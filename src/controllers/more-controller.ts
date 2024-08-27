import {
  BaseController, 
  CustomNavigationBar,
  setLayer, 
  DynamicItemSizeMatrix,
  router,
  SplitViewController,
} from "jsbox-cview";
import { createGeneralSettingsController } from "./settings-general-controller";
import { createSettingsDownloadsController } from "./settings-downloads-controller";
import { WebDAVSettingsController } from "./settings-webdav-controller";
import { createSettingsTranslationController } from "./settings-translation-controller";

export class MoreController extends BaseController {
  cviews: { navbar: CustomNavigationBar, list: DynamicItemSizeMatrix };
  constructor() {
    super()
    const navbar = new CustomNavigationBar({
      props: {
        title: "其他",
        leftBarButtonItems: [{
          symbol: "sidebar.left",
          handler: () => {
            (router.get("splitViewController") as SplitViewController).sideBarShown = true
          }
        }],
        rightBarButtonItems: [{
          symbol: "power", 
          tintColor: $color("red"),
          handler: () => $app.close()
        }]
      }
    });
    const list = new DynamicItemSizeMatrix({
      props: {
        maxColumns: 2,
        minItemWidth: 290,
        fixedItemHeight: 150,
        spacing: 20,
        bgcolor: $color("clear"),
        indicatorInsets: $insets(50, 0, 50, 0),
        header: {
          type: "view",
          props: {
            id: "header",
            height: 50
          }
        },
        footer: {
          type: "view",
          props: {
            id: "footer",
            height: 100
          },
          views: [
            {
              type: "label",
              props: {
                lines: 3,
                font: $font(11),
                align: $align.center,
                textColor: $color("secondaryText"),
                text: `Version ${JSON.parse($file.read("config.json").string || "").info.version}\nMIT License`
              },
              layout: (make, view) => {
                make.top.left.right.inset(0);
                make.height.equalTo(50);
              }
            }
          ]
        },
        template: {
          views: [
            {
              type: "view",
              props: {
                bgcolor: $color("primarySurface")
              },
              layout: (make, view) => {
                setLayer(view, {
                  cornerRadius: 15,
                  shadowRadius: 10,
                  shadowOpacity: 0.4,
                  shadowOffset: $size(5, 5),
                  shadowColor: $color("black")
                });
                make.left.right.top.bottom.inset(0);
              },
              views: [
                {
                  type: "view",
                  props: {
                    cornerRadius: 15,
                    bgcolor: $color("primarySurface")
                  },
                  layout: $layout.fill,
                  views: [
                    {
                      type: "gradient",
                      props: {
                        id: "gradient",
                        locations: [0.0, 1.0],
                        startPoint: $point(0, 0),
                        endPoint: $point(1, 1),
                        colors: [$color("#DA8080"), $color("#BE3737")]
                      },
                      layout: $layout.fill
                    },
                    {
                      type: "image",
                      props: {
                        id: "icon",
                        contentMode: 1,
                        tintColor: $color("white")
                      },
                      layout: (make, view) => {
                        make.left.top.inset(10);
                        make.size.equalTo($size(30, 30));
                      }
                    },
                    {
                      type: "label",
                      props: {
                        id: "title",
                        font: $font("bold", 18),
                        textColor: $color("white")
                      },
                      layout: (make, view) => {
                        make.top.height.equalTo(view.prev);
                        make.left.equalTo(view.prev.right).inset(10);
                      }
                    },
                    {
                      type: "text",
                      props: {
                        id: "content",
                        userInteractionEnabled: false,
                        editable: false,
                        selectable: false,
                        scrollEnabled: false,
                        font: $font(14),
                        textColor: $color("white"),
                        bgcolor: $color("clear")
                      },
                      layout: (make, view) => {
                        make.top.equalTo(view.prev.bottom).inset(2);
                        make.left.right.inset(10);
                        make.bottom.inset(0);
                      }
                    },
                    {
                      type: "blur",
                      props: {
                        id: "blur",
                        style: 16,
                        cornerRadius: 17,
                        smoothCorners: true
                      },
                      layout: (make, view) => {
                        make.height.equalTo(34);
                        make.width.equalTo(150);
                        make.right.inset(20);
                        make.bottom.inset(10);
                      },
                      views: [
                        {
                          type: "label",
                          props: {
                            id: "button",
                            align: $align.center,
                            bgcolor: $color("clear"),
                            font: $font("bold", 15),
                            textColor: $color("white")
                      },
                          layout: $layout.fill
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        data: [
          {
            gradient: {
              colors: [$color("#DA8080"), $color("#BE3737")]
            },
            icon: {
              icon: $icon("177", $color("white"))
            },
            title: {
              text: "项目地址"
            },
            content: {
              text: "欢迎关注JSEhViewer！\n在GitHub上查看说明文档，或者在issues页面留下你的建议"
            },
            blur: {
              hidden: false
            },
            button: {
              text: "前往GitHub"
            }
          },
          {
            gradient: {
              colors: [$color("#E18B7A"), $color("#C7472D")]
            },
            icon: {
              symbol: "gear"
            },
            title: {
              text: "通用"
            },
            content: {
              text: "一些常用的设置\n包括UI偏好、标签翻译、排序方式、清理缓存、重新登录等"
            },
            blur: {
              hidden: true
            }
          },
          {
            gradient: {
              colors: [$color("#D7AD6B"), $color("#AD7E2F")]
            },
            icon: {
              symbol: "externaldrive"
            },
            title: {
              text: "下载管理"
            },
            content: {
              text:
                "当前n个图库排队下载中\n共计n张图片等待下载"
            },
            blur: {
              hidden: true
            }
          },
          {
            gradient: {
              colors: [$color("#B8CC1C"), $color("#919B00")]
            },
            icon: {
              symbol: "externaldrive"
            },
            title: {
              text: "WebDAV"
            },
            content: {
              text:
                "多端共享，及时备份\n对服务端有要求，请注意查看说明\n当前地址: http://192.168.1.1:5007/Public"
            },
            blur: {
              hidden: true
            }
          },
          {
            gradient: {
              colors: [$color("#8AB46A"), $color("#587A3D")]
            },
            icon: {
              symbol: "externaldrive"
            },
            title: {
              text: "AI翻译"
            },
            content: {
              text:
                "图片AI翻译设置"
            },
            blur: {
              hidden: true
            }
          },
          {
            gradient: {
              colors: [$color("#8CB1C0"), $color("#518294")]
            },
            icon: {
              symbol: "flag.and.flag.filled.crossed"
            },
            title: {
              text: "EHentai标签"
            },
            content: {
              text: "跳转至EHentai我的标签页面\n可以将某个标签设置为关注或者隐藏，并分组管理"
            },
            blur: {
              hidden: false
            },
            button: {
              text: "在Safari查看"
            }
          },
          {
            gradient: {
              colors: [$color("#8E96CD"), $color("#4B58A9")]
            },
            icon: {
              symbol: "square.text.square"
            },
            title: {
              text: "EHentai设置"
            },
            content: {
              text:
                "跳转至EHentai设置页面\n可以对EHentai的搜索、图库、收藏、过滤、UI等进行详细设定"
            },
            blur: {
              hidden: false
            },
            button: {
              text: "在Safari查看"
            }
          } //b8cc1c A6BC00
        ]
      },
      layout: $layout.fillSafeArea,
      events: {
        didSelect: (sender, indexPath) => {
          switch (indexPath.item) {
            case 0:
              $app.openURL("https://github.com/Gandum2077/JSEhViewer")
              break;
            case 1:
              const generalSettingsController = createGeneralSettingsController()
              generalSettingsController.uipush({
                navBarHidden: true,
                statusBarStyle: 0
              })
              break;
            case 2:
              const downloadsSettingsController = createSettingsDownloadsController()
              downloadsSettingsController.uipush({
                navBarHidden: true,
                statusBarStyle: 0
              })
              break;
            case 3:
              const webDAVSettingsController = new WebDAVSettingsController()
              webDAVSettingsController.uipush({
                navBarHidden: true,
                statusBarStyle: 0
              })
              break;
            case 4:
              const translationSettingsController = createSettingsTranslationController()
              translationSettingsController.uipush({
                navBarHidden: true,
                statusBarStyle: 0
              })
              break;
            case 5:
              $app.openURL("https://e-hentai.org/mytags")
              break;
            case 6:
              $app.openURL("https://e-hentai.org/uconfig.php")
              break;
            default:
              break
          }
        }
      }
    })
    this.cviews = { navbar, list }
    this.rootView.views = [list, navbar]
  }

}