import { BaseController, CustomNavigationBar, SearchBar, SymbolButton, router, SplitViewController, ContentView, Button, Base } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import { jumpRangeDialog, jumpPageDialog } from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { statusManager } from "../utils/status";
import { EHlistView } from "../components/ehlist-view";
import { appLog } from "../utils/tools";
import { SearchController } from "./search-controller";
import { EHListExtendedItem } from "ehentai-parser";
import { StatusTabOptions } from "../types";
import { downloaderManager } from "../utils/api";

export class HomepageController extends BaseController {
  cviews: { navbar: CustomNavigationBar, list: EHlistView };
  constructor() {
    super({
      props: {
        id: "homepageController",
        bgcolor: $color("backgroundColor")
      },
      events: {
        didLoad: () => {
          this.cviews.list.footerText = "请等待配置同步……";
          this.cviews.list.isLoading = true;
        },
        didAppear: () => {
          console.log("archiveController didAppear")
          downloaderManager.startTabDownloader()
        }
      }
    })
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
              handler: () => {
                if (configManager.homepageManagerLayoutMode === "large") return
                configManager.homepageManagerLayoutMode = "large"
                listLayoutButton.symbol = "list.bullet"
                list.layoutMode = "large"
              }
            },
            {
              title: "矩阵布局",
              handler: () => {
                if (configManager.homepageManagerLayoutMode === "normal") return
                configManager.homepageManagerLayoutMode = "normal"
                listLayoutButton.symbol = "square.grid.2x2"
                list.layoutMode = "normal"
              }
            }
          ]
        }
      },
      layout: $layout.fill
    })
    const navbar = new CustomNavigationBar({
      props: {
        title: "首页",
        leftBarButtonItems: [
          {
            symbol: "sidebar.left",
            handler: () => {
              (router.get("splitViewController") as SplitViewController).sideBarShown = true
            }
          },
          {
            cview: listLayoutButton
          }
        ],
        rightBarButtonItems: [
          {
            symbol: "arrow.left.arrow.right.circle",
            handler: async () => {
              let type = "homepage"
              if (type === "homepage" || type === "watched") {
                const result = await jumpRangeDialog(true)
                console.log(result)
              } else if (type === "favorite") {
                const result = await jumpRangeDialog(false)
                console.log(result)
              } else if (type === "toplist") {
                const result = await jumpPageDialog(200)
                console.log(result)
              }
            }
          }
        ]
      }
    })
    const searchBar = new Button({
      props: {
      },
      layout: (make, view) => {
        make.left.right.inset(4)
        make.height.equalTo(36)
        make.top.inset(4.5)
      },
      events: {
        tapped: sender => {
          const searchController = new SearchController()
          searchController.present()
        }
      }
    })
    const list = new EHlistView({
      layoutMode: configManager.homepageManagerLayoutMode,
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
        make.bottom.equalTo(view.super.safeAreaBottom).offset(-50)
      }
    })
    this.cviews = { navbar, list }
    this.rootView.views = [navbar, list]
  }

  startLoad(options: StatusTabOptions) {
    this.cviews.list.footerText = "加载中……";
    this.cviews.list.isLoading = true;
    statusManager.loadTab(options).then().catch(e => appLog(e, "error"))
  }

  async loadMore() {
    if (!statusManager.currentTab || statusManager.currentTab.pages.length === 0) return;
    // popular and upload tab can not load more
    if (statusManager.currentTab.type === "popular" || statusManager.currentTab.type === "upload") return;

    if (
      statusManager.currentTab.type === "front_page"
      || statusManager.currentTab.type === "watched"
      || statusManager.currentTab.type === "favorites"
    ) {
      const lastPage = statusManager.currentTab.pages[statusManager.currentTab.pages.length - 1];
      if (!lastPage.next_page_available) return;
    } else if (statusManager.currentTab.type === "toplist") {
      const lastPage = statusManager.currentTab.pages[statusManager.currentTab.pages.length - 1];
      if (lastPage.current_page === lastPage.total_pages - 1) return;
    }
    this.cviews.list.footerText = "正在加载更多……";
    this.cviews.list.isLoading = true;
    try {
      await statusManager.loadMoreTab()
    } catch (e) {
      appLog(e, "error")
    }
  }

  async reload() {
    this.cviews.list.footerText = "正在重新加载……";
    this.cviews.list.isLoading = true;
    try {
      await statusManager.reloadTab()
    } catch (e) {
      appLog(e, "error")
    }
  }

  endLoad() {
    const tab = statusManager.currentTab;
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
        break;
      }
      case "popular": {
        const items = tab.pages.map(page => page.items).flat() as EHListExtendedItem[];
        this.cviews.list.items = items;
        this.cviews.list.footerText = "没有更多了";
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
        break;
      }
      case "upload": {
        const items = tab.pages.map(page => page.items).flat();
        this.cviews.list.items = items;
        this.cviews.list.footerText = "没有更多了";
        break;
      }
      default:
        throw new Error("Invalid tab type");
    }
    this.cviews.list.isLoading = false;
  }
}
