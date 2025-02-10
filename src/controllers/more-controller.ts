import {
  BaseController, 
  CustomNavigationBar,
  setLayer, 
  DynamicItemSizeMatrix,
  router,
  SplitViewController,
} from "jsbox-cview";
import { createGeneralSettingsController } from "./settings-general-controller";
import { SettingsDownloadsController } from "./settings-downloads-controller";
import { setWebDAVConfig } from "./settings-webdav-controller";
import { setAITranslationConfig } from "./settings-translation-controller";
import { configManager } from "../utils/config";

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
              text: "一些常用的设置\n包括UI偏好、标签翻译更新、排序方式、清理缓存、重新登录等"
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
              symbol: "arrow.up.arrow.down.circle"
            },
            title: {
              text: "下载与上传"
            },
            content: {
              text:
                "当前下载: n / m\n当前上传: n / m"
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
              symbol: "externaldrive.connected.to.line.below"
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
              symbol: "globe"
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
              text: "在网页端查看和修改EHentai标签(修改后请重启本应用)"
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
                "在网页端调整本应用未涉及的设置，比如清晰度、过滤条件、收藏分类(修改后请重启本应用)"
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
        didSelect: async (sender, indexPath) => {
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
              const downloadsController = new SettingsDownloadsController()
              downloadsController.uipush({
                navBarHidden: true,
                statusBarStyle: 0
              })
              break;
            case 3:
              const values = await setWebDAVConfig();
              configManager.webdavEnabled = values.enabled;
              configManager.webdavAutoUpload = values.autoUpload;
              configManager.updateAllWebDAVServices(values.services);
              break;
            case 4:
              await setAITranslationConfig();
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