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
import { clearExtraPropsForReload, statusManager } from "../utils/status";
import { StatusTabOptions } from "../types";
import { HomepageController } from "./homepage-controller";
import { _mapSearchTermsToRow } from "../components/searchterm-history-list";
import { configManager } from "../utils/config";
import { updateLastAccess } from "../utils/tools";

class HeaderStackBlur extends Base<UIButtonView, UiTypes.ButtonOptions> {
  _defineView: () => UiTypes.ButtonOptions;
  constructor(type: "front_page" | "watched" | "popular" | "favorites" | "upload") {
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
        events: {
          tapped: () => {
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
            (router.get("homepageController") as HomepageController).triggerLoad(options);
            (router.get("splitViewController") as SplitViewController).sideBarShown = false;
            (router.get("primaryViewController") as TabBarController).index = 0;
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

class DelayRefreshFavoritesButtonPart extends Base<UIButtonView, UiTypes.ButtonOptions> {
  _defineView: () => UiTypes.ButtonOptions;
  constructor() {
    super();
    this._defineView = () => {
      return {
        type: "button",
        props: {
          id: this.id,
          cornerRadius: 15,
          smoothCorners: true,
          bgcolor: $color("tertiarySurface"),
          menu: {
            asPrimary: true,
            pullDown: true,
            items: ["全部", ...configManager.favcatTitles].map((title, index) => {
              return {
                title,
                handler: () => {
                  (router.get("homepageController") as HomepageController).triggerLoad({
                    type: "favorites",
                    options: {
                      favcat: index === 0 ? undefined : ((index - 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9),
                    },
                  });
                  (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                  (router.get("primaryViewController") as TabBarController).index = 0;
                },
              };
            }),
          },
        },
        layout: $layout.fill,
        views: [
          {
            type: "image",
            props: {
              symbol: fixedTabSymbolTitle["favorites"].symbol,
              tintColor: fixedTabSymbolTitle["favorites"].color,
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
              text: fixedTabSymbolTitle["favorites"].title,
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

class DelayRefreshFavoritesButton extends Base<UIView, UiTypes.ViewOptions> {
  cviews: {
    buttonPart: DelayRefreshFavoritesButtonPart;
  };
  _defineView: () => UiTypes.ViewOptions;
  constructor() {
    super();
    const buttonPart = new DelayRefreshFavoritesButtonPart();
    this.cviews = { buttonPart };
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        views: [buttonPart.definition],
      };
    };
  }

  refresh() {
    this.cviews.buttonPart.view.hidden = true;
    this.view.add(new DelayRefreshFavoritesButtonPart().definition);
  }
}

export class SidebarTabController extends BaseController {
  cviews: {
    headerView: CustomNavigationBar;
    bgview: ContentView;
    list: List;
    favoriteButton: DelayRefreshFavoritesButton;
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
    const favoriteButton = new DelayRefreshFavoritesButton();
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
                favoriteButton.definition,
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
                            (router.get("homepageController") as HomepageController).triggerLoad({
                              type: "toplist",
                              options: {
                                timeRange: "yesterday",
                                page: 0,
                              },
                            });
                            (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                            (router.get("primaryViewController") as TabBarController).index = 0;
                          },
                        },
                        {
                          title: "最近一月",
                          handler: () => {
                            (router.get("homepageController") as HomepageController).triggerLoad({
                              type: "toplist",
                              options: {
                                timeRange: "past_month",
                                page: 0,
                              },
                            });
                            (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                            (router.get("primaryViewController") as TabBarController).index = 0;
                          },
                        },
                        {
                          title: "最近一年",
                          handler: () => {
                            (router.get("homepageController") as HomepageController).triggerLoad({
                              type: "toplist",
                              options: {
                                timeRange: "past_year",
                                page: 0,
                              },
                            });
                            (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                            (router.get("primaryViewController") as TabBarController).index = 0;
                          },
                        },
                        {
                          title: "总排行",
                          handler: () => {
                            (router.get("homepageController") as HomepageController).triggerLoad({
                              type: "toplist",
                              options: {
                                timeRange: "all",
                                page: 0,
                              },
                            });
                            (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                            (router.get("primaryViewController") as TabBarController).index = 0;
                          },
                        },
                      ],
                    },
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
                      statusManager.addTab({ showInManager: true });
                      statusManager.currentTabId = statusManager.tabIdsShownInManager.at(-1)!;
                      this.refresh();
                      const home = router.get("homepageController") as HomepageController;
                      home.updateStatus();
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
        showsVerticalIndicator: false,
        bgcolor: $color("clear"),
        actions: [
          {
            title: "关闭",
            color: $color("red"),
            handler: (sender, indexPath) => {
              if (statusManager.tabIdsShownInManager.length <= 1) {
                $ui.error("无法关闭最后一个标签页");
              } else {
                const idToDelete = statusManager.tabIdsShownInManager[indexPath.row];
                let flag = false;
                // 如果要关闭的是当前标签页，那么先转移到其他标签页，优先转移到下一个，如果没有则转移到上一个
                if (statusManager.currentTabId === idToDelete) {
                  const nextIndex =
                    statusManager.tabIdsShownInManager.length > indexPath.row + 1
                      ? indexPath.row + 1
                      : indexPath.row - 1;
                  statusManager.currentTabId = statusManager.tabIdsShownInManager[nextIndex];
                  flag = true;
                }
                statusManager.tabIdsShownInManager.splice(indexPath.row, 1);
                this.refresh();
                if (flag) {
                  const tab = statusManager.currentTab;
                  const oldScrollState = tab.scrollState;
                  const home = router.get("homepageController") as HomepageController;
                  home.updateStatus();
                  if (oldScrollState) {
                    home.cviews.list.updateScrollState(oldScrollState);
                  }
                  if (tab.status === "pending" && tab.data.type !== "blank") {
                    home.triggerLoad(clearExtraPropsForReload(tab.data));
                  }
                }

                // 更新最后访问的标签页
                updateLastAccess();
              }
            },
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
        make.left.right.equalTo(view.super.safeArea).inset(16);
      },
      events: {
        swipeEnabled: (sender, indexPath) => {
          return statusManager.tabIdsShownInManager.length > 1;
        },
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
            headerView.cviews.separator.view.alpha = sender.contentOffset.y / 50;
            headerView.cviews.titleViewWrapper.view.alpha = (Math.max(0, sender.contentOffset.y - 25) / 50) * 2;
            bgview.view.hidden = false;
          }
        },
        didSelect: (sender, indexPath, data) => {
          statusManager.currentTabId = statusManager.tabIdsShownInManager[indexPath.row];
          this.refresh();
          const tab = statusManager.currentTab;
          const oldScrollState = tab.scrollState;
          const home = router.get("homepageController") as HomepageController;
          home.updateStatus();
          if (oldScrollState) {
            home.cviews.list.updateScrollState(oldScrollState);
          }
          (router.get("splitViewController") as SplitViewController).sideBarShown = false;
          (router.get("primaryViewController") as TabBarController).index = 0;
          if (tab.status === "pending" && tab.data.type !== "blank") {
            home.triggerLoad(clearExtraPropsForReload(tab.data));
          }
        },
      },
    });
    this.cviews = {
      headerView,
      bgview,
      list,
      favoriteButton,
    };
    this.rootView.views = [list, bgview, headerView];
  }

  refresh() {
    // 刷新标签页列表，首先从statusManager中获取标签页列表，然后更新list的data
    const data = statusManager.tabIdsShownInManager.map((id, index) => {
      const tab = statusManager.tabsMap.get(id);
      if (!tab) throw new Error("标签页不存在");
      const type = tab.data.type;
      if (type === "blank") {
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
        type === "toplist" ||
        type === "popular" ||
        type === "upload" ||
        type === "image_lookup" ||
        ((type === "front_page" || type === "watched" || type === "favorites") &&
          (!tab.data.options.searchTerms || tab.data.options.searchTerms.length === 0))
      ) {
        let title = fixedTabSymbolTitle[type].title;
        if (type === "favorites" && tab.data.options.favcat !== undefined) {
          title = configManager.favcatTitles[tab.data.options.favcat];
        }
        if (type === "toplist") {
          title =
            tab.data.options.timeRange === "yesterday"
              ? "日排行"
              : tab.data.options.timeRange === "past_month"
              ? "月排行"
              : tab.data.options.timeRange === "past_year"
              ? "年排行"
              : "总排行";
        }
        return {
          image: {
            symbol: fixedTabSymbolTitle[tab.data.type].symbol,
            tintColor: fixedTabSymbolTitle[tab.data.type].color,
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
            bgcolor: fixedTabSymbolTitle[tab.data.type].color,
          },
          rightColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: fixedTabSymbolTitle[tab.data.type].color,
          },
        };
      } else if (
        (type === "front_page" || type === "watched" || type === "favorites") &&
        tab.data.options.searchTerms &&
        tab.data.options.searchTerms.length
      ) {
        return {
          image: {
            symbol: fixedTabSymbolTitle[tab.data.type].symbol,
            tintColor: fixedTabSymbolTitle[tab.data.type].color,
          },
          label: {
            styledText: _mapSearchTermsToRow(tab.data.options.searchTerms, 0).label.styledText,
          },
          leftColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: fixedTabSymbolTitle[tab.data.type].color,
          },
          rightColumn: {
            hidden: id !== statusManager.currentTabId,
            bgcolor: fixedTabSymbolTitle[tab.data.type].color,
          },
        };
      } else {
        throw new Error("错误的标签页类型");
      }
    });
    this.cviews.list.view.data = data;
  }
}
