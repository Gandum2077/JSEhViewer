import { BaseController, CustomNavigationBar, SymbolButton, router, SplitViewController } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import { jumpRangeDialog, jumpPageDialog } from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { EHlistView } from "../components/ehlist-view";
import { statusManager } from "../utils/status";
import { downloaderManager } from "../utils/api";
import { getSearchOptions } from "./search-controller";
import { CustomSearchBar } from "../components/custom-searchbar";
import { ArchiveTabOptions } from "../types";
import { buildSortedFsearch } from "ehentai-parser";

export class ArchiveController extends BaseController {
  cviews: { navbar: CustomNavigationBar, list: EHlistView, searchBar: CustomSearchBar };
  constructor() {
    super({
      props: {
        id: "archiveController",
        bgcolor: $color("backgroundColor")
      },
      events: {
        didAppear: () => {
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
              symbol: "list.bullet",
              handler: () => {
                if (configManager.archiveManagerLayoutMode === "large") return
                configManager.archiveManagerLayoutMode = "large"
                listLayoutButton.symbol = "list.bullet"
                list.layoutMode = "large"
              }
            },
            {
              title: "矩阵布局",
              symbol: "square.grid.2x2",
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
              let type = "front_page"
              if (type === "front_page" || type === "watched") {
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
    const searchBar = new CustomSearchBar({
      props: {
      },
      events: {
        tapped: async sender => {
          const args = await getSearchOptions({
            type: "archive",
            options: {
              searchTerms: statusManager.archiveTab?.options.searchTerms,
              page: 0,
              pageSize: 50,
              sort: configManager.archiveManagerOrderMethod,
              type: "all"
            }
          }, "onlyShowArchive") as ArchiveTabOptions
          this.startLoad(args)
        }
      }
    })
    const list = new EHlistView({
      layoutMode: configManager.archiveManagerLayoutMode,
      searchBar,
      pulled: () => {
        this.reload()
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
    this.cviews = { navbar, list, searchBar }
    this.rootView.views = [navbar, list]
  }

  startLoad(options: ArchiveTabOptions) {
    statusManager.loadArchiveTab(options)
    if (options.options.searchTerms && options.options.searchTerms.length) {
      const fsearch = buildSortedFsearch(options.options.searchTerms);
      configManager.addOrUpdateSearchHistory(fsearch, options.options.searchTerms);
      configManager.updateTagAccessCount(options.options.searchTerms);
      this.cviews.searchBar.searchTerms = options.options.searchTerms;
    } else {
      this.cviews.searchBar.searchTerms = [];
    }
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
    if ((tab.options.page + 1) * tab.options.pageSize >= tab.pages[0].all_count) {
      this.cviews.list.footerText = "没有更多了";
    } else {
      this.cviews.list.footerText = "上拉加载更多";

    }
    this.cviews.list.isLoading = false;
  }
}
