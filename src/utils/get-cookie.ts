// 为了绕过人机识别系统验证，使用WebView登录
// 服务于: welcome.ts

import { Web, ContentView, DialogSheet, SymbolButton } from "jsbox-cview";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1";

interface CookiesItem {
  domain: string;
  path: string;
  version: number;
  sessionOnly: boolean;
  name: string;
  value: string;
  HTTPOnly: boolean;
  secure: boolean;
}

function getAllCookies(webView: UIWebView): Promise<CookiesItem[]> {
  return new Promise((resolve, reject) => {
    const httpCookieStore = webView
      .ocValue()
      .invoke("configuration")
      .invoke("websiteDataStore")
      .invoke("httpCookieStore");
    const handler = $block("void, NSArray *", function (array: any) {
      const list = [];
      const length = array.$count();
      for (let index = 0; index < length; index++) {
        const element = array.$objectAtIndex_(index);
        list.push(element);
      }
      resolve(
        list.map((n) => {
          return {
            domain: n.$domain().jsValue(),
            path: n.$path().jsValue(),
            version: n.$version(),
            sessionOnly: n.$sessionOnly(),
            name: n.$name().jsValue(),
            value: n.$value().jsValue(),
            HTTPOnly: n.$HTTPOnly(),
            secure: n.$secure(),
          };
        })
      );
    });
    httpCookieStore.$getAllCookies_(handler);
  });
}

function presentSheet(url: string): Promise<CookiesItem[]> {
  let flagLoading = false;
  const chevronLeftButton = new SymbolButton({
    props: {
      symbol: "chevron.left",
      enabled: false,
      tintColor: $color("systemGray5"),
    },
    events: {
      tapped: (sender) => webView.view.goBack(),
    },
  });
  const chevronRightButton = new SymbolButton({
    props: {
      symbol: "chevron.right",
      enabled: false,
      tintColor: $color("systemGray5"),
    },
    events: {
      tapped: (sender) => webView.view.goForward(),
    },
  });
  const loadButton = new SymbolButton({
    props: {
      symbol: "arrow.counterclockwise",
    },
    events: {
      tapped: (sender) => {
        if (flagLoading) webView.view.stopLoading();
        else webView.view.reload();
      },
    },
  });
  const shareButton = new SymbolButton({
    props: {
      symbol: "square.and.arrow.up",
    },
    events: {
      tapped: (sender) => $share.sheet(webView.view.url),
    },
  });
  const startLoading = () => {
    if (webView.view.canGoBack) {
      chevronLeftButton.view.enabled = true;
      chevronLeftButton.tintColor = $color("primaryText");
    } else {
      chevronLeftButton.view.enabled = false;
      chevronLeftButton.tintColor = $color("systemGray5");
    }
    if (webView.view.canGoForward) {
      chevronRightButton.view.enabled = true;
      chevronRightButton.tintColor = $color("primaryText");
    } else {
      chevronRightButton.view.enabled = false;
      chevronRightButton.tintColor = $color("systemGray5");
    }
    flagLoading = true;
    loadButton.symbol = "xmark";
  };
  const stopLoading = () => {
    if (webView.view.canGoBack) {
      chevronLeftButton.view.enabled = true;
      chevronLeftButton.tintColor = $color("primaryText");
    } else {
      chevronLeftButton.view.enabled = false;
      chevronLeftButton.tintColor = $color("systemGray5");
    }
    if (webView.view.canGoForward) {
      chevronRightButton.view.enabled = true;
      chevronRightButton.tintColor = $color("primaryText");
    } else {
      chevronRightButton.view.enabled = false;
      chevronRightButton.tintColor = $color("systemGray5");
    }
    flagLoading = false;
    loadButton.symbol = "arrow.counterclockwise";
  };
  const footerbar = new ContentView({
    props: {
      bgcolor: $color("tertiarySurface"),
    },
    layout: (make, view) => {
      make.left.right.bottom.inset(0);
      make.top.equalTo(view.super.safeAreaBottom).inset(-50);
    },
    views: [
      {
        type: "stack",
        props: {
          axis: $stackViewAxis.horizontal,
          distribution: $stackViewDistribution.equalSpacing,
          stack: {
            views: [
              chevronLeftButton.definition,
              chevronRightButton.definition,
              loadButton.definition,
              shareButton.definition,
            ],
          },
        },
        layout: $layout.fillSafeArea,
      },
    ],
  });
  const webView = new Web({
    props: {
      url,
    },
    layout: (make, view) => {
      make.bottom.equalTo(footerbar.view.top);
      make.top.left.right.equalTo(view.super.safeArea);
    },
    events: {
      decideNavigation: (sender, action) => {
        if (action.type === 0) {
          sender.url = action.requestURL;
          return false;
        }
        return true;
      },
      didReceiveServerRedirect: (sender, navigation) => {
        if (
          sender.url === "https://e-hentai.org/bounce_login.php?b=d&bt=1-1" ||
          sender.url.includes("&act=Login")
        ) {
          sheet.title = "请登录";
        }
      },
      didStart: (sender, navigation) => startLoading(),
      didFinish: async (sender, navigation) => {
        stopLoading();
        const cookies = await getAllCookies(sender);
        if (
          cookies.find((cookie) => cookie.name === "ipb_member_id") &&
          cookies.find((cookie) => cookie.name === "ipb_pass_hash")
        ) {
          sheet.title = "已登录，请稍等";
          $delay(1.5, () => sheet.done());
        }
      },
      didFail: (sender, navigation, error) => stopLoading(),
    },
  });

  const view = new ContentView({
    props: {
      bgcolor: $color("secondarySurface"),
    },
    views: [footerbar.definition, webView.definition],
  });

  const sheet = new DialogSheet({
    title: "请稍等",
    presentMode: 1,
    cview: view,
    doneHandler: () => getAllCookies(webView.view),
  });
  return new Promise((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}

export async function getCookie(exhentai = true): Promise<string> {
  const url = "https://e-hentai.org/home.php";
  const cookies = await presentSheet(url);
  const ipb_member_id = cookies.find(
    (cookie) => cookie.name === "ipb_member_id"
  )?.value;
  const ipb_pass_hash = cookies.find(
    (cookie) => cookie.name === "ipb_pass_hash"
  )?.value;
  if (!ipb_member_id || !ipb_pass_hash)
    throw new Error("网页登录失败, 未能获取到必要的Cookie");
  if (exhentai) {
    const resp = await $http.get({
      url: "https://exhentai.org",
      header: {
        "User-Agent": UA,
        Cookie: assembleCookieString([
          { name: "ipb_member_id", value: ipb_member_id },
          { name: "ipb_pass_hash", value: ipb_pass_hash },
          { name: "yay", value: "louder" },
        ]),
      },
      timeout: 30,
    });
    if (
      resp.error ||
      resp.response.statusCode !== 200 ||
      !(resp.data as string).startsWith("<!DOCTYPE html>")
    )
      throw new Error("登录Exhentai失败");
    const setCookie = parseSetCookieString(resp.response.headers["Set-Cookie"]);
    // 此处应该是必然有igneous的，否则登录失败，这应该是能否访问Exhentai的标志
    const igneous = setCookie.find((n) => n.name === "igneous")?.value;
    if (!igneous) throw new Error("登录Exhentai失败");
    const resp2 = await $http.get({
      url: "https://exhentai.org/uconfig.php",
      header: {
        "User-Agent": UA,
        Cookie: assembleCookieString([
          { name: "ipb_member_id", value: ipb_member_id },
          { name: "ipb_pass_hash", value: ipb_pass_hash },
          { name: "yay", value: "louder" },
          { name: "igneous", value: igneous },
        ]),
      },
      timeout: 30,
    });
    if (resp2.error || resp2.response.statusCode !== 200)
      throw new Error("获取Exhentai设置失败");
    const setCookie2 = parseSetCookieString(
      resp2.response.headers["Set-Cookie"]
    );
    // 后面这些，只有sk是必然有的，其他的不一定有
    const sk = setCookie2.find((n) => n.name === "sk")?.value;
    const star = setCookie2.find((n) => n.name === "star")?.value;
    const hath_perks = setCookie2.find((n) => n.name === "hath_perks")?.value;
    return assembleCookieString([
      { name: "ipb_member_id", value: ipb_member_id },
      { name: "ipb_pass_hash", value: ipb_pass_hash },
      { name: "yay", value: "louder" },
      { name: "igneous", value: igneous },
      { name: "sk", value: sk },
      { name: "star", value: star },
      { name: "hath_perks", value: hath_perks },
    ]);
  } else {
    const resp = await $http.get({
      url: "https://e-hentai.org/uconfig.php",
      header: {
        "User-Agent": UA,
        Cookie: assembleCookieString([
          { name: "ipb_member_id", value: ipb_member_id },
          { name: "ipb_pass_hash", value: ipb_pass_hash },
        ]),
      },
      timeout: 30,
    });
    const setCookie = parseSetCookieString(resp.response.headers["Set-Cookie"]);
    // 后面这些，只有sk是必然有的，其他的不一定有
    const sk = setCookie.find((n) => n.name === "sk")?.value;
    const hath_perks = setCookie.find((n) => n.name === "hath_perks")?.value;
    return assembleCookieString([
      { name: "ipb_member_id", value: ipb_member_id },
      { name: "ipb_pass_hash", value: ipb_pass_hash },
      { name: "sk", value: sk },
      { name: "hath_perks", value: hath_perks },
      { name: "nw", value: "1" },
    ]);
  }
}

function parseSetCookieString(setCookieString: string) {
  return setCookieString.split(", ").map((n) => {
    const [name, value] = n.split(";")[0].split("=");
    return { name, value };
  });
}

function assembleCookieString(cookies: { name: string; value?: string }[]) {
  return cookies
    .filter((n) => n.value)
    .map((n) => n.name + "=" + n.value)
    .join("; ");
}
