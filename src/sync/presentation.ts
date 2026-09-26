import { CloudRecord } from "./store";

const labels: Record<string, string> = {
  title: "标题",
  english_title: "英文标题",
  japanese_title: "日文标题",
  token: "图库标识",
  thumbnail_url: "缩略图",
  category: "分类",
  posted_time: "发布时间",
  visible: "可见",
  length: "页数",
  torrent_available: "有种子",
  uploader: "上传者",
  disowned: "匿名上传",
  comment: "备注",
  first_access_time: "首次阅读",
  last_access_time: "最近访问",
  readlater: "稍后阅读",
  last_read_page: "阅读页",
  favorited: "已收藏",
  favcat: "收藏分类",
  average_rating: "平均评分",
  display_rating: "显示评分",
  is_my_rating: "我的评分",
  pageDirection: "阅读方向",
  spreadModeEnabled: "双页阅读",
  skipFirstPageInSpread: "跳过封面",
  skipLandscapePagesInSpread: "跳过横向页",
  pagingGesture: "翻页手势",
  position_key: "书签排序",
  name: "名称",
  script_text: "翻译脚本",
  config_form: "配置表单",
  config: "服务配置",
  host: "服务器",
  port: "端口",
  https: "HTTPS",
  path: "路径",
  namespace: "标签分类",
  watched: "关注",
  hidden: "隐藏",
  color: "颜色",
  weight: "权重",
  device_id: "设备",
  qualifier: "搜索限定",
  term: "搜索词",
  count: "访问次数",
  gid: "图库",
  page_index: "图片页",
  favorited_at: "收藏时间",
};
const toggles = new Set([
  "visible",
  "torrent_available",
  "disowned",
  "readlater",
  "favorited",
  "is_my_rating",
  "spreadModeEnabled",
  "skipFirstPageInSpread",
  "skipLandscapePagesInSpread",
  "https",
  "watched",
  "hidden",
]);
const values: Record<string, string> = {
  left_to_right: "从左到右",
  right_to_left: "从右到左",
  vertical: "纵向",
  tap_and_swipe: "点击与滑动",
  swipe: "滑动",
  tap: "点击",
};

/** Compact, human-readable preview; the management screen also offers the complete content. */
export function recordPreview(record: Pick<CloudRecord, "tablename" | "deleted" | "content">): string {
  if (record.deleted) return "已删除";
  const content = record.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return "内容格式异常，点击查看完整内容";
  if (record.tablename === "marked_uploaders_v2") return "已标记此上传者";
  return Object.entries(content)
    .map(([key, value]) => {
      if (key === "children" && Array.isArray(value)) {
        const title = record.tablename === "archive_entries_v2" ? "标签" : "搜索词";
        const preview = value
          .slice(0, 8)
          .map((item) => {
            if (!item || typeof item !== "object") return "格式异常";
            return `${item.subtract ? "-" : item.tilde ? "~" : ""}${item.namespace ? item.namespace + ":" : ""}${item.tag ?? item.term ?? ""}${item.dollar ? "$" : ""}`;
          })
          .join("、");
        return `${title}：${preview}${value.length > 8 ? ` 等 ${value.length} 项` : ""}`;
      }
      const text =
        value === null
          ? "未设置"
          : toggles.has(key)
            ? value
              ? "是"
              : "否"
            : (key === "last_read_page" || key === "page_index") && typeof value === "number"
              ? `第 ${value + 1} 页`
              : typeof value === "object"
                ? JSON.stringify(value)
                : (values[String(value)] ?? String(value));
      return `${labels[key] ?? key}：${text.length > 120 ? text.slice(0, 120) + "…" : text}`;
    })
    .join("\n");
}
