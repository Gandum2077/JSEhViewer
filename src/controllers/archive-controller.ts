import { BaseController, CustomNavigationBar, SymbolButton, router, SplitViewController } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import { getJumpPageDialog } from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { EHlistView } from "../components/ehlist-view";
import { statusManager } from "../utils/status";
import { downloaderManager } from "../utils/api";
import { getSearchOptions } from "./search-controller";
import { CustomSearchBar } from "../components/custom-searchbar";
import { ArchiveTab, ArchiveTabOptions } from "../types";
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
          downloaderManager.startTabDownloader("archive");
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
              const tab = statusManager.tabsMap.get("archive") as ArchiveTab;
              if (!tab || tab.pages.length === 0) {
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
              searchTerms: (statusManager.tabsMap.get("archive") as ArchiveTab).options.searchTerms,
              page: 0,
              pageSize: 50,
              sort: configManager.archiveManagerOrderMethod,
              type: "all"
            }
          }, "onlyShowArchive") as ArchiveTabOptions;
          await this.triggerLoad(args);
        }
      }
    })
    const list = new EHlistView({
      layoutMode: configManager.archiveManagerLayoutMode,
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
        const tab = await statusManager.loadMoreTab("archive") as ArchiveTab;
        downloaderManager.getTabDownloader("archive")!.clear();
        downloaderManager.getTabDownloader("archive")!.add(
          tab.pages.map(page => page.items).flat().map(item => ({
            gid: item.gid,
            url: item.thumbnail_url
          }))
        )
        downloaderManager.startTabDownloader("archive");
        this.updateLoadedStatus();

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

  async triggerLoad(options: ArchiveTabOptions) {
    this.updateLoadingStatus(options);
    const tab = await statusManager.loadTab(options, "archive") as ArchiveTab;
    if (!tab) return;
    downloaderManager.getTabDownloader("archive")!.clear();
    downloaderManager.getTabDownloader("archive")!.add(
      tab.pages.map(page => page.items).flat().map(item => ({
        gid: item.gid,
        url: item.thumbnail_url
      }))
    )
    downloaderManager.startTabDownloader("archive");
    this.updateLoadedStatus();
  }

  async reload() {
    const tab = await statusManager.reloadTab("archive") as ArchiveTab;
    downloaderManager.getTabDownloader("archive")!.clear();
    downloaderManager.getTabDownloader("archive")!.add(
      tab.pages.map(page => page.items).flat().map(item => ({
        gid: item.gid,
        url: item.thumbnail_url
      }))
    )
    downloaderManager.startTabDownloader("archive");
    this.updateLoadedStatus();
  }

  updateLoadingStatus(options: ArchiveTabOptions) {
    // 1. 列表归零
    // 2. 搜索栏更新
    // 3. 标题更新 TODO
    this.cviews.list.items = [];
    if (options.options.searchTerms && options.options.searchTerms.length) {
      const fsearch = buildSortedFsearch(options.options.searchTerms);
      configManager.addOrUpdateSearchHistory(fsearch, options.options.searchTerms);
      configManager.updateTagAccessCount(options.options.searchTerms);
      this.cviews.searchBar.searchTerms = options.options.searchTerms;
    } else {
      this.cviews.searchBar.searchTerms = [];
    }
  }

  updateLoadedStatus() {
    const tab = statusManager.tabsMap.get("archive") as ArchiveTab;
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
