// 为了绕过人机识别系统验证，使用WebView登录
// 服务于: welcome.ts

import { ParsedCookie } from "ehentai-parser";
import { ContentView, DialogSheet, SymbolButton, PreferenceSection, formDialog, OCWebView } from "jsbox-cview";
import { appLog } from "./tools";

function getAllCookies(webView: any): Promise<ParsedCookie[]> {
  return new Promise((resolve, reject) => {
    const httpCookieStore = webView.invoke("configuration").invoke("websiteDataStore").invoke("httpCookieStore");
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
  let cookies: ParsedCookie[] = [];
  const chevronLeftButton = new SymbolButton({
    props: {
      symbol: "chevron.left",
      enabled: false,
      tintColor: $color("systemGray5"),
    },
    events: {
      tapped: (sender) => webView.goBack(),
    },
  });
  const chevronRightButton = new SymbolButton({
    props: {
      symbol: "chevron.right",
      enabled: false,
      tintColor: $color("systemGray5"),
    },
    events: {
      tapped: (sender) => webView.goForward(),
    },
  });
  const loadButton = new SymbolButton({
    props: {
      symbol: "arrow.counterclockwise",
    },
    events: {
      tapped: (sender) => {
        if (flagLoading) webView.stopLoading();
        else webView.reload();
      },
    },
  });
  const shareButton = new SymbolButton({
    props: {
      symbol: "square.and.arrow.up",
    },
    events: {
      tapped: (sender) => $share.sheet(webView.url),
    },
  });
  const startLoading = () => {
    if (webView.canGoBack) {
      chevronLeftButton.view.enabled = true;
      chevronLeftButton.tintColor = $color("primaryText");
    } else {
      chevronLeftButton.view.enabled = false;
      chevronLeftButton.tintColor = $color("systemGray5");
    }
    if (webView.canGoForward) {
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
    if (webView.canGoBack) {
      chevronLeftButton.view.enabled = true;
      chevronLeftButton.tintColor = $color("primaryText");
    } else {
      chevronLeftButton.view.enabled = false;
      chevronLeftButton.tintColor = $color("systemGray5");
    }
    if (webView.canGoForward) {
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
        layout: (make, view) => {
          make.top.bottom.equalTo(view.super.safeArea);
          make.left.right.equalTo(view.super.safeArea).inset(25);
        },
      },
      {
        type: "view",
        props: {
          bgcolor: $color("separator"),
        },
        layout: (make, view) => {
          make.height.equalTo(1 / $device.info.screen.scale);
          make.top.left.right.inset(0);
        },
      },
    ],
  });
  const webView = new OCWebView({
    props: {
      url,
    },
    layout: (make, view) => {
      make.bottom.equalTo(view.prev.top);
      make.top.left.right.equalTo(view.super.safeArea);
    },
    events: {
      didStart: () => startLoading(),
      didFinish: async (sender) => {
        stopLoading();
        cookies = await getAllCookies(sender);
        if (
          cookies.find((cookie) => cookie.name === "ipb_member_id") &&
          cookies.find((cookie) => cookie.name === "ipb_pass_hash")
        ) {
          sheet.title = "已登录，请稍等";
          $delay(1.5, () => sheet.done());
        }
      },
      didFail: () => stopLoading(),
    },
  });

  const view = new ContentView({
    props: {
      bgcolor: $color("tertiarySurface"),
    },
    views: [footerbar.definition, webView.definition],
  });

  const sheet = new DialogSheet({
    title: "请登录",
    cview: view,
    doneHandler: () => {
      return cookies;
    },
  });
  return new Promise((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}

/**
 * 手动输入Cookie。探出一个Sheet让用户输入
 * @param exhentai boolean
 * @returns ParsedCookie[]
 */
async function manualSetCookie(exhentai: boolean): Promise<ParsedCookie[]> {
  const sections: PreferenceSection[] = [
    {
      title: "",
      rows: [
        {
          type: "string",
          title: "ipb_member_id",
          key: "ipb_member_id",
          value: "",
        },
        {
          type: "string",
          title: "ipb_pass_hash",
          key: "ipb_pass_hash",
          value: "",
        },
      ],
    },
  ];
  if (exhentai) {
    sections[0].rows.push({
      type: "string",
      title: "igneous",
      key: "igneous",
      value: "",
    });
  }
  const values = await formDialog({
    sections,
    title: "手动输入Cookie",
    checkHandler: (values) => {
      const ipb_member_id = values["ipb_member_id"] as string;
      const ipb_pass_hash = values["ipb_pass_hash"] as string;
      if (!ipb_member_id || !ipb_pass_hash || (exhentai && !values["igneous"])) {
        $ui.alert({
          title: "错误",
          message: "请填写所有项目",
        });
        return false;
      }
      if (!ipb_member_id.match(/^\d+$/)) {
        $ui.alert({
          title: "错误",
          message: "ipb_member_id格式不正确，应为纯数字",
        });
        return false;
      }
      if (!ipb_pass_hash.match(/^[a-f0-9]{32}$/)) {
        $ui.alert({
          title: "错误",
          message: "ipb_pass_hash格式不正确，应为32位小写字母和数字的组合",
        });
        return false;
      }
      if (exhentai && !(values["igneous"] as string).match(/^[a-z0-9]{17}$/)) {
        $ui.alert({
          title: "错误",
          message: "igneous格式不正确，应为17位小写字母和数字的组合",
        });
        return false;
      }
      return true;
    },
  });
  const cookies: ParsedCookie[] = [
    { name: "ipb_member_id", value: values["ipb_member_id"] as string },
    { name: "ipb_pass_hash", value: values["ipb_pass_hash"] as string },
  ];
  if (exhentai) {
    cookies.push({ name: "igneous", value: values["igneous"] as string });
  }
  return cookies;
}

export async function getCookie({
  exhentai,
  isManualCookieInput,
}: {
  exhentai: boolean;
  isManualCookieInput: boolean;
}): Promise<ParsedCookie[]> {
  const url = "https://e-hentai.org/home.php";
  const cookies = isManualCookieInput ? await manualSetCookie(exhentai) : await presentSheet(url);
  const cookie_ipb_member_id = cookies.find((cookie) => cookie.name === "ipb_member_id");
  const cookie_ipb_pass_hash = cookies.find((cookie) => cookie.name === "ipb_pass_hash");
  if (!cookie_ipb_member_id || !cookie_ipb_pass_hash) throw new Error("网页登录失败, 未能获取到必要的Cookie");
  if (exhentai) {
    let cookie_igneous: ParsedCookie | undefined;
    if (isManualCookieInput) {
      cookie_igneous = cookies.find((cookie) => cookie.name === "igneous");
    } else {
      const resp = await $http.get({
        url: "https://exhentai.org",
        header: {
          Cookie: assembleCookieString([
            { name: "ipb_member_id", value: cookie_ipb_member_id.value },
            { name: "ipb_pass_hash", value: cookie_ipb_pass_hash.value },
            { name: "yay", value: "louder" },
          ]),
        },
        timeout: 30,
      });
      if (resp.error) {
        appLog(resp, "error");
        throw new Error("网络错误: " + resp.error.localizedDescription);
      } else if (resp.response.statusCode !== 200) {
        appLog(resp, "error");
        throw new Error("登录里站失败: 状态码" + resp.response.statusCode);
      } else if (!(resp.data as string).startsWith("<!DOCTYPE html>")) {
        appLog(resp, "error");
        throw new Error("访问里站未返回内容。如果你确定账号有里站权限，可能是因为当前IP地址被风控，请更换IP再尝试。");
      }
      const setCookies = parseSetCookieString(resp.response.headers["Set-Cookie"]);
      cookie_igneous = setCookies.find((n) => n.name === "igneous");
      if (!cookie_igneous || cookie_igneous.value.length !== 17) {
        appLog(resp, "error");
        throw new Error("无法获取里站Cookie。如果你确定账号有里站权限，可能是因为当前IP地址被风控，请更换IP再尝试。");
      }
    }
    // 此处应该是必然有igneous的，否则登录失败，这应该是能否访问Exhentai的标志
    if (!cookie_igneous) {
      throw new Error("登录失败, 未能获取到必要的Cookie");
    }
    const resp2 = await $http.get({
      url: "https://exhentai.org/uconfig.php",
      header: {
        Cookie: assembleCookieString([
          { name: "ipb_member_id", value: cookie_ipb_member_id.value },
          { name: "ipb_pass_hash", value: cookie_ipb_pass_hash.value },
          { name: "yay", value: "louder" },
          { name: "igneous", value: cookie_igneous.value },
        ]),
      },
      timeout: 30,
    });
    if (resp2.error || resp2.response.statusCode !== 200 || resp2.response.url.indexOf("/uconfig.php") === -1) {
      appLog(resp2, "error");
      throw new Error("获取网页端设置失败");
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
        Cookie: assembleCookieString([
          { name: "ipb_member_id", value: cookie_ipb_member_id.value },
          { name: "ipb_pass_hash", value: cookie_ipb_pass_hash.value },
        ]),
      },
      timeout: 30,
    });
    if (resp.error || resp.response.statusCode !== 200 || resp.response.url.indexOf("/uconfig.php") === -1) {
      appLog(resp, "error");
      throw new Error("获取网页端设置失败");
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
