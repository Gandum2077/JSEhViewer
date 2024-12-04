import { EHQualifier, EHSearchTerm, TagNamespace, tagNamespaces } from "ehentai-parser";
import { MarkedTag, MarkedTagDict, TranslationData, TranslationDict, WebDAVService, DBSearchHistory, DBSearchBookmarks } from "../types";
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
  translationUpdateTime: string,
  defaultFavcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
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
  translationUpdateTime: new Date(0).toISOString(),
  defaultFavcat: 0
}

async function getEhTagTranslationText() {
  const url = "https://api.github.com/repos/EhTagTranslation/Database/releases/latest";
  const resp = await $http.get({ url: url, timeout: 30 });
  const info: {
    assets: { name: string; browser_download_url: string }[];
  } = resp.data;
  const dbUrl = info.assets.find(i => i.name === "db.full.json")!.browser_download_url;
  const resp2 = await $http.get({ url: dbUrl, timeout: 30 });
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
  private _translationList: { namespace: TagNamespace, name: string, translation: string }[]
  private _extraSavedTags: { namespace: TagNamespace, name: string }[]
  private _searchHistory: DBSearchHistory
  private _searchBookmarks: DBSearchBookmarks
  private _webDAVServices: WebDAVService[]
  constructor() {
    this._config = this._initConfig()
    this._markedTagDict = this._getMarkedTagsDict()
    this._markedUploaders = this._queryMarkedUploaders()
    this._bannedUploaders = this._queryBannedUploaders()
    this._favcatTitles = this._queryFavcatTitles()
    const r = this._queryTranslationDict()
    this._translationList = r.translationList
    this._translationDict = r.translationDict
    this._extraSavedTags = this._queryExtraSavedTags()
    this._searchHistory = this._querySearchHistory()
    this._searchBookmarks = this._querySearchBookmarks()
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

  get defaultFavcat() {
    return this._config.defaultFavcat
  }

  set defaultFavcat(value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
    this._setConfig("defaultFavcat", value)
  }

  get translationList() {
    return this._translationList
  }

  get translationDict() {
    return this._translationDict
  }

  get markedTagDict() {
    return this._markedTagDict
  }

  get extraSavedTags() {
    return this._extraSavedTags
  }

  get searchHistory() {
    return this._searchHistory
  }

  get searchBookmarks() {
    return this._searchBookmarks
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

  private _queryTranslationDict() {
    const sql = "SELECT namespace, name, translation FROM translation_data"
    const data = dbManager.query(sql) as {
      namespace: TagNamespace;
      name: string;
      translation: string;
    }[]
    const dict = {} as TranslationDict
    for (const namespace of tagNamespaces) {
      const data_ = data.filter(d => d.namespace === namespace).map(d => ([d.name, d.translation]))
      dict[namespace] = Object.fromEntries(data_)
    }
    return { translationList: data, translationDict: dict }
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
    const r = this._queryTranslationDict()
    this._translationList = r.translationList
    this._translationDict = r.translationDict
    // 此时需要重新检查extra_saved_tags中的标签是否已经被翻译，如果已经被翻译，就删除
    const needDeletedTags = this._extraSavedTags.filter(tag => this.translate(tag.namespace, tag.name))
    if (needDeletedTags.length > 0) {
      const sql_delete_extra_saved_tags = "DELETE FROM extra_saved_tags WHERE namespace = ? AND name = ?"
      dbManager.batchUpdate(sql_delete_extra_saved_tags, needDeletedTags.map(tag => [tag.namespace, tag.name]))
      this._extraSavedTags = this._queryExtraSavedTags()
    }
  }

  private _queryExtraSavedTags() {
    const sql = "SELECT * FROM extra_saved_tags"
    const data = dbManager.query(sql) as {
      namespace: TagNamespace;
      name: string;
    }[]
    return data
  }

  addExtraSavedTag(namespace: TagNamespace, name: string) {
    const sql = "INSERT INTO extra_saved_tags (namespace, name) VALUES (?, ?)"
    const args = [namespace, name]
    dbManager.update(sql, args)
    this._extraSavedTags.push({ namespace, name })
  }

  deleteExtraSavedTag(namespace: TagNamespace, name: string) {
    const sql = "DELETE FROM extra_saved_tags WHERE namespace = ? AND name = ?"
    const args = [namespace, name]
    dbManager.update(sql, args)
    this._extraSavedTags = this._queryExtraSavedTags()
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
`
    const rows = dbManager.query(sql) as {
      id: number;
      last_access_time: string;
      sorted_fsearch: string;
      search_terms: string;
    }[]
    const result = rows.map(row => ({
      id: row.id,
      last_access_time: row.last_access_time,
      sorted_fsearch: row.sorted_fsearch,
      searchTerms: row.search_terms
        ? row.search_terms.split(';').map(term => {
          const [namespace, qualifier, termText, dollar, subtract, tilde] = term.split('|');
          return {
            namespace: namespace ? namespace as TagNamespace : undefined,
            qualifier: qualifier ? qualifier as EHQualifier : undefined,
            term: termText,
            dollar: Boolean(Number(dollar)),
            subtract: Boolean(Number(subtract)),
            tilde: Boolean(Number(tilde))
          };
        })
        : []
    })).sort((a, b) => b.last_access_time.localeCompare(a.last_access_time));
    return result
  }

  addOrUpdateSearchHistory(sortedFsearch: string, searchTerms: EHSearchTerm[]) {
    const sql_check = "SELECT id FROM search_history WHERE sorted_fsearch = ?"
    const args_check = [sortedFsearch]
    const id = dbManager.query(sql_check, args_check)[0]?.id
    const last_access_time = new Date().toISOString()
    if (id) {
      const sql_update = "UPDATE search_history SET last_access_time = ? WHERE id = ?"
      const args_update = [last_access_time, id]
      dbManager.update(sql_update, args_update)
      this._searchHistory.find(item => item.id === id)!.last_access_time = last_access_time
      this._searchHistory.sort((a, b) => b.last_access_time.localeCompare(a.last_access_time))
    } else {
      const sql_insert_history = "INSERT INTO search_history (last_access_time, sorted_fsearch) VALUES (?, ?)"
      const args_insert_history = [last_access_time, sortedFsearch]
      dbManager.update(sql_insert_history, args_insert_history)
      const sql_get_id = "SELECT id FROM search_history WHERE sorted_fsearch = ?"
      const args_get_id = [sortedFsearch]
      const id = dbManager.query(sql_get_id, args_get_id)[0].id
      const sql_insert_terms = "INSERT INTO search_history_search_terms (search_history_id, namespace, qualifier, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?, ?)"
      const args_insert_terms = searchTerms.map(term => [id, term.namespace, term.qualifier, term.term, Number(term.dollar), Number(term.subtract), Number(term.tilde)])
      dbManager.batchUpdate(sql_insert_terms, args_insert_terms)
      this._searchHistory.unshift({
        id,
        last_access_time,
        sorted_fsearch: sortedFsearch,
        searchTerms
      })
    }
  }

  deleteSearchHistory(id: number) {
    const sql_delete = "DELETE FROM search_history WHERE id = ?"
    dbManager.update(sql_delete, [id])
    const sql_delete_terms = "DELETE FROM search_history_search_terms WHERE search_history_id = ?"
    dbManager.update(sql_delete_terms, [id])
    const index_delete = this._searchHistory.findIndex(item => item.id === id)
    if (index_delete !== -1) {
      this._searchHistory.splice(index_delete, 1)
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
`
    const rows = dbManager.query(sql) as {
      id: number;
      sort_order: number;
      sorted_fsearch: string;
      search_terms: string;
    }[]
    const result = rows.map(row => ({
      id: row.id,
      sort_order: row.sort_order,
      sorted_fsearch: row.sorted_fsearch,
      searchTerms: row.search_terms
        ? row.search_terms.split(';').map(term => {
          const [namespace, qualifier, termText, dollar, subtract, tilde] = term.split('|');
          return {
            namespace: namespace ? namespace as TagNamespace : undefined,
            qualifier: qualifier ? qualifier as EHQualifier : undefined,
            term: termText,
            dollar: Boolean(Number(dollar)),
            subtract: Boolean(Number(subtract)),
            tilde: Boolean(Number(tilde))
          };
        })
        : []
    })).sort((a, b) => a.sort_order - b.sort_order);
    return result
  }

  addSearchBookmark(sortedFsearch: string, searchTerms: EHSearchTerm[]) {
    const sql_check = "SELECT id FROM search_bookmarks WHERE sorted_fsearch = ?"
    const args_check = [sortedFsearch]
    const id = dbManager.query(sql_check, args_check)[0]?.id
    if (id) {
      return false
    } else {
      const sql_insert_bookmark = "INSERT INTO search_bookmarks (sort_order, sorted_fsearch) VALUES (?, ?)"
      const newSortOrder = this._searchBookmarks.length === 0 ? 0 : this._searchBookmarks[this._searchBookmarks.length - 1].sort_order + 1
      const args_insert_bookmark = [newSortOrder, sortedFsearch]
      dbManager.update(sql_insert_bookmark, args_insert_bookmark)
      const sql_get_id = "SELECT id FROM search_bookmarks WHERE sorted_fsearch = ?"
      const args_get_id = [sortedFsearch]
      const id = dbManager.query(sql_get_id, args_get_id)[0].id
      const sql_insert_terms = "INSERT INTO search_bookmarks_search_terms (search_bookmarks_id, namespace, qualifier, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?, ?)"
      const args_insert_terms = searchTerms.map(term => [id, term.namespace, term.qualifier, term.term, Number(term.dollar), Number(term.subtract), Number(term.tilde)])
      dbManager.batchUpdate(sql_insert_terms, args_insert_terms)
      this._searchBookmarks.push({
        id,
        sort_order: newSortOrder,
        sorted_fsearch: sortedFsearch,
        searchTerms
      })
      return true
    }
  }

  deleteSearchBookmark(id: number) {
    const sql_delete = "DELETE FROM search_bookmarks WHERE id = ?"
    dbManager.update(sql_delete, [id])
    const sql_delete_terms = "DELETE FROM search_bookmarks_search_terms WHERE search_bookmarks_id = ?"
    dbManager.update(sql_delete_terms, [id])
    const index_delete = this._searchBookmarks.findIndex(item => item.id === id)
    if (index_delete !== -1) {
      this._searchBookmarks.splice(index_delete, 1)
    }
    this.reorderSearchBookmarks(this._searchBookmarks.map(item => item.id))
  }

  reorderSearchBookmarks(resorted_ids: number[]) {
    const sql_update = "UPDATE search_bookmarks SET sort_order = ? WHERE id = ?"
    dbManager.batchUpdate(sql_update, resorted_ids.map((id, index) => [index, id]))
    this._searchBookmarks = this._querySearchBookmarks()
  }

  getTenMostAccessedTags() {
    const sql = "SELECT * FROM tag_access_count ORDER BY count DESC LIMIT 10"
    const data = dbManager.query(sql) as {
      namespace: TagNamespace;
      qualifier: EHQualifier;
      term: string;
      count: number;
    }[]
    return data
  }

  updateTagAccessCount(tags: EHSearchTerm[]) {
    const sql = `
INSERT INTO tag_access_count (namespace, qualifier, term, count)
VALUES (?, ?, ?, 1)
ON CONFLICT(namespace, qualifier, term)
DO UPDATE SET count = count + 1;
`
    // qualifier仅保留uploader
    dbManager.batchUpdate(sql, tags.map(tag => ([tag.namespace || "", tag.qualifier || "", tag.term  || ""])))
  }

  getTenLastAccessSearchTerms(): EHSearchTerm[] {
    const sql = `
SELECT DISTINCT
    search_history_search_terms.namespace,
    CASE 
        WHEN search_history_search_terms.qualifier = 'uploader' THEN search_history_search_terms.qualifier
        ELSE NULL
    END AS qualifier,
    search_history_search_terms.term
FROM
    search_history_search_terms
JOIN
    search_history
ON
    search_history_search_terms.search_history_id = search_history.id
ORDER BY
    search_history.last_access_time DESC;
`
    const data = dbManager.query(sql) as {
      namespace: string;
      term: string;
      qualifier: string;
      dollar: number;
      subtract: number;
      tilde: number;
      last_access_time: string;
    }[]
    return data.map(n => ({
      namespace: n.namespace ? n.namespace as TagNamespace : undefined,
      term: n.term,
      qualifier: n.qualifier ? n.qualifier as EHQualifier : undefined,
      dollar: Boolean(n.dollar),
      subtract: Boolean(n.subtract),
      tilde: Boolean(n.tilde),
    }))
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
