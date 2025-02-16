import { EHCategory, EHGallery, EHListCompactItem, EHListExtendedItem, EHQualifier, EHTagListItem, TagNamespace } from "ehentai-parser";
import { api, downloaderManager } from "./api";
import { dbManager } from "./database";
import { ArchiveSearchOptions, DBArchiveItem, StatusTab, StatusTabOptions } from "../types";
import { cvid } from "jsbox-cview";

function buildArchiveSearchSQLQuery(options: ArchiveSearchOptions): { sql: string; args: any[] } {
  const { page, pageSize, type, sort, searchTerms, excludedCategories, minimumPages, maximumPages, minimumRating } = options;

  let sql = `
    SELECT 
      archives.*
    FROM 
      archives
  `;

  const conditions: string[] = [];
  const args: any[] = [];

  // Handle type filter
  if (type && type !== "all") {
    if (type === "readlater") {
      conditions.push("readlater = 1");
    } else if (type === "download") {
      conditions.push("downloaded = 1");
    }
  }

  // Handle excludedCategories
  if (excludedCategories && excludedCategories.length > 0) {
    conditions.push(`category NOT IN (${excludedCategories.map(() => "?").join(", ")})`);
    args.push(...excludedCategories);
  }

  // Handle page length filters
  if (minimumPages !== undefined) {
    conditions.push("length >= ?");
    args.push(minimumPages);
  }
  if (maximumPages !== undefined) {
    conditions.push("length <= ?");
    args.push(maximumPages);
  }

  // Handle rating filter
  if (minimumRating !== undefined) {
    conditions.push("rating >= ?");
    args.push(minimumRating);
  }

  // Handle search terms
  // 分为以下情况：
  // 1. uploader, title, gid, comment四种修饰词单独成为一个条件（weak, uploaduid, favnote禁用）
  // 2. 如果某个term没有修饰词也没有命名空间，那么将在title和taglist中搜索
  // 3. tag修饰词将只在taglist中搜索
  // 4. 或搜索需要单独提取出来处理

  if (searchTerms && searchTerms.length > 0) {
    const specialQualifiers: EHQualifier[] = ["uploader", "title", "gid", "comment"];
    const searchTermsWithSpecialConditions = searchTerms.filter(term => term.qualifier && specialQualifiers.includes(term.qualifier));
    const searchTermsWithOutSpecialConditions = searchTerms.filter(term => !term.qualifier || !specialQualifiers.includes(term.qualifier));
    for (const st of searchTermsWithSpecialConditions) {
      switch (st.qualifier) {
        case "uploader": {
          if (st.subtract) {
            const condition = `uploader <> ?`;
            const arg = st.term;
            conditions.push(condition);
            args.push(arg);
          } else {
            const condition = `uploader = ?`;
            const arg = st.term;
            conditions.push(condition);
            args.push(arg);
          }
          break;
        }
        case "title": {
          if (st.subtract) {
            const condition = `(title NOT LIKE ? AND english_title NOT LIKE ? AND japanese_title NOT LIKE ?)`;
            const arg = `%${st.term}%`;
            conditions.push(condition);
            args.push(arg);
            args.push(arg);
            args.push(arg);
          } else {
            const condition = `(title LIKE ? OR english_title LIKE ? OR japanese_title LIKE ?)`;
            const arg = `%${st.term}%`;
            conditions.push(condition);
            args.push(arg);
            args.push(arg);
            args.push(arg);
          }
          break;
        }
        case "gid": {
          if (st.subtract) {
            const condition = `gid <> ?`;
            const arg = Number(st.term);
            conditions.push(condition);
            args.push(arg);
          } else {
            const condition = `gid = ?`;
            const arg = Number(st.term);
            conditions.push(condition);
            args.push(arg);
          }
          break;
        }
        case "comment": {
          if (st.subtract) {
            const condition = `comment NOT LIKE ?`;
            const arg = `%${st.term}%`;
            conditions.push(condition);
            args.push(arg);
          } else {
            const condition = `comment LIKE ?`;
            const arg = `%${st.term}%`;
            conditions.push(condition);
            args.push(arg);
          }
          break;
        }
      }
    }

    // 查找没有修饰词也没有命名空间的term(不能有~符号)
    const searchTermsNoQualifierAndNamespace = searchTermsWithOutSpecialConditions.filter(term => !term.qualifier && !term.namespace && !term.tilde);
    for (const st of searchTermsNoQualifierAndNamespace) {
      const condition = `(title LIKE ? OR english_title LIKE ? OR japanese_title LIKE ? OR taglist LIKE ?)`;
      const arg = `%${st.term}%`;
      conditions.push(condition);
      args.push(arg);
      args.push(arg);
      args.push(arg);
      args.push(arg);
    }

    // 下面需要创建一个子查询，用于处理tag修饰词，类似于以下SQL语句
    // SELECT DISTINCT gid
    // FROM archive_taglist
    // WHERE (namespace = 'language' AND tag = 'chinese')
    //   OR (namespace = 'female' AND tag like 'ga%')
    //   OR (namespace='female' AND tag <> "zz")
    //   AND gid in (
    //     SELECT DISTINCT gid
    //     FROM archive_taglist
    //     WHERE (namespace = 'artist' AND tag = 'ito fleda')
    //       OR (namespace = 'female' AND tag like 'gaa%')
    //   )
    // GROUP BY gid
    // HAVING COUNT(*) = 3

    const subConditions: string[] = [];
    const subsubConditions: string[] = [];

    // 查找不含~符号的搜索词（此时qualifier只剩tag）
    const searchTermsTag = searchTermsWithOutSpecialConditions.filter(term => !term.tilde && term.qualifier === "tag" || term.namespace);
    if (searchTermsTag.length > 0) {
      for (const st of searchTermsTag) {
        if (st.namespace && st.dollar) {
          subConditions.push(`(namespace = ? AND tag = ?)`);
          args.push(st.namespace);
          args.push(st.term);
        } else if (st.namespace && !st.dollar) {
          subConditions.push(`(namespace = ? AND tag LIKE ?)`);
          args.push(st.namespace);
          args.push(`${st.term}%`);
        } else if (!st.namespace && st.dollar) {
          subConditions.push(`(tag = ?)`);
          args.push(st.term);
        } else if (!st.namespace && !st.dollar) {
          subConditions.push(`(tag LIKE ?)`);
          args.push(`${st.term}%`);
        }
      }
    }

    // 查找或搜索(~符号的搜索词只被看作标签)
    const searchTermsTilde = searchTermsWithOutSpecialConditions.filter(term => term.tilde);
    if (searchTermsTilde.length > 0) {
      for (const st of searchTermsTilde) {
        if (st.namespace && st.dollar) {
          subsubConditions.push(`(namespace = ? AND tag = ?)`);
          args.push(st.namespace);
          args.push(st.term);
        } else if (st.namespace && !st.dollar) {
          subsubConditions.push(`(namespace = ? AND tag LIKE ?)`);
          args.push(st.namespace);
          args.push(`${st.term}%`);
        } else if (!st.namespace && st.dollar) {
          subsubConditions.push(`(tag = ?)`);
          args.push(st.term);
        } else if (!st.namespace && !st.dollar) {
          subsubConditions.push(`(tag LIKE ?)`);
          args.push(`${st.term}%`);
        }
      }
    }

    if (subConditions.length > 0 && subsubConditions.length > 0) {
      const subQuery = `
        SELECT DISTINCT gid
        FROM archive_taglist
        WHERE ${subConditions.join(" OR ")}
          AND gid IN (
            SELECT DISTINCT gid
            FROM archive_taglist
            WHERE ${subsubConditions.join(" OR ")}
          )
        GROUP BY gid
        HAVING COUNT(*) = ${subConditions.length}
      `;
      conditions.push(`gid IN (${subQuery})`);
    } else if (subConditions.length > 0) {
      const subQuery = `
        SELECT DISTINCT gid
        FROM archive_taglist
        WHERE ${subConditions.join(" OR ")}
        GROUP BY gid
        HAVING COUNT(*) = ${subConditions.length}
      `;
      conditions.push(`gid IN (${subQuery})`);
    } else if (subsubConditions.length > 0) {
      const subQuery = `
        SELECT DISTINCT gid
        FROM archive_taglist
        WHERE ${subsubConditions.join(" OR ")}
      `;
      conditions.push(`gid IN (${subQuery})`);
    }
  }

  // Add conditions to query
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  // Handle sorting
  if (sort) {
    sql += ` ORDER BY ${sort} DESC`;
  } else {
    sql += ` ORDER BY first_access_time DESC`;
  }

  // Handle pagination
  const offset = page * pageSize;
  sql += ` LIMIT ? OFFSET ?`;
  args.push(pageSize, offset);

  return { sql, args };
}

/**
 * 管理状态
 */
class StatusManager {
  private _tabsMap: Map<string, StatusTab> = new Map();
  private _tabIdsInManager: string[];
  private _currentTabId;
  constructor() {
    // 初始化
    this._tabsMap.set("archive", { type: "archive", options: { page: 0, pageSize: 50, type: "all" }, pages: [] });
    const firstTabId = cvid.newId;
    this._tabsMap.set(firstTabId, { type: "blank" });
    this._tabIdsInManager = [firstTabId];
    this._currentTabId = firstTabId;
    // 建立对应的下载器
    downloaderManager.addTabDownloader("archive");
    downloaderManager.addTabDownloader(firstTabId);
  }

  get tabsMap() {
    return this._tabsMap;
  }

  get currentTab() {
    const tab = this._tabsMap.get(this._currentTabId);
    if (!tab) throw new Error("Invalid tab id");
    return tab;
  }

  set currentTabId(tabId: string) {
    if (!this._tabIdsInManager.includes(tabId)) throw new Error("Invalid tab id");
    this._currentTabId = tabId;
  }

  get currentTabId() {
    return this._currentTabId;
  }

  get tabIdsShownInManager() {
    return this._tabIdsInManager;
  }

  addBlankTab({ showInManager }: { showInManager: boolean } = { showInManager: true }) {
    const tabId = cvid.newId;
    this._tabsMap.set(tabId, { type: "blank" });
    if (showInManager) this._tabIdsInManager.push(tabId);
    downloaderManager.addTabDownloader(tabId);
    return tabId;
  }

  removeTab(tabId: string) {
    if (this._tabIdsInManager.includes(tabId)) {
      this._tabIdsInManager = this._tabIdsInManager.filter(id => id !== tabId);
    }
    this._tabsMap.delete(tabId);
    downloaderManager.removeTabDownloader(tabId);
  }

  showTabInManager(tabId: string) {
    if (this._tabIdsInManager.includes(tabId)) return;
    this._tabIdsInManager.push(tabId);
  }

  hideTabInManager(tabId: string) {
    if (!this._tabIdsInManager.includes(tabId)) return;
    this._tabIdsInManager = this._tabIdsInManager.filter(id => id !== tabId);
  }

  async loadTab(options: StatusTabOptions, tabId: string) {
    const tab = this._tabsMap.get(tabId);
    if (!tab) throw new Error("Tab not found");
    let newTab: StatusTab;
    switch (options.type) {
      case "front_page": {
        const page = await api.getFrontPageInfo(options.options);
        newTab = {
          type: "front_page",
          options: options.options,
          pages: [page]
        }
        break;
      }
      case "watched": {
        const page = await api.getWatchedInfo(options.options);
        newTab = {
          type: "watched",
          options: options.options,
          pages: [page]
        }
        break;
      }
      case "popular": {
        const page = await api.getPopularInfo(options.options);
        newTab = {
          type: "popular",
          options: options.options,
          pages: [page]
        }
        break;
      }
      case "favorites": {
        const page = await api.getFavoritesInfo(options.options);
        newTab = {
          type: "favorites",
          options: options.options,
          pages: [page]
        }
        break;
      }
      case "toplist": {
        const page = await api.getTopListInfo(options.options);
        newTab = {
          type: "toplist",
          options: options.options,
          pages: [page]
        }
        break;
      }
      case "upload": {
        const page = await api.getUploadInfo();
        newTab = {
          type: "upload",
          pages: [page]
        }
        break;
      }
      case "archive": {
        const items = this.queryArchiveItem(options.options);
        const count = this.queryArchiveItemCount(options.options.type);
        newTab = {
          type: "archive",
          options: options.options,
          pages: [{
            type: "archive",
            all_count: count,
            items
          }]
        }
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
    // 表示此tab在运行过程中被删除
    if (!this._tabsMap.has(tabId)) return;
    this._tabsMap.set(tabId, newTab);
    return newTab;
  }

  async loadMoreTab(tabId: string) {
    const tab = this._tabsMap.get(tabId);
    if (!tab) throw new Error("Tab not found");
    switch (tab.type) {
      case "front_page": {
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage) return;
        if (!lastPage.next_page_available) return;
        const miniumGid = lastPage.items[lastPage.items.length - 1].gid;
        tab.options.range = undefined;
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = miniumGid;
        const page = await api.getFrontPageInfo(tab.options);
        tab.pages.push(page);
        return tab;
      }
      case "watched": {
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage) return;
        if (!lastPage.next_page_available) return;
        const miniumGid = lastPage.items[lastPage.items.length - 1].gid;
        tab.options.range = undefined;
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = miniumGid;
        const page = await api.getWatchedInfo(tab.options);
        tab.pages.push(page);
        return tab;
      }
      case "popular": {
        break;
      }
      case "favorites": {
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage) return;
        if (!lastPage.next_page_available) return;
        const miniumGid = lastPage.items[lastPage.items.length - 1].gid;
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = miniumGid;
        if (lastPage.sort_order === "favorited_time") {
          tab.options.maximumFavoritedTimestamp = lastPage.last_item_favorited_timestamp
        }
        const page = await api.getFavoritesInfo(tab.options);
        tab.pages.push(page);
        return tab;
      }
      case "toplist": {
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage) return;
        if (lastPage.current_page === lastPage.total_pages - 1) return; //
        tab.options.page = lastPage.current_page + 1;
        const page = await api.getTopListInfo(tab.options);
        tab.pages.push(page);
        return tab;
      }
      case "upload": {
        break;
      }
      case "archive": {
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage) return;
        if ((tab.options.page + 1) * tab.options.pageSize >= lastPage.all_count) return;
        tab.options.page += 1;
        const items = this.queryArchiveItem(tab.options);
        tab.pages.push({
          type: "archive",
          all_count: this.queryArchiveItemCount(tab.options.type),
          items
        });
        return tab;
      }
      default:
        throw new Error("Invalid tab type");
    }
  }

  async reloadTab(tabId: string) {
    const tab = this._tabsMap.get(tabId);
    if (!tab) throw new Error("Tab not found");
    switch (tab.type) {
      case "front_page": {
        tab.options.range = undefined;
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = undefined;
        const page = await api.getFrontPageInfo(tab.options);
        tab.pages = [page];
        return tab;
      }
      case "watched": {
        tab.options.range = undefined;
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = undefined;
        const page = await api.getWatchedInfo(tab.options);
        tab.pages = [page];
        return tab;
      }
      case "popular": {
        const page = await api.getPopularInfo(tab.options);
        tab.pages = [page];
        return tab;
      }
      case "favorites": {
        tab.options.jump = undefined;
        tab.options.seek = undefined;
        tab.options.minimumGid = undefined;
        tab.options.minimumFavoritedTimestamp = undefined;
        tab.options.maximumGid = undefined;
        tab.options.maximumFavoritedTimestamp = undefined;
        const page = await api.getFavoritesInfo(tab.options);
        tab.pages = [page];
        return tab;
      }
      case "toplist": {
        tab.options.page = 0;
        const page = await api.getTopListInfo(tab.options);
        tab.pages = [page];
        return tab;
      }
      case "upload": {
        const page = await api.getUploadInfo();
        tab.pages = [page];
        return tab;
      }
      case "archive": {
        tab.options.page = 0;
        const items = this.queryArchiveItem(tab.options);
        const count = this.queryArchiveItemCount(tab.options.type);
        tab.pages = [{
          type: "archive",
          all_count: count,
          items
        }];
        return tab;
      }
      default:
        throw new Error("Invalid tab type");
    }
  }

  queryArchiveItemCount(type: "readlater" | "download" | "all" = "all") {
    const sql = type === "all" ? `SELECT COUNT(*) FROM archives;` : `SELECT COUNT(*) FROM archives WHERE type = ?;`;
    const args = type === "all" ? undefined : [type];
    const rawData = dbManager.query(sql, args) as { "COUNT(*)": number }[];
    return rawData[0]["COUNT(*)"];
  }

  queryArchiveItem(options: ArchiveSearchOptions) {
    const { sql, args } = buildArchiveSearchSQLQuery(options);
    const rawData = dbManager.query(sql, args) as {
      gid: number;
      readlater: number;
      downloaded: number;
      first_access_time: string;
      last_access_time: string;
      token: string;
      title: string;
      english_title: string;
      japanese_title: string;
      thumbnail_url: string;
      category: string;
      posted_time: string;
      visible: number;
      rating: number;
      is_my_rating: number;
      length: number;
      torrent_available: number;
      favorited: number;
      favcat?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      uploader: string;
      disowned: number;
      favorited_time: string;
      taglist: string;
      comment: string;
      last_read_page: number;
    }[];
    const data: DBArchiveItem[] = rawData.map(row => ({
      gid: row.gid,
      readlater: Boolean(row.readlater),
      downloaded: Boolean(row.downloaded),
      first_access_time: row.first_access_time,
      last_access_time: row.last_access_time,
      token: row.token,
      title: row.title,
      english_title: row.english_title,
      japanese_title: row.japanese_title,
      thumbnail_url: row.thumbnail_url,
      category: row.category as EHCategory,
      posted_time: row.posted_time,
      visible: Boolean(row.visible),
      rating: row.rating,
      is_my_rating: Boolean(row.is_my_rating),
      length: row.length,
      torrent_available: Boolean(row.torrent_available),
      favorited: Boolean(row.favorited),
      favcat: row.favcat,
      uploader: row.uploader,
      disowned: Boolean(row.disowned),
      taglist: JSON.parse(row.taglist) as EHTagListItem[],
      comment: row.comment,
      last_read_page: row.last_read_page
    }));
    const extendedItems: EHListExtendedItem[] = data.map(item => ({
      type: "extended",
      gid: item.gid,
      token: item.token,
      url: "",
      title: item.title,
      thumbnail_url: item.thumbnail_url,
      category: item.category,
      posted_time: item.posted_time,
      visible: item.visible,
      estimated_display_rating: item.rating,
      is_my_rating: item.is_my_rating,
      length: item.length,
      torrent_available: item.torrent_available,
      favorited: item.favorited,
      favcat: item.favcat,
      uploader: item.uploader,
      disowned: item.disowned,
      taglist: item.taglist
    }));
    return extendedItems;
  }

  storeArchiveItemOrUpdateAccessTime(infos: EHGallery | EHListExtendedItem | EHListCompactItem, readlater: boolean) {
    // 先查询是否已经存在，如果存在则更新访问时间
    const sql_query = `SELECT * FROM archives WHERE gid = ?;`;
    const result = dbManager.query(sql_query, [infos.gid]);
    if (result.length > 0) {
      this.updateLastAccessTime(infos.gid);
      return;
    } else {
      this.storeArchiveItem(infos, readlater);
    }
  }

  storeArchiveItem(infos: EHGallery | EHListExtendedItem | EHListCompactItem, readlater: boolean) {
    // 需要先查询是否已经存在，如果存在则不应该做任何事情
    const sql_insert = `INSERT OR REPLACE INTO archives (
      "gid",
      "readlater",
      "downloaded",
      "first_access_time",
      "last_access_time",
      "token",
      "title",
      "english_title",
      "japanese_title",
      "thumbnail_url",
      "category",
      "posted_time",
      "visible",
      "rating",
      "is_my_rating",
      "length",
      "torrent_available",
      "favorited",
      "favcat",
      "uploader",
      "disowned",
      "taglist",
      "comment",
      "last_read_page"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(gid) DO NOTHING;`;
    const sql_taglist = `INSERT OR REPLACE INTO archive_taglist (
      "gid",
      "namespace",
      "tag"
    ) VALUES (?, ?, ?);`;
    // 将EHGallery | EHListExtendedItem | EHListCompactItem转换为DBArchiveItem
    let title = "";
    let english_title = "";
    let japanese_title = "";
    let rating = 0;
    let torrent_available = false;
    let comment = "";
    if ("type" in infos) {
      title = infos.title;
      rating = infos.estimated_display_rating;
      torrent_available = infos.torrent_available;
    } else {
      title = infos.japanese_title || infos.english_title;
      english_title = infos.english_title;
      japanese_title = infos.japanese_title;
      rating = infos.display_rating;
      torrent_available = infos.torrent_count > 0;
      comment = infos.comments.length > 0 && infos.comments[0].is_uploader ? $text.HTMLUnescape(infos.comments[0].comment_div) : "";
    }

    const data: DBArchiveItem = {
      gid: infos.gid,
      readlater,
      downloaded: false,  // TODO 暂未推出下载功能
      first_access_time: new Date().toISOString(),
      last_access_time: new Date().toISOString(),
      token: infos.token,
      title,
      english_title,
      japanese_title,
      thumbnail_url: infos.thumbnail_url,
      category: infos.category,
      posted_time: infos.posted_time,
      visible: infos.visible,
      rating,
      is_my_rating: infos.is_my_rating,
      length: infos.length,
      torrent_available,
      favorited: infos.favorited,
      favcat: infos.favcat,
      uploader: infos.uploader,
      disowned: infos.disowned,
      taglist: infos.taglist,
      comment,
      last_read_page: 0
    };
    const taglist_string: [number, TagNamespace, string][] = []
    infos.taglist.map(item => {
      item.tags.forEach(tag => {
        taglist_string.push([infos.gid, item.namespace, tag]);
      });
    });
    dbManager.update(sql_insert, [
      data.gid,
      data.readlater,
      data.downloaded,
      data.first_access_time,
      data.last_access_time,
      data.token,
      data.title,
      data.english_title,
      data.japanese_title,
      data.thumbnail_url,
      data.category,
      data.posted_time,
      data.visible,
      data.rating,
      data.is_my_rating,
      data.length,
      data.torrent_available,
      data.favorited,
      data.favcat,
      data.uploader,
      data.disowned,
      JSON.stringify(data.taglist),
      data.comment,
      data.last_read_page
    ]);
    dbManager.batchUpdate(sql_taglist, taglist_string);
  }

  deleteArchiveItem(gid: number) {
    const sql = `DELETE FROM archives WHERE gid = ?;`;
    dbManager.update(sql, [gid]);
    const sql_taglist = `DELETE FROM archive_taglist WHERE gid = ?;`;
    dbManager.update(sql_taglist, [gid]);
  }

  updateLastAccessTime(gid: number) {
    // 应该在访问图库的时候更新
    const sql = `UPDATE archives SET last_access_time = datetime('now') WHERE gid = ?;`;
    dbManager.update(sql, [gid]);
  }

  updateLastReadPage(gid: number, page: number) {
    // 应该在退出阅读器的时候更新
    const sql = `UPDATE archives SET last_read_page = ? WHERE gid = ?;`;
    dbManager.update(sql, [page, gid]);
  }

  getLastReadPage(gid: number) {
    const sql = `SELECT last_read_page FROM archives WHERE gid = ?;`;
    const rawData = dbManager.query(sql, [gid]) as { last_read_page: number }[];
    if (rawData.length === 0) return 0;
    return rawData[0].last_read_page;
  }

}

export const statusManager = new StatusManager();