import { TagNamespace, tagNamespaces } from "ehentai-parser";
import { MarkedTag, MarkedTagDict, TranslationData, TranslationDict, SavedSearchKeyword, WebDAVService } from "../types";
import { dbManager } from "./database";

interface Config {
  cookie: string;
  exhentai: boolean;
  syncMyTags: boolean;
  mpvAvailable: boolean;
  homepageManagerLayoutMode: "large" | "normal",
  archiveManagerLayoutMode: "large" | "normal",
  tagManagerOnlyShowBookmarked: boolean,
  webdavIntroductionFirstRead: boolean,
  autopagerInterval: number,
  downloadsOrderMethod: "gid" | "downloaded_time",
  favoritesOrderMethod: "favorited_time" | "published_time",
  webdavEnabled: boolean,
  selectedWebdavService: number,
  webdavAutoUpload: boolean,
  translationUpdateTime: string
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
  autopagerInterval: 5,
  downloadsOrderMethod: "gid",
  favoritesOrderMethod: "favorited_time",
  webdavEnabled: true,
  selectedWebdavService: -1,
  webdavAutoUpload: false,
  translationUpdateTime: new Date(0).toISOString()
}

async function getEhTagTranslationText() {
  const url = "https://api.github.com/repos/EhTagTranslation/Database/releases/latest";
  const resp = await $http.get({ url: url, timeout: 30 });
  const info: {
    assets: { name: string; browser_download_url: string }[];
  } = resp.data;
  const dbUrl = info.assets.find(i => i.name === "db.full.json")!.browser_download_url;
  console.log(dbUrl)
  const resp2 = await $http.get({ url: dbUrl, timeout: 30 });
  console.log(resp2)
  return resp2.rawData.string || "";
}

function extractTranslationData(data: any): TranslationData {
  const result: TranslationData = []
  // 去掉data.data中namespace为`rows`的第一个元素
  const index = data.data.findIndex((i: any) => i.namespace === "rows")
  if (index !== -1) {
    data.data.splice(index, 1)
  }
  // 排序: 根据namespaces的顺序对data.data进行排序
  data.data.sort((a: any, b: any) => tagNamespaces.indexOf(a.namespace) - tagNamespaces.indexOf(b.namespace))
  for (const namespaceData of data.data) {
    const namespace = namespaceData.namespace
    // 排序: 根据raw的顺序对namespaceData.data进行排序
    const entries: any = Object.entries(namespaceData.data)
    entries.sort((a: any, b: any) => a[0].localeCompare(b[0]))
    for (const [raw, rowData] of entries) {
      const translation = rowData.name.text
      const intro = rowData.intro.html
      const links = rowData.links.html
      result.push({ namespace, name: raw, translation, intro, links })
    }
  }
  return result
}

class ConfigManager {
  private _config: Config;
  private _markedTagDict: MarkedTagDict
  private _markedUploaders: string[]
  private _bannedUploaders: string[]
  private _favcatTitles: string[]
  private _translationDict: TranslationDict
  private _savedSearchKeywords: SavedSearchKeyword[]
  private _webDAVServices: WebDAVService[]
  constructor() {
    this._config = this._initConfig()
    this._markedTagDict = this._getMarkedTagsDict()
    this._markedUploaders = this._queryMarkedUploaders()
    this._bannedUploaders = this._queryBannedUploaders()
    this._favcatTitles = this._queryFavcatTitles()
    this._translationDict = this._queryTranslationDict()
    this._savedSearchKeywords = this._querySavedSearchKeywords()
    this._webDAVServices = this._queryWebDAVServices()
  }

  private _initConfig() {
    dbManager.batchUpdate(
      `INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING;`,
      Object.entries(defaultConfig).map(([key, value]) => [key, JSON.stringify(value)])
    );
    const existingConfig = dbManager.query("SELECT * FROM config").map(({ key, value }) => ([key, JSON.parse(value)]));
    return Object.fromEntries(existingConfig) as Config
  }

  private _setConfig(key: keyof Config, value: number | boolean | string) {
    (this._config[key] as any) = value
    dbManager.update("UPDATE config SET value = ? WHERE key = ?", [JSON.stringify(value), key])
  }

  get cookie() {
    return this._config.cookie
  }

  set cookie(value: string) {
    this._setConfig("cookie", value)
  }

  get exhentai() {
    return this._config.exhentai
  }

  set exhentai(value: boolean) {
    this._setConfig("exhentai", value)
  }

  get syncMyTags() {
    return this._config.syncMyTags
  }

  set syncMyTags(value: boolean) {
    this._setConfig("syncMyTags", value)
  }

  get mpvAvailable() {
    return this._config.mpvAvailable
  }

  set mpvAvailable(value: boolean) {
    this._setConfig("mpvAvailable", value)
  }

  get homepageManagerLayoutMode() {
    return this._config.homepageManagerLayoutMode
  }

  set homepageManagerLayoutMode(value: "large" | "normal") {
    this._setConfig("homepageManagerLayoutMode", value)
  }

  get archiveManagerLayoutMode() {
    return this._config.archiveManagerLayoutMode
  }

  set archiveManagerLayoutMode(value: "large" | "normal") {
    this._setConfig("archiveManagerLayoutMode", value)
  }

  get tagManagerOnlyShowBookmarked() {
    return this._config.tagManagerOnlyShowBookmarked
  }

  set tagManagerOnlyShowBookmarked(value: boolean) {
    this._setConfig("tagManagerOnlyShowBookmarked", value)
  }

  get webdavIntroductionFirstRead() {
    return this._config.webdavIntroductionFirstRead
  }

  set webdavIntroductionFirstRead(value: boolean) {
    this._setConfig("webdavIntroductionFirstRead", value)
  }

  get autopagerInterval() {
    return this._config.autopagerInterval
  }

  set autopagerInterval(value: number) {
    this._setConfig("autopagerInterval", value)
  }

  get downloadsOrderMethod() {
    return this._config.downloadsOrderMethod
  }

  set downloadsOrderMethod(value: "gid" | "downloaded_time") {
    this._setConfig("downloadsOrderMethod", value)
  }

  get favoritesOrderMethod() {
    return this._config.favoritesOrderMethod
  }

  set favoritesOrderMethod(value: "favorited_time" | "published_time") {
    this._setConfig("favoritesOrderMethod", value)
  }

  get webdavEnabled() {
    return this._config.webdavEnabled
  }

  set webdavEnabled(value: boolean) {
    this._setConfig("webdavEnabled", value)
  }

  get selectedWebdavService() {
    return this._config.selectedWebdavService
  }

  set selectedWebdavService(value: number) {
    this._setConfig("selectedWebdavService", value)
  }

  get webdavAutoUpload() {
    return this._config.webdavAutoUpload
  }

  set webdavAutoUpload(value: boolean) {
    this._setConfig("webdavAutoUpload", value)
  }

  get translationUpdateTime() {
    return this._config.translationUpdateTime
  }

  set translationUpdateTime(value: string) {
    this._setConfig("translationUpdateTime", value)
  }

  get translationDict() {
    return this._translationDict
  }

  get markedTagDict() {
    return this._markedTagDict
  }

  private _getMarkedTagsDict() {
    const sql = "SELECT * FROM marked_tags"
    const data = dbManager.query(sql) as {
      tagid: number;
      namespace: TagNamespace;
      name: string;
      watched: 0 | 1;
      hidden: 0 | 1;
      color: string;
      weight: number;
    }[]
    const tags = data.map(d => ({
      tagid: d.tagid,
      namespace: d.namespace,
      name: d.name,
      watched: Boolean(d.watched),
      hidden: Boolean(d.hidden),
      color: d.color,
      weight: d.weight
    }))
    const result = {} as MarkedTagDict
    for (const namespace of tagNamespaces) {
      const data = tags.filter(t => t.namespace === namespace)
      result[namespace] = Object.fromEntries(data.map(t => ([t.name, t])))
    }
    return result
  }

  updateAllMarkedTags(markedTags: MarkedTag[]) {
    const sql_remove = "DELETE FROM marked_tags"
    const sql_update = "INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight) VALUES (?, ?, ?, ?, ?, ?, ?)"
    dbManager.update(sql_remove)
    dbManager.batchUpdate(sql_update, markedTags.map(t => [t.tagid, t.namespace, t.name, t.watched, t.hidden, t.color || "", t.weight]))
    const result = {} as MarkedTagDict
    for (const namespace of tagNamespaces) {
      const data = markedTags.filter(t => t.namespace === namespace)
      result[namespace] = Object.fromEntries(data.map(t => ([t.name, t])))
    }
    this._markedTagDict = result
  }

  getMarkedTag(namespace: TagNamespace, name: string): MarkedTag | undefined {
    const data = this._markedTagDict[namespace][name]
    return data
  }

  updateMarkedTag(tag: MarkedTag) {
    const sql = "UPDATE marked_tags SET tagid = ?, watched = ?, hidden = ?, color = ?, weight = ? WHERE namespace = ? AND name = ?"
    const args = [tag.tagid, tag.watched, tag.hidden, tag.color, tag.weight, tag.namespace, tag.name]
    dbManager.update(sql, args)
    this._markedTagDict[tag.namespace][tag.name] = tag
  }

  deleteMarkedTag(namespace: TagNamespace, name: string) {
    const sql = "DELETE FROM marked_tags WHERE namespace = ? AND name = ?"
    const args = [namespace, name]
    dbManager.update(sql, args)
    delete this._markedTagDict[namespace][name]
  }

  get markedUploaders() {
    return this._markedUploaders
  }

  private _queryMarkedUploaders() {
    const sql = "SELECT * FROM marked_uploaders"
    const data = dbManager.query(sql) as {
      uploader: string;
    }[]
    return data.map(d => d.uploader)
  }

  addMarkedUploader(uploader: string) {
    const sql = "INSERT INTO marked_uploaders (uploader) VALUES (?) ON CONFLICT (uploader) DO NOTHING"
    const args = [uploader]
    dbManager.update(sql, args)
    this._markedUploaders = this._queryMarkedUploaders()
  }

  deleteMarkedUploader(uploader: string) {
    const sql = "DELETE FROM marked_uploaders WHERE uploader = ?"
    const args = [uploader]
    dbManager.update(sql, args)
    this._markedUploaders = this._queryMarkedUploaders()
  }

  get bannedUploaders() {
    return this._bannedUploaders
  }

  private _queryBannedUploaders() {
    const sql = "SELECT * FROM banned_uploaders"
    const data = dbManager.query(sql) as {
      uploader: string;
    }[]
    return data.map(d => d.uploader)
  }

  updateAllBannedUploaders(uploaders: string[]) {
    const sql_remove = "DELETE FROM banned_uploaders"
    const sql_update = "INSERT INTO banned_uploaders (uploader) VALUES (?)"
    // 另外需要删除marked_uploaders中的被禁止的上传者
    const sql_remove_marked = `DELETE FROM marked_uploaders WHERE uploader IN (SELECT uploader FROM banned_uploaders);`
    dbManager.update(sql_remove)
    dbManager.batchUpdate(sql_update, uploaders.map(u => [u]))
    dbManager.update(sql_remove_marked)
    this._bannedUploaders = uploaders
  }

  get favcatTitles() {
    return this._favcatTitles
  }

  private _queryFavcatTitles() {
    const sql = "SELECT * FROM favcat_titles"
    const data = dbManager.query(sql) as {
      favcat: number;
      title: string;
    }[]
    return data.map(d => d.title)
  }

  updateAllFavcatTitles(titles: string[]) {
    const sql_remove = "DELETE FROM favcat_titles"
    const sql_update = "INSERT INTO favcat_titles (favcat, title) VALUES (?, ?)"
    dbManager.update(sql_remove)
    dbManager.batchUpdate(sql_update, titles.map((t, i) => ([i, t])))
    this._favcatTitles = titles
  }

  private _queryTranslationDict(): TranslationDict {
    const sql = "SELECT namespace, name, translation FROM translation_data"
    const data = dbManager.query(sql) as {
      namespace: string;
      name: string;
      translation: string;
    }[]
    const result = {} as TranslationDict
    for (const namespace of tagNamespaces) {
      const data_ = data.filter(d => d.namespace === namespace).map(d => ([d.name, d.translation]))
      result[namespace] = Object.fromEntries(data_)
    }
    return result
  }

  translate(namespace: TagNamespace, name: string): string | undefined {
    return this._translationDict[namespace]?.[name]
  }

  getTranslationDetailedInfo(namespace: TagNamespace, name: string) {
    const sql = "SELECT * FROM translation_data where namespace = ? and name = ?"
    const args = [namespace, name]
    const data = dbManager.query(sql, args) as {
      namespace: TagNamespace;
      name: string;
      translation: string;
      intro: string;
      links: string;
    }[]
    if (data.length === 0) {
      return
    } else {
      return data[0]
    }
  }

  async updateTranslationData() {
    const sql_update_translation_data = "INSERT INTO translation_data (namespace, name, translation, intro, links) VALUES (?, ?, ?, ?, ?)"
    const sql_delete_translation_data = "DELETE FROM translation_data"
    const text = await getEhTagTranslationText();
    const data: any = JSON.parse(text)
    const time: string = data.head.committer.when
    const translationData = extractTranslationData(data)
    dbManager.update(sql_delete_translation_data)
    this.translationUpdateTime = time
    dbManager.batchUpdate(sql_update_translation_data, translationData.map(d => [d.namespace, d.name, d.translation, d.intro, d.links]))
    this._translationDict = this._queryTranslationDict()
  }

  private _querySavedSearchKeywords() {
    const sql = "SELECT * FROM saved_search_keywords"
    const data = dbManager.query(sql) as SavedSearchKeyword[]
    data.sort((a, b) => a.order_id - b.order_id)
    return data
  }

  get savedSearchKeywords() {
    return this._savedSearchKeywords
  }

  addSavedSearchKeyword(content: string, name?: string) {
    // 不检查name和content是否特异，如果有需要的话，可以在前端实现
    const sql = `INSERT INTO saved_search_keywords (name, content, order_id)
      VALUES (?, ?, (SELECT IFNULL(MAX(order_id), 0) + 1 FROM OrderedTable));`
    const args = [name, content]
    dbManager.update(sql, args)
    this._savedSearchKeywords = this._querySavedSearchKeywords()
  }

  updateSavedSearchKeyword(id: number, content: string, name?: string) {
    const sql = "UPDATE saved_search_keywords SET name = ?, content = ? WHERE id = ?"
    const args = [name, content, id]
    dbManager.update(sql, args)
    this._savedSearchKeywords = this._querySavedSearchKeywords()
  }

  deleteSavedSearchKeyword(id: number) {
    const sql = "DELETE FROM saved_search_keywords WHERE id = ?"
    const args = [id]
    dbManager.update(sql, args)
    this._savedSearchKeywords = this._querySavedSearchKeywords()
  }

  swapSavedSearchKeywordOrder(keyword1: SavedSearchKeyword, keyword2: SavedSearchKeyword) {
    const sql = "UPDATE saved_search_keywords SET order_id = ? WHERE id = ?"
    const args = [keyword2.order_id, keyword1.id]
    dbManager.update(sql, args)
    const args2 = [keyword1.order_id, keyword2.id]
    dbManager.update(sql, args2)
    this._savedSearchKeywords = this._querySavedSearchKeywords()
  }

  private _queryWebDAVServices() {
    const sql = "SELECT * FROM webdav_services"
    const data = dbManager.query(sql) as WebDAVService[]
    return data
  }

  addWebDAVService(service: Omit<WebDAVService, "id">) {
    const sql = "INSERT INTO webdav_services (name, url, username, password) VALUES (?, ?, ?, ?)"
    const args = [service.name, service.url, service.username, service.password]
    dbManager.update(sql, args)
    this._webDAVServices = this._queryWebDAVServices()
  }

  upadteWebDAVService(service: WebDAVService) {
    const sql = "UPDATE webdav_services SET name = ?, url = ?, username = ?, password = ? WHERE id = ?"
    const args = [service.name, service.url, service.username, service.password, service.id]
    dbManager.update(sql, args)
    this._webDAVServices = this._queryWebDAVServices()
  }

  deleteWebDAVService(id: number) {
    const sql = "DELETE FROM webdav_services WHERE id = ?"
    const args = [id]
    dbManager.update(sql, args)
    this._webDAVServices = this._queryWebDAVServices()
  }

  get webDAVServices() {
    return this._webDAVServices
  }

  set webDAVServices(services: WebDAVService[]) {
    this._webDAVServices = services
  }
}

export const configManager = new ConfigManager();
