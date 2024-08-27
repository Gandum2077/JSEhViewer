import { BaseController, CustomNavigationBar, SearchBar, SymbolButton, router, SplitViewController } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import { jumpRangeDialog, jumpPageDialog } from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { EHlistView } from "../components/ehlist-view";
import { statusManager } from "../utils/status";
import { api, downloaderManager } from "../utils/api";

export class ArchiveController extends BaseController {
  cviews: { navbar: CustomNavigationBar, list: EHlistView };
  constructor() {
    super({
      props: {
        id: "archiveController",
        bgcolor: $color("backgroundColor")
      },
      events: {
        didAppear: () => {
          console.log("archiveController didAppear")
          downloaderManager.startArchiveTabDownloader()
        }
      }
    })
    const listLayoutButton = new SymbolButton({
      props: {
        symbol: configManager.archiveManagerLayoutMode === "normal" ? "square.grid.2x2" : "list.bullet",
        menu: {
          title: "布局方式",
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "列表布局",
              handler: () => {
                if (configManager.archiveManagerLayoutMode === "large") return
                configManager.archiveManagerLayoutMode = "large"
                listLayoutButton.symbol = "list.bullet"
                list.layoutMode = "large"
              }
            },
            {
              title: "矩阵布局",
              handler: () => {
                if (configManager.archiveManagerLayoutMode === "normal") return
                configManager.archiveManagerLayoutMode = "normal"
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
    const searchBar = new SearchBar({
      props: {
      },
      layout: (make, view) => {
        make.left.right.inset(4)
        make.height.equalTo(36)
        make.top.inset(4.5)
      }
    })
    const list = new EHlistView({
      layoutMode: configManager.archiveManagerLayoutMode,
      searchBar,
      pulled: () => {
        this.startLoad()
      },
      didSelect: async (sender, indexPath, item) => {
        const galleryController = new GalleryController(item.gid, item.token)
        galleryController.uipush({
          navBarHidden: true,
          statusBarStyle: 0
        })
      },
      didReachBottom: async () => {
        this.loadMore()
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

  startLoad() {
    statusManager.loadArchiveTab({
      type: "archive",
      options: {
        page: 0,
        page_size: 50,
        type: "all",
        sort: "posted_time"
      }
    })
  }

  loadMore() {
    statusManager.loadMoreArchiveTab()
  }

  reload() {
    statusManager.reloadArchiveTab()
  }

  endLoad() {
    const tab = statusManager.archiveTab;
    if (!tab) return;
    const items = tab.pages.map(page => page.items).flat();
    this.cviews.list.items = items;
    if ((tab.options.page + 1) * tab.options.page_size >= tab.pages[0].all_count) {
          this.cviews.list.footerText = "没有更多了";
        } else {
          this.cviews.list.footerText = "上拉加载更多";

    }
    this.cviews.list.isLoading = false;
  }
}
