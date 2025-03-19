import { BaseController, CustomNavigationBar, SymbolButton, router, SplitViewController } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import {
  getJumpRangeDialogForHomepage,
  getJumpPageDialog,
  getJumpRangeDialogForFavorites,
} from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { clearExtraPropsForReload, statusManager } from "../utils/status";
import { EHlistView } from "../components/ehlist-view";
import { appLog } from "../utils/tools";
import { buildSortedFsearch, EHListExtendedItem, EHSearchTerm, extractGidToken } from "ehentai-parser";
import { StatusTabOptions } from "../types";
import { api, downloaderManager, TabThumbnailDownloader } from "../utils/api";
import { CustomSearchBar } from "../components/custom-searchbar";
import { getSearchOptions } from "./search-controller";
import { SidebarTabController } from "./sidebar-tab-controller";
import { globalTimer } from "../utils/timer";
import { EhlistTitleView } from "../components/ehlist-titleview";
import { popoverForTitleView } from "../components/titleview-popover";

export class HomepageController extends BaseController {
  _thumbnailAllLoaded: boolean = false; // 此标志用于在TabDownloader完成后，再进行一次刷新
  cviews: {
    navbar: CustomNavigationBar;
    list: EHlistView;
    searchBar: CustomSearchBar;
    titleView: EhlistTitleView;
  };
  constructor() {
    super({
      props: {
        id: "homepageController",
        bgcolor: $color("backgroundColor"),
      },
      events: {
        didLoad: () => {
          globalTimer.addTask({
            id: "homepageController",
            paused: true,
            handler: () => {
              const finished = downloaderManager.getTabDownloader(
                statusManager.currentTabId
              )!.isAllFinishedDespiteError;
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
          downloaderManager.startTabDownloader(statusManager.currentTabId);
          globalTimer.resumeTask("homepageController");
        },
        didDisappear: () => {
          globalTimer.pauseTask("homepageController");
        },
      },
    });
    const listLayoutButton = new SymbolButton({
      props: {
        symbol: configManager.homepageManagerLayoutMode === "normal" ? "square.grid.2x2" : "list.bullet",
        menu: {
          title: "布局方式",
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "列表布局",
              symbol: "list.bullet",
              handler: () => {
                if (configManager.homepageManagerLayoutMode === "large") return;
                configManager.homepageManagerLayoutMode = "large";
                listLayoutButton.symbol = "list.bullet";
                list.layoutMode = "large";
              },
            },
            {
              title: "矩阵布局",
              symbol: "square.grid.2x2",
              handler: () => {
                if (configManager.homepageManagerLayoutMode === "normal") return;
                configManager.homepageManagerLayoutMode = "normal";
                listLayoutButton.symbol = "square.grid.2x2";
                list.layoutMode = "normal";
              },
            },
          ],
        },
      },
      layout: $layout.fill,
    });
    const openLinkButton = new SymbolButton({
      props: {
        symbol: "link",
      },
      layout: $layout.fill,
      events: {
        tapped: async () => {
          const result = await $input.text({
            type: $kbType.url,
            placeholder: "输入链接，直接打开图库",
            text: "",
          });
          if (!result) return;
          const url = result.trim().toLowerCase();
          let gid: number | undefined;
          let token: string | undefined;
          try {
            const r = extractGidToken(url);
            gid = r.gid;
            token = r.token;
          } catch (e) {
            $ui.toast("无效链接");
          }
          if (!gid || !token) return;
          const galleryController = new GalleryController(gid, token);
          galleryController.uipush({
            navBarHidden: true,
            statusBarStyle: 0,
          });
        },
      },
    });
    const titleView = new EhlistTitleView({
      defaultTitle: "空白页",
      tapped: async (sender) => {
        const tab = statusManager.currentTab;
        switch (tab.type) {
          case "front_page": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.type,
                filterOptions: {
                  disableLanguageFilters: tab.options.disableLanguageFilters ?? false,
                  disableUploaderFilters: tab.options.disableUploaderFilters ?? false,
                  disableTagFilters: tab.options.disableTagFilters ?? false,
                },
                count: {
                  loaded: tab.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr),
                  all: tab.pages[0].total_item_count,
                  filtered: tab.pages.map((n) => n.filtered_count).reduce((prev, curr) => prev + curr),
                },
              },
            });
            if (
              (tab.options.disableLanguageFilters ?? false) !== values.filterOptions.disableLanguageFilters ||
              (tab.options.disableUploaderFilters ?? false) !== values.filterOptions.disableUploaderFilters ||
              (tab.options.disableTagFilters ?? false) !== values.filterOptions.disableTagFilters
            ) {
              tab.options.disableLanguageFilters = values.filterOptions.disableLanguageFilters || undefined;
              tab.options.disableUploaderFilters = values.filterOptions.disableUploaderFilters || undefined;
              tab.options.disableTagFilters = values.filterOptions.disableTagFilters || undefined;
              await this.reload();
            }
            break;
          }
          case "watched": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.type,
                filterOptions: {
                  disableLanguageFilters: tab.options.disableLanguageFilters ?? false,
                  disableUploaderFilters: tab.options.disableUploaderFilters ?? false,
                  disableTagFilters: tab.options.disableTagFilters ?? false,
                },
                count: {
                  loaded: tab.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr),
                  filtered: tab.pages.map((n) => n.filtered_count).reduce((prev, curr) => prev + curr),
                },
              },
            });
            if (
              (tab.options.disableLanguageFilters ?? false) !== values.filterOptions.disableLanguageFilters ||
              (tab.options.disableUploaderFilters ?? false) !== values.filterOptions.disableUploaderFilters ||
              (tab.options.disableTagFilters ?? false) !== values.filterOptions.disableTagFilters
            ) {
              tab.options.disableLanguageFilters = values.filterOptions.disableLanguageFilters || undefined;
              tab.options.disableUploaderFilters = values.filterOptions.disableUploaderFilters || undefined;
              tab.options.disableTagFilters = values.filterOptions.disableTagFilters || undefined;
              await this.reload();
            }
            break;
          }
          case "popular": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.type,
                filterOptions: {
                  disableLanguageFilters: tab.options.disableLanguageFilters ?? false,
                  disableUploaderFilters: tab.options.disableUploaderFilters ?? false,
                  disableTagFilters: tab.options.disableTagFilters ?? false,
                },
                count: {
                  loaded: tab.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr),
                  filtered: tab.pages.map((n) => n.filtered_count).reduce((prev, curr) => prev + curr),
                },
              },
            });
            if (
              (tab.options.disableLanguageFilters ?? false) !== values.filterOptions.disableLanguageFilters ||
              (tab.options.disableUploaderFilters ?? false) !== values.filterOptions.disableUploaderFilters ||
              (tab.options.disableTagFilters ?? false) !== values.filterOptions.disableTagFilters
            ) {
              tab.options.disableLanguageFilters = values.filterOptions.disableLanguageFilters || undefined;
              tab.options.disableUploaderFilters = values.filterOptions.disableUploaderFilters || undefined;
              tab.options.disableTagFilters = values.filterOptions.disableTagFilters || undefined;
              await this.reload();
            }
            break;
          }
          case "favorites": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.type,
                favoritesOrderMethod: configManager.favoritesOrderMethod,
                count: {
                  loaded: tab.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr),
                },
              },
            });
            if (values.favoritesOrderMethod !== configManager.favoritesOrderMethod) {
              api
                .setFavoritesSortOrder(values.favoritesOrderMethod)
                .then(() => {
                  configManager.favoritesOrderMethod = values.favoritesOrderMethod;
                  this.reload().then();
                })
                .catch(() => {
                  $ui.error("收藏页排序更新失败");
                });
            }
            break;
          }
          case "toplist": {
            popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.type,
                count: {
                  loaded: tab.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr),
                },
              },
            });
            break;
          }
          case "upload": {
            popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.type,
                count: {
                  loaded: tab.pages[0].folders.map((n) => n.items.length).reduce((prev, curr) => prev + curr),
                },
              },
            });
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
            symbol: "sidebar.left",
            handler: () => {
              (router.get("splitViewController") as SplitViewController).sideBarShown = true;
            },
          },
          {
            cview: listLayoutButton,
          },
        ],
        rightBarButtonItems: [
          {
            cview: openLinkButton,
          },
          {
            symbol: "arrow.left.arrow.right.circle",
            handler: async () => {
              if (!statusManager.currentTab) {
                $ui.toast("无法翻页，请先加载内容");
                return;
              }
              const type = statusManager.currentTab.type;
              if (type === "front_page" || type === "watched") {
                const firstPage = statusManager.currentTab.pages[0];
                const lastPage = statusManager.currentTab.pages[statusManager.currentTab.pages.length - 1];
                if (firstPage.items.length === 0 || lastPage.items.length === 0) {
                  $ui.toast("没有内容，无法翻页");
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
                await this.triggerLoad({
                  type,
                  options: {
                    ...statusManager.currentTab.options,
                    range: result.range,
                    minimumGid: result.minimumGid,
                    maximumGid: result.maximumGid,
                    jump: result.jump,
                    seek: result.seek,
                  },
                });
              } else if (type === "favorites") {
                const firstPage = statusManager.currentTab.pages[0];
                const lastPage = statusManager.currentTab.pages[statusManager.currentTab.pages.length - 1];
                if (firstPage.items.length === 0 || lastPage.items.length === 0) {
                  $ui.toast("没有内容，无法翻页");
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
                await this.triggerLoad({
                  type,
                  options: {
                    ...statusManager.currentTab.options,
                    minimumGid: result.minimumGid,
                    minimumFavoritedTimestamp: result.minimumFavoritedTimestamp,
                    maximumGid: result.maximumGid,
                    maximumFavoritedTimestamp: result.maximumFavoritedTimestamp,
                    jump: result.jump,
                    seek: result.seek,
                  },
                });
              } else if (type === "toplist") {
                const result = await getJumpPageDialog(200);
                await this.triggerLoad({
                  type,
                  options: {
                    ...statusManager.currentTab.options,
                    ...result,
                  },
                });
              } else {
                $ui.toast("全部内容已加载");
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
          let type: "front_page" | "watched" | "favorites" = "front_page";
          let searchTerms: EHSearchTerm[] | undefined = undefined;
          if (
            statusManager.currentTab &&
            (statusManager.currentTab.type === "front_page" ||
              statusManager.currentTab.type === "watched" ||
              statusManager.currentTab.type === "favorites")
          ) {
            searchTerms = statusManager.currentTab.options.searchTerms;
            type = statusManager.currentTab.type;
          }
          const args = await getSearchOptions({ type, options: { searchTerms } }, "showAllExceptArchive");
          await this.triggerLoad(args);
        },
      },
    });
    const list = new EHlistView({
      layoutMode: configManager.homepageManagerLayoutMode,
      searchBar,
      pulled: async () => {
        await this.reload();
      },
      didSelect: async (sender, indexPath, item) => {
        const galleryController = new GalleryController(item.gid, item.token);
        galleryController.uipush({
          navBarHidden: true,
          statusBarStyle: 0,
        });
      },
      didLongPress: (sender, indexPath, item) => {},
      didReachBottom: async () => {
        await this.loadMore();
      },
      contentOffsetChanged: (scrollState) => {
        const tab = statusManager.currentTab;
        if (tab.type !== "blank" && tab.type !== "archive") {
          tab.scrollState = scrollState;
        }
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.inset(0);
        make.bottom.equalTo(view.super.safeAreaBottom).offset(-50);
      },
    });
    this.cviews = { navbar, list, searchBar, titleView };
    this.rootView.views = [navbar, list];
  }

  async triggerLoad(options: StatusTabOptions) {
    this.updateLoadingStatus(options);
    const tabId = statusManager.currentTabId;
    const tab = await statusManager.loadTab(options, tabId);
    if (!tab) return;
    const dm = downloaderManager.getTabDownloader(statusManager.currentTabId) as TabThumbnailDownloader;
    dm.clear();
    if (tab.type !== "upload") {
      dm.add(
        tab.pages
          .map((page) => page.items)
          .flat()
          .map((item) => ({
            gid: item.gid,
            url: item.thumbnail_url,
          }))
      );
      downloaderManager.startTabDownloader(statusManager.currentTabId);
    }
    this.updateLoadedStatus();
  }

  updateBlankStatus() {
    this.cviews.titleView.title = "首页";
    this.cviews.list.items = [];
    this.cviews.list.footerText = "";
    this.cviews.searchBar.searchTerms = [];
  }

  updateLoadingStatus(options: StatusTabOptions) {
    // 1. 列表归零
    // 2. 搜索栏更新
    // 3. 标题更新
    this.cviews.list.footerText = "加载中……";
    this.cviews.list.items = [];
    if (
      (options.type === "front_page" || options.type === "watched" || options.type === "favorites") &&
      options.options.searchTerms &&
      options.options.searchTerms.length
    ) {
      const fsearch = buildSortedFsearch(options.options.searchTerms);
      configManager.addOrUpdateSearchHistory(fsearch, options.options.searchTerms);
      configManager.updateTagAccessCount(options.options.searchTerms);
      this.cviews.searchBar.searchTerms = options.options.searchTerms;
    } else {
      this.cviews.searchBar.searchTerms = [];
    }
  }

  async loadMore() {
    if (statusManager.currentTab.type === "blank" || statusManager.currentTab.pages.length === 0) return;
    // popular and upload tab can not load more
    if (statusManager.currentTab.type === "popular" || statusManager.currentTab.type === "upload") return;
    if (
      statusManager.currentTab.type === "front_page" ||
      statusManager.currentTab.type === "watched" ||
      statusManager.currentTab.type === "favorites"
    ) {
      const lastPage = statusManager.currentTab.pages[statusManager.currentTab.pages.length - 1];
      if (!lastPage.next_page_available) return;
    } else if (statusManager.currentTab.type === "toplist") {
      const lastPage = statusManager.currentTab.pages[statusManager.currentTab.pages.length - 1];
      if (lastPage.current_page === lastPage.total_pages - 1) return;
    }
    this.cviews.list.footerText = "正在加载更多……";
    try {
      const tab = await statusManager.loadMoreTab(statusManager.currentTabId);
      if (!tab) return;
      const dm = downloaderManager.getTabDownloader(statusManager.currentTabId) as TabThumbnailDownloader;
      dm.clear();
      dm.add(
        tab.pages
          .map((page) => page.items)
          .flat()
          .map((item) => ({
            gid: item.gid,
            url: item.thumbnail_url,
          }))
      );
      downloaderManager.startTabDownloader(statusManager.currentTabId);

      this.updateLoadedStatus();
    } catch (e) {
      appLog(e, "error");
    }
  }

  async reload() {
    this.cviews.list.footerText = "正在重新加载……";
    try {
      const tab = await statusManager.reloadTab(statusManager.currentTabId);
      const dm = downloaderManager.getTabDownloader(statusManager.currentTabId) as TabThumbnailDownloader;
      dm.clear();
      if (tab.type !== "upload" && tab.type !== "blank") {
        dm.add(
          tab.pages
            .map((page) => page.items)
            .flat()
            .map((item) => ({
              gid: item.gid,
              url: item.thumbnail_url,
            }))
        );
        downloaderManager.startTabDownloader(statusManager.currentTabId);
      }
      this.updateLoadedStatus();
    } catch (e) {
      appLog(e, "error");
    }
  }

  updateLoadedStatus() {
    const tab = statusManager.currentTab;
    switch (tab.type) {
      case "blank": {
        this.cviews.titleView.title = "首页";
        this.cviews.list.items = [];
        this.cviews.list.footerText = "";
        break;
      }
      case "front_page": {
        const items = tab.pages.map((page) => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage.next_page_available) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        this.cviews.titleView.title = "首页";
        break;
      }
      case "watched": {
        const items = tab.pages.map((page) => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage.next_page_available) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        this.cviews.titleView.title = "订阅";
        break;
      }
      case "popular": {
        const items = tab.pages.map((page) => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        this.cviews.list.footerText = "没有更多了";
        this.cviews.titleView.title = "热门";
        break;
      }
      case "favorites": {
        const items = tab.pages.map((page) => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage.next_page_available) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        this.cviews.titleView.title = "收藏";
        break;
      }
      case "toplist": {
        const items = tab.pages.map((page) => page.items).flat();
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (lastPage.current_page === lastPage.total_pages - 1) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        const timeRange = tab.options.timeRange;
        this.cviews.titleView.title = {
          yesterday: "日排行",
          past_month: "月排行",
          past_year: "年排行",
          all: "总排行",
        }[timeRange];
        break;
      }
      case "upload": {
        const folders = tab.pages[0].folders;
        this.cviews.list.uploadFolders = folders;
        this.cviews.list.footerText = "没有更多了";
        this.cviews.titleView.title = "我的上传";
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
    this._thumbnailAllLoaded = false;
    if (tab.type !== "blank") {
      const storedOptions = clearExtraPropsForReload(tab);
      configManager.lastAccessPageJson = JSON.stringify(storedOptions);
    }
    (router.get("sidebarTabController") as SidebarTabController).refresh();
  }
}
