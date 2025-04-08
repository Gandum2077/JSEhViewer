import { BaseController, CustomNavigationBar, SymbolButton, router, SplitViewController } from "jsbox-cview";
import { GalleryController } from "./gallery-controller";
import {
  getJumpRangeDialogForHomepage,
  getJumpPageDialog,
  getJumpRangeDialogForFavorites,
} from "../components/seekpage-dialog";
import { configManager } from "../utils/config";
import { clearExtraPropsForReload, statusManager, VirtualTab } from "../utils/status";
import { EHlistView } from "../components/ehlist-view";
import { EHlistUploadView } from "../components/ehlist-upload-view";
import { buildSortedFsearch, EHListExtendedItem, EHSearchTerm, extractGidToken } from "ehentai-parser";
import { StatusTabOptions } from "../types";
import { api, downloaderManager } from "../utils/api";
import { CustomSearchBar } from "../components/custom-searchbar";
import { getSearchOptions } from "./search-controller";
import { SidebarTabController } from "./sidebar-tab-controller";
import { globalTimer } from "../utils/timer";
import { EhlistTitleView } from "../components/ehlist-titleview";
import { popoverForTitleView } from "../components/titleview-popover";
import { ArchiveController } from "./archive-controller";

export class HomepageController extends BaseController {
  private _thumbnailAllLoaded: boolean = false; // 此标志用于在TabDownloader完成后，再进行一次刷新
  cviews: {
    navbar: CustomNavigationBar;
    list: EHlistView;
    uploadList: EHlistUploadView;
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
          downloaderManager.startIfIdle({ prioritized: [{ type: "tab", id: statusManager.currentTabId }] });
          globalTimer.resumeTask("homepageController");
        },
        didDisappear: () => {
          globalTimer.pauseTask("homepageController");
        },
      },
    });
    const listLayoutButton = new SymbolButton({
      props: {
        symbol:
          configManager.homepageManagerLayoutMode === "large"
            ? "list.bullet"
            : configManager.homepageManagerLayoutMode === "normal"
            ? "square.grid.2x2.fill"
            : "square.grid.3x3.fill",
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
              symbol: "square.grid.2x2.fill",
              handler: () => {
                if (configManager.homepageManagerLayoutMode === "normal") return;
                configManager.homepageManagerLayoutMode = "normal";
                listLayoutButton.symbol = "square.grid.2x2.fill";
                list.layoutMode = "normal";
              },
            },
            {
              title: "紧凑布局",
              symbol: "square.grid.3x3.fill",
              handler: () => {
                if (configManager.homepageManagerLayoutMode === "minimal") return;
                configManager.homepageManagerLayoutMode = "minimal";
                listLayoutButton.symbol = "square.grid.3x3.fill";
                list.layoutMode = "minimal";
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
                  all: tab.data.pages.at(0)?.total_item_count ?? 0,
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
          case "popular": {
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
          case "toplist": {
            popoverForTitleView({
              sourceView: sender,
              sourceRect: sender.bounds,
              popoverOptions: {
                type: tab.data.type,
                count: {
                  loaded: tab.data.pages.map((n) => n.items.length).reduce((prev, curr) => prev + curr, 0),
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
                type: tab.data.type,
                count: {
                  loaded:
                    tab.data.pages
                      .at(0)
                      ?.folders.map((n) => n.items.length)
                      .reduce((prev, curr) => prev + curr, 0) ?? 0,
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
              const tab = statusManager.currentTab;
              if (tab.data.type === "archive") throw new Error("invalid tab type");
              if (tab.data.type === "blank" || tab.data.type === "upload" || tab.data.type === "popular") {
                $ui.toast("目前无法翻页");
                return;
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
              } else if (type === "toplist") {
                const result = await getJumpPageDialog(200);
                this.triggerLoad({
                  type,
                  options: {
                    ...tab.data.options,
                    ...result,
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
          const tab = statusManager.currentTab;
          let type: "front_page" | "watched" | "favorites" = "front_page";
          let searchTerms: EHSearchTerm[] | undefined = undefined;
          if (tab.data.type === "front_page" || tab.data.type === "watched" || tab.data.type === "favorites") {
            searchTerms = tab.data.options.searchTerms;
            type = tab.data.type;
          }
          const args = await getSearchOptions({ type, options: { searchTerms } }, "showAllExceptArchive");
          this.triggerLoad(args);
        },
      },
    });
    const list = new EHlistView({
      layoutMode: configManager.homepageManagerLayoutMode,
      searchBar,
      readlaterHandler: (item) => {
        const dbitem = statusManager.getArchiveItem(item.gid);
        if (dbitem && dbitem.readlater) {
          $ui.toast("稍后阅读中已有该图库");
          return;
        }
        statusManager.updateArchiveItem(item.gid, {
          infos: dbitem ? undefined : item,
          readlater: true,
        });
        $ui.success("已添加到稍后阅读");
        (router.get("archiveController") as ArchiveController).silentRefresh();
      },
      pulled: async () => {
        const tab = statusManager.currentTab;
        if (tab.data.type !== "blank" && tab.data.type !== "upload") {
          await this.triggerLoadAsync(clearExtraPropsForReload(tab.data), true);
        }
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
        const tab = statusManager.currentTab;
        if (tab.data.type !== "blank" && tab.data.type !== "upload") {
          tab.scrollState = scrollState;
        }
      },
      layout: (make, view) => {
        make.centerX.equalTo(view.super);
        make.width.equalTo($ui.controller.view.safeArea);
        make.top.equalTo(view.prev.prev.bottom);
        make.bottom.equalTo(view.super.safeAreaBottom).offset(-50);
      },
    });
    const searchBarForUploadList = new CustomSearchBar({
      props: {},
      events: {
        tapped: async (sender) => {
          const tab = statusManager.currentTab;
          let type: "front_page" | "watched" | "favorites" = "front_page";
          let searchTerms: EHSearchTerm[] | undefined = undefined;
          if (tab.data.type === "front_page" || tab.data.type === "watched" || tab.data.type === "favorites") {
            searchTerms = tab.data.options.searchTerms;
            type = tab.data.type;
          }
          const args = await getSearchOptions({ type, options: { searchTerms } }, "showAllExceptArchive");
          this.triggerLoad(args);
        },
      },
    });
    const uploadList = new EHlistUploadView({
      searchBar: searchBarForUploadList,
      pulled: async () => {
        const tab = statusManager.currentTab;
        if (tab.data.type === "upload") {
          await this.triggerLoadAsync(clearExtraPropsForReload(tab.data), true);
        }
      },
      didSelect: (sender, indexPath, item) => {
        const galleryController = new GalleryController(item.gid, item.token);
        galleryController.uipush({
          navBarHidden: true,
          statusBarStyle: 0,
        });
      },
      didReachBottom: () => {
        return;
      },
      contentOffsetChanged: (scrollState) => {
        const tab = statusManager.currentTab;
        if (tab.data.type === "upload") {
          tab.scrollState = scrollState;
        }
      },
      layout: (make, view) => {
        make.centerX.equalTo(view.super);
        make.width.equalTo($ui.controller.view.safeArea);
        make.top.equalTo(view.prev.bottom);
        make.bottom.equalTo(view.super.safeAreaBottom).offset(-50);
      },
    });
    this.cviews = { navbar, list, uploadList, searchBar, titleView };
    this.rootView.views = [navbar, uploadList, list];
  }

  triggerLoad(tabOptions: StatusTabOptions, reload?: boolean) {
    const tab = statusManager.currentTab;
    if (tab.data.type === "archive") throw new Error("invalid tab type");
    tab.loadTab({
      tabOptions,
      loadedHandler: (vtab, success) => {
        this._loadedHandler(vtab, success, !reload);
      },
    });
    this.updateStatus(reload);
  }

  triggerLoadMore() {
    const tab = statusManager.currentTab;
    if (tab.data.type === "archive") throw new Error("invalid tab type");
    if (!tab.isNextPageAvailable) return;
    tab.loadMoreTab({
      loadedHandler: (vtab, success) => {
        this._loadedHandler(vtab, success, false);
      },
    });
    this.updateStatus(true);
  }

  async triggerLoadAsync(tabOptions: StatusTabOptions, reload?: boolean) {
    const tab = statusManager.currentTab;
    if (tab.data.type === "archive") throw new Error("invalid tab type");
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
    if (vtab.data.type === "archive") throw new Error("invalid tab type");

    // 更新搜索历史和标签访问次数
    if (
      updateSearchTermsCount &&
      (vtab.data.type === "front_page" || vtab.data.type === "watched" || vtab.data.type === "favorites")
    ) {
      const searchTerms = vtab.data.options.searchTerms;
      if (searchTerms && searchTerms.length) {
        const fsearch = buildSortedFsearch(searchTerms);
        configManager.addOrUpdateSearchHistory(fsearch, searchTerms);
        configManager.updateTagAccessCount(searchTerms);
      }
    }

    // 更新页面状态
    if (vtab.id === statusManager.currentTabId) {
      this.updateStatus();
    }

    // 下载器更新
    if (success && vtab.data.type !== "upload" && vtab.data.type !== "blank") {
      const d = downloaderManager.getTabDownloader(vtab.id);
      if (!d) return;
      d.clear();
      d.add(
        vtab.data.pages
          .map((page) => page.items)
          .flat()
          .map((item) => ({
            gid: item.gid,
            url: item.thumbnail_url,
          }))
      );
      // 只有id一致时才开始下载
      if (vtab.id === statusManager.currentTabId) {
        downloaderManager.startTabDownloader(vtab.id);
      }
    }
  }

  /**
   * 根据virtualTab更新状态，可以在任何时候调用
   * @param reloading 代表是否处于刷新中，如果是，不要刷新列表，节约UI资源
   */
  updateStatus(reloading: boolean = false) {
    // 五个内容需要更新状态：列表、搜索栏、标题、底部、两个列表的隐藏状态

    const tab = statusManager.currentTab;
    if (tab.data.type === "archive") throw new Error("invalid tab type");

    // 更新列表的隐藏状态
    if (tab.data.type === "upload") {
      this.cviews.list.view.hidden = true;
      this.cviews.uploadList.view.hidden = false;
    } else {
      this.cviews.list.view.hidden = false;
      this.cviews.uploadList.view.hidden = true;
    }

    // 更新搜索栏
    const searchTerms =
      tab.data.type === "front_page" || tab.data.type === "watched" || tab.data.type === "favorites"
        ? tab.data.options.searchTerms
        : [];
    if (searchTerms && searchTerms.length) {
      this.cviews.searchBar.searchTerms = searchTerms;
    } else {
      this.cviews.searchBar.searchTerms = [];
    }

    // 更新标题
    this.cviews.titleView.title =
      tab.data.type === "blank"
        ? "空白页"
        : tab.data.type === "front_page"
        ? "首页"
        : tab.data.type === "watched"
        ? "订阅"
        : tab.data.type === "favorites" && typeof tab.data.options.favcat === "number"
        ? configManager.favcatTitles[tab.data.options.favcat]
        : tab.data.type === "favorites"
        ? "收藏"
        : tab.data.type === "popular"
        ? "热门"
        : tab.data.type === "toplist" && tab.data.options.timeRange === "yesterday"
        ? "日排行"
        : tab.data.type === "toplist" && tab.data.options.timeRange === "past_month"
        ? "月排行"
        : tab.data.type === "toplist" && tab.data.options.timeRange === "past_year"
        ? "年排行"
        : tab.data.type === "toplist" && tab.data.options.timeRange === "all"
        ? "总排行"
        : tab.data.type === "upload"
        ? "我的上传"
        : "";

    // 更新列表
    if (!reloading) {
      if (tab.data.type === "upload") {
        const folders = tab.data.pages.at(0)?.folders;
        this.cviews.uploadList.uploadFolders = folders || [];
        this.cviews.list.items = [];
      } else if (tab.data.type === "blank") {
        this.cviews.list.items = [];
        this.cviews.uploadList.uploadFolders = [];
      } else {
        this.cviews.list.items = tab.data.pages.map((page) => page.items).flat() as EHListExtendedItem[];
      }
    }

    // 更新底部
    const footerText =
      tab.data.type === "blank" || tab.status === "pending"
        ? ""
        : tab.status === "loading"
        ? "加载中……"
        : tab.status === "error"
        ? "加载出现错误"
        : tab.isNextPageAvailable
        ? "上拉加载更多"
        : "没有更多了";
    this.cviews.uploadList.footerText = footerText;
    this.cviews.list.footerText = footerText;

    // 其他
    if (tab.data.type !== "blank") {
      const storedOptions: StatusTabOptions[] = [];
      statusManager.tabIdsShownInManager.forEach((id) => {
        const tab = statusManager.tabsMap.get(id);
        if (!tab) throw new Error("标签页不存在");
        if (tab.data.type !== "blank") {
          storedOptions.push(clearExtraPropsForReload(tab.data));
        }
      });
      configManager.lastAccessPageJson = JSON.stringify(storedOptions);
      configManager.lastAccessTabIndex = statusManager.tabIdsShownInManager.findIndex(
        (n) => n === statusManager.currentTabId
      );
    }
    this._thumbnailAllLoaded = false;
    (router.get("sidebarTabController") as SidebarTabController).refresh();
  }
}
