import {
  EHQualifier,
  EHSearchTerm,
  TagNamespace,
  tagNamespaces,
} from "ehentai-parser";
import {
  MarkedTag,
  MarkedTagDict,
  TranslationData,
  TranslationDict,
  WebDAVService,
  DBSearchHistory,
  DBSearchBookmarks,
} from "../types";
import { dbManager } from "./database";
import {
  aiTranslationPath,
  imagePath,
  originalImagePath,
  thumbnailPath,
} from "./glv";

interface Config {
  cookie: string; // 登录Cookie
  exhentai: boolean; // 是否登录Exhentai
  syncMyTags: boolean; // 是否同步我的标签
  mpvAvailable: boolean; // 是否可用MPV
  homepageManagerLayoutMode: "large" | "normal"; // 主页管理器布局模式
  archiveManagerLayoutMode: "large" | "normal"; // 存档管理器布局模式
  tagManagerOnlyShowBookmarked: boolean; // 标签管理器仅显示已收藏的标签
  webdavIntroductionFirstRead: boolean; // 是否首次阅读WebDAV介绍
  importingArchiverIntroductionRead: boolean; // 是否阅读过导入压缩包的介绍
  archiveManagerOrderMethod:
    | "first_access_time"
    | "last_access_time"
    | "posted_time"; // 存档管理器排序方式
  favoritesOrderMethod: "published_time" | "favorited_time"; // 收藏页排序方式（与网页同步）
  alwaysShowWebDAVWidget: boolean; // 是否始终显示WebDAV组件
  webdavEnabled: boolean; // 是否启用WebDAV
  webdavAutoUpload: boolean; // 是否自动上传到WebDAV
  translationUpdateTime: string; // 标签翻译更新时间
  defaultFavcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 默认收藏到
  mytagsApiuid: number;
  mytagsApikey: string;
  selectedAiTranslationService: string; // 选择的AI翻译服务
  aiTranslationSavedConfigText: string; // AI翻译配置
  autoClearCache: boolean; // 是否在关闭时自动清除缓存
  autoCacheWhenReading: boolean; // 阅读时是否自动缓存整个图库
  pageTurnMethod: "click_and_swipe" | "click" | "swipe"; // 翻页方式
  startPageType:
    | "blank_page"
    | "last_access"
    | "specific_page"
    | "specific_searchterms"; // 起始页面类型
  lastAccessPageJson: string; // 上次访问页面, 以json格式存储的StatusTabOptions
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
  specificSearchtermsOnStart: string; // 指定搜索词
}

const defaultConfig: Config = {
  cookie: "",
  exhentai: false,
  syncMyTags: false,
  mpvAvailable: false,
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
  selectedAiTranslationService: "",
  aiTranslationSavedConfigText: "{}",
  autoClearCache: false,
  autoCacheWhenReading: true,
  pageTurnMethod: "click_and_swipe",
  startPageType: "blank_page",
  lastAccessPageJson: "",
  specificPageTypeOnStart: "front_page",
  specificSearchtermsOnStart: "",
};

async function getEhTagTranslationText() {
  const url =
    "https://api.github.com/repos/EhTagTranslation/Database/releases/latest";
  const resp = await $http.get({ url: url, timeout: 30 });
  const info: {
    assets: { name: string; browser_download_url: string }[];
  } = resp.data;
  const dbUrl = info.assets.find(
    (i) => i.name === "db.full.json"
  )!.browser_download_url;
  const resp2 = await $http.get({ url: dbUrl, timeout: 30 });
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
  data.data.sort(
    (a: any, b: any) =>
      tagNamespaces.indexOf(a.namespace) - tagNamespaces.indexOf(b.namespace)
  );
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
  pushedSearchResultControllerLayoutMode: "large" | "normal";
  private _aiTranslationSavedConfig: Record<string, any>;
  // 用于控制搜索结果页面的布局模式，其初始值和homepageManagerLayoutMode相同，但后续可以被PushedSearchResultController组件修改
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
    this.pushedSearchResultControllerLayoutMode =
      this.homepageManagerLayoutMode;
    this._aiTranslationSavedConfig = JSON.parse(
      this.aiTranslationSavedConfigText
    );
  }

  private _initConfig() {
    dbManager.batchUpdate(
      `INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING;`,
      Object.entries(defaultConfig).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ])
    );
    const existingConfig = dbManager
      .query("SELECT * FROM config")
      .map(({ key, value }) => [key, JSON.parse(value)]);
    return Object.fromEntries(existingConfig) as Config;
  }

  private _setConfig(key: keyof Config, value: number | boolean | string) {
    (this._config[key] as any) = value;
    dbManager.update("UPDATE config SET value = ? WHERE key = ?", [
      JSON.stringify(value),
      key,
    ]);
  }

  /***CONFIG***/
  get cookie() {
    return this._config.cookie;
  }

  set cookie(value: string) {
    this._setConfig("cookie", value);
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

  get homepageManagerLayoutMode() {
    return this._config.homepageManagerLayoutMode;
  }

  set homepageManagerLayoutMode(value: "large" | "normal") {
    this._setConfig("homepageManagerLayoutMode", value);
  }

  get archiveManagerLayoutMode() {
    return this._config.archiveManagerLayoutMode;
  }

  set archiveManagerLayoutMode(value: "large" | "normal") {
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

  set archiveManagerOrderMethod(
    value: "first_access_time" | "last_access_time" | "posted_time"
  ) {
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

  get selectedAiTranslationService() {
    return this._config.selectedAiTranslationService;
  }

  set selectedAiTranslationService(value: string) {
    this._setConfig("selectedAiTranslationService", value);
  }

  get aiTranslationSavedConfigText() {
    return this._config.aiTranslationSavedConfigText;
  }

  set aiTranslationSavedConfigText(value: string) {
    this._setConfig("aiTranslationSavedConfigText", value);
  }

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

  get pageTurnMethod() {
    return this._config.pageTurnMethod;
  }

  set pageTurnMethod(value: "click_and_swipe" | "click" | "swipe") {
    this._setConfig("pageTurnMethod", value);
  }

  get startPageType() {
    return this._config.startPageType;
  }

  set startPageType(
    value:
      | "blank_page"
      | "last_access"
      | "specific_page"
      | "specific_searchterms"
  ) {
    this._setConfig("startPageType", value);
  }

  get lastAccessPageJson() {
    return this._config.lastAccessPageJson;
  }

  set lastAccessPageJson(value: string) {
    this._setConfig("lastAccessPageJson", value);
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
      | "upload"
  ) {
    this._setConfig("specificPageTypeOnStart", value);
  }

  get specificSearchtermsOnStart() {
    return this._config.specificSearchtermsOnStart;
  }

  set specificSearchtermsOnStart(value: string) {
    this._setConfig("specificSearchtermsOnStart", value);
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
    const sql = "SELECT * FROM marked_tags";
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
      const data: [string, MarkedTag][] = tags
        .filter((t) => t.namespace === namespace)
        .map((t) => [t.name, t]);
      result.set(namespace, new Map(data));
    }
    return result;
  }

  updateAllMarkedTags(markedTags: MarkedTag[]) {
    // 更新marked_tags表, 从服务器获取数据后调用（而非本地添加/删除）
    const sql_remove = "DELETE FROM marked_tags";
    dbManager.update(sql_remove);
    dbManager.batchInsert(
      "marked_tags",
      ["tagid", "namespace", "name", "watched", "hidden", "color", "weight"],
      markedTags.map((t) => [
        t.tagid,
        t.namespace,
        t.name,
        t.watched,
        t.hidden,
        t.color || "",
        t.weight,
      ])
    );
    const result = new Map() as MarkedTagDict;
    for (const namespace of tagNamespaces) {
      const data: [string, MarkedTag][] = markedTags
        .filter((t) => t.namespace === namespace)
        .map((t) => [t.name, t]);
      result.set(namespace, new Map(data));
    }
    this._markedTagDict = result;
  }

  getMarkedTag(namespace: TagNamespace, name: string): MarkedTag | undefined {
    const data = this._markedTagDict.get(namespace)?.get(name);
    return data;
  }

  updateMarkedTag(tag: MarkedTag) {
    const sql =
      "UPDATE marked_tags SET tagid = ?, watched = ?, hidden = ?, color = ?, weight = ? WHERE namespace = ? AND name = ?";
    const args = [
      tag.tagid,
      tag.watched,
      tag.hidden,
      tag.color,
      tag.weight,
      tag.namespace,
      tag.name,
    ];
    dbManager.update(sql, args);
    if (!this._markedTagDict.get(tag.namespace)) {
      this._markedTagDict.set(tag.namespace, new Map());
    }
    this._markedTagDict.get(tag.namespace)!.set(tag.name, tag);
  }

  addMarkedTag(tag: MarkedTag) {
    // 添加marked_tags中的记录, 仅用于本地添加
    const sql =
      "INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight) VALUES (?, ?, ?, ?, ?, ?, ?)";
    const args = [
      tag.tagid,
      tag.namespace,
      tag.name,
      tag.watched,
      tag.hidden,
      tag.color || "",
      tag.weight,
    ];
    dbManager.update(sql, args);
    if (!this._markedTagDict.get(tag.namespace)) {
      this._markedTagDict.set(tag.namespace, new Map());
    }
    this._markedTagDict.get(tag.namespace)!.set(tag.name, tag);
  }

  deleteMarkedTag(namespace: TagNamespace, name: string) {
    // 删除marked_tags中的记录, 仅用于本地删除
    const sql = "DELETE FROM marked_tags WHERE namespace = ? AND name = ?";
    const args = [namespace, name];
    dbManager.update(sql, args);
    this._markedTagDict.get(namespace)!.delete(name);
  }

  get markedUploaders() {
    return this._markedUploaders;
  }

  private _queryMarkedUploaders() {
    const sql = "SELECT * FROM marked_uploaders";
    const data = dbManager.query(sql) as {
      uploader: string;
    }[];
    return data.map((d) => d.uploader);
  }

  addMarkedUploader(uploader: string) {
    const sql =
      "INSERT INTO marked_uploaders (uploader) VALUES (?) ON CONFLICT (uploader) DO NOTHING";
    const args = [uploader];
    dbManager.update(sql, args);
    this._markedUploaders = this._queryMarkedUploaders();
  }

  deleteMarkedUploader(uploader: string) {
    const sql = "DELETE FROM marked_uploaders WHERE uploader = ?";
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
    const sql_remove_marked = `DELETE FROM marked_uploaders WHERE uploader IN (SELECT uploader FROM banned_uploaders);`;
    dbManager.update(sql_remove);
    dbManager.batchInsert(
      "banned_uploaders",
      ["uploader"],
      uploaders.map((u) => [u])
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
      titles.map((t, i) => [i, t])
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
    const sql =
      "SELECT * FROM translation_data where namespace = ? and name = ?";
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
    const text = await getEhTagTranslationText();
    const data: any = JSON.parse(text);
    const time: string = data.head.committer.when;
    const translationData = extractTranslationData(data);
    dbManager.update(sql_delete_translation_data);
    this.translationUpdateTime = time;
    dbManager.batchInsert(
      "translation_data",
      ["namespace", "name", "translation", "intro", "links"],
      translationData.map((d) => [
        d.namespace,
        d.name,
        d.translation,
        d.intro,
        d.links,
      ])
    );
    const r = this._queryTranslationDict();
    this._translationList = r.translationList;
    this._translationDict = r.translationDict;
  }

  private _querySearchHistory() {
    const sql = `
SELECT 
    h.id,
    h.last_access_time,
    h.sorted_fsearch,
    GROUP_CONCAT(
        COALESCE(t.namespace, '') || '|' ||
        COALESCE(t.qualifier, '') || '|' ||
        COALESCE(t.term, '') || '|' ||
        COALESCE(t.dollar, 0) || '|' ||
        COALESCE(t.subtract, 0) || '|' ||
        COALESCE(t.tilde, 0), ';'
    ) AS search_terms
FROM 
    search_history AS h
LEFT JOIN 
    search_history_search_terms AS t
ON 
    h.id = t.search_history_id
GROUP BY 
    h.id;
`;
    const rows = dbManager.query(sql) as {
      id: number;
      last_access_time: string;
      sorted_fsearch: string;
      search_terms: string;
    }[];
    const result = rows
      .map((row) => ({
        id: row.id,
        last_access_time: row.last_access_time,
        sorted_fsearch: row.sorted_fsearch,
        searchTerms: row.search_terms
          ? row.search_terms.split(";").map((term) => {
              const [namespace, qualifier, termText, dollar, subtract, tilde] =
                term.split("|");
              return {
                namespace: namespace ? (namespace as TagNamespace) : undefined,
                qualifier: qualifier ? (qualifier as EHQualifier) : undefined,
                term: termText,
                dollar: Boolean(Number(dollar)),
                subtract: Boolean(Number(subtract)),
                tilde: Boolean(Number(tilde)),
              };
            })
          : [],
      }))
      .sort((a, b) => b.last_access_time.localeCompare(a.last_access_time));
    return result;
  }

  addOrUpdateSearchHistory(sortedFsearch: string, searchTerms: EHSearchTerm[]) {
    const sql_check = "SELECT id FROM search_history WHERE sorted_fsearch = ?";
    const args_check = [sortedFsearch];
    const id = dbManager.query(sql_check, args_check)[0]?.id;
    const last_access_time = new Date().toISOString();
    if (id) {
      const sql_update =
        "UPDATE search_history SET last_access_time = ? WHERE id = ?";
      const args_update = [last_access_time, id];
      dbManager.update(sql_update, args_update);
      this._searchHistory.find((item) => item.id === id)!.last_access_time =
        last_access_time;
      this._searchHistory.sort((a, b) =>
        b.last_access_time.localeCompare(a.last_access_time)
      );
    } else {
      const sql_insert_history =
        "INSERT INTO search_history (last_access_time, sorted_fsearch) VALUES (?, ?)";
      const args_insert_history = [last_access_time, sortedFsearch];
      dbManager.update(sql_insert_history, args_insert_history);
      const sql_get_id =
        "SELECT id FROM search_history WHERE sorted_fsearch = ?";
      const args_get_id = [sortedFsearch];
      const id = dbManager.query(sql_get_id, args_get_id)[0].id;
      const sql_insert_terms =
        "INSERT INTO search_history_search_terms (search_history_id, namespace, qualifier, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?, ?)";
      const args_insert_terms = searchTerms.map((term) => [
        id,
        term.namespace,
        term.qualifier,
        term.term,
        Number(term.dollar),
        Number(term.subtract),
        Number(term.tilde),
      ]);
      dbManager.batchUpdate(sql_insert_terms, args_insert_terms);
      this._searchHistory.unshift({
        id,
        last_access_time,
        sorted_fsearch: sortedFsearch,
        searchTerms,
      });
    }
  }

  deleteSearchHistory(id: number) {
    const sql_delete = "DELETE FROM search_history WHERE id = ?";
    dbManager.update(sql_delete, [id]);
    const sql_delete_terms =
      "DELETE FROM search_history_search_terms WHERE search_history_id = ?";
    dbManager.update(sql_delete_terms, [id]);
    const index_delete = this._searchHistory.findIndex(
      (item) => item.id === id
    );
    if (index_delete !== -1) {
      this._searchHistory.splice(index_delete, 1);
    }
  }

  private _querySearchBookmarks() {
    const sql = `
SELECT
    b.id,
    b.sort_order,
    b.sorted_fsearch,
    GROUP_CONCAT(
        COALESCE(t.namespace, '') || '|' ||
        COALESCE(t.qualifier, '') || '|' ||
        COALESCE(t.term, '') || '|' ||
        COALESCE(t.dollar, 0) || '|' ||
        COALESCE(t.subtract, 0) || '|' ||
        COALESCE(t.tilde, 0), ';'
    ) AS search_terms
FROM 
    search_bookmarks AS b
LEFT JOIN 
    search_bookmarks_search_terms AS t
ON 
    b.id = t.search_bookmarks_id
GROUP BY 
    b.id;
`;
    const rows = dbManager.query(sql) as {
      id: number;
      sort_order: number;
      sorted_fsearch: string;
      search_terms: string;
    }[];
    const result = rows
      .map((row) => ({
        id: row.id,
        sort_order: row.sort_order,
        sorted_fsearch: row.sorted_fsearch,
        searchTerms: row.search_terms
          ? row.search_terms.split(";").map((term) => {
              const [namespace, qualifier, termText, dollar, subtract, tilde] =
                term.split("|");
              return {
                namespace: namespace ? (namespace as TagNamespace) : undefined,
                qualifier: qualifier ? (qualifier as EHQualifier) : undefined,
                term: termText,
                dollar: Boolean(Number(dollar)),
                subtract: Boolean(Number(subtract)),
                tilde: Boolean(Number(tilde)),
              };
            })
          : [],
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
    return result;
  }

  addSearchBookmark(sortedFsearch: string, searchTerms: EHSearchTerm[]) {
    const sql_check =
      "SELECT id FROM search_bookmarks WHERE sorted_fsearch = ?";
    const args_check = [sortedFsearch];
    const id = dbManager.query(sql_check, args_check)[0]?.id;
    if (id) {
      return false;
    } else {
      const sql_insert_bookmark =
        "INSERT INTO search_bookmarks (sort_order, sorted_fsearch) VALUES (?, ?)";
      const newSortOrder =
        this._searchBookmarks.length === 0
          ? 0
          : this._searchBookmarks[this._searchBookmarks.length - 1].sort_order +
            1;
      const args_insert_bookmark = [newSortOrder, sortedFsearch];
      dbManager.update(sql_insert_bookmark, args_insert_bookmark);
      const sql_get_id =
        "SELECT id FROM search_bookmarks WHERE sorted_fsearch = ?";
      const args_get_id = [sortedFsearch];
      const id = dbManager.query(sql_get_id, args_get_id)[0].id;
      const sql_insert_terms =
        "INSERT INTO search_bookmarks_search_terms (search_bookmarks_id, namespace, qualifier, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?, ?)";
      const args_insert_terms = searchTerms.map((term) => [
        id,
        term.namespace,
        term.qualifier,
        term.term,
        Number(term.dollar),
        Number(term.subtract),
        Number(term.tilde),
      ]);
      dbManager.batchUpdate(sql_insert_terms, args_insert_terms);
      this._searchBookmarks.push({
        id,
        sort_order: newSortOrder,
        sorted_fsearch: sortedFsearch,
        searchTerms,
      });
      return true;
    }
  }

  deleteSearchBookmark(id: number) {
    const sql_delete = "DELETE FROM search_bookmarks WHERE id = ?";
    dbManager.update(sql_delete, [id]);
    const sql_delete_terms =
      "DELETE FROM search_bookmarks_search_terms WHERE search_bookmarks_id = ?";
    dbManager.update(sql_delete_terms, [id]);
    const index_delete = this._searchBookmarks.findIndex(
      (item) => item.id === id
    );
    if (index_delete !== -1) {
      this._searchBookmarks.splice(index_delete, 1);
    }
    this.reorderSearchBookmarks(this._searchBookmarks.map((item) => item.id));
  }

  reorderSearchBookmarks(resorted_ids: number[]) {
    const sql_update =
      "UPDATE search_bookmarks SET sort_order = ? WHERE id = ?";
    dbManager.batchUpdate(
      sql_update,
      resorted_ids.map((id, index) => [index, id])
    );
    this._searchBookmarks = this._querySearchBookmarks();
  }

  getTenMostAccessedTags() {
    const sql = "SELECT * FROM tag_access_count ORDER BY count DESC LIMIT 10";
    const data = dbManager.query(sql) as {
      namespace: TagNamespace;
      qualifier: EHQualifier;
      term: string;
      count: number;
    }[];
    return data;
  }

  updateTagAccessCount(tags: EHSearchTerm[]) {
    const sql = `
INSERT INTO tag_access_count (namespace, qualifier, term, count)
VALUES (?, ?, ?, 1)
ON CONFLICT(namespace, qualifier, term)
DO UPDATE SET count = count + 1;
`;
    // qualifier仅保留uploader
    dbManager.batchUpdate(
      sql,
      tags.map((tag) => [
        tag.namespace || "",
        tag.qualifier || "",
        tag.term || "",
      ])
    );
  }

  getSomeLastAccessSearchTerms(): EHSearchTerm[] {
    const sql = `
SELECT 
    namespace,
    qualifier,
    term
FROM (
    SELECT 
        search_history_search_terms.namespace,
        search_history_search_terms.qualifier,
        search_history_search_terms.term,
        search_history.last_access_time,
        ROW_NUMBER() OVER (
            PARTITION BY 
                search_history_search_terms.namespace,
                search_history_search_terms.qualifier,
                search_history_search_terms.term
            ORDER BY 
                search_history.last_access_time DESC
        ) AS row_num
    FROM 
        search_history_search_terms
    JOIN 
        search_history
    ON 
        search_history_search_terms.search_history_id = search_history.id
) 
WHERE row_num = 1
ORDER BY last_access_time DESC
LIMIT 20;
`;
    const data = dbManager.query(sql) as {
      namespace: string;
      term: string;
      qualifier: string;
      dollar: number;
      subtract: number;
      tilde: number;
      last_access_time: string;
    }[];
    return data.map((n) => ({
      namespace: n.namespace ? (n.namespace as TagNamespace) : undefined,
      term: n.term,
      qualifier: n.qualifier ? (n.qualifier as EHQualifier) : undefined,
      dollar: Boolean(n.dollar),
      subtract: Boolean(n.subtract),
      tilde: Boolean(n.tilde),
    }));
  }

  private _queryWebDAVServices(): WebDAVService[] {
    const sql = "SELECT * FROM webdav_services";
    const data = dbManager.query(sql) as {
      name: string;
      host: string;
      port: number | null;
      path: string | null;
      https: 0 | 1;
      username: string | null;
      password: string | null;
      enabled: 0 | 1;
    }[];
    return data.map((n) => ({
      name: n.name,
      host: n.host,
      port: n.port || undefined,
      path: n.path || undefined,
      https: Boolean(n.https),
      username: n.username || undefined,
      password: n.password || undefined,
      enabled: Boolean(n.enabled),
    }));
  }

  updateAllWebDAVServices(services: WebDAVService[]) {
    const sql_remove = "DELETE FROM webdav_services";
    const sql_update =
      "INSERT INTO webdav_services (name, host, port, https, path, username, password, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    dbManager.update(sql_remove);
    dbManager.batchUpdate(
      sql_update,
      services.map((service) => [
        service.name,
        service.host,
        service.port,
        service.https,
        service.path,
        service.username,
        service.password,
        service.enabled,
      ])
    );
    this._webDAVServices = services;
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

  get aiTranslationServiceConfig() {
    return this._aiTranslationSavedConfig;
  }

  saveAiTranslationServiceConfig(config: Record<string, any>) {
    this._aiTranslationSavedConfig = config;
    this.aiTranslationSavedConfigText = JSON.stringify(config);
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
    // 再根据日期对出符合条件的id
    const sql = "SELECT id FROM search_history WHERE last_access_time < ?";
    const data = dbManager.query(sql, [date.toISOString()]) as {
      id: number;
    }[];
    const needDeleteIds = data.map((n) => n.id);
    const sql_delete = "DELETE FROM search_history WHERE id = ?";
    const sql_delete_terms =
      "DELETE FROM search_history_search_terms WHERE search_history_id = ?";
    dbManager.batchUpdate(
      sql_delete_terms,
      needDeleteIds.map((id) => [id])
    );
    dbManager.batchUpdate(
      sql_delete,
      needDeleteIds.map((id) => [id])
    );
    this._searchHistory = this._querySearchHistory();
  }

  /**
   * 清除较旧的阅读记录, 排除下载项
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
    const sql =
      "SELECT gid FROM archives WHERE last_access_time < ? AND downloaded <> 1";
    const data = dbManager.query(sql, [date.toISOString()]) as {
      gid: number;
    }[];
    const needDeleteGids = data.map((n) => n.gid);
    const sql_delete = "DELETE FROM archives WHERE gid = ?";
    const sql_delete_taglist = "DELETE FROM archive_taglist WHERE gid = ?";
    dbManager.batchUpdate(
      sql_delete,
      needDeleteGids.map((gid) => [gid])
    );
    dbManager.batchUpdate(
      sql_delete_taglist,
      needDeleteGids.map((gid) => [gid])
    );
  }

  /**
   * 清除缓存
   * 规则：
   * 1. 删除thumbnailPath
   * 2. 删除originalImagePath
   * 3. 删除aiTranslationPath
   * 4. 在imagePath中，查找所有没有被标注为"downloaded"的文件夹，删除它们
   */
  clearCache() {
    $file.delete(thumbnailPath);
    $file.delete(originalImagePath);
    $file.delete(aiTranslationPath);
    const sql = "SELECT gid FROM archives WHERE downloaded <> 1";
    const data = dbManager.query(sql) as {
      gid: number;
    }[];
    const needDeleteGids = data.map((n) => n.gid);
    const imageDirs = $file.list(imagePath);
    for (const dir of imageDirs) {
      const gid = parseInt(dir);
      if (needDeleteGids.includes(gid)) {
        $file.delete(imagePath + dir);
      }
    }
  }

  /**
   * 清除所有缓存和下载内容
   */
  clearAll() {
    $file.delete(thumbnailPath);
    $file.delete(originalImagePath);
    $file.delete(aiTranslationPath);
    $file.delete(imagePath);
    // 删除archives和archive_taglist表中所有数据
    const sql_delete_archive_taglist = "DELETE FROM archive_taglist";
    const sql_delete_archives = "DELETE FROM archives";
    dbManager.update(sql_delete_archive_taglist);
    dbManager.update(sql_delete_archives);
  }
}

export const configManager = new ConfigManager();
