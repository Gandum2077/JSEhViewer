import {
  Base,
  BaseController,
  ContentView,
  CustomNavigationBar,
  gold,
  List,
  router,
  SplitViewController,
  TabBarController,
} from "jsbox-cview";
import { logoColorHex, fixedTabSymbolTitle } from "../utils/glv";
import { statusManager } from "../utils/status";
import { StatusTabOptions } from "../types";
import { HomepageController } from "./homepage-controller";
import { _mapSearchTermsToRow } from "../components/searchterm-history-list";

class HeaderStackBlur extends Base<UIButtonView, UiTypes.ButtonOptions> {
  _defineView: () => UiTypes.ButtonOptions;
  constructor(
    type: "front_page" | "watched" | "popular" | "favorites" | "upload"
  ) {
    super();
    this._defineView = () => {
      return {
        type: "button",
        props: {
          id: this.id,
          cornerRadius: 15,
          smoothCorners: true,
          bgcolor: $color("tertiarySurface"),
        },
        layout: (make, view) => {
          make.size.equalTo($size(30, 30));
        },
        events: {
          tapped: () => {
            (
              router.get("splitViewController") as SplitViewController
            ).sideBarShown = false;
            (router.get("primaryViewController") as TabBarController).index = 0;
            let options: StatusTabOptions;
            switch (type) {
              case "front_page":
                options = {
                  type: "front_page",
                  options: {},
                };
                break;
              case "watched":
                options = {
                  type: "watched",
                  options: {},
                };
                break;
              case "popular":
                options = {
                  type: "popular",
                  options: {},
                };
                break;
              case "favorites":
                options = {
                  type: "favorites",
                  options: {},
                };
                break;
              case "upload":
                options = {
                  type: "upload",
                };
                break;
              default:
                throw new Error("未知的选项");
            }
            (
              router.get("homepageController") as HomepageController
            ).triggerLoad(options);
          },
        },
        views: [
          {
            type: "image",
            props: {
              symbol: fixedTabSymbolTitle[type].symbol,
              tintColor: fixedTabSymbolTitle[type].color,
              contentMode: 1,
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.top.inset(12.5);
              make.size.equalTo($size(32.5, 32.5));
            },
          },
          {
            type: "label",
            props: {
              text: fixedTabSymbolTitle[type].title,
              font: $font("bold", 12),
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.top.equalTo(view.prev.bottom).inset(3);
            },
          },
        ],
      };
    };
  }
}

export class SidebarTabController extends BaseController {
  cviews: {
    headerView: CustomNavigationBar;
    bgview: ContentView;
    list: List;
  };
  constructor() {
    super({
      props: {
        id: "sidebarTabController",
        bgcolor: $color("backgroundColor", "secondarySurface"),
      },
      events: {
        didLoad: (sender) => {
          this.cviews.headerView.cviews.bgview.view.alpha = 0;
          this.cviews.headerView.cviews.separator.view.alpha = 0;
          this.cviews.headerView.cviews.titleViewWrapper.view.alpha = 0;
        },
      },
    });
    const headerView = new CustomNavigationBar({
      props: {
        title: "JSEhViewer",
        tintColor: $color(logoColorHex, "#DD0000"),
      },
    });

    const bgview = new ContentView({
      props: {
        bgcolor: $color("backgroundColor", "secondarySurface"),
      },
      layout: (make, view) => {
        make.left.right.top.inset(0);
        make.bottom.equalTo(view.super.safeAreaTop).inset(-50);
      },
    });
    // 首页 订阅 热门 收藏 排行 我的上传
    const headerStack = new ContentView({
      props: {
        bgcolor: $color("clear"),
      },
      layout: (make, view) => {
        make.height.equalTo(155);
        make.left.right.inset(0);
        make.top.equalTo(view.prev.bottom).inset(22);
      },
      views: [
        {
          type: "stack",
          props: {
            spacing: 7,
            axis: $stackViewAxis.horizontal,
            distribution: $stackViewDistribution.fillEqually,
            stack: {
              views: [
                new HeaderStackBlur("front_page").definition,
                new HeaderStackBlur("watched").definition,
                new HeaderStackBlur("popular").definition,
              ],
            },
          },
          layout: (make, view) => {
            make.top.inset(0);
            make.left.right.inset(0);
            make.height.equalTo(70);
          },
        },
        {
          type: "stack",
          props: {
            spacing: 7,
            axis: $stackViewAxis.horizontal,
            distribution: $stackViewDistribution.fillEqually,
            stack: {
              views: [
                new HeaderStackBlur("favorites").definition,
                {
                  type: "button",
                  props: {
                    cornerRadius: 15,
                    smoothCorners: true,
                    bgcolor: $color("tertiarySurface"),
                    menu: {
                      asPrimary: true,
                      pullDown: true,
                      items: [
                        {
                          title: "昨天",
                          handler: () => {
                            (
                              router.get(
                                "splitViewController"
                              ) as SplitViewController
                            ).sideBarShown = false;
                            (
                              router.get(
                                "primaryViewController"
                              ) as TabBarController
                            ).index = 0;
                            (
                              router.get(
                                "homepageController"
                              ) as HomepageController
                            ).triggerLoad({
                              type: "toplist",
                              options: {
                                timeRange: "yesterday",
                                page: 0,
                              },
                            });
                          },
                        },
                        {
                          title: "最近一月",
                          handler: () => {
                            (
                              router.get(
                                "splitViewController"
                              ) as SplitViewController
                            ).sideBarShown = false;
                            (
                              router.get(
                                "primaryViewController"
                              ) as TabBarController
                            ).index = 0;
                            (
                              router.get(
                                "homepageController"
                              ) as HomepageController
                            ).triggerLoad({
                              type: "toplist",
                              options: {
                                timeRange: "past_month",
                                page: 0,
                              },
                            });
                          },
                        },
                        {
                          title: "最近一年",
                          handler: () => {
                            (
                              router.get(
                                "splitViewController"
                              ) as SplitViewController
                            ).sideBarShown = false;
                            (
                              router.get(
                                "primaryViewController"
                              ) as TabBarController
                            ).index = 0;
                            (
                              router.get(
                                "homepageController"
                              ) as HomepageController
                            ).triggerLoad({
                              type: "toplist",
                              options: {
                                timeRange: "past_year",
                                page: 0,
                              },
                            });
                          },
                        },
                        {
                          title: "总排行",
                          handler: () => {
                            (
                              router.get(
                                "splitViewController"
                              ) as SplitViewController
                            ).sideBarShown = false;
                            (
                              router.get(
                                "primaryViewController"
                              ) as TabBarController
                            ).index = 0;
                            (
                              router.get(
                                "homepageController"
                              ) as HomepageController
                            ).triggerLoad({
                              type: "toplist",
                              options: {
                                timeRange: "all",
                                page: 0,
                              },
                            });
                          },
                        },
                      ],
                    },
                  },
                  layout: (make, view) => {
                    make.size.equalTo($size(30, 30));
                  },
                  views: [
                    {
                      type: "image",
                      props: {
                        symbol: "chart.bar.fill",
                        tintColor: gold,
                        contentMode: 1,
                      },
                      layout: (make, view) => {
                        make.centerX.equalTo(view.super);
                        make.top.inset(12.5);
                        make.size.equalTo($size(32.5, 32.5));
                      },
                    },
                    {
                      type: "label",
                      props: {
                        text: "排行",
                        font: $font("bold", 12),
                      },
                      layout: (make, view) => {
                        make.centerX.equalTo(view.super);
                        make.top.equalTo(view.prev.bottom).inset(3);
                      },
                    },
                  ],
                },
                new HeaderStackBlur("upload").definition,
              ],
            },
          },
          layout: (make, view) => {
            make.top.equalTo(view.prev.bottom).inset(15);
            make.left.right.inset(0);
            make.height.equalTo(70);
          },
        },
      ],
    });

    const list = new List({
      props: {
        header: {
          type: "view",
          props: {
            height: 100 + 22 + 155 + 22 + 40,
          },
          views: [
            {
              type: "label",
              props: {
                id: "header",
                text: "JSEhViewer",
                textColor: $color(logoColorHex, "#DD0000"),
                font: $font("bold", 30),
              },
              layout: (make, view) => {
                make.top.inset(50);
                make.height.equalTo(50);
                make.left.inset(0);
              },
            },
            headerStack.definition,
            {
              type: "view",
              props: {},
              layout: (make, view) => {
                make.top.equalTo(view.prev.bottom).inset(22);
                make.height.equalTo(40);
                make.left.right.inset(0);
              },
              views: [
                {
                  type: "label",
                  props: {
                    text: "标签页",
                    font: $font("bold", 16),
                  },
                  layout: (make, view) => {
                    make.left.inset(10);
                    make.centerY.equalTo(view.super);
                  },
                },
                {
                  type: "button",
                  props: {
                    tintColor: $color("systemLink"),
                    titleColor: $color("systemLink"),
                    bgcolor: $color("clear"),
                    title: "新建",
                    symbol: "plus",
                    font: $font(16),
                  },
                  layout: (make, view) => {
                    make.right.inset(10);
                    make.centerY.equalTo(view.super);
                  },
                  events: {
                    tapped: () => {
                      statusManager.addBlankTab();
                      this.refresh();
                    },
                  },
                },
              ],
            },
          ],
        },
        footer: {
          type: "view",
          props: {
            height: 50,
          },
        },
        autoRowHeight: true,
        bgcolor: $color("clear"),
        actions: [
          {
            title: "关闭",
            color: $color("red"),
            handler: (sender, indexPath) => {},
          },
        ],
        template: {
          props: {
            bgcolor: $color("tertiarySurface"),
          },
          views: [
            {
              type: "label",
              props: {
                id: "label",
                lines: 0,
                lineSpacing: 22,
              },
              layout: (make, view) => {
                make.left.inset(35);
                make.right.inset(10);
                make.top.inset(10);
                make.bottom.inset(3);
              },
            },
            {
              type: "image",
              props: {
                id: "image",
                contentMode: 1,
              },
              layout: (make, view) => {
                make.centerY.equalTo(view.super);
                make.left.inset(5);
                make.size.equalTo($size(25, 25));
              },
            },
            {
              type: "view",
              props: {
                id: "leftColumn",
              },
              layout: (make, view) => {
                make.left.top.bottom.inset(0);
                make.width.equalTo(3);
              },
            },
            {
              type: "view",
              props: {
                id: "rightColumn",
              },
              layout: (make, view) => {
                make.right.top.bottom.inset(0);
                make.width.equalTo(3);
              },
            },
          ],
        },
        data: [
          {
            image: {
              symbol: "rectangle.fill.on.rectangle.angled.fill",
              tintColor: $color("systemLink"),
            },
            label: {
              styledText: {
                text: "新标签页\n",
                font: $font(14),
                styles: [
                  {
                    range: $range(0, 4),
                    font: $font("bold", 14),
                  },
                ],
              },
            },
            leftColumn: {
              hidden: false,
              bgcolor: $color("systemLink"),
            },
            rightColumn: {
              hidden: false,
              bgcolor: $color("systemLink"),
            },
          },
        ],
      },
      layout: (make, view) => {
        make.top.bottom.equalTo(view.super.safeArea);
        make.left.right.inset(16);
      },
      events: {
        didScroll: (sender) => {
          if (sender.contentOffset.y <= 0) {
            sender.get("header").hidden = false;
            headerView.cviews.bgview.view.alpha = 0;
            headerView.cviews.separator.view.alpha = 0;
            headerView.cviews.titleViewWrapper.view.alpha = 0;
            bgview.view.hidden = false;
          } else if (sender.contentOffset.y >= 50) {
            sender.get("header").hidden = true;
            headerView.cviews.bgview.view.alpha = 1;
            headerView.cviews.separator.view.alpha = 1;
            headerView.cviews.titleViewWrapper.view.alpha = 1;
            bgview.view.hidden = true;
          } else {
            sender.get("header").hidden = false;
            headerView.cviews.bgview.view.alpha = sender.contentOffset.y / 50;
            headerView.cviews.separator.view.alpha =
              sender.contentOffset.y / 50;
            headerView.cviews.titleViewWrapper.view.alpha =
              (Math.max(0, sender.contentOffset.y - 25) / 50) * 2;
            bgview.view.hidden = false;
          }
        },
        didSelect: (sender, indexPath, data) => {
          statusManager.currentTabId =
            statusManager.tabIdsShownInManager[indexPath.row];
          this.refresh();
          (
            router.get("splitViewController") as SplitViewController
          ).sideBarShown = false;
          (router.get("primaryViewController") as TabBarController).index = 0;
          const tab = statusManager.currentTab;
          if (tab.type === "blank") {
            (
              router.get("homepageController") as HomepageController
            ).updateBlankStatus();
          } else {
            (
              router.get("homepageController") as HomepageController
            ).updateLoadingStatus(tab);
            (
              router.get("homepageController") as HomepageController
            ).updateLoadedStatus();
          }
        },
      },
    });
    this.cviews = {
      headerView,
      bgview,
      list,
    };
    this.rootView.views = [list, bgview, headerView];
  }

  refresh() {
    // 刷新标签页列表，首先从statusManager中获取标签页列表，然后更新list的data
    const data = statusManager.tabIdsShownInManager.map((id, index) => {
      const tab = statusManager.tabsMap.get(id);
      if (!tab) throw new Error("标签页不存在");
      if (tab.type === "blank") {
        return {
          image: {
            symbol: "rectangle.fill.on.rectangle.angled.fill",
            tintColor: $color("systemLink"),
          },
          label: {
            styledText: {
              text: "新标签页\n",
              font: $font(14),
              styles: [
                {
                  range: $range(0, 4),
                  font: $font("bold", 14),
                },
              ],
            },
          },
          leftColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: $color("systemLink"),
          },
          rightColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: $color("systemLink"),
          },
        };
      } else if (
        tab.type === "toplist" ||
        tab.type === "popular" ||
        tab.type === "upload" ||
        ((tab.type === "front_page" ||
          tab.type === "watched" ||
          tab.type === "favorites") &&
          (!tab.options.searchTerms || tab.options.searchTerms.length === 0))
      ) {
        let title = fixedTabSymbolTitle[tab.type].title;
        if (tab.type === "toplist") {
          title = {
            yesterday: "日排行",
            past_month: "月排行",
            past_year: "年排行",
            all: "总排行",
          }[tab.options.timeRange];
        }
        return {
          image: {
            symbol: fixedTabSymbolTitle[tab.type].symbol,
            tintColor: fixedTabSymbolTitle[tab.type].color,
          },
          label: {
            styledText: {
              text: title + "\n",
              font: $font(14),
              styles: [
                {
                  range: $range(0, title.length),
                  font: $font("bold", 14),
                },
              ],
            },
          },
          leftColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: fixedTabSymbolTitle[tab.type].color,
          },
          rightColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: fixedTabSymbolTitle[tab.type].color,
          },
        };
      } else if (
        (tab.type === "front_page" ||
          tab.type === "watched" ||
          tab.type === "favorites") &&
        tab.options.searchTerms &&
        tab.options.searchTerms.length
      ) {
        return {
          image: {
            symbol: fixedTabSymbolTitle[tab.type].symbol,
            tintColor: fixedTabSymbolTitle[tab.type].color,
          },
          label: {
            styledText: _mapSearchTermsToRow(tab.options.searchTerms, 0).label
              .styledText,
          },
          leftColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: fixedTabSymbolTitle[tab.type].color,
          },
          rightColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: fixedTabSymbolTitle[tab.type].color,
          },
        };
      } else {
        throw new Error("错误的标签页类型");
      }
    });
    this.cviews.list.view.data = data;
  }
}
