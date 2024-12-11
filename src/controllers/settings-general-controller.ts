import { BaseController, CustomNavigationBar, PreferenceListView } from "jsbox-cview";
import { configManager } from "../utils/config";
import { toLocalTimeString } from "../utils/tools";

export function createGeneralSettingsController() {
  const generalSettingsController = new BaseController();
  const headerView = new CustomNavigationBar({
    props: {
      title: "通用",
      popButtonEnabled: true,
    },
  });
  const list = new PreferenceListView({
    sections: [
      {
        title: "主页",
        rows: [
          {
            type: "boolean",
            title: "启动后继续上次浏览",
            value: false
          },
          {
            type: "boolean",
            title: "启动后先显示存档页",
            key: "appStartWithDownloads",
            value: false
          }
        ],
      },
      {
        title: "侧边栏",
        rows: [
          {
            type: "stepper",
            title: "标签页数量",
            min: 3,
            max: 10,
            value: 3
          },
          {
            type: "action",
            title: "清除较旧的历史记录",
            value: () => {
              $ui.menu({
                items: ["一周前", "一个月前", "六个月前", "全部", "取消"],
                handler: (title, idx) => {

                }
              })
            }
          }
        ]
      },
      {
        title: "标签翻译\n(来源: EhTagTranslation项目)",
        rows: [
          {
            type: "action",
            title: "更新标签翻译",
            value: () => {

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
        title: "排序",
        rows: [
          {
            type: "list",
            title: "收藏页排序",
            key: "favoritesOrderMethod",
            items: ["按收藏时间", "按发布时间"],
            value: configManager.favoritesOrderMethod === "favorited_time" ? 0 : 1
          },
          {
            type: "list",
            title: "存档页排序",
            key: "archiveManagerOrderMethod",
            items: ["按发布时间", "按首次阅读时间", "按最近阅读时间"],
            value: configManager.archiveManagerOrderMethod === "posted_time" ? 0 : configManager.archiveManagerOrderMethod === "first_access_time" ? 1 : 2
          }
        ]
      },
      {
        title: "阅读",
        rows: [
          {
            type: "stepper",
            title: "自动翻页间隔（秒）",
            key: "autopagerInterval",
            min: 1,
            max: 20,
            value: 5
          },
          {
            type: "list",
            title: "翻页方式",
            items: ["上下点击翻页", "左右滑动翻页"],
            value: 0
          }
        ]
      },
      {
        title: "账号",
        rows: [
          {
            type: "action",
            title: "重新登录",
            destructive: true,
            value: () => {
              $ui.alert({
                title: "重新登录",
                message: "是否确定要重新登录？",
                actions: [
                  {
                    title: "取消"
                  },
                  {
                    title: "确定",
                    handler: () => {
                      $addin.restart();
                    },
                  },
                ],
              });
            }
          },
        ],
      },
      {
        title: "缓存",
        rows: [
          {
            type: "action",
            title: "清除缩略图缓存",
            destructive: false,
            value: () => {
              $cache.clear();
              $ui.toast("已清除");
            }
          },
          {
            type: "action",
            title: "清除存档中未被收藏的图库",
            destructive: true,
            value: () => {
              $ui.toast("已清除");
            }
          },
          {
            type: "action",
            title: "清除全部存档",
            destructive: true,
            value: () => {
              $ui.toast("已清除");
            }
          },
        ]
      }
    ],
    layout: (make, view) => {
      make.top.equalTo(view.prev.bottom);
      make.left.right.bottom.equalTo(view.super.safeArea);
    },
    events: {
      changed: values => {

      }
    }
  });
  generalSettingsController.rootView.views = [headerView, list];
  return generalSettingsController;
}