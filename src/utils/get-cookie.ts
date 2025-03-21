// 为了绕过人机识别系统验证，使用WebView登录
// 服务于: welcome.ts

import { ParsedCookie } from "ehentai-parser";
import { Web, ContentView, DialogSheet, SymbolButton } from "jsbox-cview";
import { appLog } from "./tools";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1";

function getAllCookies(webView: UIWebView): Promise<ParsedCookie[]> {
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
          let domain = n.$domain().jsValue();
          if (typeof domain !== "string") domain = undefined;
          let path = n.$path().jsValue();
          if (typeof path !== "string") path = undefined;
          let expires = n.$expiresDate().jsValue();
          if (typeof expires !== "object" || !("getTime" in expires)) {
            expires = undefined;
          } else {
            expires = (expires as Date).toUTCString();
          }
          let version = n.$version();
          if (typeof version !== "number") version = undefined;
          let SessionOnly = n.$sessionOnly();
          if (typeof SessionOnly !== "boolean") SessionOnly = undefined;
          let HttpOnly = n.$HTTPOnly();
          if (typeof HttpOnly !== "boolean") HttpOnly = undefined;
          let Secure = n.$secure();
          if (typeof Secure !== "boolean") Secure = undefined;
          return {
            name: n.$name().jsValue(),
            value: n.$value().jsValue(),
            domain,
            path,
            expires,
            version,
            SessionOnly,
            HttpOnly,
            Secure,
          };
        })
      );
    });
    httpCookieStore.$getAllCookies_(handler);
  });
}

function presentSheet(url: string): Promise<ParsedCookie[]> {
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
        if (sender.url === "https://e-hentai.org/bounce_login.php?b=d&bt=1-1" || sender.url.includes("&act=Login")) {
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

export async function getCookie(exhentai = true): Promise<ParsedCookie[]> {
  const url = "https://e-hentai.org/home.php";
  const cookies = await presentSheet(url);
  const cookie_ipb_member_id = cookies.find((cookie) => cookie.name === "ipb_member_id");
  const cookie_ipb_pass_hash = cookies.find((cookie) => cookie.name === "ipb_pass_hash");
  if (!cookie_ipb_member_id || !cookie_ipb_pass_hash) throw new Error("网页登录失败, 未能获取到必要的Cookie");
  if (exhentai) {
    const resp = await $http.get({
      url: "https://exhentai.org",
      header: {
        "User-Agent": UA,
        Cookie: assembleCookieString([
          { name: "ipb_member_id", value: cookie_ipb_member_id.value },
          { name: "ipb_pass_hash", value: cookie_ipb_pass_hash.value },
          { name: "yay", value: "louder" },
        ]),
      },
      timeout: 30,
    });
    if (resp.error || resp.response.statusCode !== 200 || !(resp.data as string).startsWith("<!DOCTYPE html>")) {
      appLog(resp, "error");
      throw new Error("登录Exhentai失败：未知原因");
    }
    const setCookies = parseSetCookieString(resp.response.headers["Set-Cookie"]);
    // 此处应该是必然有igneous的，否则登录失败，这应该是能否访问Exhentai的标志
    const cookie_igneous = setCookies.find((n) => n.name === "igneous");
    if (!cookie_igneous || cookie_igneous.value.length !== 17) {
      appLog(resp, "error");
      throw new Error(
        "登录Exhentai失败：无法获取里站Cookie。如果你确定账号有里站权限，那可能是因为当前IP地址存在问题，请更换IP再尝试。"
      );
    }
    const resp2 = await $http.get({
      url: "https://exhentai.org/uconfig.php",
      header: {
        "User-Agent": UA,
        Cookie: assembleCookieString([
          { name: "ipb_member_id", value: cookie_ipb_member_id.value },
          { name: "ipb_pass_hash", value: cookie_ipb_pass_hash.value },
          { name: "yay", value: "louder" },
          { name: "igneous", value: cookie_igneous.value },
        ]),
      },
      timeout: 30,
    });
    if (resp2.error || resp2.response.statusCode !== 200) {
      appLog(resp, "error");
      throw new Error("获取Exhentai设置失败");
    }
    const setCookies2 = parseSetCookieString(resp2.response.headers["Set-Cookie"]);
    // 后面这些，只有sk是必然有的，其他的不一定有
    const cookie_sk = setCookies2.find((n) => n.name === "sk");
    const cookie_star = setCookies2.find((n) => n.name === "star");
    const cookie_hath_perks = setCookies2.find((n) => n.name === "hath_perks");
    const parsedCookies: ParsedCookie[] = [
      { name: "ipb_member_id", value: cookie_ipb_member_id.value },
      { name: "ipb_pass_hash", value: cookie_ipb_pass_hash.value },
      {
        name: "igneous",
        value: cookie_igneous.value,
        expires: cookie_igneous.expires,
      },
      { name: "nw", value: "1" },
      { name: "msort", value: "d-d" },
    ];
    if (cookie_sk) {
      parsedCookies.push({ name: "sk", value: cookie_sk.value });
    }
    if (cookie_star) {
      parsedCookies.push({ name: "star", value: cookie_star.value });
    }
    if (cookie_hath_perks) {
      parsedCookies.push({
        name: "hath_perks",
        value: cookie_hath_perks.value,
      });
    }
    return parsedCookies;
  } else {
    const resp = await $http.get({
      url: "https://e-hentai.org/uconfig.php",
      header: {
        "User-Agent": UA,
        Cookie: assembleCookieString([
          { name: "ipb_member_id", value: cookie_ipb_member_id.value },
          { name: "ipb_pass_hash", value: cookie_ipb_pass_hash.value },
        ]),
      },
      timeout: 30,
    });
    if (resp.error || resp.response.statusCode !== 200) {
      appLog(resp, "error");
      throw new Error("获取E-hentai设置失败");
    }
    const setCookie = parseSetCookieString(resp.response.headers["Set-Cookie"]);
    // 后面这些，只有sk是必然有的，其他的不一定有
    const cookie_sk = setCookie.find((n) => n.name === "sk");
    const cookie_hath_perks = setCookie.find((n) => n.name === "hath_perks");
    const parsedCookies: ParsedCookie[] = [
      { name: "ipb_member_id", value: cookie_ipb_member_id.value },
      { name: "ipb_pass_hash", value: cookie_ipb_pass_hash.value },
      { name: "nw", value: "1" },
      { name: "msort", value: "d-d" },
    ];
    if (cookie_sk) {
      parsedCookies.push({ name: "sk", value: cookie_sk.value });
    }
    if (cookie_hath_perks) {
      parsedCookies.push({
        name: "hath_perks",
        value: cookie_hath_perks.value,
      });
    }
    return parsedCookies;
  }
}

function parseSetCookieString(setCookieString: string): ParsedCookie[] {
  return splitCookiesString(setCookieString).map((n) => parseCookieString(n));
}

function assembleCookieString(cookies: { name: string; value?: string }[]) {
  return cookies
    .filter((n) => n.value)
    .map((n) => n.name + "=" + n.value)
    .join("; ");
}

/**
 * 给JSBox擦屁股，将合并的Set-Cookie重新分开
 * @param setCookieStr string
 * @returns string[]
 */
function splitCookiesString(setCookieStr: string): string[] {
  if (!setCookieStr) return [];

  const cookies: string[] = [];
  let currentCookie = "";
  let inExpires = false;

  for (let i = 0; i < setCookieStr.length; i++) {
    const char = setCookieStr[i];

    if (char === ",") {
      // 如果当前处于 expires 属性中（日期中的逗号），则直接加入当前 cookie
      if (inExpires) {
        currentCookie += char;
      } else {
        // 否则认为这是一个 cookie 的分隔符
        cookies.push(currentCookie.trim());
        currentCookie = "";
        // 跳过逗号后面的空格
        while (setCookieStr[i + 1] === " ") {
          i++;
        }
      }
    } else {
      currentCookie += char;
      // 检测是否刚刚开始处理 expires 属性
      if (!inExpires && currentCookie.toLowerCase().endsWith("; expires=")) {
        inExpires = true;
      }
      // 如果在 expires 中，遇到 GMT 表示日期结束，可以退出 expires 状态
      if (inExpires && currentCookie.indexOf("GMT") !== -1) {
        inExpires = false;
      }
    }
  }

  if (currentCookie) {
    cookies.push(currentCookie.trim());
  }

  return cookies;
}

/**
 * 将单个的setCookie分解为格式化的数据
 * @param cookieStr string
 * @returns ParsedCookie
 */
function parseCookieString(cookieStr: string): ParsedCookie {
  // 将单个 cookie 字符串以分号拆分成各部分
  const parts = cookieStr.split(";").map((part) => part.trim());
  const [nameValue, ...attributes] = parts;
  // 考虑 cookie value 可能包含 '=' 号
  const [name, ...valueParts] = nameValue.split("=");
  const value: string = valueParts.join("=");
  const cookieObj: ParsedCookie = { name, value };

  // 解析其他属性（例如 expires、path、domain 等）
  attributes.forEach((attr) => {
    const [key, ...rest] = attr.split("=");
    const keyLower: string = key.trim().toLowerCase();
    const val: string = rest.join("=").trim();

    switch (keyLower) {
      case "domain":
        if (val) {
          cookieObj.domain = val;
        }
        break;
      case "path":
        if (val) {
          cookieObj.path = val;
        }
        break;
      case "version":
        if (val) {
          cookieObj.version = parseInt(val);
        }
        break;
      case "sessiononly":
        if (val) {
          cookieObj.SessionOnly = true;
        }
        break;
      case "secure":
        cookieObj.Secure = true;
        break;
      case "httponly":
        cookieObj.HttpOnly = true;
        break;
      default:
        // 其它未知属性可忽略或按需处理
        break;
    }
  });

  return cookieObj;
}
