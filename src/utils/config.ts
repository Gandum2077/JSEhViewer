import { EHQualifier, EHSearchTerm, TagNamespace, tagNamespaces } from "ehentai-parser";
import {
  MarkedTag,
  MarkedTagDict,
  TranslationData,
  TranslationDict,
  WebDAVService,
  DBSearchHistory,
  DBSearchBookmarks,
  AITranslationService,
  AITranslationConfigFormItem,
  ReaderConfig,
} from "../types";
import { dbManager, DatabaseStatement } from "./database";
import { allocateContentId, archiveDeletionStatements, bookmarkPosition } from "./database-records";
import { incrementLocalTagAccessCounts } from "./tag-access-counts";
import { aiTranslationPath, databasePath, imagePath, originalImagePath, thumbnailPath } from "./glv";
import {
  CREDENTIALS_REVISION_KEY,
  Credentials,
  credentialsPathForDatabase,
  prepareCredentialsUpdate,
  readCredentials,
} from "./credentials";
import { appLog } from "./tools";
import {
  readAITranslationSecrets,
  saveAITranslationSecrets,
  splitAITranslationConfig,
} from "../ai-translations/secure-config";

interface Config {
  exhentai: boolean; // 是否登录Exhentai
  syncMyTags: boolean; // 是否同步我的标签
  mpvAvailable: boolean; // 是否可用MPV

  githubToken: string; // GitHub Token，用于获取标签翻译

  homepageManagerLayoutMode: "large" | "normal" | "minimal"; // 主页管理器布局模式
  archiveManagerLayoutMode: "large" | "normal" | "minimal"; // 存档管理器布局模式
  tagManagerOnlyShowBookmarked: boolean; // 标签管理器仅显示已收藏的标签
  webdavIntroductionFirstRead: boolean; // 是否首次阅读WebDAV介绍
  importingArchiverIntroductionRead: boolean; // 是否阅读过导入压缩包的介绍
  archiveManagerOrderMethod: "first_access_time" | "last_access_time" | "posted_time"; // 存档管理器排序方式
  favoritesOrderMethod: "published_time" | "favorited_time"; // 收藏页排序方式（与网页同步）
  alwaysShowWebDAVWidget: boolean; // 是否始终显示WebDAV组件
  webdavEnabled: boolean; // 是否启用WebDAV
  webdavAutoUpload: boolean; // 是否自动上传到WebDAV
  translationUpdateTime: string; // 标签翻译更新时间
  defaultFavcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 默认收藏到
  mytagsApiuid: number;
  mytagsApikey: string;
  // Deprecated: 已迁移到 ai_translation_services_v2 表
  // selectedAiTranslationService: string;
  // Deprecated: 已迁移到 ai_translation_services_v2 表
  // aiTranslationSavedConfigText: string;
  autoClearCache: boolean; // 是否在关闭时自动清除缓存
  autoCacheWhenReading: boolean; // 阅读时是否自动缓存整个图库
  downloadCount: number; // 关闭自动缓存时的普通图片预加载张数（含当前图片），正整数
  imageShareOnLongPressEnabled: boolean; // 长按图片分享

  // 翻页方式
  pageDirection: "left_to_right" | "right_to_left" | "vertical"; // 翻页方向
  spreadModeEnabled: boolean; // 双页模式
  skipFirstPageInSpread: boolean; // 双页模式中跳过首页
  skipLandscapePagesInSpread: boolean; // 双页模式中跳过横图
  pagingGesture: "tap_and_swipe" | "swipe" | "tap"; // 翻页手势

  startPageType: "blank_page" | "last_access" | "specific_page" | "specific_searchterms"; // 起始页面类型
  lastAccessPageJson: string; // 上次访问页面, 以json格式存储的StatusTabOptions
  lastAccessTabIndex: number; // 上次访问页面的index
  specificPageTypeOnStart:
    | "front_page"
    | "watched"
    | "popular"
    | "favorites"
    | "toplist-yesterday"
    | "toplist-past_month"
    | "toplist-past_year"
    | "toplist-all"
    | "upload"; // 指定页面
  specificSearchtermsOnStart: string; // 指定搜索词，以json格式存储的EHSearchTerm[]
  resumeIncompleteDownloadsOnStart: boolean; // 启动后继续未完成的下载任务
  toplistTagFilterDefaultEnabled: boolean; // 是否启用排行页本地标签过滤功能，被设置页面的大开关控制

  // 图片收藏设置
  favoriteImageSort: "gid" | "favorited_at";
  favoriteImageQueryOrder: "asc" | "desc";
  favoriteImageShowTitle: boolean;
  favoriteImagePagingGesture: "tap_and_swipe" | "swipe" | "tap";
}

const READER_CONFIG_KEYS = [
  "pageDirection",
  "spreadModeEnabled",
  "skipFirstPageInSpread",
  "skipLandscapePagesInSpread",
  "pagingGesture",
];

const defaultConfig: Config = {
  exhentai: false,
  syncMyTags: false,
  mpvAvailable: false,
  githubToken: "",
  homepageManagerLayoutMode: "large",
  archiveManagerLayoutMode: "large",
  tagManagerOnlyShowBookmarked: false,
  webdavIntroductionFirstRead: false,
  importingArchiverIntroductionRead: false,
  archiveManagerOrderMethod: "last_access_time",
  favoritesOrderMethod: "published_time",
  alwaysShowWebDAVWidget: false,
  webdavEnabled: false,
  webdavAutoUpload: false,
  translationUpdateTime: new Date(0).toISOString(),
  defaultFavcat: 0,
  mytagsApiuid: 0,
  mytagsApikey: "",
  // Deprecated: 仅用于兼容旧版本数据库中的 config 表字段
  // selectedAiTranslationService: "",
  // Deprecated: 仅用于兼容旧版本数据库中的 config 表字段
  // aiTranslationSavedConfigText: "{}",
  autoClearCache: false,
  autoCacheWhenReading: true,
  downloadCount: 3,
  imageShareOnLongPressEnabled: true,
  pageDirection: "left_to_right",
  spreadModeEnabled: false,
  skipFirstPageInSpread: true,
  skipLandscapePagesInSpread: true,
  pagingGesture: "tap_and_swipe",
  startPageType: "blank_page",
  lastAccessPageJson: "",
  lastAccessTabIndex: 0,
  specificPageTypeOnStart: "front_page",
  specificSearchtermsOnStart: "",
  resumeIncompleteDownloadsOnStart: false,
  toplistTagFilterDefaultEnabled: false,
  favoriteImageSort: "favorited_at",
  favoriteImageQueryOrder: "desc",
  favoriteImageShowTitle: false,
  favoriteImagePagingGesture: "tap_and_swipe",
};

async function getEhTagTranslationText(githubToken: string) {
  const header: Record<string, string> = {};
  if (githubToken) {
    header.Authorization = `Bearer ${githubToken}`;
  }
  const url = "https://api.github.com/repos/EhTagTranslation/Database/releases/latest";
  const resp = await $http.get({ url: url, timeout: 30, header });
  if (resp.error) {
    appLog(resp, "error");
    throw new Error("访问GitHub API失败: " + resp.error.localizedDescription);
  }
  if (resp.response && resp.response.statusCode > 300) {
    appLog(resp, "error");
    throw new Error(`GitHub API返回错误，状态码: ${resp.response.statusCode}，返回内容: ${JSON.stringify(resp.data)}`);
  }
  const info: { assets: { name: string; url: string }[] } = resp.data;
  const asset = info.assets.find((a) => a.name === "db.full.json");
  if (!asset) throw new Error("GitHub Release中缺少db.full.json");
  const dbUrl = asset.url;
  header.Accept = "application/octet-stream";
  const resp2 = await $http.get({ url: dbUrl, timeout: 30, header });
  if (resp2.error) {
    appLog(resp, "error");
    throw new Error("下载标签翻译数据失败: " + resp2.error.localizedDescription);
  }
  if (resp2.response && resp2.response.statusCode > 300) {
    appLog(resp, "error");
    throw new Error(
      `下载标签翻译数据失败，状态码: ${resp2.response.statusCode}，返回内容: ${JSON.stringify(resp2.data)}`,
    );
  }
  return resp2.rawData.string || "";
}

function extractTranslationData(data: any): TranslationData {
  const result: TranslationData = [];
  // 去掉data.data中namespace为`rows`的第一个元素
  const index = data.data.findIndex((i: any) => i.namespace === "rows");
  if (index !== -1) {
    data.data.splice(index, 1);
  }
  // 排序: 根据namespaces的顺序对data.data进行排序
  data.data.sort((a: any, b: any) => tagNamespaces.indexOf(a.namespace) - tagNamespaces.indexOf(b.namespace));
  for (const namespaceData of data.data) {
    const namespace = namespaceData.namespace;
    // 排序: 根据raw的顺序对namespaceData.data进行排序
    const entries: any = Object.entries(namespaceData.data);
    entries.sort((a: any, b: any) => a[0].localeCompare(b[0]));
    for (const [raw, rowData] of entries) {
      const translation = rowData.name.text;
      const intro = rowData.intro.html;
      const links = rowData.links.html;
      result.push({ namespace, name: raw, translation, intro, links });
    }
  }
  return result;
}

class ConfigManager {
  private _config: Config;
  private _markedTagDict: MarkedTagDict;
  private _markedUploaders: string[];
  private _bannedUploaders: string[];
  private _favcatTitles: string[];
  private _translationDict: TranslationDict;
  private _translationList: {
    namespace: TagNamespace;
    name: string;
    translation: string;
  }[];
  private _searchHistory: DBSearchHistory;
  private _searchBookmarks: DBSearchBookmarks;
  private _webDAVServices: WebDAVService[];
  private _aiTranslationServices: AITranslationService[];
  pushedSearchResultControllerLayoutMode: "large" | "normal" | "minimal";
  // 用于控制搜索结果页面的布局模式，其初始值和homepageManagerLayoutMode相同，但后续可以被PushedSearchResultController组件修改

  /***图片加载设置***/
  // 该部分的配置将在每次启动时更新，不进入数据库
  isDonator: boolean = false;
  sourceNexusPerk: boolean = false;
  higherResolutionsAvailable: boolean = false;
  hathLoadSettingIndex: number = 0;
  hathRegionAttr: string = "";
  imageSizeSettingIndex: number = 0;
  preferOriginalImage: boolean = false;
  /***图片加载设置 END***/

  constructor() {
    this._config = this._initConfig();
    this._markedTagDict = this._getMarkedTagsDict();
    this._markedUploaders = this._queryMarkedUploaders();
    this._bannedUploaders = this._queryBannedUploaders();
    this._favcatTitles = this._queryFavcatTitles();
    const r = this._queryTranslationDict();
    this._translationList = r.translationList;
    this._translationDict = r.translationDict;
    this._searchHistory = this._querySearchHistory();
    this._searchBookmarks = this._querySearchBookmarks();
    this._webDAVServices = this._queryWebDAVServices();
    this._aiTranslationServices = this._queryAITranslationServices();
    this.pushedSearchResultControllerLayoutMode = this.homepageManagerLayoutMode;
  }

  private _initConfig() {
    dbManager.batchUpdate(
      `INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING;`,
      Object.entries(defaultConfig)
        .filter(([key]) => !READER_CONFIG_KEYS.includes(key))
        .map(([key, value]) => [key, JSON.stringify(value)]),
    );
    const existingConfig = dbManager.query("SELECT * FROM config").map(({ key, value }) => [key, JSON.parse(value)]);
    const config = Object.fromEntries(existingConfig) as Config;
    const [reader] = dbManager.query("SELECT * FROM global_reader_config_v2 WHERE id = '1'");
    if (!reader) throw new Error("缺少全局阅读设置");
    for (const key of READER_CONFIG_KEYS) {
      (config as any)[key] = typeof (defaultConfig as any)[key] === "boolean" ? Boolean(reader[key]) : reader[key];
    }
    return config;
  }

  private _setConfig(key: keyof Config, value: number | boolean | string) {
    if (READER_CONFIG_KEYS.includes(key)) {
      dbManager.update(`UPDATE global_reader_config_v2 SET ${key} = ? WHERE id = '1'`, [value]);
    } else {
      dbManager.update("UPDATE config SET value = ? WHERE key = ?", [JSON.stringify(value), key]);
    }
    (this._config[key] as any) = value;
  }

  /***CONFIG***/
  private _readCredentials(): Credentials {
    const value = dbManager.query("SELECT value FROM config WHERE key = ?", [CREDENTIALS_REVISION_KEY])[0]?.value;
    return readCredentials(credentialsPathForDatabase(databasePath), value ? JSON.parse(value) : undefined);
  }

  private _saveCredentials(credentials: Credentials, statements: DatabaseStatement[] = []) {
    const update = prepareCredentialsUpdate(
      credentialsPathForDatabase(databasePath),
      this._readCredentials(),
      credentials,
    );
    try {
      dbManager.transactionUpdate([
        ...statements,
        {
          sql: "INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          args: [CREDENTIALS_REVISION_KEY, JSON.stringify(update.revision)],
        },
      ]);
    } catch (error) {
      update.rollback();
      throw error;
    }
    update.finish();
  }

  get cookie() {
    return this._readCredentials().cookie;
  }

  set cookie(value: string) {
    this._saveCredentials({ ...this._readCredentials(), cookie: value });
  }

  get exhentai() {
    return this._config.exhentai;
  }

  set exhentai(value: boolean) {
    this._setConfig("exhentai", value);
  }

  get syncMyTags() {
    return this._config.syncMyTags;
  }

  set syncMyTags(value: boolean) {
    this._setConfig("syncMyTags", value);
  }

  get mpvAvailable() {
    return this._config.mpvAvailable;
  }

  set mpvAvailable(value: boolean) {
    this._setConfig("mpvAvailable", value);
  }

  get githubToken() {
    return this._config.githubToken;
  }

  set githubToken(value: string) {
    this._setConfig("githubToken", value);
  }

  get homepageManagerLayoutMode() {
    return this._config.homepageManagerLayoutMode;
  }

  set homepageManagerLayoutMode(value: "large" | "normal" | "minimal") {
    this._setConfig("homepageManagerLayoutMode", value);
  }

  get archiveManagerLayoutMode() {
    return this._config.archiveManagerLayoutMode;
  }

  set archiveManagerLayoutMode(value: "large" | "normal" | "minimal") {
    this._setConfig("archiveManagerLayoutMode", value);
  }

  get tagManagerOnlyShowBookmarked() {
    return this._config.tagManagerOnlyShowBookmarked;
  }

  set tagManagerOnlyShowBookmarked(value: boolean) {
    this._setConfig("tagManagerOnlyShowBookmarked", value);
  }

  get webdavIntroductionFirstRead() {
    return this._config.webdavIntroductionFirstRead;
  }

  set webdavIntroductionFirstRead(value: boolean) {
    this._setConfig("webdavIntroductionFirstRead", value);
  }

  get importingArchiverIntroductionRead() {
    return this._config.importingArchiverIntroductionRead;
  }

  set importingArchiverIntroductionRead(value: boolean) {
    this._setConfig("importingArchiverIntroductionRead", value);
  }

  get archiveManagerOrderMethod() {
    return this._config.archiveManagerOrderMethod;
  }

  set archiveManagerOrderMethod(value: "first_access_time" | "last_access_time" | "posted_time") {
    this._setConfig("archiveManagerOrderMethod", value);
  }

  get favoritesOrderMethod() {
    return this._config.favoritesOrderMethod;
  }

  set favoritesOrderMethod(value: "favorited_time" | "published_time") {
    this._setConfig("favoritesOrderMethod", value);
  }

  get alwaysShowWebDAVWidget() {
    return this._config.alwaysShowWebDAVWidget;
  }

  set alwaysShowWebDAVWidget(value: boolean) {
    this._setConfig("alwaysShowWebDAVWidget", value);
  }

  get webdavEnabled() {
    return this._config.webdavEnabled;
  }

  set webdavEnabled(value: boolean) {
    this._setConfig("webdavEnabled", value);
  }

  get webdavAutoUpload() {
    return this._config.webdavAutoUpload;
  }

  set webdavAutoUpload(value: boolean) {
    this._setConfig("webdavAutoUpload", value);
  }

  get translationUpdateTime() {
    return this._config.translationUpdateTime;
  }

  set translationUpdateTime(value: string) {
    this._setConfig("translationUpdateTime", value);
  }

  get defaultFavcat() {
    return this._config.defaultFavcat;
  }

  set defaultFavcat(value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
    this._setConfig("defaultFavcat", value);
  }

  get mytagsApiuid() {
    return this._config.mytagsApiuid;
  }

  set mytagsApiuid(value: number) {
    this._setConfig("mytagsApiuid", value);
  }

  get mytagsApikey() {
    return this._config.mytagsApikey;
  }

  set mytagsApikey(value: string) {
    this._setConfig("mytagsApikey", value);
  }

  get selectedAiTranslationServiceName() {
    return this._aiTranslationServices.find((service) => service.selected)?.name;
  }

  set selectedAiTranslationServiceName(value: string | undefined) {
    if (value) {
      dbManager.transactionUpdate([
        {
          sql: "UPDATE ai_translation_services_v2 SET selected = 0 WHERE deleted = 0 AND selected = 1",
        },
        {
          sql: "UPDATE ai_translation_services_v2 SET selected = 1 WHERE deleted = 0 AND name = ?",
          args: [value],
        },
      ]);
    } else {
      dbManager.update("UPDATE ai_translation_services_v2 SET selected = 0 WHERE deleted = 0 AND selected = 1");
    }
    this._aiTranslationServices = this._queryAITranslationServices();
  }

  /* Deprecated: 已迁移到 ai_translation_services_v2 表
  get aiTranslationSavedConfigText() {
    return JSON.stringify(this.aiTranslationServiceConfig);
  }

  set aiTranslationSavedConfigText(value: string) {
    let config: Record<string, any> = {};
    try {
      config = JSON.parse(value);
    } catch {
      config = {};
    }
    this.saveAiTranslationServiceConfig(config);
  } */

  get autoClearCache() {
    return this._config.autoClearCache;
  }

  set autoClearCache(value: boolean) {
    this._setConfig("autoClearCache", value);
  }

  get autoCacheWhenReading() {
    return this._config.autoCacheWhenReading;
  }

  set autoCacheWhenReading(value: boolean) {
    this._setConfig("autoCacheWhenReading", value);
  }

  get downloadCount() {
    return this._config.downloadCount;
  }

  set downloadCount(value: number) {
    if (!Number.isSafeInteger(value) || value < 1) return;
    this._setConfig("downloadCount", value);
  }

  get imageShareOnLongPressEnabled() {
    return this._config.imageShareOnLongPressEnabled;
  }

  set imageShareOnLongPressEnabled(value: boolean) {
    this._setConfig("imageShareOnLongPressEnabled", value);
  }

  get pageDirection() {
    return this._config.pageDirection;
  }

  set pageDirection(value: "vertical" | "left_to_right" | "right_to_left") {
    this._setConfig("pageDirection", value);
  }

  get spreadModeEnabled() {
    return this._config.spreadModeEnabled;
  }

  set spreadModeEnabled(value: boolean) {
    this._setConfig("spreadModeEnabled", value);
  }

  get skipFirstPageInSpread() {
    return this._config.skipFirstPageInSpread;
  }

  set skipFirstPageInSpread(value: boolean) {
    this._setConfig("skipFirstPageInSpread", value);
  }

  get skipLandscapePagesInSpread() {
    return this._config.skipLandscapePagesInSpread;
  }

  set skipLandscapePagesInSpread(value: boolean) {
    this._setConfig("skipLandscapePagesInSpread", value);
  }

  get pagingGesture() {
    return this._config.pagingGesture;
  }

  set pagingGesture(value: "tap" | "swipe" | "tap_and_swipe") {
    this._setConfig("pagingGesture", value);
  }

  get startPageType() {
    return this._config.startPageType;
  }

  set startPageType(value: "blank_page" | "last_access" | "specific_page" | "specific_searchterms") {
    this._setConfig("startPageType", value);
  }

  get lastAccessPageJson() {
    return this._config.lastAccessPageJson;
  }

  set lastAccessPageJson(value: string) {
    this._setConfig("lastAccessPageJson", value);
  }

  get lastAccessTabIndex() {
    return this._config.lastAccessTabIndex;
  }

  set lastAccessTabIndex(value: number) {
    this._setConfig("lastAccessTabIndex", value);
  }

  get specificPageTypeOnStart() {
    return this._config.specificPageTypeOnStart;
  }

  set specificPageTypeOnStart(
    value:
      | "front_page"
      | "watched"
      | "popular"
      | "favorites"
      | "toplist-yesterday"
      | "toplist-past_month"
      | "toplist-past_year"
      | "toplist-all"
      | "upload",
  ) {
    this._setConfig("specificPageTypeOnStart", value);
  }

  get specificSearchtermsOnStart() {
    return this._config.specificSearchtermsOnStart;
  }

  set specificSearchtermsOnStart(value: string) {
    this._setConfig("specificSearchtermsOnStart", value);
  }

  get resumeIncompleteDownloadsOnStart() {
    return this._config.resumeIncompleteDownloadsOnStart;
  }

  set resumeIncompleteDownloadsOnStart(value: boolean) {
    this._setConfig("resumeIncompleteDownloadsOnStart", value);
  }

  get toplistTagFilterDefaultEnabled() {
    return this._config.toplistTagFilterDefaultEnabled;
  }

  set toplistTagFilterDefaultEnabled(value: boolean) {
    this._setConfig("toplistTagFilterDefaultEnabled", value);
  }

  get favoriteImageSort() {
    return this._config.favoriteImageSort;
  }

  set favoriteImageSort(value: "gid" | "favorited_at") {
    this._setConfig("favoriteImageSort", value);
  }

  get favoriteImageQueryOrder() {
    return this._config.favoriteImageQueryOrder;
  }

  set favoriteImageQueryOrder(value: "asc" | "desc") {
    this._setConfig("favoriteImageQueryOrder", value);
  }

  get favoriteImageShowTitle() {
    return this._config.favoriteImageShowTitle;
  }

  set favoriteImageShowTitle(value: boolean) {
    this._setConfig("favoriteImageShowTitle", value);
  }

  get favoriteImagePagingGesture() {
    return this._config.favoriteImagePagingGesture;
  }

  set favoriteImagePagingGesture(value: "tap_and_swipe" | "swipe" | "tap") {
    this._setConfig("favoriteImagePagingGesture", value);
  }

  /***CONFIG END***/

  get translationList() {
    return this._translationList;
  }

  get translationDict() {
    return this._translationDict;
  }

  get markedTagDict() {
    return this._markedTagDict;
  }

  get searchHistory() {
    return this._searchHistory;
  }

  get searchBookmarks() {
    return this._searchBookmarks;
  }

  private _getMarkedTagsDict() {
    const sql = `SELECT 0 AS tagid, namespace, name, watched, hidden, color, weight
      FROM local_marked_tags_v2 WHERE deleted = 0
      UNION ALL SELECT tagid, namespace, name, watched, hidden, color, weight
      FROM downloaded_marked_tags_v2 AS remote
      WHERE NOT EXISTS (SELECT 1 FROM local_marked_tags_v2 AS local
        WHERE local.namespace = remote.namespace AND local.name = remote.name)`;
    const data = dbManager.query(sql) as {
      tagid: number;
      namespace: TagNamespace;
      name: string;
      watched: 0 | 1;
      hidden: 0 | 1;
      color: string;
      weight: number;
    }[];
    const tags = data.map((d) => ({
      tagid: d.tagid,
      namespace: d.namespace,
      name: d.name,
      watched: Boolean(d.watched),
      hidden: Boolean(d.hidden),
      color: d.color,
      weight: d.weight,
    }));
    const result = new Map() as MarkedTagDict;
    for (const namespace of tagNamespaces) {
      const data: [string, MarkedTag][] = tags.filter((t) => t.namespace === namespace).map((t) => [t.name, t]);
      result.set(namespace, new Map(data));
    }
    return result;
  }

  updateAllMarkedTags(markedTags: MarkedTag[]) {
    dbManager.transactionUpdate([
      { sql: "DELETE FROM downloaded_marked_tags_v2" },
      ...markedTags.map((tag) => ({
        sql: "INSERT INTO downloaded_marked_tags_v2 (tagid, namespace, name, watched, hidden, color, weight) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [tag.tagid, tag.namespace, tag.name, tag.watched, tag.hidden, tag.color || "", tag.weight],
      })),
    ]);
    this._markedTagDict = this._getMarkedTagsDict();
  }

  getMarkedTag(namespace: TagNamespace, name: string): MarkedTag | undefined {
    return this._markedTagDict.get(namespace)?.get(name);
  }

  updateMarkedTag(tag: MarkedTag) {
    if (this.syncMyTags && tag.tagid !== 0) {
      dbManager.update(
        `INSERT INTO downloaded_marked_tags_v2 (tagid, namespace, name, watched, hidden, color, weight)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(namespace, name) DO UPDATE SET
        tagid=excluded.tagid, watched=excluded.watched, hidden=excluded.hidden, color=excluded.color, weight=excluded.weight`,
        [tag.tagid, tag.namespace, tag.name, tag.watched, tag.hidden, tag.color || "", tag.weight],
      );
    } else {
      dbManager.update(
        `INSERT INTO local_marked_tags_v2 (id, namespace, name, watched, hidden, color, weight)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET deleted=0,
        watched=excluded.watched, hidden=excluded.hidden, color=excluded.color, weight=excluded.weight`,
        [`${tag.namespace}:${tag.name}`, tag.namespace, tag.name, tag.watched, tag.hidden, tag.color || "", tag.weight],
      );
    }
    this._markedTagDict = this._getMarkedTagsDict();
  }

  addMarkedTag(tag: MarkedTag) {
    this.updateMarkedTag(tag);
  }

  deleteMarkedTag(namespace: TagNamespace, name: string) {
    if (this.syncMyTags) {
      dbManager.update("DELETE FROM downloaded_marked_tags_v2 WHERE namespace = ? AND name = ?", [namespace, name]);
    } else {
      // A tombstone also hides a downloaded tag when it is removed locally.
      dbManager.update(
        `INSERT INTO local_marked_tags_v2 (id, namespace, name, deleted) VALUES (?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET deleted=1`,
        [`${namespace}:${name}`, namespace, name],
      );
    }
    this._markedTagDict = this._getMarkedTagsDict();
  }

  get markedUploaders() {
    return this._markedUploaders;
  }

  private _queryMarkedUploaders() {
    const sql = "SELECT id AS uploader FROM marked_uploaders_v2 WHERE deleted = 0";
    const data = dbManager.query(sql) as {
      uploader: string;
    }[];
    return data.map((d) => d.uploader);
  }

  addMarkedUploader(uploader: string) {
    const sql = "INSERT INTO marked_uploaders_v2 (id) VALUES (?) ON CONFLICT (id) DO UPDATE SET deleted = 0";
    const args = [uploader];
    dbManager.update(sql, args);
    this._markedUploaders = this._queryMarkedUploaders();
  }

  deleteMarkedUploader(uploader: string) {
    const sql = "UPDATE marked_uploaders_v2 SET deleted = 1 WHERE id = ?";
    const args = [uploader];
    dbManager.update(sql, args);
    this._markedUploaders = this._queryMarkedUploaders();
  }

  get bannedUploaders() {
    return this._bannedUploaders;
  }

  private _queryBannedUploaders() {
    const sql = "SELECT * FROM banned_uploaders";
    const data = dbManager.query(sql) as {
      uploader: string;
    }[];
    return data.map((d) => d.uploader);
  }

  updateAllBannedUploaders(uploaders: string[]) {
    const sql_remove = "DELETE FROM banned_uploaders";
    // 另外需要删除marked_uploaders中的被禁止的上传者
    const sql_remove_marked = `UPDATE marked_uploaders_v2 SET deleted = 1 WHERE id IN (SELECT uploader FROM banned_uploaders);`;
    dbManager.update(sql_remove);
    dbManager.batchInsert(
      "banned_uploaders",
      ["uploader"],
      uploaders.map((u) => [u]),
    );
    dbManager.update(sql_remove_marked);
    this._bannedUploaders = uploaders;
  }

  get favcatTitles() {
    return this._favcatTitles;
  }

  private _queryFavcatTitles() {
    const sql = "SELECT * FROM favcat_titles";
    const data = dbManager.query(sql) as {
      favcat: number;
      title: string;
    }[];
    return data.map((d) => d.title);
  }

  updateAllFavcatTitles(titles: string[]) {
    const sql_remove = "DELETE FROM favcat_titles";
    dbManager.update(sql_remove);
    dbManager.batchInsert(
      "favcat_titles",
      ["favcat", "title"],
      titles.map((t, i) => [i, t]),
    );
    this._favcatTitles = titles;
  }

  private _queryTranslationDict() {
    const sql = "SELECT namespace, name, translation FROM translation_data";
    const data = dbManager.query(sql) as {
      namespace: TagNamespace;
      name: string;
      translation: string;
    }[];
    const dict = new Map() as TranslationDict;
    for (const namespace of tagNamespaces) {
      const data_: [string, string][] = data
        .filter((d) => d.namespace === namespace)
        .map((d) => [d.name, d.translation]);
      dict.set(namespace, new Map(data_));
    }
    return { translationList: data, translationDict: dict };
  }

  translate(namespace: TagNamespace, name: string): string | undefined {
    return this._translationDict.get(namespace)?.get(name);
  }

  getTranslationDetailedInfo(namespace: TagNamespace, name: string) {
    const sql = "SELECT * FROM translation_data where namespace = ? and name = ?";
    const args = [namespace, name];
    const data = dbManager.query(sql, args) as {
      namespace: TagNamespace;
      name: string;
      translation: string;
      intro: string;
      links: string;
    }[];
    if (data.length === 0) {
      return;
    } else {
      return data[0];
    }
  }

  async updateTranslationData() {
    const sql_delete_translation_data = "DELETE FROM translation_data";
    const text = await getEhTagTranslationText(this.githubToken);
    const data: any = JSON.parse(text);
    const time: string = data.head.committer.when;
    const translationData = extractTranslationData(data);
    dbManager.update(sql_delete_translation_data);
    this.translationUpdateTime = time;
    dbManager.batchInsert(
      "translation_data",
      ["namespace", "name", "translation", "intro", "links"],
      translationData.map((d) => [d.namespace, d.name, d.translation, d.intro, d.links]),
    );
    const r = this._queryTranslationDict();
    this._translationList = r.translationList;
    this._translationDict = r.translationDict;
  }

  private _querySearchTerms(
    table: "search_history_search_terms_v2" | "search_bookmarks_search_terms_v2",
    parent: string,
  ): EHSearchTerm[] {
    const column = table === "search_history_search_terms_v2" ? "history_id" : "bookmark_id";
    return dbManager.query(`SELECT * FROM ${table} WHERE ${column} = ? ORDER BY term_index`, [parent]).map((term) => ({
      namespace: term.namespace || undefined,
      qualifier: term.qualifier || undefined,
      term: term.term,
      dollar: Boolean(term.dollar),
      subtract: Boolean(term.subtract),
      tilde: Boolean(term.tilde),
    }));
  }

  private _searchTermStatements(
    table: "search_history_search_terms_v2" | "search_bookmarks_search_terms_v2",
    id: string,
    terms: EHSearchTerm[],
  ): DatabaseStatement[] {
    const parent = table === "search_history_search_terms_v2" ? "history_id" : "bookmark_id";
    return [
      { sql: `DELETE FROM ${table} WHERE ${parent} = ?`, args: [id] },
      ...terms.map((term, index) => ({
        sql: `INSERT INTO ${table} (${parent}, term_index, namespace, qualifier, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          index,
          term.namespace,
          term.qualifier,
          term.term,
          Boolean(term.dollar),
          Boolean(term.subtract),
          Boolean(term.tilde),
        ],
      })),
    ];
  }

  private _querySearchHistory(): DBSearchHistory {
    return dbManager
      .query("SELECT id, last_access_time FROM search_history_v2 WHERE deleted = 0 ORDER BY last_access_time DESC")
      .map((row) => ({
        id: row.id,
        sorted_fsearch: row.id,
        last_access_time: row.last_access_time,
        searchTerms: this._querySearchTerms("search_history_search_terms_v2", row.id),
      }));
  }

  addOrUpdateSearchHistory(sortedFsearch: string, searchTerms: EHSearchTerm[]) {
    dbManager.transactionUpdate([
      {
        sql: `INSERT INTO search_history_v2 (id, last_access_time) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET deleted=0, last_access_time=excluded.last_access_time`,
        args: [sortedFsearch, new Date().toISOString()],
      },
      ...this._searchTermStatements("search_history_search_terms_v2", sortedFsearch, searchTerms),
    ]);
    this._searchHistory = this._querySearchHistory();
  }

  deleteSearchHistory(id: string) {
    dbManager.update("UPDATE search_history_v2 SET deleted = 1 WHERE id = ?", [id]);
    this._searchHistory = this._querySearchHistory();
  }

  private _querySearchBookmarks(): DBSearchBookmarks {
    return dbManager
      .query("SELECT id, position_key FROM search_bookmarks_v2 WHERE deleted = 0 ORDER BY position_key, id")
      .map((row, index) => ({
        id: row.id,
        sorted_fsearch: row.id,
        sort_order: index,
        searchTerms: this._querySearchTerms("search_bookmarks_search_terms_v2", row.id),
      }));
  }

  addSearchBookmark(sortedFsearch: string, searchTerms: EHSearchTerm[]) {
    if (this._searchBookmarks.some((bookmark) => bookmark.id === sortedFsearch)) return false;
    // Reindex all active rows together, so migrated and newly created keys share one order.
    const ids = [...this._searchBookmarks.map((bookmark) => bookmark.id), sortedFsearch];
    dbManager.transactionUpdate([
      {
        sql: `INSERT INTO search_bookmarks_v2 (id, position_key) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET deleted=0, position_key=excluded.position_key`,
        args: [sortedFsearch, bookmarkPosition(ids.length - 1)],
      },
      ...this._searchTermStatements("search_bookmarks_search_terms_v2", sortedFsearch, searchTerms),
      ...ids.map((id, index) => ({
        sql: "UPDATE search_bookmarks_v2 SET position_key = ? WHERE id = ?",
        args: [bookmarkPosition(index), id],
      })),
    ]);
    this._searchBookmarks = this._querySearchBookmarks();
    return true;
  }

  deleteSearchBookmark(id: string) {
    dbManager.update("UPDATE search_bookmarks_v2 SET deleted = 1 WHERE id = ?", [id]);
    this._searchBookmarks = this._querySearchBookmarks();
  }

  reorderSearchBookmarks(ids: string[]) {
    if (
      ids.length !== this._searchBookmarks.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !this._searchBookmarks.some((bookmark) => bookmark.id === id))
    )
      throw new Error("书签排序列表不完整");
    dbManager.batchUpdate(
      "UPDATE search_bookmarks_v2 SET position_key = ? WHERE id = ?",
      ids.map((id, index) => [bookmarkPosition(index), id]),
    );
    this._searchBookmarks = this._querySearchBookmarks();
  }

  getTenMostAccessedTags() {
    const sql = `SELECT namespace,qualifier,term,SUM(count) AS count
      FROM tag_access_count_v2 WHERE deleted=0 GROUP BY namespace,qualifier,term
      ORDER BY count DESC,namespace,qualifier,term LIMIT 10`;
    const data = dbManager.query(sql) as {
      namespace: TagNamespace;
      qualifier: EHQualifier;
      term: string;
      count: number;
    }[];
    return data;
  }

  updateTagAccessCount(tags: EHSearchTerm[]) {
    incrementLocalTagAccessCounts(tags);
  }

  getSomeLastAccessSearchTerms(): EHSearchTerm[] {
    return dbManager
      .query(
        `SELECT namespace, qualifier, term FROM (
      SELECT t.*, h.last_access_time, ROW_NUMBER() OVER (
        PARTITION BY namespace, qualifier, term ORDER BY h.last_access_time DESC, t.term_index
      ) AS row_num
      FROM search_history_search_terms_v2 AS t JOIN search_history_v2 AS h ON t.history_id=h.id
      WHERE h.deleted=0
    ) WHERE row_num=1 ORDER BY last_access_time DESC LIMIT 20`,
      )
      .map((row) => ({
        namespace: row.namespace || undefined,
        qualifier: row.qualifier || undefined,
        term: row.term,
        dollar: false,
        subtract: false,
        tilde: false,
      }));
  }

  private _queryWebDAVServices(): WebDAVService[] {
    const sql = "SELECT * FROM webdav_services_v2 WHERE deleted = 0 ORDER BY rowid";
    const data = dbManager.query(sql) as {
      id: string;
      name: string;
      host: string;
      port: number | null;
      path: string | null;
      https: 0 | 1;
      enabled: 0 | 1;
    }[];
    const credentials = this._readCredentials().webdav;
    return data.map((n) => ({
      id: n.id,
      name: n.name,
      host: n.host,
      port: n.port || undefined,
      path: n.path || undefined,
      https: Boolean(n.https),
      username: credentials[n.id]?.username ?? undefined,
      password: credentials[n.id]?.password ?? undefined,
      enabled: Boolean(n.enabled),
    }));
  }

  updateAllWebDAVServices(services: WebDAVService[]) {
    const usedIds = new Set<string>(dbManager.query("SELECT id FROM webdav_services_v2").map((row) => row.id));
    const records = services.map((service) => ({
      ...service,
      id:
        service.id ??
        allocateContentId(
          [
            "webdav_service_v2",
            service.name,
            service.host,
            service.port ?? null,
            Number(service.https),
            service.path ?? null,
          ],
          usedIds,
        ),
    }));
    this._saveCredentials(
      {
        ...this._readCredentials(),
        webdav: Object.fromEntries(
          records.map((service) => [
            service.id,
            {
              username: service.username ?? null,
              password: service.password ?? null,
            },
          ]),
        ),
      },
      [
        { sql: "UPDATE webdav_services_v2 SET deleted = 1, enabled = 0 WHERE deleted = 0" },
        ...records.map((service) => ({
          sql: `INSERT INTO webdav_services_v2 (id, name, host, port, https, path, enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET deleted=0, name=excluded.name,
          host=excluded.host, port=excluded.port, https=excluded.https, path=excluded.path, enabled=excluded.enabled`,
          args: [service.id, service.name, service.host, service.port, service.https, service.path, service.enabled],
        })),
      ],
    );
    this._webDAVServices = this._queryWebDAVServices();
  }

  getCopiedWebDAVServices() {
    return this._webDAVServices.map((service) => ({ ...service }));
  }

  get webDAVServices() {
    return this._webDAVServices;
  }

  get currentWebDAVService() {
    if (!this.webdavEnabled) return;
    return this._webDAVServices.find((service) => service.enabled);
  }

  private _queryAITranslationServices(): AITranslationService[] {
    const sql =
      "SELECT id, name, selected, script_text, config_form, config FROM ai_translation_services_v2 WHERE deleted = 0 ORDER BY rowid";
    const rows = dbManager.query(sql) as {
      id: string;
      name: string;
      selected: 0 | 1;
      script_text: string;
      config_form: string | null;
      config: string | null;
    }[];
    return rows.map((row) => {
      const service: AITranslationService = {
        id: row.id,
        name: row.name,
        selected: Boolean(row.selected),
        scriptText: row.script_text,
        configForm: row.config_form ? (JSON.parse(row.config_form) as AITranslationConfigFormItem[]) : undefined,
        config: row.config ? (JSON.parse(row.config) as Record<string, any>) : undefined,
      };
      const split = splitAITranslationConfig(service);
      const keys = Object.keys(split.secrets);
      if (!keys.length) return service;
      const saved = readAITranslationSecrets(row.id);
      const secrets = Object.fromEntries(
        keys.map((key) => [key, Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : split.secrets[key]]),
      );
      if (split.hasPersistedSecrets) {
        saveAITranslationSecrets(row.id, secrets, () =>
          dbManager.update("UPDATE ai_translation_services_v2 SET config_form = ?, config = ? WHERE id = ?", [
            JSON.stringify(split.configForm),
            split.config ? JSON.stringify(split.config) : null,
            row.id,
          ]),
        );
      }
      return { ...service, configForm: split.configForm, config: { ...split.config, ...secrets } };
    });
  }

  addAITranslationService(service: AITranslationService) {
    if (service.id !== undefined) {
      throw new Error("addAITranslationService 只能用于新增服务");
    }
    const { secrets, ...split } = splitAITranslationConfig(service);
    service = { ...service, configForm: split.configForm, config: split.config };

    const statements: { sql: string; args?: (string | number | boolean | null | undefined)[] }[] = [];

    if (service.selected) {
      statements.push({
        sql: "UPDATE ai_translation_services_v2 SET selected = 0 WHERE deleted = 0 AND selected = 1",
      });
    }

    const id = allocateContentId(
      [
        "ai_translation_service_v2",
        service.name,
        service.scriptText,
        service.configForm ? JSON.stringify(service.configForm) : null,
        service.config ? JSON.stringify(service.config) : null,
      ],
      new Set<string>(dbManager.query("SELECT id FROM ai_translation_services_v2").map((row) => row.id)),
    );
    statements.push({
      sql: `INSERT INTO ai_translation_services_v2 (id, name, selected, script_text, config_form, config) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        service.name,
        Number(service.selected),
        service.scriptText,
        service.configForm ? JSON.stringify(service.configForm) : undefined,
        service.config ? JSON.stringify(service.config) : undefined,
      ],
    });

    saveAITranslationSecrets(id, secrets, () => dbManager.transactionUpdate(statements));

    this._aiTranslationServices = this._queryAITranslationServices();
  }

  editAITranslationService(service: AITranslationService) {
    if (service.id === undefined) {
      throw new Error("editAITranslationService 只能用于编辑已有服务");
    }
    const id = service.id;
    const { secrets, ...split } = splitAITranslationConfig(service);
    service = { ...service, configForm: split.configForm, config: split.config };

    const statements: { sql: string; args?: (string | number | boolean | null | undefined)[] }[] = [];

    if (service.selected) {
      statements.push({
        sql: "UPDATE ai_translation_services_v2 SET selected = 0 WHERE deleted = 0 AND selected = 1 AND id != ?",
        args: [service.id],
      });
    }

    statements.push({
      sql: `UPDATE ai_translation_services_v2
            SET name = ?, selected = ?, script_text = ?, config_form = ?, config = ?
            WHERE id = ?`,
      args: [
        service.name,
        Number(service.selected),
        service.scriptText,
        service.configForm ? JSON.stringify(service.configForm) : undefined,
        service.config ? JSON.stringify(service.config) : undefined,
        service.id,
      ],
    });

    saveAITranslationSecrets(id, secrets, () => dbManager.transactionUpdate(statements));

    this._aiTranslationServices = this._queryAITranslationServices();
  }

  deleteAITranslationService(name: string) {
    const service = this._aiTranslationServices.find((service) => service.name === name);
    if (!service?.id) return;
    saveAITranslationSecrets(service.id, {}, () =>
      dbManager.update("UPDATE ai_translation_services_v2 SET deleted = 1, selected = 0 WHERE id = ?", [service.id]),
    );
    this._aiTranslationServices = this._queryAITranslationServices();
  }

  get aiTranslationServices() {
    return this._aiTranslationServices;
  }

  /**
   * 清除较旧的搜索记录
   * @param index 0: 一个月前, 1: 三个月前, 2: 六个月前, 3: 一年前
   */
  clearOldSearchRecords(index: number) {
    // 先根据index计算出对应的日期
    const date = new Date();
    if (index === 0) {
      date.setMonth(date.getMonth() - 1);
    } else if (index === 1) {
      date.setMonth(date.getMonth() - 3);
    } else if (index === 2) {
      date.setMonth(date.getMonth() - 6);
    } else {
      date.setFullYear(date.getFullYear() - 1);
    }
    dbManager.update("UPDATE search_history_v2 SET deleted = 1 WHERE last_access_time < ? AND deleted = 0", [
      date.toISOString(),
    ]);
    this._searchHistory = this._querySearchHistory();
  }

  /**
   * 清除较旧的阅读记录, 排除下载项和包含图片收藏的图库
   * @param index 0: 一个月前, 1: 三个月前, 2: 六个月前, 3: 一年前
   */
  clearOldReadRecords(index: number) {
    // 先根据index计算出对应的日期
    const date = new Date();
    if (index === 0) {
      date.setMonth(date.getMonth() - 1);
    } else if (index === 1) {
      date.setMonth(date.getMonth() - 3);
    } else if (index === 2) {
      date.setMonth(date.getMonth() - 6);
    } else {
      date.setFullYear(date.getFullYear() - 1);
    }
    // 再根据日期对出符合条件的gid
    const sql = `
      SELECT a.gid
      FROM archive_records_v2 a
      WHERE a.last_access_time < ?
        AND COALESCE(a.downloaded, 0) <> 1
        AND NOT EXISTS (
          SELECT 1 FROM favorite_images_v2 f WHERE f.gid = a.gid AND f.deleted = 0
        )
    `;
    const data = dbManager.query(sql, [date.toISOString()]) as {
      gid: number;
    }[];
    const needDeleteGids = data.map((n) => n.gid);
    if (needDeleteGids.length === 0) return;

    dbManager.transactionUpdate(needDeleteGids.flatMap((gid) => archiveDeletionStatements(gid)));
  }

  /**
   * 清除缓存
   * 规则：
   * 1. 删除未收藏图片的缩略图
   * 2. 删除originalImagePath
   * 3. 删除aiTranslationPath
   * 4. 普通图片保留下载图库及收藏页，其余删除
   */
  clearCache() {
    $file.delete(originalImagePath);
    $file.delete(aiTranslationPath);
    const downloadedGids = new Set(
      (dbManager.query("SELECT gid FROM archive_records_v2 WHERE downloaded = 1") as { gid: number }[]).map(
        (item) => item.gid,
      ),
    );
    const favorites = new Map<number, Set<number>>();
    for (const item of dbManager.query("SELECT gid, page_index FROM favorite_images_v2 WHERE deleted = 0") as {
      gid: number;
      page_index: number;
    }[]) {
      if (!favorites.has(item.gid)) favorites.set(item.gid, new Set());
      favorites.get(item.gid)!.add(item.page_index);
    }
    // 保留收藏普通图片及缩略图；图库元数据保留，以支持缺失资源恢复。
    for (const root of [thumbnailPath, imagePath]) {
      for (const name of $file.list(root) ?? []) {
        const gid = /^\d+$/.test(name) ? Number(name) : undefined;
        if (root === imagePath && gid !== undefined && downloadedGids.has(gid)) continue;
        const pages = gid === undefined ? undefined : favorites.get(gid);
        if (!pages) {
          $file.delete(root + name);
          continue;
        }
        for (const file of $file.list(root + name) ?? []) {
          const match = /^(\d+)(?:_[^.]+)?\.(?:png|jpe?g|gif|webp)$/i.exec(file);
          if (!match || !pages.has(Number(match[1]) - 1)) $file.delete(root + name + "/" + file);
        }
      }
    }
  }

  /**
   * 清除所有缓存、下载内容和图片收藏
   */
  clearAll() {
    $file.delete(thumbnailPath);
    $file.delete(originalImagePath);
    $file.delete(aiTranslationPath);
    $file.delete(imagePath);
    dbManager.transactionUpdate(archiveDeletionStatements());
  }

  /**
   * 获得特定图库的阅读器参数
   */
  getGalleryReaderConfig(gid: number): ReaderConfig | undefined {
    const sql = "SELECT * FROM gallery_reader_config_v2 WHERE id = ? AND deleted = 0";
    const data = dbManager.query(sql, [String(gid)]) as {
      gid: number;
      pageDirection: string;
      spreadModeEnabled: number;
      skipFirstPageInSpread: number;
      skipLandscapePagesInSpread: number;
      pagingGesture: string;
    }[];
    if (data.length === 0) {
      return;
    } else {
      const n = data[0];
      return {
        pageDirection: n.pageDirection as "left_to_right" | "right_to_left" | "vertical",
        spreadModeEnabled: Boolean(n.spreadModeEnabled),
        skipFirstPageInSpread: Boolean(n.skipFirstPageInSpread),
        skipLandscapePagesInSpread: Boolean(n.skipLandscapePagesInSpread),
        pagingGesture: n.pagingGesture as "tap_and_swipe" | "swipe" | "tap",
      };
    }
  }

  /**
   * 设置特定图库的阅读器参数
   * @param gid
   * @param config
   */
  setGalleryReaderConfig(gid: number, config: ReaderConfig) {
    const sql_update = `
    INSERT INTO gallery_reader_config_v2
    (id, pageDirection, spreadModeEnabled, skipFirstPageInSpread, skipLandscapePagesInSpread, pagingGesture)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      deleted = 0,
      pageDirection = excluded.pageDirection,
      spreadModeEnabled = excluded.spreadModeEnabled,
      skipFirstPageInSpread = excluded.skipFirstPageInSpread,
      skipLandscapePagesInSpread = excluded.skipLandscapePagesInSpread,
      pagingGesture = excluded.pagingGesture
    `;
    const args_update = [
      String(gid),
      config.pageDirection,
      config.spreadModeEnabled,
      config.skipFirstPageInSpread,
      config.skipLandscapePagesInSpread,
      config.pagingGesture,
    ];
    dbManager.update(sql_update, args_update);
  }

  deleteGalleryReaderConfig(gid: number) {
    const sql_delete = "UPDATE gallery_reader_config_v2 SET deleted = 1 WHERE id = ?";
    dbManager.update(sql_delete, [String(gid)]);
  }

  getCommonReaderConfig(): ReaderConfig {
    return {
      pageDirection: this.pageDirection,
      spreadModeEnabled: this.spreadModeEnabled,
      skipFirstPageInSpread: this.skipFirstPageInSpread,
      skipLandscapePagesInSpread: this.skipLandscapePagesInSpread,
      pagingGesture: this.pagingGesture,
    };
  }

  setCommonReaderConfig(config: ReaderConfig) {
    dbManager.update(
      `UPDATE global_reader_config_v2 SET pageDirection = ?, spreadModeEnabled = ?,
      skipFirstPageInSpread = ?, skipLandscapePagesInSpread = ?, pagingGesture = ? WHERE id = '1'`,
      [
        config.pageDirection,
        config.spreadModeEnabled,
        config.skipFirstPageInSpread,
        config.skipLandscapePagesInSpread,
        config.pagingGesture,
      ],
    );
    Object.assign(this._config, config);
  }
}

export const configManager = new ConfigManager();
