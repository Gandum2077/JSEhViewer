import { TagNamespace, tagNamespaceMostUsedAlternateMap } from "ehentai-parser";
import { globalLogLevel } from "./glv";

const levelMap = {
  info: 0,
  warn: 1,
  error: 2,
  fatal: 3
}

export function appLog(message: any, level: "info" | "warn" | "error" | "fatal" = "info") {
  if (levelMap[level] >= levelMap[globalLogLevel]) {
    if (level === "info") {
      console.info(message)
    } else if (level === "warn") {
      console.warn(message)
    } else if (level === "error") {
      console.error(message)
    } else if (level === "fatal") {
      console.error(message)
      const text = message instanceof Error ? message.name + ": " + message.message : message.toString()
      $ui.alert({
        title: "致命错误",
        message: text,
        actions: [{
          title: "退出应用",
          handler: () => {
            $app.close()
          }
        }]
      })
    } else {
      console.log(message)
    }
  }
}

/**
 * 清除JSBox的所有Cookie
 */
export function clearCookie() {
  const dataStore = $objc("WKWebsiteDataStore").invoke("defaultDataStore")
  const websiteDataTypes = NSSet.$setWithObject("WKWebsiteDataTypeCookies")
  const dateFrom = $objc("NSDate").$distantPast()
  const handler = $block("void", () => { });
  dataStore.$removeDataOfTypes_modifiedSince_completionHandler(websiteDataTypes, dateFrom, handler)
}

// 转化为简易的UTC时间字符串, 返回格式为"yyyy-MM-dd HH:mm"
export function toSimpleUTCTimeString(time: string | Date | number): string {
  if (typeof time === "string" && time.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)) {
    return time.replace("T", " ").slice(0, 16)
  }
  if (typeof time === "string") {
    time = new Date(time)
  } else if (typeof time === "number") {
    time = new Date(time)
  } else {
    time = time
  }
  const text = time.toISOString().split('T')[0]
  const hours = time.getUTCHours().toString().padStart(2, '0');
  const minutes = time.getUTCMinutes().toString().padStart(2, '0');
  return text + " " + hours + ":" + minutes
}

// 转化为本地时间字符串, 返回格式为"yyyy-MM-dd HH:mm"
export function toLocalTimeString(time: string | Date | number): string {
  if (typeof time === "string") {
    time = new Date(time)
  } else if (typeof time === "number") {
    time = new Date(time)
  } else {
    time = time
  }
  const year = time.getFullYear()
  const month = (time.getMonth() + 1).toString().padStart(2, '0')
  const day = time.getDate().toString().padStart(2, '0')
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

/**
 * 从标题字符串中提取主要内容，规则为去掉前面和后面被括号和中括号包裹的内容
 */
export function extractMainTitle(title: string): string {
  return title.replace(/\([^\(\)]+\)/g, "").replace(/\[[^\[\]]+\]/g, "").trim()
}

export function buildSearchTerm(namespace: TagNamespace, name: string): string {
  const abbr = tagNamespaceMostUsedAlternateMap[namespace]
  if (name.includes(" ")) {
    return `${abbr}:"${name}$"`
  } else {
    return `${abbr}:${name}$`
  }
}