import { BaseController, CustomNavigationBar, DynamicPreferenceListView, PreferenceSection, router } from "jsbox-cview";
import { configManager } from "../utils/config";
import { appLog, toLocalTimeString } from "../utils/tools";
import { ArchiveController } from "./archive-controller";
import { statusManager } from "../utils/status";
import { api } from "../utils/api";
import { HomepageController } from "./homepage-controller";
import { assembleSearchTerms, EHSearchTerm, parseFsearch } from "ehentai-parser";
import { ArchiveTab } from "../types";

export class GeneralSettingsController extends BaseController {
  private _isUpdatingTranslationData = false;
  private _funds?: { credits: number; gp: number };
  private _imageLimit?:
    | {
        unlocked: true;
        used: number;
        total: number;
        restCost: number;
      }
    | {
        unlocked: false;
      };
  private _fetchImageLimitAndFundsFailed: boolean = false;
  cviews: {
    list: DynamicPreferenceListView;
  };
  constructor() {
    super({
      events: {
        didLoad: () => {
          this.updateImageLimitAndFunds()
            .then(() => {
              this.cviews.list.sections = this.getCurrentSections();
            })
            .catch((e: any) => {
              this._fetchImageLimitAndFundsFailed = true;
              this.cviews.list.sections = this.getCurrentSections();
            });
        },
      },
    });
    const navbar = new CustomNavigationBar({
      props: {
        title: "通用",
        popButtonEnabled: true,
      },
    });
    const list = new DynamicPreferenceListView({
      sections: this.getCurrentSections(),
      props: {
        style: 2,
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.equalTo(view.super);
      },
      events: {
        changed: (values: {
          startPageType: 0 | 1 | 2 | 3;
          specificPageTypeOnStart?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
          specificSearchtermsOnStart?: "";
          favoritesOrderMethod: 0 | 1;
          archiveManagerOrderMethod: 0 | 1 | 2;
          alwaysShowWebDAVWidget: boolean;
          defaultFavcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
          autoCacheWhenReading: boolean;
          pageTurnMethod: 0 | 1 | 2;
          autoClearCache: boolean;
        }) => {
          // 先把values中的值转换为configManager中的值的格式
          const startPageType =
            values.startPageType === 0
              ? "blank_page"
              : values.startPageType === 1
              ? "last_access"
              : values.startPageType === 2
              ? "specific_page"
              : "specific_searchterms";

          const pageTypes: (
            | "front_page"
            | "watched"
            | "popular"
            | "favorites"
            | "toplist-yesterday"
            | "toplist-past_month"
            | "toplist-past_year"
            | "toplist-all"
            | "upload"
          )[] = [
            "front_page",
            "watched",
            "popular",
            "favorites",
            "toplist-yesterday",
            "toplist-past_month",
            "toplist-past_year",
            "toplist-all",
            "upload",
          ];
          const specificPageTypeOnStart =
            values.specificPageTypeOnStart === undefined
              ? configManager.specificPageTypeOnStart
              : pageTypes[values.specificPageTypeOnStart];
          const specificSearchtermsOnStart =
            values.specificSearchtermsOnStart ?? configManager.specificSearchtermsOnStart;
          const favoritesOrderMethod = values.favoritesOrderMethod === 0 ? "published_time" : "favorited_time";
          const archiveManagerOrderMethod =
            values.archiveManagerOrderMethod === 0
              ? "last_access_time"
              : values.archiveManagerOrderMethod === 1
              ? "first_access_time"
              : "posted_time";
          const alwaysShowWebDAVWidget = values.alwaysShowWebDAVWidget;
          const defaultFavcat = values.defaultFavcat;
          const autoCacheWhenReading = values.autoCacheWhenReading;
          const pageTurnMethod =
            values.pageTurnMethod === 0 ? "click_and_swipe" : values.pageTurnMethod === 1 ? "click" : "swipe";
          const autoClearCache = values.autoClearCache;

          // 再比较configManager中的值和values中的值是否相同，如果不同，则更新configManager中的值
          if (startPageType !== configManager.startPageType) {
            configManager.startPageType = startPageType;
            // 立即刷新
            this.cviews.list.sections = this.getCurrentSections();
          }

          if (specificPageTypeOnStart !== configManager.specificPageTypeOnStart) {
            configManager.specificPageTypeOnStart = specificPageTypeOnStart;
          }

          if (specificSearchtermsOnStart !== configManager.specificSearchtermsOnStart) {
            let sts: EHSearchTerm[] | undefined;
            try {
              sts = this.parse(specificSearchtermsOnStart);
            } catch (e: any) {
              $ui.alert({
                title: "搜索词错误",
                message: e.message,
              });
            }
            if (sts) {
              configManager.specificSearchtermsOnStart = JSON.stringify(sts);
            }
            // 立即刷新
            this.cviews.list.sections = this.getCurrentSections();
          }

          if (favoritesOrderMethod !== configManager.favoritesOrderMethod) {
            $ui.toast("正在更新收藏页排序");
            api
              .setFavoritesSortOrder(favoritesOrderMethod)
              .then(() => {
                $ui.success("收藏页排序更新成功");
                configManager.favoritesOrderMethod = favoritesOrderMethod;
                // 如果当前页面是收藏页，则需要刷新当前页面
                const tab = statusManager.currentTab;
                if (tab.type === "favorites") {
                  (router.get("homepageController") as HomepageController).reload().then();
                }
              })
              .catch(() => {
                $ui.error("收藏页排序更新失败");
                this.cviews.list.sections = this.getCurrentSections();
              });
          }
          if (archiveManagerOrderMethod !== configManager.archiveManagerOrderMethod) {
            configManager.archiveManagerOrderMethod = archiveManagerOrderMethod;
            // 刷新存档页
            const tab = statusManager.tabsMap.get("archive") as ArchiveTab;
            tab.options.sort = archiveManagerOrderMethod;
            (router.get("archiveController") as ArchiveController).reload().then();
          }
          if (alwaysShowWebDAVWidget !== configManager.alwaysShowWebDAVWidget) {
            configManager.alwaysShowWebDAVWidget = alwaysShowWebDAVWidget;
          }
          if (defaultFavcat !== configManager.defaultFavcat) {
            configManager.defaultFavcat = defaultFavcat;
          }
          if (autoCacheWhenReading !== configManager.autoCacheWhenReading) {
            configManager.autoCacheWhenReading = autoCacheWhenReading;
          }
          if (pageTurnMethod !== configManager.pageTurnMethod) {
            configManager.pageTurnMethod = pageTurnMethod;
          }
          if (autoClearCache !== configManager.autoClearCache) {
            configManager.autoClearCache = autoClearCache;
          }
        },
      },
    });
    this.rootView.views = [navbar, list];
    this.cviews = {
      list,
    };
  }

  getCurrentSections(): PreferenceSection[] {
    const sections: PreferenceSection[] = [
      {
        title: "账号(本应用不记录您的账号密码，只存储Cookie，如需修改账号设置，请重新登录)",
        rows: [
          {
            type: "info",
            title: "登录里站",
            value: configManager.exhentai ? "已登录" : "未登录",
          },
          {
            type: "info",
            title: "同步我的标签",
            value: configManager.syncMyTags ? "已开启" : "未开启",
          },
          {
            type: "info",
            title: "多页查看器",
            value: configManager.mpvAvailable ? "可使用" : "不可用",
          },
          {
            type: "action",
            title: "重新登录",
            destructive: true,
            value: () => {
              $ui.alert({
                title: "重新登录？",
                message: "将重启应用，请确认是否继续",
                actions: [
                  {
                    title: "取消",
                  },
                  {
                    title: "确定",
                    handler: () => {
                      configManager.cookie = "";
                      $addin.restart();
                    },
                  },
                ],
              });
            },
          },
        ],
      },
      {
        title: "图片配额",
        rows: [
          {
            type: "info",
            title: "已用配额",
            value: this._fetchImageLimitAndFundsFailed
              ? "获取失败"
              : this._imageLimit
              ? `${this._imageLimit.unlocked ? this._imageLimit.used + " / " + this._imageLimit.total : "未解锁"}`
              : "正在获取…",
          },
          {
            type: "info",
            title: "Credits",
            value: this._fetchImageLimitAndFundsFailed
              ? "获取失败"
              : this._funds
              ? this._funds.credits.toLocaleString("en-US")
              : "正在获取…",
          },
          {
            type: "info",
            title: "GP",
            value: this._fetchImageLimitAndFundsFailed
              ? "获取失败"
              : this._funds
              ? this._funds.gp.toLocaleString("en-US")
              : "正在获取…",
          },
        ],
      },
      {
        title: "标签翻译(来源: EhTagTranslation)",
        rows: [
          {
            type: "action",
            title: this._isUpdatingTranslationData ? "正在更新中..." : "更新标签翻译",
            value: () => {
              if (this._isUpdatingTranslationData) {
                $ui.warning("正在更新中，请稍后再试");
                return;
              }
              $ui.alert({
                title: "更新标签翻译",
                message: "是否继续？",
                actions: [
                  {
                    title: "取消",
                  },
                  {
                    title: "确定",
                    handler: async () => {
                      this._isUpdatingTranslationData = true;
                      try {
                        this.cviews.list.sections = this.getCurrentSections();
                        await configManager.updateTranslationData();
                        $ui.success("标签翻译更新完成");
                      } catch (error) {
                        $ui.error("标签翻译更新失败");
                      } finally {
                        this._isUpdatingTranslationData = false;
                        this.cviews.list.sections = this.getCurrentSections();
                      }
                    },
                  },
                ],
              });
            },
          },
          {
            type: "info",
            title: "上次更新时间",
            value: toLocalTimeString(configManager.translationUpdateTime),
          },
        ],
      },
      {
        title: "起始页面",
        rows: [
          {
            type: "list",
            title: "起始页面",
            items: ["新标签页", "恢复上次的浏览", "指定页面", "指定搜索词"],
            key: "startPageType",
            value:
              configManager.startPageType === "blank_page"
                ? 0
                : configManager.startPageType === "last_access"
                ? 1
                : configManager.startPageType === "specific_page"
                ? 2
                : 3,
          },
        ],
      },
      {
        title: "排序",
        rows: [
          {
            type: "list",
            title: "收藏页排序",
            items: ["发布时间", "收藏时间"],
            key: "favoritesOrderMethod",
            value: configManager.favoritesOrderMethod === "published_time" ? 0 : 1,
          },
          {
            type: "list",
            title: "存档页排序",
            items: ["最近阅读时间", "首次阅读时间", "发布时间"],
            key: "archiveManagerOrderMethod",
            value:
              configManager.archiveManagerOrderMethod === "last_access_time"
                ? 0
                : configManager.archiveManagerOrderMethod === "first_access_time"
                ? 1
                : 2,
          },
        ],
      },
      {
        title: "图库与阅读",
        rows: [
          {
            type: "boolean",
            title: "始终显示WebDAV组件",
            key: "alwaysShowWebDAVWidget",
            value: configManager.alwaysShowWebDAVWidget,
          },
          {
            type: "list",
            title: "默认收藏到",
            items: configManager.favcatTitles,
            key: "defaultFavcat",
            value: configManager.defaultFavcat,
          },
          {
            type: "boolean",
            title: "阅读时自动缓存",
            key: "autoCacheWhenReading",
            value: configManager.autoCacheWhenReading,
          },
          {
            type: "list",
            title: "翻页方式",
            items: ["点击和滑动", "仅点击", "仅滑动"],
            key: "pageTurnMethod",
            value:
              configManager.pageTurnMethod === "click_and_swipe" ? 0 : configManager.pageTurnMethod === "click" ? 1 : 2,
          },
        ],
      },
      {
        title: "存储",
        rows: [
          {
            type: "boolean",
            title: "关闭应用时自动清理缓存",
            key: "autoClearCache",
            value: configManager.autoClearCache,
          },
          {
            type: "action",
            title: "清除较旧的搜索记录",
            value: () => {
              $ui.menu({
                items: ["一个月前", "三个月前", "六个月前", "一年前"],
                handler: (title, index) => {
                  configManager.clearOldSearchRecords(index);
                },
              });
            },
          },
          {
            type: "action",
            title: "清除较旧的阅读记录",
            value: () => {
              $ui.menu({
                items: ["一个月前", "三个月前", "六个月前", "一年前"],
                handler: (title, index) => {
                  configManager.clearOldReadRecords(index);
                  (router.get("archiveController") as ArchiveController).reload();
                },
              });
            },
          },
          {
            type: "action",
            title: "立即清理缓存",
            value: () => {
              $ui.alert({
                title: "清理缓存",
                message: "此操作会删除所有缓存，然后重启本应用，是否继续？",
                actions: [
                  {
                    title: "取消",
                  },
                  {
                    title: "确定",
                    handler: () => {
                      configManager.clearCache();
                      $addin.restart();
                    },
                  },
                ],
              });
            },
          },
          {
            type: "action",
            title: "删除全部缓存和下载内容",
            destructive: true,
            value: () => {
              $ui.alert({
                title: "全部删除",
                message: "此操作会删除所有的缓存和下载内容，然后重启本应用，是否继续？",
                actions: [
                  {
                    title: "取消",
                  },
                  {
                    title: "确定",
                    handler: () => {
                      configManager.clearAll();
                      $addin.restart();
                    },
                  },
                ],
              });
            },
          },
        ],
      },
    ];
    if (this._fetchImageLimitAndFundsFailed || this._funds || this._imageLimit) {
      sections[1].rows.push({
        type: "action",
        title: "刷新",
        value: async () => {
          this._fetchImageLimitAndFundsFailed = false;
          this._imageLimit = undefined;
          this._funds = undefined;
          this.cviews.list.sections = this.getCurrentSections();
          this.updateImageLimitAndFunds()
            .then(() => {
              this.cviews.list.sections = this.getCurrentSections();
            })
            .catch((e: any) => {
              this._fetchImageLimitAndFundsFailed = true;
              this.cviews.list.sections = this.getCurrentSections();
            });
        },
      });
    }
    if (!this._fetchImageLimitAndFundsFailed && this._imageLimit && !this._imageLimit.unlocked) {
      sections[1].rows.push({
        type: "action",
        title: "解锁配额(花费 20,000 GP)",
        value: () => {
          this._fetchImageLimitAndFundsFailed = false;
          this._imageLimit = undefined;
          this._funds = undefined;
          this.cviews.list.sections = this.getCurrentSections();
          this.unlockQuota()
            .then(() => {
              this.cviews.list.sections = this.getCurrentSections();
            })
            .catch((e: any) => {
              appLog(e, "error");
              this._fetchImageLimitAndFundsFailed = true;
              this.cviews.list.sections = this.getCurrentSections();
              if (e.message) $ui.error(e.message);
            });
        },
      });
    } else if (
      !this._fetchImageLimitAndFundsFailed &&
      this._imageLimit &&
      this._imageLimit.unlocked &&
      this._imageLimit.used > 0
    ) {
      sections[1].rows.push({
        type: "action",
        title: `重置配额(花费 ${this._imageLimit.restCost.toLocaleString("en-US")} GP)`,
        value: () => {
          this._fetchImageLimitAndFundsFailed = false;
          this._imageLimit = undefined;
          this._funds = undefined;
          this.cviews.list.sections = this.getCurrentSections();
          this.resetQuota()
            .then(() => {
              this.cviews.list.sections = this.getCurrentSections();
            })
            .catch((e: any) => {
              appLog(e, "error");
              this._fetchImageLimitAndFundsFailed = true;
              this.cviews.list.sections = this.getCurrentSections();
              if (e.message) $ui.error(e.message);
            });
        },
      });
    }

    if (configManager.startPageType === "specific_page") {
      const pageTypes = [
        ["front_page", "首页"],
        ["watched", "订阅"],
        ["popular", "热门"],
        ["favorites", "收藏"],
        ["toplist-yesterday", "日排行"],
        ["toplist-past_month", "月排行"],
        ["toplist-past_year", "年排行"],
        ["toplist-all", "总排行"],
        ["upload", "我的上传"],
      ];

      sections[3].rows.push({
        type: "list",
        title: "指定页面",
        key: "specificPageTypeOnStart",
        items: pageTypes.map(([, title]) => title),
        value: pageTypes.findIndex(([key]) => key === configManager.specificPageTypeOnStart),
      });
    } else if (configManager.startPageType === "specific_searchterms") {
      sections[3].rows.push({
        type: "string",
        title: "搜索词",
        key: "specificSearchtermsOnStart",
        value:
          configManager.specificSearchtermsOnStart &&
          assembleSearchTerms(JSON.parse(configManager.specificSearchtermsOnStart)),
      });
    }
    return sections;
  }

  async updateImageLimitAndFunds() {
    const [imageLimit, funds] = await Promise.all([api.getImageLimits(), api.getCreditsAndGpCount()]);
    this._imageLimit = imageLimit;
    this._funds = funds;
  }

  async unlockQuota() {
    const imageLimit = await api.UnlockQuota();
    const funds = await api.getCreditsAndGpCount();
    this._imageLimit = imageLimit;
    this._funds = funds;
  }

  async resetQuota() {
    const imageLimit = await api.ResetQuota();
    const funds = await api.getCreditsAndGpCount();
    this._imageLimit = imageLimit;
    this._funds = funds;
  }

  parse(fsearch: string) {
    const searchTerms = fsearch ? parseFsearch(fsearch) : [];
    if (searchTerms.some((st) => st.qualifier && st.tilde && st.qualifier !== "tag" && st.qualifier !== "weak")) {
      throw new Error("~符号只能用于标签，其他修饰词均不支持~符号");
    }
    return searchTerms;
  }
}
