import {
  EHFavoritesList,
  EHFrontPageList,
  EHGallery,
  EHIgneousExpiredError,
  EHImageLookupList,
  EHIPBannedError,
  EHListCompactItem,
  EHListExtendedItem,
  EHPopularList,
  EHTopList,
  EHUploadList,
  EHWatchedList,
} from "ehentai-parser";
import { api, downloaderManager } from "./api";
import {
  ArchiveSearchOptions,
  ArchiveTabOptions,
  DBArchiveItem,
  FavoritesTabOptions,
  FrontPageTabOptions,
  ImageLookupTabOptions,
  PopularTabOptions,
  ScrollState,
  StatusTab,
  StatusTabOptions,
  ToplistTabOptions,
  UploadTabOptions,
  WatchedTabOptions,
} from "../types";
import { cvid, router } from "jsbox-cview";
import { FatalError } from "./error";
import { PushedSearchResultController } from "../controllers/pushed-search-result-controller";
import { HomepageController } from "../controllers/homepage-controller";
import { ArchiveController } from "../controllers/archive-controller";
import { configManager } from "./config";
import { archiveRepository, MutationOrigin } from "../repositories";

function filterToplistItemsByLocalTagFilter(items: EHListCompactItem[]) {
  return items.filter((item) => {
    for (const { namespace, tags } of item.taglist) {
      for (const tag of tags) {
        if (configManager.getMarkedTag(namespace, tag)?.hidden) {
          return false;
        }
      }
    }
    return true;
  });
}

type InferTabOptions<T> = T extends { type: "front_page" }
  ? FrontPageTabOptions
  : T extends { type: "watched" }
    ? WatchedTabOptions
    : T extends { type: "popular" }
      ? PopularTabOptions
      : T extends { type: "favorites" }
        ? FavoritesTabOptions
        : T extends { type: "toplist" }
          ? ToplistTabOptions
          : T extends { type: "upload" }
            ? UploadTabOptions
            : T extends { type: "image_lookup" }
              ? ImageLookupTabOptions
              : T extends { type: "archive" }
                ? ArchiveTabOptions
                : never;

/**
 * 清除关于“定位”信息
 * @param oldOptions
 * @returns
 */
export function clearExtraPropsForReload<T extends StatusTabOptions>(oldOptions: T): InferTabOptions<T> {
  switch (oldOptions.type) {
    case "front_page": {
      return {
        type: "front_page",
        options: {
          ...oldOptions.options,
          range: undefined,
          jump: undefined,
          seek: undefined,
          minimumGid: undefined,
          maximumGid: undefined,
        },
      } as InferTabOptions<T>;
    }
    case "watched": {
      return {
        type: "watched",
        options: {
          ...oldOptions.options,
          range: undefined,
          jump: undefined,
          seek: undefined,
          minimumGid: undefined,
          maximumGid: undefined,
        },
      } as InferTabOptions<T>;
    }
    case "popular": {
      return {
        type: "popular",
        options: oldOptions.options,
      } as InferTabOptions<T>;
    }
    case "favorites": {
      return {
        type: "favorites",
        options: {
          ...oldOptions.options,
          jump: undefined,
          seek: undefined,
          minimumGid: undefined,
          minimumFavoritedTimestamp: undefined,
          maximumGid: undefined,
          maximumFavoritedTimestamp: undefined,
        },
      } as InferTabOptions<T>;
    }
    case "toplist": {
      return {
        type: "toplist",
        options: {
          ...oldOptions.options,
          page: 0,
        },
        enableTagFilter: oldOptions.enableTagFilter,
      } as InferTabOptions<T>;
    }
    case "upload": {
      return {
        type: "upload",
      } as InferTabOptions<T>;
    }
    case "image_lookup": {
      return {
        type: "image_lookup",
        options: {
          ...oldOptions.options,
          jump: undefined,
          seek: undefined,
          minimumGid: undefined,
          maximumGid: undefined,
        },
      } as InferTabOptions<T>;
    }
    case "archive": {
      return {
        type: "archive",
        options: {
          ...oldOptions.options,
          fromPage: 0,
          toPage: 0,
        },
      } as InferTabOptions<T>;
    }
    default:
      throw new Error("Invalid tab type");
  }
}

export class VirtualTab {
  id: string;
  private _status: "pending" | "loading" | "loaded" | "error" = "pending";
  private _loadingId: number = 0;
  // 代表本次更新列表的ID，如果ID改变，说明用户主动进行了刷新，那么回调函数不应该响应，data.pages也不应该改变
  errorMessage?: string;
  scrollState?: ScrollState;
  data: StatusTab; // 初始为空白页
  constructor({ id, initalTabOptions }: { id: string; initalTabOptions?: StatusTabOptions }) {
    this.id = id;
    if (!initalTabOptions) {
      this.data = {
        type: "blank",
      };
    } else if (initalTabOptions.type === "front_page") {
      this.data = {
        type: "front_page",
        options: clearExtraPropsForReload(initalTabOptions).options,
        pages: [],
      };
    } else if (initalTabOptions.type === "watched") {
      this.data = {
        type: "watched",
        options: clearExtraPropsForReload(initalTabOptions).options,
        pages: [],
      };
    } else if (initalTabOptions.type === "popular") {
      this.data = {
        type: "popular",
        options: clearExtraPropsForReload(initalTabOptions).options,
        pages: [],
      };
    } else if (initalTabOptions.type === "favorites") {
      this.data = {
        type: "favorites",
        options: clearExtraPropsForReload(initalTabOptions).options,
        pages: [],
      };
    } else if (initalTabOptions.type === "toplist") {
      this.data = {
        type: "toplist",
        options: clearExtraPropsForReload(initalTabOptions).options,
        enableTagFilter: initalTabOptions.enableTagFilter,
        pages: [],
      };
    } else if (initalTabOptions.type === "upload") {
      this.data = {
        type: "upload",
        pages: [],
      };
    } else if (initalTabOptions.type === "image_lookup") {
      this.data = {
        type: "image_lookup",
        options: clearExtraPropsForReload(initalTabOptions).options,
        pages: [],
      };
    } else {
      this.data = {
        type: "archive",
        options: clearExtraPropsForReload(initalTabOptions).options,
        pages: [],
      };
    }
  }

  get status() {
    return this._status;
  }

  get isNextPageAvailable() {
    if (
      this.data.type === "blank" ||
      this.data.type === "upload" ||
      this.data.type === "popular" ||
      this.data.pages.length === 0
    ) {
      return false;
    } else if (
      this.data.type === "front_page" ||
      this.data.type === "watched" ||
      this.data.type === "favorites" ||
      this.data.type === "image_lookup"
    ) {
      const lastPage = this.data.pages[this.data.pages.length - 1];
      return lastPage.next_page_available;
    } else if (this.data.type === "toplist") {
      const lastPage = this.data.pages[this.data.pages.length - 1];
      return lastPage.current_page !== lastPage.total_pages - 1;
    } else if (this.data.type === "archive") {
      const lastPage = this.data.pages[0]; // archive只有一页
      const pageSize = this.data.options.pageSize || 50;
      return lastPage.all_count > lastPage.items.length + this.data.options.fromPage * pageSize;
    }
    return false;
  }

  private _fateErrorAlert(e: any) {
    if (e instanceof EHIgneousExpiredError) {
      throw new FatalError("里站Cookie已过期，且无法自动刷新");
    }
    if (e instanceof EHIPBannedError) {
      throw new FatalError("你的IP地址可能被封禁");
    }
  }

  async loadTab({
    tabOptions,
    reload,
    loadedHandler,
  }: {
    tabOptions: StatusTabOptions;
    reload?: boolean;
    loadedHandler: (vtab: VirtualTab, success: boolean) => void;
  }) {
    this._loadingId++;
    const cachedLoadingId = this._loadingId;
    this._status = "loading";
    this.errorMessage = undefined;
    switch (tabOptions.type) {
      case "front_page": {
        this.data = {
          type: "front_page",
          options: tabOptions.options,
          pages: reload && this.data.type === "front_page" ? this.data.pages : [],
        };
        let page: EHFrontPageList | undefined;
        try {
          page = await api.getFrontPageInfo(tabOptions.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages = [page];
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "watched": {
        this.data = {
          type: "watched",
          options: tabOptions.options,
          pages: reload && this.data.type === "watched" ? this.data.pages : [],
        };
        let page: EHWatchedList | undefined;
        try {
          page = await api.getWatchedInfo(tabOptions.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages = [page];
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "popular": {
        this.data = {
          type: "popular",
          options: tabOptions.options,
          pages: reload && this.data.type === "popular" ? this.data.pages : [],
        };
        let page: EHPopularList | undefined;
        try {
          page = await api.getPopularInfo(tabOptions.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages = [page];
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "favorites": {
        this.data = {
          type: "favorites",
          options: tabOptions.options,
          pages: reload && this.data.type === "favorites" ? this.data.pages : [],
        };
        let page: EHFavoritesList | undefined;
        try {
          page = await api.getFavoritesInfo(tabOptions.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages = [page];
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "toplist": {
        this.data = {
          type: "toplist",
          options: tabOptions.options,
          enableTagFilter: tabOptions.enableTagFilter,
          pages: reload && this.data.type === "toplist" ? this.data.pages : [],
        };
        let page: EHTopList | undefined;
        try {
          page = await api.getTopListInfo({
            timeRange: tabOptions.options.timeRange,
            page: tabOptions.options.page,
          });
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          let filtered_count = 0;
          if (tabOptions.enableTagFilter) {
            const filteredItems = filterToplistItemsByLocalTagFilter(page.items);
            filtered_count = page.items.length - filteredItems.length;
            page.items = filteredItems;
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages = [
              {
                ...page,
                filtered_count,
              },
            ];
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "upload": {
        this.data = {
          type: "upload",
          pages: reload && this.data.type === "upload" ? this.data.pages : [],
        };
        let page: EHUploadList | undefined;
        try {
          page = await api.getUploadInfo();
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages = [page];
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "image_lookup": {
        this.data = {
          type: "image_lookup",
          options: tabOptions.options,
          pages: reload && this.data.type === "image_lookup" ? this.data.pages : [],
        };
        let page: EHImageLookupList | undefined;
        try {
          page = await api.getImageLookupInfo(tabOptions.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages = [page];
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "archive": {
        this.data = {
          type: "archive",
          options: tabOptions.options,
          pages: reload && this.data.type === "archive" ? this.data.pages : [],
        };
        const items = this.queryArchiveItem(tabOptions.options);
        const count = this.queryArchiveItemCount(tabOptions.options);
        if (this._loadingId === cachedLoadingId) {
          this._status = "loaded";
          this.data.pages = [
            {
              type: "archive",
              all_count: count,
              items,
            },
          ];
          loadedHandler(this, true);
        }
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
  }

  async loadMoreTab({ loadedHandler }: { loadedHandler: (vtab: VirtualTab, success: boolean) => void }) {
    if (!this.isNextPageAvailable) throw new Error("LoadMoreTab Error: Next Page Not Available");
    this._loadingId++;
    const cachedLoadingId = this._loadingId;
    this._status = "loading";
    this.errorMessage = undefined;
    switch (this.data.type) {
      case "front_page": {
        const lastPage = this.data.pages[this.data.pages.length - 1];
        const maximumGid = lastPage.items[lastPage.items.length - 1].gid;
        this.data.options = {
          ...this.data.options,
          range: undefined,
          jump: undefined,
          seek: undefined,
          minimumGid: undefined,
          maximumGid,
        };
        let page: EHFrontPageList | undefined;
        try {
          page = await api.getFrontPageInfo(this.data.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages.push(page);
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "watched": {
        const lastPage = this.data.pages[this.data.pages.length - 1];
        const maximumGid = lastPage.items[lastPage.items.length - 1].gid;
        this.data.options = {
          ...this.data.options,
          range: undefined,
          jump: undefined,
          seek: undefined,
          minimumGid: undefined,
          maximumGid,
        };
        let page: EHWatchedList | undefined;
        try {
          page = await api.getWatchedInfo(this.data.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages.push(page);
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "favorites": {
        const lastPage = this.data.pages[this.data.pages.length - 1];
        const maximumGid = lastPage.items[lastPage.items.length - 1].gid;
        this.data.options = {
          ...this.data.options,
          jump: undefined,
          seek: undefined,
          minimumGid: undefined,
          maximumGid,
          maximumFavoritedTimestamp:
            lastPage.sort_order === "favorited_time" ? lastPage.last_item_favorited_timestamp : undefined,
        };
        let page: EHFavoritesList | undefined;
        try {
          page = await api.getFavoritesInfo(this.data.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages.push(page);
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "toplist": {
        const lastPage = this.data.options.page || 0;
        this.data.options = {
          ...this.data.options,
          page: lastPage + 1,
        };
        let page: EHTopList | undefined;
        try {
          page = await api.getTopListInfo({
            timeRange: this.data.options.timeRange,
            page: this.data.options.page,
          });
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          let filtered_count = 0;
          if (this.data.enableTagFilter) {
            const filteredItems = filterToplistItemsByLocalTagFilter(page.items);
            filtered_count = page.items.length - filteredItems.length;
            page.items = filteredItems;
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages.push({
              ...page,
              filtered_count,
            });
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "image_lookup": {
        const lastPage = this.data.pages[this.data.pages.length - 1];
        const maximumGid = lastPage.items[lastPage.items.length - 1].gid;
        this.data.options = {
          ...this.data.options,
          jump: undefined,
          seek: undefined,
          minimumGid: undefined,
          maximumGid,
        };
        let page: EHImageLookupList | undefined;
        try {
          page = await api.getImageLookupInfo(this.data.options);
        } catch (e: any) {
          this._fateErrorAlert(e);
          this._status = "error";
          this.errorMessage = e.message;
          loadedHandler(this, false);
        }
        if (page) {
          if (page.items.length && page.display_mode !== "extended") {
            throw new FatalError("列表的显示模式不为扩展，您可能在网页端或其他App中更改了设置");
          }
          if (this._loadingId === cachedLoadingId) {
            this._status = "loaded";
            this.data.pages.push(page);
            loadedHandler(this, true);
          }
        }
        break;
      }
      case "archive": {
        const lastPage = this.data.options.toPage;
        this.data.options = {
          ...this.data.options,
          toPage: lastPage + 1,
        };
        if (this._loadingId === cachedLoadingId) {
          this._status = "loaded";
          this.data.pages = [
            {
              type: "archive",
              all_count: this.queryArchiveItemCount(this.data.options),
              items: this.queryArchiveItem(this.data.options),
            },
          ];
          loadedHandler(this, true);
        }
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
  }

  silentUpdateItem(
    gid: number,
    options: {
      my_rating?: number;
      favorite_info?: { favorited: false } | { favorited: true; favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
    },
  ) {
    if (
      this.data.type !== "blank" &&
      this.data.type !== "archive" &&
      this.data.type !== "upload" &&
      this.data.pages.length > 0
    ) {
      const item = this.data.pages.find((n) => n.items.some((m) => m.gid === gid))?.items.find((n) => n.gid === gid);
      if (item) {
        if (options.my_rating) {
          item.is_my_rating = true;
          item.estimated_display_rating = options.my_rating;
        }
        if (options.favorite_info) {
          item.favorited = options.favorite_info.favorited;
          item.favcat = options.favorite_info.favorited ? options.favorite_info.favcat : undefined;
        }
      }
    }
  }

  queryArchiveItemCount(options: ArchiveSearchOptions) {
    return archiveRepository.count(options);
  }

  queryArchiveItem(options: ArchiveSearchOptions) {
    const data = archiveRepository.query(options);
    const extendedItems: EHListExtendedItem[] = data.map((item) => ({
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
      taglist: item.taglist,
    }));
    return extendedItems;
  }

  // 判断当前tab是否存在搜索参数（不包括搜索词和定位参数）
  get hasSearchOptions() {
    switch (this.data.type) {
      case "blank":
      case "favorites":
      case "upload":
      case "image_lookup":
      case "archive": {
        return false;
      }
      case "front_page":
      case "watched": {
        const options = this.data.options;
        return Boolean(
          options.excludedCategories?.length ||
          options.browseExpungedGalleries ||
          options.requireGalleryTorrent ||
          options.minimumPages ||
          options.maximumPages ||
          options.minimumRating ||
          options.disableLanguageFilters ||
          options.disableTagFilters ||
          options.disableUploaderFilters,
        );
      }
      case "popular": {
        return Boolean(
          this.data.options.disableLanguageFilters ||
          this.data.options.disableTagFilters ||
          this.data.options.disableUploaderFilters,
        );
      }
      case "toplist": {
        return (
          (configManager.toplistTagFilterDefaultEnabled && !this.data.enableTagFilter) ||
          (!configManager.toplistTagFilterDefaultEnabled && this.data.enableTagFilter)
        );
      }
      default: {
        return false;
      }
    }
  }
}

/**
 * 管理状态
 */
class StatusManager {
  private _tabsMap: Map<string, VirtualTab> = new Map();
  private _tabIdsInManager: string[];
  private _currentTabId;
  pushedControllerMap: Map<string, PushedSearchResultController> = new Map();
  constructor() {
    // 初始化
    this._tabsMap.set(
      "archive",
      new VirtualTab({ id: "archive", initalTabOptions: { type: "archive", options: { fromPage: 0, toPage: 0 } } }),
    );
    const firstTabId = cvid.newId;
    this._tabsMap.set(firstTabId, new VirtualTab({ id: firstTabId }));
    this._tabIdsInManager = [firstTabId];
    this._currentTabId = firstTabId;
    // 建立对应的下载器
    downloaderManager.addTabDownloader("archive");
    downloaderManager.addTabDownloader(firstTabId);
  }

  get tabsMap() {
    return this._tabsMap;
  }

  get(tabId: string) {
    return this._tabsMap.get(tabId);
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

  setReorderTabIdsShownInManager(tabIds: string[]) {
    if (tabIds.length !== this._tabIdsInManager.length) throw new Error("Invalid tab ids");
    if (
      tabIds.some((tabId) => !this._tabIdsInManager.includes(tabId)) ||
      this._tabIdsInManager.some((tabId) => !tabIds.includes(tabId))
    ) {
      throw new Error("Invalid tab ids");
    }
    this._tabIdsInManager = [...tabIds];
  }

  addTab({ showInManager, initalTabOptions }: { showInManager: boolean; initalTabOptions?: StatusTabOptions }) {
    const tabId = cvid.newId;
    this._tabsMap.set(tabId, new VirtualTab({ id: tabId, initalTabOptions }));
    if (showInManager) this._tabIdsInManager.push(tabId);
    downloaderManager.addTabDownloader(tabId);
    return tabId;
  }

  removeTab(tabId: string) {
    if (this._tabIdsInManager.includes(tabId)) {
      this._tabIdsInManager = this._tabIdsInManager.filter((id) => id !== tabId);
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
    this._tabIdsInManager = this._tabIdsInManager.filter((id) => id !== tabId);
  }

  silentRefreshAll(
    gid: number,
    options: {
      my_rating?: number;
      favorite_info?: { favorited: false } | { favorited: true; favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
    },
  ) {
    for (const c of this.tabsMap.values()) {
      if (c.id !== "archive") c.silentUpdateItem(gid, options);
    }
    for (const controller of this.pushedControllerMap.values()) {
      controller.updateStatus();
    }
    (router.get("homepageController") as HomepageController).updateStatus();
    (router.get("archiveController") as ArchiveController).silentRefresh();
  }

  getArchiveItem(gid: number) {
    return archiveRepository.get(gid);
  }

  queryArchiveGids(options: ArchiveSearchOptions) {
    return archiveRepository.queryGids(options);
  }

  private _buildArchiveItem({
    infos,
    first_access_time,
    last_access_time,
    readlater = false,
    downloaded = false,
    last_read_page = 0,
  }: {
    infos: EHGallery | EHListExtendedItem | EHListCompactItem;
    first_access_time?: string;
    last_access_time?: string;
    readlater?: boolean;
    downloaded?: boolean;
    last_read_page?: number;
  }): DBArchiveItem {
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
      comment =
        infos.comments.length > 0 && infos.comments[0].is_uploader
          ? $text.HTMLUnescape(infos.comments[0].comment_div)
          : "";
    }
    const dateNow = new Date().toISOString();
    return {
      gid: infos.gid,
      readlater,
      downloaded,
      first_access_time: first_access_time || dateNow,
      last_access_time: last_access_time || dateNow,
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
      last_read_page,
    };
  }

  deleteArchiveItem(gid: number) {
    archiveRepository.delete(gid, MutationOrigin.user, true);
  }

  getLastReadPage(gid: number) {
    return archiveRepository.getLastReadPage(gid);
  }

  updateArchiveItem(
    gid: number,
    options: {
      infos?: EHGallery | EHListExtendedItem | EHListCompactItem;
      last_read_page?: number;
      updateLastAccessTime?: boolean;
      readlater?: boolean;
      downloaded?: boolean;
      my_rating?: number;
      favorite_info?: { favorited: false } | { favorited: true; favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
    },
  ) {
    const oldInfos = archiveRepository.get(gid);
    if (!oldInfos) {
      if (options.infos) {
        // 情况1: 数据库内不存在该条数据，但是有options.infos，那么直接存储
        // 该情况下，除了infos，只有readlater、downloaded、last_read_page是有效的
        archiveRepository.save(
          this._buildArchiveItem({
            infos: options.infos,
            readlater: options.readlater,
            downloaded: options.downloaded,
            last_read_page: options.last_read_page,
          }),
          MutationOrigin.user,
        );
      } else {
        // 情况2: 数据库内不存在该条数据，且没有options.infos，则报错
        throw new Error("Archive item not found and no info provided");
      }
    } else {
      if (options.infos && !("type" in options.infos)) {
        // 情况3: 数据库内存在该条数据，且有options.infos，并且infos为EHGallery，那么直接存储
        // 该情况下，将复合oldInfos和options的信息，更新first_access_time、last_access_time、readlater、downloaded、last_read_page
        const replacement = this._buildArchiveItem({
          infos: options.infos,
          first_access_time: oldInfos.first_access_time,
          last_access_time: options.updateLastAccessTime ? new Date().toISOString() : oldInfos.last_access_time,
          readlater: options.readlater ?? oldInfos.readlater,
          downloaded: options.downloaded ?? oldInfos.downloaded,
          last_read_page: options.last_read_page ?? oldInfos.last_read_page,
        });
        if (options.my_rating !== undefined) {
          replacement.is_my_rating = true;
          replacement.rating = options.my_rating;
        }
        if (options.favorite_info) {
          if (options.favorite_info.favorited) {
            replacement.favorited = true;
            replacement.favcat = options.favorite_info.favcat;
          } else {
            replacement.favorited = false;
          }
        }
        archiveRepository.save(replacement, MutationOrigin.user, true);
      } else {
        let myRating = options.my_rating;
        let favoriteInfo = options.favorite_info;
        if (options.infos && "type" in options.infos) {
          // 情况4: 数据库内存在该条数据，且有options.infos，并且infos为EHListExtendedItem或EHListCompactItem
          // 该情况下，将从options.infos中提取my_rating、favorited、favcat，然后更新
          if (
            myRating === undefined &&
            options.infos.is_my_rating &&
            (!oldInfos.is_my_rating ||
              (oldInfos.is_my_rating && options.infos.estimated_display_rating !== oldInfos.rating))
          ) {
            // 如果options中没有my_rating，并且options.infos的my_rating信息和oldInfos的my_rating不同
            myRating = options.infos.estimated_display_rating;
          }
          if (favoriteInfo === undefined) {
            if (!options.infos.favorited && oldInfos.favorited) {
              favoriteInfo = { favorited: false };
            } else if (
              (options.infos.favorited && !oldInfos.favorited) ||
              (options.infos.favorited && oldInfos.favorited && options.infos.favcat !== oldInfos.favcat)
            ) {
              favoriteInfo = {
                favorited: true,
                favcat: options.infos.favcat ?? 0,
              };
            }
          }
        }
        // 情况5: 数据库内存在该条数据，但是没有options.info，那么options里存在什么就更新什么
        archiveRepository.update(
          gid,
          {
            readlater: options.readlater,
            downloaded: options.downloaded,
            last_read_page: options.last_read_page,
            last_access_time: options.updateLastAccessTime ? new Date().toISOString() : undefined,
            my_rating: myRating,
            favorite_info: favoriteInfo,
          },
          MutationOrigin.user,
        );
      }
    }
  }
}

export const statusManager = new StatusManager();
