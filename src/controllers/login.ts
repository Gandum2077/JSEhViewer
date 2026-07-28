// 验证所需的登录信息是否存在，不存在则弹出登录界面。此过程独立完成，但是需要在主界面加载后执行。
// 因此整个过程为：主界面加载 -> 检查登录（加载本模块） -> 数据加载
// 本模块需要的文件：get-cookie.ts

import {
  Image,
  PresentedPageController,
  PreferenceListView,
  PageViewer,
  ContentView,
  PageControl,
  Button,
} from "jsbox-cview";
import { getCookie } from "../utils/get-cookie";
import { defaultButtonColor } from "../utils/glv";
import { clearCookie } from "../utils/tools";
import { configManager } from "../utils/config";
import { api } from "../utils/api";
import { showIntroductionSheet } from "../components/show-introduction-sheet";

const galleryOneText = `欢迎使用[JSEhViewer](https://github.com/Gandum2077/JSEhViewer)，一款运行在JSBox平台的E-Hentai阅读应用。

JSEhViewer的运行依赖从网页端抓取数据。启动时会自动将[网站设置](https://e-hentai.org/uconfig.php)修改为特定的值：

  搜索页的显示模式: 扩展
  图库的缩略图模式: 大

运行时请不要在网页端修改设置，有可能会导致错误。`;

class WelcomeController extends PresentedPageController {
  constructor(finishHandler: () => void) {
    super({
      props: {
        presentMode: 5,
        animated: true,
        interactiveDismissalDisabled: true,
      },
    });
    const optionList = new PreferenceListView({
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
          ],
        },
        {
          title: "",
          rows: [
            {
              type: "boolean",
              title: "同步我的标签",
              key: "syncMyTags",
              value: false,
            },
            {
              type: "action",
              title: "查看同步标签的规则",
              value: () => {
                showIntroductionSheet({ title: "同步标签", path: "assets/sync-mytags-introduction.md" });
              },
            },
          ],
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
            {
              type: "action",
              title: "关于429错误和GitHub Token",
              value: () => {
                showIntroductionSheet({
                  path: "assets/github-token-introduction.md",
                  title: "GitHub Token",
                });
              },
            },
          ],
        },
      ],
      props: {
        style: 2,
        scrollEnabled: false,
        bgcolor: $color("clear"),
      },
      layout: (make, view) => {
        make.centerX.equalTo(view.super);
        make.centerY.equalTo(view.super).offset(0);
        make.height.equalTo(360);
        make.width.greaterThanOrEqualTo(300).priority(1000);
        make.width.lessThanOrEqualTo(600).priority(999);
        make.width.equalTo(view.super).offset(-75).priority(998);
      },
    });
    const tappedEvent = async (sender: UIButtonView, type: "cookie" | "web") => {
      try {
        const { exhentai, syncMyTags, githubToken } = optionList.values as {
          exhentai: boolean;
          syncMyTags: boolean;
          githubToken: string;
        };
        configManager.githubToken = githubToken;
        sender.title = "获取账号信息...";
        cookieLoginButton.view.enabled = false;
        webLoginButton.view.enabled = false;
        const cookie = await getCookie({ exhentai, isManualCookieInput: type === "cookie" });
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
        cookieLoginButton.view.title = "Cookie登录";
        cookieLoginButton.view.enabled = true;
        webLoginButton.view.title = "网页登录";
        webLoginButton.view.enabled = true;
      }
    };
    const cookieLoginButton = new Button({
      props: {
        title: "Cookie登录",
        bgcolor: defaultButtonColor,
      },
      layout: (make, view) => {
        make.centerX.equalTo(view.super);
        make.top.greaterThanOrEqualTo(view.prev.bottom).offset(50).priority(1000);
        make.centerY.equalTo(view.super).multipliedBy(1.7).priority(999);
        make.height.equalTo(50);
        make.width.equalTo(view.prev);
      },
      events: { tapped: (sender) => tappedEvent(sender, "cookie") },
    });
    const webLoginButton = new Button({
      props: {
        title: "网页登录",
        bgcolor: defaultButtonColor,
      },
      layout: (make, view) => {
        make.centerX.equalTo(view.super);
        make.bottom.equalTo(view.prev.top).inset(20);
        make.height.equalTo(50);
        make.width.equalTo(view.prev);
      },
      events: { tapped: (sender) => tappedEvent(sender, "web") },
    });
    const gallery = new PageViewer({
      props: {
        page: 0,
        cviews: [
          new ContentView({
            props: {
              bgcolor: $color("#F7CD82", "#5B584F"),
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
                },
                layout: (make, view) => {
                  make.center.equalTo(view.super);
                  make.height.equalTo(300);
                  make.width.greaterThanOrEqualTo(300).priority(1000);
                  make.width.lessThanOrEqualTo(600).priority(999);
                  make.width.equalTo(view.super).offset(-75).priority(998);
                },
              },
              {
                type: "button",
                props: {
                  title: "我已了解",
                  bgcolor: defaultButtonColor,
                },
                layout: (make, view) => {
                  make.centerX.equalTo(view.super);
                  make.top.greaterThanOrEqualTo(view.prev.bottom).offset(50).priority(1000);
                  make.centerY.equalTo(view.super).multipliedBy(1.7).priority(999);
                  make.height.equalTo(50);
                  make.width.equalTo(view.prev);
                },
                events: {
                  tapped: (sender) => {
                    gallery.scrollToPage(1);
                  },
                },
              },
            ],
          }),
          new ContentView({
            props: {
              bgcolor: $color("backgroundColor"),
            },
            layout: $layout.fill,
            views: [optionList.definition, cookieLoginButton.definition, webLoginButton.definition],
          }),
        ],
      },
      layout: $layout.fill,
      events: {
        changed: (sender, page) => {
          pagecontrol.currentPage = page;
        },
      },
    });
    const pagecontrol = new PageControl({
      props: {
        numberOfPages: 2,
        currentPage: 0,
      },
      layout: (make, view) => {
        make.centerX.equalTo(view.super);
        make.bottom.equalTo(view.super.safeAreaBottom).inset(2);
      },
      events: {
        changed: (sender, page) => {
          gallery.scrollToPage(page);
        },
      },
    });
    const closeButton = new Image({
      props: {
        symbol: "xmark",
        tintColor: $color("primaryText"),
        userInteractionEnabled: true,
      },
      layout: (make, view) => {
        make.height.width.equalTo(25);
        make.left.inset(25);
        make.top.equalTo(view.super.safeArea).offset(12.5);
      },
      events: {
        tapped: () => $app.close(),
      },
    });
    const logo = new Image({
      props: {
        src: "assets/icon-large.png",
      },
      layout: (make, view) => {
        make.height.width.equalTo(128);
        make.centerX.equalTo(view.super);
        make.centerY.lessThanOrEqualTo(view.super).offset(-200).priority(1000);
        make.centerY.equalTo(view.super).multipliedBy(0.4).priority(999);
      },
    });
    this.rootView.views = [gallery, closeButton, logo, pagecontrol];
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
