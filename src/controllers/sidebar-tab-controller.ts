import { Base, BaseController, ContentView, CustomNavigationBar, gold, List, router, SplitViewController } from "jsbox-cview";
import { logoColorHex } from "../utils/glv";
import { statusManager } from "../utils/status";
import { appLog } from "../utils/tools";
import { StatusTabOptions } from "../types";

class HeaderStackBlur extends Base<UIButtonView,UiTypes.ButtonOptions> {
  _defineView: () => UiTypes.ButtonOptions;
constructor(symbol: string, title: string, tintColor: UIColor) {
  super()
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
          (router.get("splitViewController") as SplitViewController).sideBarShown = false;
          let options: StatusTabOptions;
          switch (title) {
            case "首页":
              options = {
                type: "front_page",
                options: {}
              }
              break;
            case "订阅":
              options = {
                type: "watched",
                options: {}
              }
              break;
            case "热门":
              options = {
                type: "popular",
                options: {}
              }
              break;
            case "收藏":
              options = {
                type: "favorites",
                options: {}
              }
              break;
            case "我的上传":
              options = {
                type: "upload"
              }
              break;
            default:
              throw new Error("未知的选项");
          }
          statusManager.loadTab(options).then().catch(e=>appLog(e, "error"));
        }
      },
      views: [
        {
          type: "image",
          props: {
            symbol,
            tintColor,
            contentMode: 1
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super);
            make.top.inset(12.5);
            make.size.equalTo($size(32.5, 32.5));
          }
        },
        {
          type: "label",
          props: {
            text: title,
            font: $font("bold", 12),
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super);
            make.top.equalTo(view.prev.bottom).inset(3);
          }
        }
      ]
    }
  }
}
}

export function createSidebarTabController() {
  const headerView = new CustomNavigationBar({
    props: {
      title: "JSEhViewer",
      tintColor: $color(logoColorHex, "#DD0000")
    }
  });

  const bgview = new ContentView({
    props: {
      bgcolor: $color("backgroundColor", "secondarySurface")
    },
    layout: (make, view) => {
      make.left.right.top.inset(0);
      make.bottom.equalTo(view.super.safeAreaTop).inset(-50);
    }
  });
  // 首页 订阅 热门 收藏 排行 我的上传
  const headerStack = new ContentView({
    props: {
      bgcolor: $color("clear")
    },
    layout: (make, view) => {
      make.height.equalTo(155);
      make.left.right.inset(6);
      make.bottom.inset(0);
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
              new HeaderStackBlur("house", "首页", $color("#62399D")).definition,
              new HeaderStackBlur("bell", "订阅", $color("#739271")).definition,
              new HeaderStackBlur("chart.line.uptrend.xyaxis", "热门", $color("red")).definition,
            ]
          }
        },
        layout: (make, view) => {
          make.top.inset(0);
          make.left.right.inset(10);
          make.height.equalTo(70);
        }
      },
      {
        type: "stack",
        props: {
          spacing: 7,
          axis: $stackViewAxis.horizontal,
          distribution: $stackViewDistribution.fillEqually,
          stack: {
            views: [
              new HeaderStackBlur("heart.fill", "收藏", $color("orange")).definition,
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
                          (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                          statusManager.loadTab({
                            type: "toplist",
                            options: {
                              timeRange: "yesterday",
                              page: 0
                            }
                          }).then().catch(e=>appLog(e, "error"));
                        }
                      },
                      {
                        title: "最近一月",
                        handler: () => {
                          (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                          statusManager.loadTab({
                            type: "toplist",
                            options: {
                              timeRange: "past_month",
                              page: 0
                            }
                          }).then().catch(e=>appLog(e, "error"));
                        }
                      },
                      {
                        title: "最近一年",
                        handler: () => {
                          (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                          statusManager.loadTab({
                            type: "toplist",
                            options: {
                              timeRange: "past_year",
                              page: 0
                            }
                          }).then().catch(e=>appLog(e, "error"));
                        }
                      },
                      {
                        title: "总排行",
                        handler: () => {
                          (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                          statusManager.loadTab({
                            type: "toplist",
                            options: {
                              timeRange: "all",
                              page: 0
                            }
                          }).then().catch(e=>appLog(e, "error"));
                        }
                      }
                    ]
                  }
                },
                layout: (make, view) => {
                  make.size.equalTo($size(30, 30));
                },
                views: [
                  {
                    type: "image",
                    props: {
                      symbol: "trophy",
                      tintColor: gold,
                      contentMode: 1
                    },
                    layout: (make, view) => {
                      make.centerX.equalTo(view.super);
                      make.top.inset(12.5);
                      make.size.equalTo($size(32.5, 32.5));
                    }
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
                    }
                  }
                ]
              },
              new HeaderStackBlur("cloud", "我的上传", $color("#007AFF")).definition,
            ]
          }
        },
        layout: (make, view) => {
          make.top.equalTo(view.prev.bottom).inset(15);
          make.left.right.inset(10);
          make.height.equalTo(70);
        }
      },
    ]
  })

  const list = new List({
    props: {
      header: {
        type: "view",
        props: {
          height: 100 + 155+ 22
        },
        views: [
          {
            type: "label",
            props: {
              id: "header",
              text: "JSEhViewer",
              textColor: $color(logoColorHex, "#DD0000"),
              font: $font("bold", 30)
            },
            layout: (make, view) => {
              make.top.inset(50);
              make.height.equalTo(50);
              make.left.inset(15);
            }
          },
          headerStack.definition
        ]
      },
      footer: {
        type: "view",
        props: {
          height: 50
        }
      },
      style: 2,
      bgcolor: $color("clear"),
      indicatorInsets: $insets(50, 0, 50, 0),
      template: {
        props: {
          bgcolor: $color("tertiarySurface")
        },
        views: [
          {
            type: "view",
            props: {
              id: "imageBackgroundView",
              cornerRadius: 4
            },
            layout: (make, view) => {
              make.size.equalTo($size(30, 30));
              make.left.inset(5);
              make.centerY.equalTo(view.super);
            }
          },
          {
            type: "image",
            props: {
              id: "image",
              contentMode: 1
            },
            layout: (make, view) => {
              make.size.equalTo($size(25, 25));
              make.center.equalTo(view.prev);
            }
          },
          {
            type: "label",
            props: {
              id: "label"
            },
            layout: (make, view) => {
              make.top.bottom.inset(0);
              make.left.equalTo($("imageBackgroundView").right).inset(5);
              make.right.inset(15);
            }
          }
        ]
      },
      data: [
        {
          title: "当前页签",
          rows: Array(3)
            .fill("test")
            .map(n => {
              return {
                imageBackgroundView: {
                  bgcolor: $color("clear")
                },
                image: {
                  symbol: "star.fill",
                  tintColor: $color("#FFD700")
                },
                label: {
                  text: n
                }
              };
            })
        }
      ]
    },
    layout: $layout.fillSafeArea,
    events: {
      didScroll: sender => {
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
      }
    }
  });
  const sidebarTabController = new BaseController({
    props: {
      bgcolor: $color("backgroundColor", "secondarySurface")
    },
    events: {
      didLoad: sender => {
        headerView.cviews.bgview.view.alpha = 0;
        headerView.cviews.separator.view.alpha = 0;
        headerView.cviews.titleViewWrapper.view.alpha = 0;
      }
    }
  });
  sidebarTabController.rootView.views = [list, bgview, headerView];
  return sidebarTabController;
}