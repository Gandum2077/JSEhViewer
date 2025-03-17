import {
  BaseController,
  CustomNavigationBar,
  setLayer,
  DynamicItemSizeMatrix,
  router,
  SplitViewController,
} from "jsbox-cview";
import { GeneralSettingsController } from "./settings-general-controller";
import { SettingsDownloadsController } from "./settings-downloads-controller";
import { setWebDAVConfig } from "./settings-webdav-controller";
import { setAITranslationConfig } from "./settings-translation-controller";
import { configManager } from "../utils/config";
import { downloaderManager } from "../utils/api";
import { globalTimer } from "../utils/timer";
import { toLocalTimeString } from "../utils/tools";

export class MoreController extends BaseController {
  cviews: { navbar: CustomNavigationBar; list: DynamicItemSizeMatrix };
  constructor() {
    super({
      events: {
        didAppear: () => {
          this.scheduledRefresh();
          globalTimer.addTask({
            id: "more-controller-refresh",
            handler: () => {
              this.scheduledRefresh();
            },
          });
        },
        didDisappear: () => {
          globalTimer.removeTask("more-controller-refresh");
        },
      },
    });
    const navbar = new CustomNavigationBar({
      props: {
        title: "其他",
        leftBarButtonItems: [
          {
            symbol: "sidebar.left",
            handler: () => {
              (
                router.get("splitViewController") as SplitViewController
              ).sideBarShown = true;
            },
          },
        ],
        rightBarButtonItems: [
          {
            symbol: "power",
            tintColor: $color("red"),
            handler: () => {
              if (configManager.autoClearCache) {
                configManager.clearCache();
              }
              $app.close();
            },
          },
        ],
      },
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
            height: 50,
          },
        },
        footer: {
          type: "view",
          props: {
            id: "footer",
            height: 100,
          },
          views: [
            {
              type: "label",
              props: {
                lines: 3,
                font: $font(11),
                align: $align.center,
                textColor: $color("secondaryText"),
                text: `Version ${
                  JSON.parse($file.read("config.json").string || "").info
                    .version
                }\nMIT License`,
              },
              layout: (make, view) => {
                make.top.left.right.inset(0);
                make.height.equalTo(50);
              },
            },
          ],
        },
        template: {
          views: [
            {
              type: "view",
              props: {
                bgcolor: $color("primarySurface"),
              },
              layout: (make, view) => {
                setLayer(view, {
                  cornerRadius: 15,
                  shadowRadius: 10,
                  shadowOpacity: 0.4,
                  shadowOffset: $size(5, 5),
                  shadowColor: $color("black"),
                });
                make.left.right.top.bottom.inset(0);
              },
              views: [
                {
                  type: "view",
                  props: {
                    cornerRadius: 15,
                    bgcolor: $color("primarySurface"),
                  },
                  layout: $layout.fill,
                  views: [
                    /*{
                      // 由于使用渐变色，导致列表快速下拉的时候，新出现的item会闪烁一下，因此弃用
                      type: "gradient",
                      props: {
                        id: "gradient",
                        locations: [0.0, 1.0],
                        startPoint: $point(0, 0),
                        endPoint: $point(1, 1),
                        //colors: [$color("clear"), $color("clear")],
                      },
                      layout: $layout.fill,
                    },*/
                    {
                      type: "view",
                      props: {
                        id: "bgview",
                      },
                      layout: $layout.fill,
                    },
                    {
                      type: "image",
                      props: {
                        id: "icon",
                        contentMode: 1,
                        tintColor: $color("white"),
                      },
                      layout: (make, view) => {
                        make.left.top.inset(10);
                        make.size.equalTo($size(30, 30));
                      },
                    },
                    {
                      type: "label",
                      props: {
                        id: "title",
                        font: $font("bold", 18),
                        textColor: $color("white"),
                      },
                      layout: (make, view) => {
                        make.top.height.equalTo(view.prev);
                        make.left.equalTo(view.prev.right).inset(10);
                      },
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
                        bgcolor: $color("clear"),
                      },
                      layout: (make, view) => {
                        make.top.equalTo(view.prev.bottom).inset(2);
                        make.left.right.inset(10);
                        make.bottom.inset(0);
                      },
                    },
                    {
                      type: "blur",
                      props: {
                        id: "blur",
                        style: 16,
                        cornerRadius: 17,
                        smoothCorners: true,
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
                            textColor: $color("white"),
                          },
                          layout: $layout.fill,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        data: this._getCurrentData(),
      },
      layout: $layout.fillSafeArea,
      events: {
        didSelect: async (sender, indexPath) => {
          switch (indexPath.item) {
            case 0:
              $app.openURL("https://github.com/Gandum2077/JSEhViewer");
              break;
            case 1:
              const generalSettingsController = new GeneralSettingsController();
              generalSettingsController.uipush({
                navBarHidden: true,
                statusBarStyle: 0,
              });
              break;
            case 2:
              const downloadsController = new SettingsDownloadsController();
              downloadsController.uipush({
                navBarHidden: true,
                statusBarStyle: 0,
              });
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
              $app.openURL("https://e-hentai.org/mytags");
              break;
            case 6:
              $app.openURL("https://e-hentai.org/uconfig.php");
              break;
            default:
              break;
          }
        },
      },
    });
    this.cviews = { navbar, list };
    this.rootView.views = [list, navbar];
  }

  private _getCurrentData() {
    // 需要获取四个数据：
    // 1. 标签翻译更新时间
    const tagTranslationUpdateTimeText = toLocalTimeString(
      configManager.translationUpdateTime
    );
    // 2. 下载与上传的数量
    let downloadText = "";
    let uploadText = "";
    // 先从下载管理器中获取正在进行的下载和上传任务, 并提取出需要展示的数据
    const downloading = [...downloaderManager.galleryDownloaders.values()]
      .filter((n) => n.background)
      .map((n) => {
        const finishedCount = n.finishedOfImages;
        const totalCount = n.infos.length;
        const errorCount = n.result.images.filter((n) => n.error).length;
        return {
          finishedCount,
          totalCount,
          errorCount,
        };
      });
    const downloadingTotal = downloading.length;
    const downloadingFinished = downloading.filter(
      (n) => n.finishedCount === n.totalCount
    ).length;
    const downloadingError = downloading.filter((n) => n.errorCount > 0).length;
    if (downloadingTotal > 0) {
      downloadText = `当前下载: ${downloadingFinished} / ${downloadingTotal}`;
      if (downloadingError > 0) {
        downloadText += `, 错误: ${downloadingError}`;
      }
    } else {
      downloadText = "没有正在进行的下载";
    }
    const uploading = [
      ...downloaderManager.galleryWebDAVUploaders.values(),
    ].map((n) => {
      const finishedCount = n.finished;
      const totalCount = n.infos.length;
      const errorCount = n.result.upload.filter((n) => n.error).length;
      return {
        finishedCount,
        totalCount,
        errorCount,
      };
    });
    const uploadingTotal = uploading.length;
    const uploadingFinished = uploading.filter(
      (n) => n.finishedCount === n.totalCount
    ).length;
    const uploadingError = uploading.filter((n) => n.errorCount > 0).length;
    if (uploadingTotal > 0) {
      uploadText = `当前上传: ${uploadingFinished} / ${uploadingTotal}`;
      if (uploadingError > 0) {
        uploadText += `, 错误: ${uploadingError}`;
      }
    } else {
      uploadText = "没有正在进行的上传";
    }
    // 3. WebDAV的地址
    let webdavEnabledText = "";
    if (configManager.webdavEnabled) {
      webdavEnabledText = "已启用WebDAV\n当前服务器: ";
      if (configManager.currentWebDAVService) {
        webdavEnabledText += configManager.currentWebDAVService.name;
      } else {
        webdavEnabledText += "未设置";
      }
    } else {
      webdavEnabledText = "未启用WebDAV";
    }
    // 4. AI翻译的选项
    let aiTranslationServiceText = "";
    if (configManager.selectedAiTranslationService === "") {
      aiTranslationServiceText = "尚未设置AI翻译服务";
    } else if (configManager.selectedAiTranslationService === "user-custom") {
      aiTranslationServiceText = "当前服务: 用户自定义";
    } else {
      aiTranslationServiceText =
        "当前服务: " + configManager.selectedAiTranslationService;
    }
    const data = [
      {
        // gradient: { colors: [$color("#DA8080"), $color("#BE3737")] },
        // bgview: { bgcolor: $color("#CC5C5C") },
        // gradient: { colors: [$color("#0F9ED5"), $color("#40C3EA")] },
        bgview: { bgcolor: $color("#0F9ED5") },
        icon: { icon: $icon("177", $color("white")) },
        title: { text: "项目地址" },
        content: {
          text: "欢迎关注JSEhViewer！\n在GitHub上查看说明文档，或者在issues页面留下你的建议",
        },
        blur: { hidden: false },
        button: { text: "前往GitHub" },
      },
      {
        // gradient: { colors: [$color("#E18B7A"), $color("#C7472D")] },
        // bgview: { bgcolor: $color("#D46954") },
        // gradient: { colors: [$color("#7B61FF"), $color("#9B8AFB")] },
        bgview: { bgcolor: $color("#7B61FF") },
        icon: { symbol: "gear" },
        title: { text: "通用" },
        content: {
          text:
            "常用的设置：UI偏好、标签翻译更新、排序方式、清理缓存、重新登录等\n标签翻译更新时间: " +
            tagTranslationUpdateTimeText,
        },
        blur: { hidden: true },
      },
      {
        // gradient: { colors: [$color("#D7AD6B"), $color("#AD7E2F")] },
        // bgview: { bgcolor: $color("#C2964D") },
        // gradient: { colors: [$color("#F97316"), $color("#FB923C")] },
        bgview: { bgcolor: $color("#F97316") },
        icon: { symbol: "arrow.up.arrow.down.circle" },
        title: { text: "下载与上传" },
        content: { text: downloadText + "\n" + uploadText },
        blur: { hidden: true },
      },
      {
        // gradient: { colors: [$color("#B8CC1C"), $color("#919B00")] },
        // bgview: { bgcolor: $color("#A5B40E") },
        // gradient: { colors: [$color("#22C55E"), $color("#4ADE80")] },
        bgview: { bgcolor: $color("#22C55E") },
        icon: { symbol: "externaldrive.connected.to.line.below" },
        title: { text: "WebDAV" },
        content: { text: webdavEnabledText },
        blur: { hidden: true },
      },
      {
        // gradient: { colors: [$color("#8AB46A"), $color("#587A3D")] },
        // bgview: { bgcolor: $color("#719754") },
        // gradient: { colors: [$color("#EC4899"), $color("#F472B6")] },
        bgview: { bgcolor: $color("#EC4899") },
        icon: { symbol: "globe" },
        title: { text: "AI翻译" },
        content: { text: "图片AI翻译设置\n" + aiTranslationServiceText },
        blur: { hidden: true },
      },
      {
        // gradient: { colors: [$color("#8CB1C0"), $color("#518294")] },
        // bgview: { bgcolor: $color("#6F9AAA") },
        // gradient: { colors: [$color("#FACC15"), $color("#FDE047")] },
        bgview: { bgcolor: $color("#fcba03") },
        icon: { symbol: "flag.and.flag.filled.crossed" },
        title: { text: "EHentai标签" },
        content: { text: "在网页端查看和修改EHentai标签(修改后请重启本应用)" },
        blur: { hidden: false },
        button: { text: "在Safari查看" },
      },
      {
        // gradient: { colors: [$color("#8E96CD"), $color("#4B58A9")] },
        // bgview: { bgcolor: $color("#6D77BB") },
        /// gradient: { colors: [$color("#06B6D4"), $color("#67E8F9")] },
        bgview: { bgcolor: $color("#06B6D4") },
        icon: { symbol: "square.text.square" },
        title: { text: "EHentai设置" },
        content: {
          text: "在网页端调整本应用未涉及的设置，比如清晰度、过滤条件、收藏分类(修改后请重启本应用)",
        },
        blur: { hidden: false },
        button: { text: "在Safari查看" },
      }, //b8cc1c A6BC00
    ];
    return data;
  }

  scheduledRefresh() {
    this.cviews.list.data = this._getCurrentData();
  }
}
