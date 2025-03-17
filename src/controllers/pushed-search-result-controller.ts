import {
  BaseController,
  CustomNavigationBar,
  SymbolButton,
  router,
} from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import {
  getJumpRangeDialogForHomepage,
  getJumpPageDialog,
  getJumpRangeDialogForFavorites,
} from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { statusManager } from "../utils/status";
import { EHlistView } from "../components/ehlist-view";
import { appLog } from "../utils/tools";
import {
  buildSortedFsearch,
  EHListExtendedItem,
  EHSearchTerm,
} from "ehentai-parser";
import { StatusTabOptions } from "../types";
import { api, downloaderManager, TabThumbnailDownloader } from "../utils/api";
import { CustomSearchBar } from "../components/custom-searchbar";
import { getSearchOptions } from "./search-controller";
import { SidebarTabController } from "./sidebar-tab-controller";
import { globalTimer } from "../utils/timer";
import { EhlistTitleView } from "../components/ehlist-titleview";
import { popoverForTitleView } from "../components/titleview-popover";

export class PushedSearchResultController extends BaseController {
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
              this.cviews.list.reload();
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
    const tabId = statusManager.addBlankTab({ showInManager: false });
    this.tabId = tabId;
    this.layoutMode = configManager.pushedSearchResultControllerLayoutMode;
    const listLayoutButton = new SymbolButton({
      props: {
        symbol:
          this.layoutMode === "normal" ? "square.grid.2x2" : "list.bullet",
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
          (
            router.get("sidebarTabController") as SidebarTabController
          ).refresh();
        },
      },
    });
    const titleView = new EhlistTitleView({
      defaultTitle: "搜索",
      tapped: async (sender) => {
        const tab = statusManager.tabsMap.get(this.tabId);
        if (!tab) return;
        switch (tab.type) {
          case "front_page": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.type,
                filterOptions: {
                  disableLanguageFilters:
                    tab.options.disableLanguageFilters ?? false,
                  disableUploaderFilters:
                    tab.options.disableUploaderFilters ?? false,
                  disableTagFilters: tab.options.disableTagFilters ?? false,
                },
                count: {
                  loaded: tab.pages
                    .map((n) => n.items.length)
                    .reduce((prev, curr) => prev + curr),
                  all: tab.pages[0].total_item_count,
                  filtered: tab.pages
                    .map((n) => n.filtered_count)
                    .reduce((prev, curr) => prev + curr),
                },
              },
            });
            if (
              (tab.options.disableLanguageFilters ?? false) !==
                values.filterOptions.disableLanguageFilters ||
              (tab.options.disableUploaderFilters ?? false) !==
                values.filterOptions.disableUploaderFilters ||
              (tab.options.disableTagFilters ?? false) !==
                values.filterOptions.disableTagFilters
            ) {
              tab.options.disableLanguageFilters =
                values.filterOptions.disableLanguageFilters || undefined;
              tab.options.disableUploaderFilters =
                values.filterOptions.disableUploaderFilters || undefined;
              tab.options.disableTagFilters =
                values.filterOptions.disableTagFilters || undefined;
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
                  disableLanguageFilters:
                    tab.options.disableLanguageFilters ?? false,
                  disableUploaderFilters:
                    tab.options.disableUploaderFilters ?? false,
                  disableTagFilters: tab.options.disableTagFilters ?? false,
                },
                count: {
                  loaded: tab.pages
                    .map((n) => n.items.length)
                    .reduce((prev, curr) => prev + curr),
                  filtered: tab.pages
                    .map((n) => n.filtered_count)
                    .reduce((prev, curr) => prev + curr),
                },
              },
            });
            if (
              (tab.options.disableLanguageFilters ?? false) !==
                values.filterOptions.disableLanguageFilters ||
              (tab.options.disableUploaderFilters ?? false) !==
                values.filterOptions.disableUploaderFilters ||
              (tab.options.disableTagFilters ?? false) !==
                values.filterOptions.disableTagFilters
            ) {
              tab.options.disableLanguageFilters =
                values.filterOptions.disableLanguageFilters || undefined;
              tab.options.disableUploaderFilters =
                values.filterOptions.disableUploaderFilters || undefined;
              tab.options.disableTagFilters =
                values.filterOptions.disableTagFilters || undefined;
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
                  loaded: tab.pages
                    .map((n) => n.items.length)
                    .reduce((prev, curr) => prev + curr),
                },
              },
            });
            if (
              values.favoritesOrderMethod !== configManager.favoritesOrderMethod
            ) {
              api
                .setFavoritesSortOrder(values.favoritesOrderMethod)
                .then(() => {
                  configManager.favoritesOrderMethod =
                    values.favoritesOrderMethod;
                  this.reload().then();
                })
                .catch(() => {
                  $ui.error("收藏页排序更新失败");
                });
            }
            break;
          }
          case "archive": {
            const values = await popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: "archive",
                archiveType: tab.options.type ?? "all",
                archiveManagerOrderMethod:
                  configManager.archiveManagerOrderMethod,
                count: {
                  loaded: tab.pages
                    .map((n) => n.items.length)
                    .reduce((prev, curr) => prev + curr),
                  all: tab.pages[tab.pages.length - 1].all_count,
                },
              },
            });
            let reloadFlag = false;
            if (values.archiveType !== (tab.options.type ?? "all")) {
              reloadFlag = true;
              tab.options.type = values.archiveType;
            }
            if (
              values.archiveManagerOrderMethod !==
              configManager.archiveManagerOrderMethod
            ) {
              reloadFlag = true;
              configManager.archiveManagerOrderMethod =
                values.archiveManagerOrderMethod;
              tab.options.sort = values.archiveManagerOrderMethod;
            }
            if (reloadFlag) this.reload();
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
              const tab = statusManager.tabsMap.get(this.tabId);
              if (!tab || tab.type === "blank") {
                $ui.toast("无法翻页，请先加载内容");
                return;
              }
              const type = tab.type;
              if (type === "front_page" || type === "watched") {
                const firstPage = tab.pages[0];
                const lastPage = tab.pages[tab.pages.length - 1];
                if (
                  firstPage.items.length === 0 ||
                  lastPage.items.length === 0
                ) {
                  $ui.toast("没有内容，无法翻页");
                  return;
                }
                if (
                  firstPage.prev_page_available === false &&
                  lastPage.next_page_available === false
                ) {
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
                    ...tab.options,
                    range: result.range,
                    minimumGid: result.minimumGid,
                    maximumGid: result.maximumGid,
                    jump: result.jump,
                    seek: result.seek,
                  },
                });
              } else if (type === "favorites") {
                const firstPage = tab.pages[0];
                const lastPage = tab.pages[tab.pages.length - 1];
                if (
                  firstPage.items.length === 0 ||
                  lastPage.items.length === 0
                ) {
                  $ui.toast("没有内容，无法翻页");
                  return;
                }
                if (
                  firstPage.prev_page_available === false &&
                  lastPage.next_page_available === false
                ) {
                  $ui.toast("全部内容已加载");
                  return;
                }
                const result = await getJumpRangeDialogForFavorites({
                  minimumGid: firstPage.items[0].gid,
                  minimumFavoritedTimestamp:
                    firstPage.first_item_favorited_timestamp,
                  maximumGid: lastPage.items[lastPage.items.length - 1].gid,
                  maximumFavoritedTimestamp:
                    lastPage.last_item_favorited_timestamp,
                  prev_page_available: firstPage.prev_page_available,
                  next_page_available: lastPage.next_page_available,
                });
                await this.triggerLoad({
                  type,
                  options: {
                    ...tab.options,
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
                    ...tab.options,
                    ...result,
                  },
                });
              } else if (type === "archive") {
                if (tab.pages.length === 0) {
                  $ui.toast("存档列表为空，无法翻页");
                  return;
                }
                const allCount = tab.pages[0].all_count;
                if (allCount === 0) {
                  $ui.toast("存档列表为空，无法翻页");
                  return;
                }
                const maxPage = Math.ceil(allCount / tab.options.pageSize);
                if (tab.pages.length === maxPage) {
                  $ui.toast("全部内容已加载");
                  return;
                }
                const { page } = await getJumpPageDialog(maxPage);
                tab.options.page = page;
                this.updateLoadingStatus({
                  type: "archive",
                  options: tab.options,
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
          const tab = statusManager.tabsMap.get(this.tabId);
          if (
            tab &&
            (tab.type === "front_page" ||
              tab.type === "watched" ||
              tab.type === "favorites")
          ) {
            searchTerms = tab.options.searchTerms;
            type = tab.type;
          }
          const args = await getSearchOptions(
            { type, options: { searchTerms } },
            "showAllExceptArchive"
          );
          await this.triggerLoad(args);
        },
      },
    });
    const list = new EHlistView({
      layoutMode: this.layoutMode,
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
      didReachBottom: async () => {
        await this.loadMore();
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

  async triggerLoad(options: StatusTabOptions) {
    this.updateLoadingStatus(options);
    const tab = await statusManager.loadTab(options, this.tabId);
    if (!tab) return;
    const dm = downloaderManager.getTabDownloader(
      this.tabId
    ) as TabThumbnailDownloader;
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
      downloaderManager.startTabDownloader(this.tabId);
    }
    this.updateLoadedStatus();
  }

  updateLoadingStatus(options: StatusTabOptions) {
    // 1. 列表归零
    // 2. 搜索栏更新
    // 3. 标题更新
    this.cviews.list.footerText = "加载中……";
    this.cviews.list.items = [];
    if (
      (options.type === "front_page" ||
        options.type === "watched" ||
        options.type === "favorites" ||
        options.type === "archive") &&
      options.options.searchTerms &&
      options.options.searchTerms.length
    ) {
      const fsearch = buildSortedFsearch(options.options.searchTerms);
      configManager.addOrUpdateSearchHistory(
        fsearch,
        options.options.searchTerms
      );
      configManager.updateTagAccessCount(options.options.searchTerms);
      this.cviews.searchBar.searchTerms = options.options.searchTerms;
    } else {
      this.cviews.searchBar.searchTerms = [];
    }
  }

  async loadMore() {
    const tab = statusManager.tabsMap.get(this.tabId);
    if (!tab) return;
    if (tab.type === "blank" || tab.pages.length === 0) return;
    // popular and upload tab can not load more
    if (tab.type === "popular" || tab.type === "upload") return;
    if (
      tab.type === "front_page" ||
      tab.type === "watched" ||
      tab.type === "favorites"
    ) {
      const lastPage = tab.pages[tab.pages.length - 1];
      if (!lastPage.next_page_available) return;
    } else if (tab.type === "toplist") {
      const lastPage = tab.pages[tab.pages.length - 1];
      if (lastPage.current_page === lastPage.total_pages - 1) return;
    }
    this.cviews.list.footerText = "正在加载更多……";
    try {
      const tab = await statusManager.loadMoreTab(this.tabId);
      if (!tab) return;
      const dm = downloaderManager.getTabDownloader(
        this.tabId
      ) as TabThumbnailDownloader;
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
      downloaderManager.startTabDownloader(this.tabId);

      this.updateLoadedStatus();
    } catch (e) {
      appLog(e, "error");
    }
  }

  async reload() {
    this.cviews.list.footerText = "正在重新加载……";
    try {
      const tab = await statusManager.reloadTab(this.tabId);
      const dm = downloaderManager.getTabDownloader(
        this.tabId
      ) as TabThumbnailDownloader;
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
        downloaderManager.startTabDownloader(this.tabId);
      }
      this.updateLoadedStatus();
    } catch (e) {
      appLog(e, "error");
    }
  }

  updateLoadedStatus() {
    const tab = statusManager.tabsMap.get(this.tabId);
    if (!tab) return;
    switch (tab.type) {
      case "front_page": {
        const items = tab.pages
          .map((page) => page.items)
          .flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage.next_page_available) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        this.cviews.titleView.title = "搜索";
        break;
      }
      case "watched": {
        const items = tab.pages
          .map((page) => page.items)
          .flat() as EHListExtendedItem[];
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
      case "favorites": {
        const items = tab.pages
          .map((page) => page.items)
          .flat() as EHListExtendedItem[];
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
      case "archive": {
        const items = tab.pages.map((page) => page.items).flat();
        this.cviews.list.items = items;
        this.cviews.list.footerText = "没有更多了";
        this.cviews.titleView.title = "归档";
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
    (router.get("sidebarTabController") as SidebarTabController).refresh();
  }
}
