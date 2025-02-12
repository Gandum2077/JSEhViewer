import { BaseController, CustomNavigationBar, DynamicPreferenceListView, PreferenceSection, router } from "jsbox-cview";
import { configManager } from "../utils/config";
import { toLocalTimeString } from "../utils/tools";
import { ArchiveController } from "./archive-controller";
import { statusManager } from "../utils/status";
import { api } from "../utils/api";
import { HomepageController } from "./homepage-controller";

export class GeneralSettingsController extends BaseController {
  private _isUpdatingTranslationData = false;
  cviews: {
    list: DynamicPreferenceListView
  }
  constructor() {
    super();
    const navbar = new CustomNavigationBar({
      props: {
        title: "通用",
        popButtonEnabled: true,
      },
    });
    const list = new DynamicPreferenceListView({
      sections: this.getCurrentSections(),
      props: {
        style: 2
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.equalTo(view.super);
      },
      events: {
        changed: (values: {
          startPageType: 0 | 1 | 2,
          favoritesOrderMethod: 0 | 1,
          archiveManagerOrderMethod: 0 | 1 | 2,
          defaultFavcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
          autoCacheWhenReading: boolean,
          pageTurnMethod: 0 | 1 | 2,
          autoClearCache: boolean,
        }) => {
          // 先把values中的值转换为configManager中的值的格式
          const startPageType = values.startPageType === 0
            ? "blank_page"
            : values.startPageType === 1 ? "last_access" : "specific_page";
          const favoritesOrderMethod = values.favoritesOrderMethod === 0 ? "published_time" : "favorited_time";
          const archiveManagerOrderMethod = values.archiveManagerOrderMethod === 0
            ? "last_access_time"
            : values.archiveManagerOrderMethod === 1 ? "first_access_time" : "posted_time";
          const defaultFavcat = values.defaultFavcat;
          const autoCacheWhenReading = values.autoCacheWhenReading;
          const pageTurnMethod = values.pageTurnMethod === 0
            ? "click_and_swipe"
            : values.pageTurnMethod === 1 ? "click" : "swipe";
          const autoClearCache = values.autoClearCache;

          // 再比较configManager中的值和values中的值是否相同，如果不同，则更新configManager中的值
          if (startPageType !== configManager.startPageType) {
            configManager.startPageType = startPageType;
            if (startPageType !== "specific_page") {
              configManager.specificStartPageJson = "";
            }
            this.cviews.list.sections = this.getCurrentSections();
          }
          if (favoritesOrderMethod !== configManager.favoritesOrderMethod) {
            $ui.toast("正在更新收藏页排序");
            api.setFavoritesSortOrder(favoritesOrderMethod)
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
        }
      }
    })
    this.rootView.views = [navbar, list];
    this.cviews = {
      list
    }
  }

  getCurrentSections(): PreferenceSection[] {
    const sections: PreferenceSection[] = [
      {
        title: "账号(本应用不记录您的账号密码，只存储Cookie，如需修改账号设置，请重新登录)",
        rows: [
          {
            type: "info",
            title: "登录里站",
            value: configManager.exhentai ? "已登录" : "未登录"
          },
          {
            type: "info",
            title: "同步我的标签",
            value: configManager.syncMyTags ? "已开启" : "未开启"
          },
          {
            type: "info",
            title: "多页查看器",
            value: configManager.mpvAvailable ? "可使用" : "不可用"
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
                    title: "取消"
                  },
                  {
                    title: "确定",
                    handler: () => {
                      configManager.cookie = "";
                      $addin.restart();
                    }
                  }
                ]
              })
            }
          }
        ]
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
                message: "此操作需要数十秒时间，并且更新数据库时会造成短暂的卡顿，是否继续？",
                actions: [
                  {
                    title: "取消"
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
                    }
                  }
                ]
              })
            }
          },
          {
            type: "info",
            title: "上次更新时间",
            value: toLocalTimeString(configManager.translationUpdateTime)
          }
        ]
      },
      {
        title: "起始页面",
        rows: [
          {
            type: "list",
            title: "起始页面",
            items: ["新标签页", "恢复上次的浏览", "特定页面"],
            key: "startPageType",
            value: configManager.startPageType === "blank_page" ? 0 : configManager.startPageType === "last_access" ? 1 : 2
          }
        ]
      },
      {
        title: "排序",
        rows: [
          {
            type: "list",
            title: "收藏页排序",
            items: ["发布时间", "收藏时间"],
            key: "favoritesOrderMethod",
            value: configManager.favoritesOrderMethod === "published_time" ? 0 : 1
          },
          {
            type: "list",
            title: "存档页排序",
            items: ["最近阅读时间", "首次阅读时间", "发布时间"],
            key: "archiveManagerOrderMethod",
            value: configManager.archiveManagerOrderMethod === "last_access_time"
              ? 0
              : configManager.archiveManagerOrderMethod === "first_access_time" ? 1 : 2
          }
        ]
      },
      {
        title: "阅读",
        rows: [
          {
            type: "list",
            title: "默认收藏到",
            items: configManager.favcatTitles,
            key: "defaultFavcat",
            value: configManager.defaultFavcat
          },
          {
            type: "boolean",
            title: "阅读时自动缓存整个图库",
            key: "autoCacheWhenReading",
            value: configManager.autoCacheWhenReading
          },
          {
            type: "list",
            title: "翻页方式",
            items: ["点击和滑动", "仅点击", "仅滑动"],
            key: "pageTurnMethod",
            value: configManager.pageTurnMethod === "click_and_swipe" ? 0 : configManager.pageTurnMethod === "click" ? 1 : 2
          }
        ]
      },
      {
        title: "存储",
        rows: [
          {
            type: "boolean",
            title: "关闭应用时自动清理缓存",
            key: "autoClearCache",
            value: configManager.autoClearCache
          },
          {
            type: "action",
            title: "清除较旧的搜索记录",
            value: () => {
              $ui.menu({
                items: ["一个月前", "三个月前", "六个月前", "一年前"],
                handler: (title, index) => {
                  configManager.clearOldSearchRecords(index);
                }
              })
            }
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
                }
              })
            }
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
                    title: "取消"
                  },
                  {
                    title: "确定",
                    handler: () => {
                      configManager.clearCache();
                      $addin.restart();
                    }
                  }
                ]
              })
            }
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
                    title: "取消"
                  },
                  {
                    title: "确定",
                    handler: () => {
                      configManager.clearAll();
                      $addin.restart();
                    }
                  }
                ]
              })
            }
          }
        ]
      }
    ]
    if (configManager.startPageType === "specific_page") {
      sections[2].rows.push({
        type: "action",
        title: "将浏览中的页面记录为起始页面",
        value: () => {
          const tab = statusManager.currentTab;
          if (tab.type === "blank") {
            $ui.warning("当前页面为空白页，无法记录");
            return;
          }
          if (tab.type === "archive") {
            throw new Error("archive tab is not supported");
          }
          configManager.specificStartPageJson = JSON.stringify({
            type: tab.type,
            options: "options" in tab ? tab.options : undefined,
          });
          $ui.success("已记录当前页面为起始页面");
          this.cviews.list.sections = this.getCurrentSections();
        }
      })
      if (configManager.specificStartPageJson) {
        const json = JSON.parse(configManager.specificStartPageJson);
        sections[2].rows.push({
          type: "interactive-info",
          title: "特定页面URL",
          value: api.buildUrl(json)
        })
      }
    }
    return sections;
  }
}
