import {
  EHSearchTerm,
  TagNamespace,
  tagNamespaceMostUsedAlternateMap,
} from "ehentai-parser";
import { appConfigPath, globalLogLevel, namespaceColor } from "./glv";
import { configManager } from "./config";

const levelMap = {
  debug: -1,
  info: 0,
  warn: 1,
  error: 2,
  fatal: 3,
};

export function appLog(
  message: any,
  level: "debug" | "info" | "warn" | "error" | "fatal" = "info"
) {
  if (levelMap[level] >= levelMap[globalLogLevel]) {
    if (level === "info") {
      console.info(message);
    } else if (level === "warn") {
      console.warn(message);
    } else if (level === "error") {
      console.error(message);
    } else if (level === "fatal") {
      console.error(message);
      const text =
        message instanceof Error
          ? message.name + ": " + message.message
          : message.toString();
      $ui.alert({
        title: "致命错误",
        message: text,
        actions: [
          {
            title: "退出应用",
            handler: () => {
              $app.close();
            },
          },
        ],
      });
    } else {
      console.log(message);
    }
  }
}

/**
 * 清除JSBox的所有Cookie
 */
export function clearCookie() {
  const dataStore = $objc("WKWebsiteDataStore").invoke("defaultDataStore");
  const websiteDataTypes = NSSet.$setWithObject("WKWebsiteDataTypeCookies");
  const dateFrom = $objc("NSDate").$distantPast();
  const handler = $block("void", () => {});
  dataStore.$removeDataOfTypes_modifiedSince_completionHandler(
    websiteDataTypes,
    dateFrom,
    handler
  );
}

// 转化为简易的UTC时间字符串, 返回格式为"yyyy-MM-dd HH:mm"
export function toSimpleUTCTimeString(time: string | Date | number): string {
  if (
    typeof time === "string" &&
    time.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  ) {
    return time.replace("T", " ").slice(0, 16);
  }
  if (typeof time === "string") {
    time = new Date(time);
  } else if (typeof time === "number") {
    time = new Date(time);
  } else {
    time = time;
  }
  const text = time.toISOString().split("T")[0];
  const hours = time.getUTCHours().toString().padStart(2, "0");
  const minutes = time.getUTCMinutes().toString().padStart(2, "0");
  return text + " " + hours + ":" + minutes;
}

// 转化为本地时间字符串, 返回格式为"yyyy-MM-dd HH:mm"
export function toLocalTimeString(time: string | Date | number): string {
  if (typeof time === "string") {
    time = new Date(time);
  } else if (typeof time === "number") {
    time = new Date(time);
  } else {
    time = time;
  }
  const year = time.getFullYear();
  const month = (time.getMonth() + 1).toString().padStart(2, "0");
  const day = time.getDate().toString().padStart(2, "0");
  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 从标题字符串中提取主要内容，规则为去掉前面和后面被括号和中括号包裹的内容
 */
export function extractMainTitle(title: string): string {
  return title
    .replace(/\([^\(\)]+\)/g, "")
    .replace(/\[[^\[\]]+\]/g, "")
    .trim();
}

export function buildSearchTerm(namespace: TagNamespace, name: string): string {
  const abbr = tagNamespaceMostUsedAlternateMap[namespace];
  if (name.includes(" ")) {
    return `${abbr}:"${name}$"`;
  } else {
    return `${abbr}:${name}$`;
  }
}

/**
 * 将searchTerm转化为字符串
 */
export function mapSearchTermToString(searchTerm: EHSearchTerm) {
  const { namespace, qualifier, term, dollar, subtract, tilde } = searchTerm;
  let text = "";
  if (namespace) {
    const translation = configManager.translate(namespace, term);
    text =
      translation || `${tagNamespaceMostUsedAlternateMap[namespace]}:${term}`;
  } else {
    text = term;
  }
  if (qualifier) text = `${qualifier}:${text}`;
  if (dollar) text += "$";
  if (tilde) text = `~${text}`;
  if (subtract) text = `-${text}`;
  return text;
}

/**
 * 获取UTF-8编码的字符串长度
 */
export function getUtf8Length(str: string) {
  let utf8Length = 0;
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);
    if (codePoint <= 0x7f) {
      utf8Length += 1;
    } else if (codePoint <= 0x7ff) {
      utf8Length += 2;
    } else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      // Handling surrogate pairs (for characters outside the Basic Multilingual Plane)
      i++; // Skip the next code unit (low surrogate)
      utf8Length += 4;
    } else {
      utf8Length += 3;
    }
  }
  return utf8Length;
}

/**
 * 裁剪图片
 */
export function cropImageData(
  imageData: NSData,
  image: UIImage | undefined,
  rect: JBRect
): NSData {
  if (!image) {
    console.error("cropImageData: image is nil");
    return imageData;
  }
  if (image.size.width === rect.width && image.size.height === rect.height) {
    return imageData;
  }

  if (rect.x === 0 && rect.y === 0) {
    const s1 = $imagekit.cropTo(image, $size(rect.width, rect.height), 0);
    return s1.jpg(1);
  } else {
    const s1 = $imagekit.cropTo(
      image,
      $size(rect.width + rect.x, rect.height + rect.y),
      0
    );
    const s2 = $imagekit.cropTo(s1, $size(rect.width, rect.height), 5);
    return s2.jpg(1);
  }
}

/**
 * 检测某个名称是否匹配某个gid
 * 具体规则：
 * 1. 用 GID 命名，例如`1049306`，可以带上分辨率标识，例如`1049306-780x`
 * 2. 在名字末尾加上用方括号包裹的 GID，例如`水無月のほんとのチカラっ![1049306]`
 * 可以带上分辨率标识。例如`水無月のほんとのチカラっ![1049306-780x]`
 */
export function isNameMatchGid(name: string, gid: number): boolean {
  // 1. 用 GID 命名，例如`1049306`，可以带上分辨率标识，例如`1049306-780x`
  const regex = new RegExp(`^${gid}(?:-[0-9]+x)?$`);
  if (regex.test(name)) return true;
  // 2. 在名字末尾加上用方括号包裹的 GID，例如`水無月のほんとのチカラっ![1049306]`
  // 可以带上分辨率标识。例如`水無月のほんとのチカラっ![1049306-780x]`
  // 首先提取最后一个方括号中的内容
  if (!name.endsWith("]")) return false;
  const index = name.lastIndexOf("[");
  if (index === -1) return false;
  const match = name.slice(index + 1, -1);
  if (regex.test(match)) return true;
  return false;
}

/**
 * 检测GitHub更新
 */
export function getLatestVersion() {
  const current_version = JSON.parse($file.read(appConfigPath).string || "")
    .info.version as string;
  $http.get({
    url: "https://api.github.com/repos/Gandum2077/JSEhViewer/releases/latest",
    timeout: 10,
    handler: (resp) => {
      if (resp.data && resp.response && resp.response.statusCode === 200) {
        const info = resp.data;
        const latest_version = info?.tag_name;
        const browser_download_url = info?.assets?.at(0)?.browser_download_url;
        if (
          browser_download_url &&
          latest_version &&
          current_version !== latest_version
        ) {
          $ui.alert({
            title: "发现新版本",
            actions: [
              {
                title: "一键更新",
                handler: () => {
                  $app.close(1);
                  $app.openURL(
                    "http://xteko.com/redir?name=JSEhViewer&url=" +
                      $text.URLEncode(browser_download_url)
                  );
                },
              },
              {
                title: "GitHub",
                handler: () => {
                  $app.openURL(
                    JSON.parse($file.read(appConfigPath).string || "").info.url
                  );
                },
              },
              {
                title: "取消",
                style: $alertActionType.cancel,
              },
            ],
          });
        }
      }
    },
  });
}
