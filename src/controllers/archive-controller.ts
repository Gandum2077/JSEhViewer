import { BaseController, CustomNavigationBar, SymbolButton, router, SplitViewController } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import { getJumpPageDialog } from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { EHlistView } from "../components/ehlist-view";
import { clearExtraPropsForReload, statusManager, VirtualTab } from "../utils/status";
import { downloaderManager } from "../utils/api";
import { getSearchOptions } from "./search-controller";
import { CustomSearchBar } from "../components/custom-searchbar";
import { ArchiveTabOptions } from "../types";
import { buildSortedFsearch } from "ehentai-parser";
import { globalTimer } from "../utils/timer";
import { EhlistTitleView } from "../components/ehlist-titleview";
import { popoverForTitleView } from "../components/titleview-popover";

export class ArchiveController extends BaseController {
  private _thumbnailAllLoaded: boolean = false; // 此标志用于在TabDownloader完成后，再进行一次刷新
  cviews: {
    navbar: CustomNavigationBar;
    list: EHlistView;
    searchBar: CustomSearchBar;
    titleView: EhlistTitleView;
  };
  constructor() {
    super({
      props: {
        id: "archiveController",
        bgcolor: $color("backgroundColor"),
      },
      events: {
        didLoad: () => {
          globalTimer.addTask({
            id: "archiveController",
            paused: true,
            handler: () => {
              const finished = downloaderManager.getTabDownloader("archive")!.isAllFinishedDespiteError;
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
          downloaderManager.startTabDownloader("archive");
          globalTimer.resumeTask("archiveController");
        },
        didDisappear: () => {
          globalTimer.pauseTask("archiveController");
        },
      },
    });
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
                if (configManager.archiveManagerLayoutMode === "large") return;
                configManager.archiveManagerLayoutMode = "large";
                listLayoutButton.symbol = "list.bullet";
                list.layoutMode = "large";
              },
            },
            {
              title: "矩阵布局",
              symbol: "square.grid.2x2",
              handler: () => {
                if (configManager.archiveManagerLayoutMode === "normal") return;
                configManager.archiveManagerLayoutMode = "normal";
                listLayoutButton.symbol = "square.grid.2x2";
                list.layoutMode = "normal";
              },
            },
          ],
        },
      },
      layout: $layout.fill,
    });
    const titleView = new EhlistTitleView({
      defaultTitle: "全部记录",
      tapped: async (sender) => {
        const tab = statusManager.tabsMap.get("archive");
        if (!tab || tab.data.type !== "archive") throw new Error("tab type not archive");
        const values = await popoverForTitleView({
          sourceView: sender,
          sourceRect: sender.bounds,
          popoverOptions: {
            type: "archive",
            archiveType: tab.data.options.type || "all",
            archiveManagerOrderMethod: configManager.archiveManagerOrderMethod,
            count: {
              loaded: tab.data.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr, 0),
              all: tab.data.pages[tab.data.pages.length - 1].all_count,
            },
          },
        });
        let reloadFlag = false;
        const newOptions = clearExtraPropsForReload(tab.data);
        if (values.archiveType !== (tab.data.options.type || "all")) {
          reloadFlag = true;
          newOptions.options.type = values.archiveType;
        }
        if (values.archiveManagerOrderMethod !== configManager.archiveManagerOrderMethod) {
          reloadFlag = true;
          configManager.archiveManagerOrderMethod = values.archiveManagerOrderMethod;
          newOptions.options.sort = values.archiveManagerOrderMethod;
        }
        if (reloadFlag) this.triggerLoad(newOptions);
      },
    });
    const navbar = new CustomNavigationBar({
      props: {
        titleView: titleView,
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
            symbol: "arrow.left.arrow.right.circle",
            handler: async () => {
              const tab = statusManager.get("archive");
              if (!tab || tab.data.type !== "archive") throw new Error("tab type not archive");
              if (tab.data.pages.length === 0) {
                $ui.toast("列表为空，无法翻页");
                return;
              }
              const allCount = tab.data.pages[tab.data.pages.length - 1].all_count;
              if (allCount === 0) {
                $ui.toast("列表为空，无法翻页");
                return;
              }
              const maxPage = Math.ceil(allCount / tab.data.options.pageSize);
              if (tab.data.pages.length === maxPage) {
                $ui.toast("全部内容已加载");
                return;
              }
              const { page } = await getJumpPageDialog(maxPage);
              const newOptions = clearExtraPropsForReload(tab.data);
              newOptions.options.page = page;
              this.triggerLoad(newOptions);
            },
          },
        ],
      },
    });
    const searchBar = new CustomSearchBar({
      props: {},
      events: {
        tapped: async (sender) => {
          const tab = statusManager.get("archive");
          if (!tab || tab.data.type !== "archive") throw new Error("tab type not archive");
          const args = (await getSearchOptions(
            {
              type: "archive",
              options: {
                searchTerms: tab.data.options.searchTerms,
                page: 0,
                pageSize: 50,
                sort: configManager.archiveManagerOrderMethod,
                type: "all",
              },
            },
            "onlyShowArchive"
          )) as ArchiveTabOptions;
          this.triggerLoad(args);
        },
      },
    });
    const list = new EHlistView({
      layoutMode: configManager.archiveManagerLayoutMode,
      searchBar,
      removeFromArchiveHandler: (item) => {
        // TODO: 后续添加刷新存档列表功能
        statusManager.deleteArchiveItem(item.gid);
      },
      pulled: () => {
        const tab = statusManager.get("archive");
        if (!tab || tab.data.type !== "archive") throw new Error("tab type not archive");
        this.triggerLoad(clearExtraPropsForReload(tab.data), true);
      },
      didSelect: (sender, indexPath, item) => {
        const galleryController = new GalleryController(item.gid, item.token);
        galleryController.uipush({
          navBarHidden: true,
          statusBarStyle: 0,
        });
      },
      didReachBottom: () => {
        this.triggerLoadMore();
      },
      contentOffsetChanged: (scrollState) => {
        downloaderManager.getTabDownloader("archive")!.currentReadingIndex = scrollState.firstVisibleItemIndex;
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

  triggerLoad(tabOptions: ArchiveTabOptions, reload?: boolean) {
    const tab = statusManager.get("archive");
    if (!tab || tab.data.type !== "archive") throw new Error("tab type not archive");
    tab.loadTab({
      tabOptions,
      loadedHandler: (vtab, success) => {
        this._loadedHandler(vtab, success, !reload);
      },
    });
  }

  triggerLoadMore() {
    const tab = statusManager.get("archive");
    if (!tab || tab.data.type !== "archive") throw new Error("tab type not archive");
    if (!tab.isNextPageAvailable) return;
    tab.loadMoreTab({
      loadedHandler: (vtab, success) => {
        this._loadedHandler(vtab, success, false);
      },
    });
  }

  private _loadedHandler(vtab: VirtualTab, success: boolean, updateSearchTermsCount: boolean) {
    if (vtab.data.type !== "archive") throw new Error("tab type not archive");
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
      downloaderManager.getTabDownloader("archive")!.clear();
      downloaderManager.getTabDownloader("archive")!.add(
        vtab.data.pages
          .map((page) => page.items)
          .flat()
          .map((item) => ({
            gid: item.gid,
            url: item.thumbnail_url,
          }))
      );
      downloaderManager.startTabDownloader("archive");
    }
  }

  /**
   * 根据virtualTab更新状态，可以在任何时候调用
   */
  updateStatus() {
    // 四个内容需要更新状态：列表、搜索栏、标题、底部
    const tab = statusManager.get("archive");
    if (!tab || tab.data.type !== "archive") throw new Error("tab type not archive");

    // 更新搜索栏
    const searchTerms = tab.data.options.searchTerms;
    if (searchTerms && searchTerms.length) {
      this.cviews.searchBar.searchTerms = searchTerms;
    } else {
      this.cviews.searchBar.searchTerms = [];
    }

    // 更新标题
    const type = tab.data.options.type ?? "all";
    this.cviews.titleView.title = type === "all" ? "全部记录" : type === "downloaded" ? "下载内容" : "稍后阅读";

    // 更新列表
    const items = tab.data.pages.map((page) => page.items).flat();
    this.cviews.list.items = items;

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
  }
}
