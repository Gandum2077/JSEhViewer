// 验证所需的登录信息是否存在，不存在则弹出登录界面。此过程独立完成，但是需要在主界面加载后执行。
// 因此整个过程为：主界面加载 -> 检查登录（加载本模块） -> 数据加载
// 本模块需要的文件：get-cookie.ts

import { PresentedPageController, ContentView, WelcomeView, DynamicPreferenceScrollView } from "jsbox-cview";
import { getCookie } from "../utils/get-cookie";
import { defaultButtonColor } from "../utils/glv";
import { clearCookie } from "../utils/tools";
import { configManager } from "../utils/config";
import { api } from "../utils/api";
import { showIntroductionSheet } from "../components/show-introduction-sheet";

interface LoginOptions {
  loginMethod: number;
  exhentai: boolean;
  syncMyTags: boolean;
  githubToken: string;
}

const galleryOneText = `欢迎使用[JSEhViewer](https://github.com/Gandum2077/JSEhViewer)，一款运行在JSBox平台的E-Hentai阅读应用。

JSEhViewer需要从网页端抓取数据。启动时会自动将网页端设置修改为特定的值：

  - 搜索页的显示模式: 扩展
  - 图库的缩略图模式: 大

本应用运行时请不要在网页端修改设置，可能会导致错误。`;

class WelcomeController extends PresentedPageController {
  constructor(finishHandler: () => void) {
    super({
      props: {
        presentMode: 5,
        animated: true,
        interactiveDismissalDisabled: true,
      },
    });
    const optionList = new DynamicPreferenceScrollView<LoginOptions>({
      props: {
        bgcolor: $color("clear"),
        scrollEnabled: false,
        tabWidth: 150,
      },
      layout: $layout.fill,
      sections: [
        {
          title: "",
          rows: [
            {
              type: "boolean",
              title: "登录里站",
              key: "exhentai",
              value: false,
            },
            {
              type: "boolean",
              title: "同步我的标签",
              key: "syncMyTags",
              value: false,
            },
          ],
          footer: {
            text: "关于同步我的标签，点击查看帮助",
            tapped: () => {
              showIntroductionSheet({
                title: "同步标签",
                path: "assets/sync-mytags-introduction.md",
              });
            },
          },
        },
        {
          title: "",
          rows: [
            {
              type: "secure",
              title: "GitHub Token",
              key: "githubToken",
              value: "",
              placeholder: "github_pat_xxx",
            },
          ],
          footer: {
            text: "如果遇到GitHub API限额错误（429），建议使用GitHub Token，点击查看帮助",
            tapped: () => {
              showIntroductionSheet({
                title: "关于GitHub Token",
                path: "assets/github-token-introduction.md",
              });
            },
          },
        },
        {
          title: "",
          rows: [
            {
              type: "tab",
              title: "登录方式",
              key: "loginMethod",
              items: ["网页", "Cookie"],
              value: 0,
            },
          ],
        },
      ],
    });
    const tappedEvent = async (sender: UIButtonView) => {
      try {
        const { loginMethod, exhentai, syncMyTags, githubToken } = optionList.values;
        configManager.githubToken = githubToken;
        sender.title = "获取账号信息...";
        sender.enabled = false;
        const cookie = await getCookie({ exhentai, isManualCookieInput: loginMethod === 1 });
        api.updateCookie(cookie);
        api.exhentai = exhentai;
        sender.title = "获取标签翻译...";
        await configManager.updateTranslationData();
        configManager.cookie = JSON.stringify(cookie);
        configManager.exhentai = exhentai;
        configManager.syncMyTags = syncMyTags;
        // 检测是否有mpv
        const hath_perks = cookie.find((n) => n.name === "hath_perks")?.value || "";
        const hathPerkList = hath_perks.slice(0, hath_perks.indexOf("-")).split(".");
        if (hathPerkList.includes("q")) {
          configManager.mpvAvailable = true;
        }
        this.dismiss();
        finishHandler();
      } catch (e: any) {
        if (e !== "cancel") {
          console.error("登录失败");
          console.error(e);
          $ui.alert({
            title: "登录失败",
            message: e.message,
          });
        }
        sender.title = "登录";
        sender.enabled = true;
      }
    };
    const welcomeView: WelcomeView = new WelcomeView({
      props: {
        pages: [
          {
            mode: "logo-content",
            logo: {
              props: {
                src: "assets/icon-large.png",
              },
              size: 128,
            },
            bgcolor: $color("#F7CD82", "#A57E43"),
            content: new ContentView({
              props: {
                bgcolor: $color("clear"),
              },
              layout: $layout.fill,
              views: [
                {
                  type: "text",
                  props: {
                    tintColor: $color("systemLink"),
                    textColor: $color("primaryText"),
                    styledText: galleryOneText,
                    font: $font(16),
                    align: $align.left,
                    bgcolor: $color("clear"),
                    editable: false,
                    scrollEnabled: false,
                    selectable: false,
                    insets: $insets(0, 0, 0, 0),
                  },
                  layout: (make, view) => {
                    make.top.inset(35);
                    make.left.right.bottom.inset(0);
                  },
                },
              ],
            }),
            contentHeight: 386,
            buttons: [
              {
                props: {
                  title: "我已了解",
                  titleColor: $color("white"),
                  bgcolor: defaultButtonColor,
                },
                tapped: () => welcomeView.scrollToPage(1),
              },
            ],
          },
          {
            mode: "logo-content",
            logo: {
              props: {
                src: "assets/icon-large.png",
              },
              size: 128,
            },
            bgcolor: $color("backgroundColor"),
            content: optionList,
            contentHeight: (width) => optionList.heightToWidth(width),
            buttons: [
              {
                props: {
                  title: "登录",
                  titleColor: $color("white"),
                  bgcolor: defaultButtonColor,
                },
                tapped: tappedEvent,
              },
            ],
          },
        ],
        leadingSymbol: "xmark",
        leadingSymbolColor: $color("primaryText"),
      },
      layout: $layout.fill,
      events: {
        leadingTapped: () => $app.close(),
      },
    });
    this.rootView.views = [welcomeView];
  }
}

export function login(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    console.info("clear cookies");
    clearCookie();
    console.info("login start");
    const welcomeController = new WelcomeController(() => resolve(true));
    welcomeController.present();
  });
}
