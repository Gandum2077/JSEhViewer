import { EHCategory, EHGallery, EHListCompactItem, EHListExtendedItem, EHQualifier, EHTagListItem, TagNamespace } from "ehentai-parser";
import { api, downloaderManager } from "./api";
import { dbManager } from "./database";
import { ArchiveSearchOptions, ArchiveTab, ArchiveTabOptions, DBArchiveItem, DBSearchBookmarks, DBSearchHistory, StatusTab, StatusTabOptions } from "../types";
import { router } from "jsbox-cview";
import { HomepageController } from "../controllers/homepage-controller";
import { ArchiveController } from "../controllers/archive-controller";

/**
 * 管理状态
 */
class StatusManager {
  private _statusTabs: (StatusTab | undefined)[] = [undefined];
  private _currentTabIndex = 0;
  private _archiveTab: ArchiveTab | undefined;
  constructor() {

  }

  get currentTab() {
    return this._statusTabs[this._currentTabIndex];
  }

  get archiveTab() {
    return this._archiveTab;
  }

  async loadTab(options: StatusTabOptions) {
    const index = this._currentTabIndex;
    switch (options.type) {
      case "front_page": {
        const page = await api.getFrontPageInfo(options.options);
        this._statusTabs[index] = {
          type: "front_page",
          options: options.options,
          pages: [page]
        };
        break;
      }
      case "watched": {
        const page = await api.getWatchedInfo(options.options);
        this._statusTabs[index] = {
          type: "watched",
          options: options.options,
          pages: [page]
        };
        break;
      }
      case "popular": {
        const page = await api.getPopularInfo(options.options);
        this._statusTabs[index] = {
          type: "popular",
          options: options.options,
          pages: [page]
        };
        break;
      }
      case "favorites": {
        const page = await api.getFavoritesInfo(options.options);
        this._statusTabs[index] = {
          type: "favorites",
          options: options.options,
          pages: [page]
        };
        break;
      }
      case "toplist": {
        const page = await api.getTopListInfo(options.options);
        this._statusTabs[index] = {
          type: "toplist",
          options: options.options,
          pages: [page]
        };
        break;
      }
      case "upload": {
        const page = await api.getUploadInfo();
        this._statusTabs[index] = {
          type: "upload",
          pages: [page]
        };
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
    if (index === this._currentTabIndex) {
      (router.get("homepageController") as HomepageController).endLoad();
      const tab = this._statusTabs[index];
      if (!tab) return;
      if (tab.type !== "upload") {
        const thumbnails = tab.pages.map(page => page.items).flat().map(item => ({
          gid: item.gid,
          url: item.thumbnail_url
        }));
        downloaderManager.currentTabDownloader.clear();
        downloaderManager.currentTabDownloader.add(thumbnails);
        downloaderManager.startTabDownloader();

      }
    }
  }

  async loadMoreTab() {
    const index = this._currentTabIndex;
    const tab = this._statusTabs[index];
    if (!tab) return;
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
        break;
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
        break;
      }
      case "popular": {
        break;
      }
      case "favorites": {
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage) return;
        if (!lastPage.next_page_available) return;
        const miniumGid = lastPage.items[lastPage.items.length - 1].gid;
        tab.options.range = undefined;
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = miniumGid;
        if (lastPage.sort_order === "favorited_time") {
          tab.options.maximumFavoritedTimestamp = lastPage.last_item_favorited_timestamp
        }
        const page = await api.getFavoritesInfo(tab.options);
        tab.pages.push(page);
        break;
      }
      case "toplist": {
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage) return;
        if (lastPage.current_page === lastPage.total_pages - 1) return; // 到达最后一页
        tab.options.page = lastPage.current_page + 1;
        const page = await api.getTopListInfo(tab.options);
        tab.pages.push(page);
        break;
      }
      case "upload": {
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
    if (index === this._currentTabIndex) {
      (router.get("homepageController") as HomepageController).endLoad();
      const tab = this._statusTabs[index];
      if (!tab) return;
      if (tab.type !== "upload") {
        const thumbnails = tab.pages[tab.pages.length - 1].items.map(item => ({
          gid: item.gid,
          url: item.thumbnail_url
        }));
        downloaderManager.currentTabDownloader.add(thumbnails);
      }
    }
  }

  async reloadTab() {
    const index = this._currentTabIndex;
    const tab = this._statusTabs[index];
    if (!tab) return;
    switch (tab.type) {
      case "front_page": {
        tab.options.range = undefined;
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = undefined;
        const page = await api.getFrontPageInfo(tab.options);
        tab.pages = [page];
        break;
      }
      case "watched": {
        tab.options.range = undefined;
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = undefined;
        const page = await api.getWatchedInfo(tab.options);
        tab.pages = [page];
        break;
      }
      case "popular": {
        const page = await api.getPopularInfo(tab.options);
        tab.pages = [page];
        break;
      }
      case "favorites": {
        tab.options.jump = undefined;
        tab.options.seek = undefined
        tab.options.minimumGid = undefined;
        tab.options.maximumGid = undefined
        const page = await api.getFavoritesInfo(tab.options);
        tab.pages = [page];
        break;
      }
      case "toplist": {
        tab.options.page = 0;
        const page = await api.getTopListInfo(tab.options);
        tab.pages = [page];
        break;
      }
      case "upload": {
        const page = await api.getUploadInfo();
        tab.pages = [page];
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
    if (index === this._currentTabIndex) {
      (router.get("homepageController") as HomepageController).endLoad();
      const tab = this._statusTabs[index];
      if (!tab) return;
      if (tab.type !== "upload") {
        const thumbnails = tab.pages.map(page => page.items).flat().map(item => ({
          gid: item.gid,
          url: item.thumbnail_url
        }));
        downloaderManager.currentTabDownloader.clear();
        downloaderManager.currentTabDownloader.add(thumbnails);
        downloaderManager.startTabDownloader();

      }
    }
  }

  loadArchiveTab(options: ArchiveTabOptions) {
    const items = this.queryArchiveItem(options.options);
    const count = this.queryArchiveItemCount();
    this._archiveTab = {
      type: "archive",
      options: options.options,
      pages: [{
        type: "archive",
        all_count: count,
        items
      }]
    };
    (router.get("archiveController") as ArchiveController).endLoad();

    const thumbnails = this._archiveTab.pages.map(page => page.items).flat().map(item => ({
      gid: item.gid,
      url: item.thumbnail_url
    }));
    downloaderManager.currentArchiveTabDownloader.clear();
    downloaderManager.currentArchiveTabDownloader.add(thumbnails);
    downloaderManager.startTabDownloader();
  }

  loadMoreArchiveTab() {
    const tab = this._archiveTab;
    if (!tab) return;
    const lastPage = tab.pages[tab.pages.length - 1];
    if (!lastPage) return;
    if ((tab.options.page + 1) * tab.options.pageSize >= lastPage.all_count) return;
    const options = tab.options;
    options.page += 1;
    const items = this.queryArchiveItem(options);
    tab.pages.push({
      type: "archive",
      all_count: lastPage.all_count,
      items
    });
    (router.get("archiveController") as ArchiveController).endLoad();

    const thumbnails = tab.pages[tab.pages.length - 1].items.map(item => ({
      gid: item.gid,
      url: item.thumbnail_url
    }));
    downloaderManager.currentArchiveTabDownloader.add(thumbnails);
  }

  reloadArchiveTab() {
    const tab = this._archiveTab;
    if (!tab) return;
    tab.options.page = 0;
    const items = this.queryArchiveItem(tab.options);
    const count = this.queryArchiveItemCount();
    tab.pages = [{
      type: "archive",
      all_count: count,
      items
    }];
    (router.get("archiveController") as ArchiveController).endLoad();

    const thumbnails = tab.pages.map(page => page.items).flat().map(item => ({
      gid: item.gid,
      url: item.thumbnail_url
    }));
    downloaderManager.currentArchiveTabDownloader.clear();
    downloaderManager.currentArchiveTabDownloader.add(thumbnails);
    downloaderManager.startArchiveTabDownloader();
  }

  queryArchiveItemCount(type: "readlater" | "has_read" | "download" | "all" = "all") {
    const sql = type === "all" ? `SELECT COUNT(*) FROM archives;` : `SELECT COUNT(*) FROM archives WHERE type = ?;`;
    const args = type === "all" ? undefined : [type];
    const rawData = dbManager.query(sql, args) as { "COUNT(*)": number }[];
    return rawData[0]["COUNT(*)"];
  }

  queryArchiveItem(options: ArchiveSearchOptions) {
    const sql = `SELECT * FROM archives 
        ORDER BY ${options.sort} DESC
        LIMIT ? OFFSET ?
        ;`
    const args = [options.pageSize, options.page * options.pageSize];
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

  get tabs() {
    return this._statusTabs;
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
      "last_read_page"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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