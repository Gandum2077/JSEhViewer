import { BaseController, CustomNavigationBar, SymbolButton, router } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import { getJumpRangeDialogForHomepage, getJumpPageDialog, getJumpRangeDialogForFavorites } from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { statusManager } from "../utils/status";
import { EHlistView } from "../components/ehlist-view";
import { appLog } from "../utils/tools";
import { buildSortedFsearch, EHListExtendedItem, EHSearchTerm } from "ehentai-parser";
import { StatusTabOptions } from "../types";
import { downloaderManager, TabThumbnailDownloader } from "../utils/api";
import { CustomSearchBar } from "../components/custom-searchbar";
import { getSearchOptions } from "./search-controller";
import { SidebarTabController } from "./sidebar-tab-controller";
import { globalTimer } from "../utils/timer";

export class PushedSearchResultController extends BaseController {
  readonly tabId: string;
  layoutMode: "normal" | "large";
  cviews: { navbar: CustomNavigationBar, list: EHlistView, searchBar: CustomSearchBar };
  constructor() {
    super({
      props: {
        bgcolor: $color("backgroundColor")
      },
      events: {
        didLoad: () => {
          globalTimer.addTask({
            id: this.tabId,
            paused: true,
            handler: () => {
              this.cviews.list.reload()
            }
          })
        },
        didAppear: () => {
          downloaderManager.startTabDownloader(this.tabId);
          globalTimer.resumeTask(this.tabId)
        },
        didDisappear: () => {
          globalTimer.pauseTask(this.tabId)
        },
        didRemove: () => {
          if (!statusManager.tabIdsShownInManager.includes(this.tabId)) {
            downloaderManager.removeTabDownloader(this.tabId);
            statusManager.removeTab(this.tabId);
            globalTimer.removeTask(this.tabId);
          }
        }
      }
    })
    const tabId = statusManager.addBlankTab({ showInManager: false });
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
              }
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
              }
            }
          ]
        }
      },
      layout: $layout.fill
    })
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
          (router.get("sidebarTabController") as SidebarTabController).refresh()
        }
      }
    })
    const navbar = new CustomNavigationBar({
      props: {
        title: "搜索",
        leftBarButtonItems: [
          {
            symbol: "chevron.left",
            handler: () => {
              $ui.pop();
            }
          },
          {
            cview: listLayoutButton
          }
        ],
        rightBarButtonItems: [
          {
            cview: showInManagerButton
          },
          {
            symbol: "arrow.left.arrow.right.circle",
            handler: async () => {
              const tab = statusManager.tabsMap.get(this.tabId);
              if (!tab || tab.type === "blank") {
                $ui.toast("无法翻页，请先加载内容")
                return;
              }
              const type = tab.type;
              if (type === "front_page" || type === "watched") {
                const firstPage = tab.pages[0];
                const lastPage = tab.pages[tab.pages.length - 1];
                if (firstPage.items.length === 0 || lastPage.items.length === 0) {
                  $ui.toast("没有内容，无法翻页")
                  return;
                }
                if (firstPage.prev_page_available === false && lastPage.next_page_available === false) {
                  $ui.toast("全部内容已加载")
                  return;
                }
                const result = await getJumpRangeDialogForHomepage({
                  minimumGid: firstPage.items[0].gid,
                  maximumGid: lastPage.items[lastPage.items.length - 1].gid,
                  prev_page_available: firstPage.prev_page_available,
                  next_page_available: lastPage.next_page_available
                })
                await this.triggerLoad({
                  type,
                  options: {
                    ...tab.options,
                    range: result.range,
                    minimumGid: result.minimumGid,
                    maximumGid: result.maximumGid,
                    jump: result.jump,
                    seek: result.seek
                  }
                })
              } else if (type === "favorites") {
                const firstPage = tab.pages[0];
                const lastPage = tab.pages[tab.pages.length - 1];
                if (firstPage.items.length === 0 || lastPage.items.length === 0) {
                  $ui.toast("没有内容，无法翻页")
                  return;
                }
                if (firstPage.prev_page_available === false && lastPage.next_page_available === false) {
                  $ui.toast("全部内容已加载")
                  return;
                }
                const result = await getJumpRangeDialogForFavorites({
                  minimumGid: firstPage.items[0].gid,
                  minimumFavoritedTimestamp: firstPage.first_item_favorited_timestamp,
                  maximumGid: lastPage.items[lastPage.items.length - 1].gid,
                  maximumFavoritedTimestamp: lastPage.last_item_favorited_timestamp,
                  prev_page_available: firstPage.prev_page_available,
                  next_page_available: lastPage.next_page_available
                })
                await this.triggerLoad({
                  type,
                  options: {
                    ...tab.options,
                    minimumGid: result.minimumGid,
                    minimumFavoritedTimestamp: result.minimumFavoritedTimestamp,
                    maximumGid: result.maximumGid,
                    maximumFavoritedTimestamp: result.maximumFavoritedTimestamp,
                    jump: result.jump,
                    seek: result.seek
                  }
                })
              } else if (type === "toplist") {
                const result = await getJumpPageDialog(200)
                await this.triggerLoad({
                  type,
                  options: {
                    ...tab.options,
                    ...result
                  }
                })
              } else if (type === "archive") {
                if (tab.pages.length === 0) {
                  $ui.toast("存档列表为空，无法翻页")
                  return;
                }
                const allCount = tab.pages[0].all_count
                if (allCount === 0) {
                  $ui.toast("存档列表为空，无法翻页")
                  return;
                }
                const maxPage = Math.ceil(allCount / tab.options.pageSize)
                if (tab.pages.length === maxPage) {
                  $ui.toast("全部内容已加载")
                  return;
                }
                const { page } = await getJumpPageDialog(maxPage)
                tab.options.page = page
                this.updateLoadingStatus({
                  type: "archive",
                  options: tab.options
                })
              } else {
                $ui.toast("全部内容已加载")
              }
            }
          }
        ]
      }
    })
    const searchBar = new CustomSearchBar({
      props: {
      },
      events: {
        tapped: async sender => {
          let type: "front_page" | "watched" | "favorites" = "front_page";
          let searchTerms: EHSearchTerm[] | undefined = undefined;
          const tab = statusManager.tabsMap.get(this.tabId);
          if (
            tab
            && (tab.type === "front_page"
              || tab.type === "watched"
              || tab.type === "favorites")
          ) {
            searchTerms = tab.options.searchTerms;
            type = tab.type;
          }
          const args = await getSearchOptions({ type, options: { searchTerms } }, "showAllExceptArchive")
          await this.triggerLoad(args);
        }
      }
    })
    const list = new EHlistView({
      layoutMode: this.layoutMode,
      searchBar,
      pulled: async () => {
        await this.reload()
      },
      didSelect: async (sender, indexPath, item) => {
        const galleryController = new GalleryController(item.gid, item.token)
        galleryController.uipush({
          navBarHidden: true,
          statusBarStyle: 0
        })
      },
      didReachBottom: async () => {
        await this.loadMore()
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom)
        make.left.right.inset(0)
        make.bottom.equalTo(view.super.bottom)
      }
    })
    this.cviews = { navbar, list, searchBar }
    this.rootView.views = [navbar, list]
  }

  async triggerLoad(options: StatusTabOptions) {
    this.updateLoadingStatus(options);
    const tab = await statusManager.loadTab(options, this.tabId);
    if (!tab) return;
    const dm = downloaderManager.getTabDownloader(this.tabId) as TabThumbnailDownloader;
    dm.clear();
    if (tab.type !== "upload") {
      dm.add(
        tab.pages.map(page => page.items).flat().map(item => ({
          gid: item.gid,
          url: item.thumbnail_url
        }))
      )
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
      (options.type === "front_page" || options.type === "watched" || options.type === "favorites" || options.type === "archive")
      && options.options.searchTerms
      && options.options.searchTerms.length
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
    const tab = statusManager.tabsMap.get(this.tabId);
    if (!tab) return;
    if (tab.type === "blank" || tab.pages.length === 0) return;
    // popular and upload tab can not load more
    if (tab.type === "popular" || tab.type === "upload") return;
    if (
      tab.type === "front_page"
      || tab.type === "watched"
      || tab.type === "favorites"
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
      const dm = downloaderManager.getTabDownloader(this.tabId) as TabThumbnailDownloader;
      dm.clear();
      dm.add(
        tab.pages.map(page => page.items).flat().map(item => ({
          gid: item.gid,
          url: item.thumbnail_url
        }))
      )
      downloaderManager.startTabDownloader(this.tabId);

      this.updateLoadedStatus();
    } catch (e) {
      appLog(e, "error")
    }
  }

  async reload() {
    this.cviews.list.footerText = "正在重新加载……";
    try {
      const tab = await statusManager.reloadTab(this.tabId);
      const dm = downloaderManager.getTabDownloader(this.tabId) as TabThumbnailDownloader;
      dm.clear();
      if (tab.type !== "upload") {
        dm.add(
          tab.pages.map(page => page.items).flat().map(item => ({
            gid: item.gid,
            url: item.thumbnail_url
          }))
        )
        downloaderManager.startTabDownloader(this.tabId);
      }
      this.updateLoadedStatus();
    } catch (e) {
      appLog(e, "error")
    }
  }

  updateLoadedStatus() {
    const tab = statusManager.tabsMap.get(this.tabId);
    if (!tab) return;
    switch (tab.type) {
      case "front_page": {
        const items = tab.pages.map(page => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage.next_page_available) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        this.cviews.navbar.title = "搜索";
        break;
      }
      case "watched": {
        const items = tab.pages.map(page => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage.next_page_available) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        this.cviews.navbar.title = "订阅";
        break;
      }
      case "popular": {
        const items = tab.pages.map(page => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        this.cviews.list.footerText = "没有更多了";
        this.cviews.navbar.title = "热门";
        break;
      }
      case "favorites": {
        const items = tab.pages.map(page => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (!lastPage.next_page_available) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        this.cviews.navbar.title = "收藏";
        break;
      }
      case "toplist": {
        const items = tab.pages.map(page => page.items).flat();
        this.cviews.list.items = items;
        const lastPage = tab.pages[tab.pages.length - 1];
        if (lastPage.current_page === lastPage.total_pages - 1) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";
        }
        const timeRange = tab.options.timeRange;
        this.cviews.navbar.title = {
          "yesterday": "日排行",
          "past_month": "月排行",
          "past_year": "年排行",
          "all": "总排行"
        }[timeRange];
        break;
      }
      case "upload": {
        const items = tab.pages.map(page => page.items).flat();
        this.cviews.list.items = items;
        this.cviews.list.footerText = "没有更多了";
        this.cviews.navbar.title = "我的上传";
        break;
      }
      case "archive": {
        const items = tab.pages.map(page => page.items).flat();
        this.cviews.list.items = items;
        this.cviews.list.footerText = "没有更多了";
        this.cviews.navbar.title = "归档";
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
    (router.get("sidebarTabController") as SidebarTabController).refresh()
  }
}
