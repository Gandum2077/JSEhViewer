import { BaseController, CustomNavigationBar, SymbolButton, router } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import { getJumpRangeDialogForHomepage, getJumpRangeDialogForFavorites } from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { clearExtraPropsForReload, statusManager, VirtualTab } from "../utils/status";
import { EHlistView } from "../components/ehlist-view";
import { buildSortedFsearch, EHListExtendedItem } from "ehentai-parser";
import { FavoritesTabOptions, FrontPageTabOptions, WatchedTabOptions } from "../types";
import { api, downloaderManager } from "../utils/api";
import { CustomSearchBar } from "../components/custom-searchbar";
import { getSearchOptions } from "./search-controller";
import { SidebarTabController } from "./sidebar-tab-controller";
import { globalTimer } from "../utils/timer";
import { EhlistTitleView } from "../components/ehlist-titleview";
import { popoverForTitleView } from "../components/titleview-popover";

export class PushedSearchResultController extends BaseController {
  _thumbnailAllLoaded: boolean = false; // 此标志用于在TabDownloader完成后，再进行一次刷新
  readonly tabId: string;
  layoutMode: "normal" | "large";
  cviews: {
    navbar: CustomNavigationBar;
    list: EHlistView;
    searchBar: CustomSearchBar;
    titleView: EhlistTitleView;
  };
  constructor() {
    super({
      props: {
        bgcolor: $color("backgroundColor"),
      },
      events: {
        didLoad: () => {
          globalTimer.addTask({
            id: this.tabId,
            paused: true,
            handler: () => {
              const finished = downloaderManager.getTabDownloader(this.tabId)!.isAllFinishedDespiteError;
              if (!finished || !this._thumbnailAllLoaded) {
                this.cviews.list.reload();
              }
              if (finished) {
                this._thumbnailAllLoaded = true;
              }
            },
          });
        },
        didAppear: () => {
          downloaderManager.startTabDownloader(this.tabId);
          globalTimer.resumeTask(this.tabId);
        },
        didDisappear: () => {
          globalTimer.pauseTask(this.tabId);
        },
        didRemove: () => {
          if (!statusManager.tabIdsShownInManager.includes(this.tabId)) {
            downloaderManager.removeTabDownloader(this.tabId);
            statusManager.removeTab(this.tabId);
            globalTimer.removeTask(this.tabId);
          }
        },
      },
    });
    const tabId = statusManager.addTab({ showInManager: false, initalTabType: "front_page" });
    this.tabId = tabId;
    this.layoutMode = configManager.pushedSearchResultControllerLayoutMode;
    const listLayoutButton = new SymbolButton({
      props: {
        symbol: this.layoutMode === "normal" ? "square.grid.2x2" : "list.bullet",
        menu: {
          title: "布局方式",
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "列表布局",
              symbol: "list.bullet",
              handler: () => {
                if (this.layoutMode === "large") return;
                configManager.pushedSearchResultControllerLayoutMode = "large";
                this.layoutMode = "large";
                listLayoutButton.symbol = "list.bullet";
                list.layoutMode = "large";
              },
            },
            {
              title: "矩阵布局",
              symbol: "square.grid.2x2",
              handler: () => {
                if (this.layoutMode === "normal") return;
                configManager.pushedSearchResultControllerLayoutMode = "normal";
                this.layoutMode = "normal";
                listLayoutButton.symbol = "square.grid.2x2";
                list.layoutMode = "normal";
              },
            },
          ],
        },
      },
      layout: $layout.fill,
    });
    const showInManagerButton = new SymbolButton({
      props: {
        symbol: "plus.rectangle.on.rectangle",
        tintColor: $color("primaryText"),
      },
      layout: $layout.fill,
      events: {
        tapped: () => {
          if (statusManager.tabIdsShownInManager.includes(this.tabId)) {
            statusManager.hideTabInManager(this.tabId);
            showInManagerButton.tintColor = $color("primaryText");
            showInManagerButton.symbol = "plus.rectangle.on.rectangle";
          } else {
            statusManager.showTabInManager(this.tabId);
            showInManagerButton.tintColor = $color("systemLink");
            showInManagerButton.symbol = "rectangle.fill.on.rectangle.fill";
          }
          (router.get("sidebarTabController") as SidebarTabController).refresh();
        },
      },
    });
    const titleView = new EhlistTitleView({
      defaultTitle: "搜索",
      tapped: async (sender) => {
        const tab = statusManager.tabsMap.get(this.tabId);
        if (!tab || (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")) {
          throw new Error("Tab not found or invalid tab type");
        }
        switch (tab.data.type) {
          case "front_page": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.data.type,
                filterOptions: {
                  disableLanguageFilters: tab.data.options.disableLanguageFilters ?? false,
                  disableUploaderFilters: tab.data.options.disableUploaderFilters ?? false,
                  disableTagFilters: tab.data.options.disableTagFilters ?? false,
                },
                count: {
                  loaded: tab.data.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr, 0),
                  all: tab.data.pages.at(0)?.total_item_count || 0,
                  filtered: tab.data.pages.map((n) => n.filtered_count).reduce((prev, curr) => prev + curr, 0),
                },
              },
            });
            if (
              (tab.data.options.disableLanguageFilters ?? false) !== values.filterOptions.disableLanguageFilters ||
              (tab.data.options.disableUploaderFilters ?? false) !== values.filterOptions.disableUploaderFilters ||
              (tab.data.options.disableTagFilters ?? false) !== values.filterOptions.disableTagFilters
            ) {
              const newOptions = clearExtraPropsForReload(tab.data);
              newOptions.options.disableLanguageFilters = values.filterOptions.disableLanguageFilters || undefined;
              newOptions.options.disableUploaderFilters = values.filterOptions.disableUploaderFilters || undefined;
              newOptions.options.disableTagFilters = values.filterOptions.disableTagFilters || undefined;
              this.triggerLoad(newOptions);
            }
            break;
          }
          case "watched": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.data.type,
                filterOptions: {
                  disableLanguageFilters: tab.data.options.disableLanguageFilters ?? false,
                  disableUploaderFilters: tab.data.options.disableUploaderFilters ?? false,
                  disableTagFilters: tab.data.options.disableTagFilters ?? false,
                },
                count: {
                  loaded: tab.data.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr, 0),
                  filtered: tab.data.pages.map((n) => n.filtered_count).reduce((prev, curr) => prev + curr, 0),
                },
              },
            });
            if (
              (tab.data.options.disableLanguageFilters ?? false) !== values.filterOptions.disableLanguageFilters ||
              (tab.data.options.disableUploaderFilters ?? false) !== values.filterOptions.disableUploaderFilters ||
              (tab.data.options.disableTagFilters ?? false) !== values.filterOptions.disableTagFilters
            ) {
              const newOptions = clearExtraPropsForReload(tab.data);
              newOptions.options.disableLanguageFilters = values.filterOptions.disableLanguageFilters || undefined;
              newOptions.options.disableUploaderFilters = values.filterOptions.disableUploaderFilters || undefined;
              newOptions.options.disableTagFilters = values.filterOptions.disableTagFilters || undefined;
              this.triggerLoad(newOptions);
            }
            break;
          }

          case "favorites": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.data.type,
                favoritesOrderMethod: configManager.favoritesOrderMethod,
                count: {
                  loaded: tab.data.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr, 0),
                },
              },
            });
            if (values.favoritesOrderMethod !== configManager.favoritesOrderMethod) {
              api
                .setFavoritesSortOrder(values.favoritesOrderMethod)
                .then(() => {
                  if (tab.data.type === "favorites") {
                    configManager.favoritesOrderMethod = values.favoritesOrderMethod;
                    this.triggerLoad(clearExtraPropsForReload(tab.data));
                  }
                })
                .catch(() => {
                  $ui.error("收藏页排序更新失败");
                });
            }
            break;
          }
          default:
            break;
        }
      },
    });
    const navbar = new CustomNavigationBar({
      props: {
        titleView,
        leftBarButtonItems: [
          {
            symbol: "chevron.left",
            handler: () => {
              $ui.pop();
            },
          },
          {
            cview: listLayoutButton,
          },
        ],
        rightBarButtonItems: [
          {
            cview: showInManagerButton,
          },
          {
            symbol: "arrow.left.arrow.right.circle",
            handler: async () => {
              const tab = statusManager.get(this.tabId);
              if (
                !tab ||
                (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")
              ) {
                throw new Error("Tab not found or invalid tab type");
              }
              const type = tab.data.type;
              if (type === "front_page" || type === "watched") {
                const firstPage = tab.data.pages.at(0);
                const lastPage = tab.data.pages.at(-1);
                if (!firstPage || !lastPage || firstPage.items.length === 0 || lastPage.items.length === 0) {
                  $ui.toast("目前无法翻页");
                  return;
                }
                if (firstPage.prev_page_available === false && lastPage.next_page_available === false) {
                  $ui.toast("全部内容已加载");
                  return;
                }
                const result = await getJumpRangeDialogForHomepage({
                  minimumGid: firstPage.items[0].gid,
                  maximumGid: lastPage.items[lastPage.items.length - 1].gid,
                  prev_page_available: firstPage.prev_page_available,
                  next_page_available: lastPage.next_page_available,
                });
                this.triggerLoad({
                  type,
                  options: {
                    ...tab.data.options,
                    range: result.range,
                    minimumGid: result.minimumGid,
                    maximumGid: result.maximumGid,
                    jump: result.jump,
                    seek: result.seek,
                  },
                });
              } else if (type === "favorites") {
                const firstPage = tab.data.pages.at(0);
                const lastPage = tab.data.pages.at(-1);
                if (!firstPage || !lastPage || firstPage.items.length === 0 || lastPage.items.length === 0) {
                  $ui.toast("目前无法翻页");
                  return;
                }
                if (firstPage.prev_page_available === false && lastPage.next_page_available === false) {
                  $ui.toast("全部内容已加载");
                  return;
                }
                const result = await getJumpRangeDialogForFavorites({
                  minimumGid: firstPage.items[0].gid,
                  minimumFavoritedTimestamp: firstPage.first_item_favorited_timestamp,
                  maximumGid: lastPage.items[lastPage.items.length - 1].gid,
                  maximumFavoritedTimestamp: lastPage.last_item_favorited_timestamp,
                  prev_page_available: firstPage.prev_page_available,
                  next_page_available: lastPage.next_page_available,
                });
                this.triggerLoad({
                  type,
                  options: {
                    ...tab.data.options,
                    minimumGid: result.minimumGid,
                    minimumFavoritedTimestamp: result.minimumFavoritedTimestamp,
                    maximumGid: result.maximumGid,
                    maximumFavoritedTimestamp: result.maximumFavoritedTimestamp,
                    jump: result.jump,
                    seek: result.seek,
                  },
                });
              }
            },
          },
        ],
      },
    });
    const searchBar = new CustomSearchBar({
      props: {},
      events: {
        tapped: async (sender) => {
          const tab = statusManager.get(this.tabId);
          if (
            !tab ||
            (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")
          ) {
            throw new Error("Tab not found or invalid tab type");
          }
          const args = (await getSearchOptions(
            { type: tab.data.type, options: { searchTerms: tab.data.options.searchTerms } },
            "showAllExceptArchive"
          )) as FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions;
          this.triggerLoad(args);
        },
      },
    });
    const list = new EHlistView({
      layoutMode: this.layoutMode,
      searchBar,
      pulled: async () => {
        const tab = statusManager.get(this.tabId);
        if (!tab || (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")) {
          throw new Error("Tab not found or invalid tab type");
        }
        await this.triggerLoadAsync(clearExtraPropsForReload(tab.data), true);
      },
      didSelect: (sender, indexPath, item) => {
        const galleryController = new GalleryController(item.gid, item.token);
        galleryController.uipush({
          navBarHidden: true,
          statusBarStyle: 0,
        });
      },
      didLongPress: (sender, indexPath, item) => {},
      didReachBottom: () => {
        this.triggerLoadMore();
      },
      contentOffsetChanged: (scrollState) => {
        const tab = statusManager.get(this.tabId);
        if (!tab || (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")) {
          throw new Error("Tab not found or invalid tab type");
        }
        tab.scrollState = scrollState;
        downloaderManager.getTabDownloader(this.tabId)!.currentReadingIndex = scrollState.firstVisibleItemIndex;
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.inset(0);
        make.bottom.equalTo(view.super.bottom);
      },
    });
    this.cviews = { navbar, list, searchBar, titleView };
    this.rootView.views = [navbar, list];
  }

  triggerLoad(tabOptions: FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions, reload?: boolean) {
    const tab = statusManager.get(this.tabId);
    if (!tab || (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")) {
      throw new Error("Tab not found or invalid tab type");
    }
    tab.loadTab({
      tabOptions,
      loadedHandler: (vtab, success) => {
        this._loadedHandler(vtab, success, !reload);
      },
    });
    this.updateStatus(reload);
  }

  triggerLoadMore() {
    const tab = statusManager.get(this.tabId);
    if (!tab || (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")) {
      throw new Error("Tab not found or invalid tab type");
    }
    if (!tab.isNextPageAvailable) return;
    tab.loadMoreTab({
      loadedHandler: (vtab, success) => {
        this._loadedHandler(vtab, success, false);
      },
    });
    this.updateStatus(true);
  }

  private async triggerLoadAsync(
    tabOptions: FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions,
    reload?: boolean
  ) {
    const tab = statusManager.get(this.tabId);
    if (!tab || (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")) {
      throw new Error("Tab not found or invalid tab type");
    }
    return new Promise<void>((resolve) => {
      tab.loadTab({
        tabOptions,
        loadedHandler: (vtab, success) => {
          this._loadedHandler(vtab, success, !reload);
          resolve();
        },
      });
      this.updateStatus(reload);
    });
  }

  private _loadedHandler(vtab: VirtualTab, success: boolean, updateSearchTermsCount: boolean) {
    if (vtab.data.type !== "front_page" && vtab.data.type !== "watched" && vtab.data.type !== "favorites") {
      throw new Error("Invalid tab type");
    }
    this.updateStatus();
    if (updateSearchTermsCount) {
      const searchTerms = vtab.data.options.searchTerms;
      if (searchTerms && searchTerms.length) {
        const fsearch = buildSortedFsearch(searchTerms);
        configManager.addOrUpdateSearchHistory(fsearch, searchTerms);
        configManager.updateTagAccessCount(searchTerms);
      }
    }
    if (success) {
      downloaderManager.getTabDownloader(this.tabId)!.clear();
      downloaderManager.getTabDownloader(this.tabId)!.add(
        vtab.data.pages
          .map((page) => page.items)
          .flat()
          .map((item) => ({
            gid: item.gid,
            url: item.thumbnail_url,
          }))
      );
      downloaderManager.startTabDownloader(this.tabId);
    }
  }

  /**
   * 根据virtualTab更新状态，可以在任何时候调用
   * @param reloading 代表是否处于刷新中，如果是，不要刷新列表，节约UI资源
   */
  updateStatus(reloading: boolean = false) {
    // 四个内容需要更新状态：列表、搜索栏、标题、底部
    // 本controller只有三种情况：front_page, watched, favorites
    const tab = statusManager.get(this.tabId);
    if (!tab || (tab.data.type !== "front_page" && tab.data.type !== "watched" && tab.data.type !== "favorites")) {
      throw new Error("Tab not found or invalid tab type");
    }

    // 更新搜索栏
    const searchTerms = tab.data.options.searchTerms;
    if (searchTerms && searchTerms.length) {
      this.cviews.searchBar.searchTerms = searchTerms;
    } else {
      this.cviews.searchBar.searchTerms = [];
    }

    // 更新标题
    this.cviews.titleView.title =
      tab.data.type === "front_page" ? "搜索" : tab.data.type === "watched" ? "订阅" : "收藏";

    // 更新列表
    if (!reloading) {
      this.cviews.list.items = tab.data.pages.map((page) => page.items).flat() as EHListExtendedItem[];
    }

    // 更新底部
    this.cviews.list.footerText =
      tab.status === "loading"
        ? "加载中……"
        : tab.status === "error"
        ? "加载出现错误"
        : tab.isNextPageAvailable
        ? "上拉加载更多"
        : "没有更多了";

    this._thumbnailAllLoaded = false;
    (router.get("sidebarTabController") as SidebarTabController).refresh();
  }
}
