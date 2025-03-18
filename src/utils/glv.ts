// 此文件中只定义常量
import { EHCategory, EHSearchedCategory, TagNamespace } from "ehentai-parser";

const debugText = $file.read("assets/debug")?.string;
export const globalLogLevel: "debug" | "info" | "warn" | "error" | "fatal" = debugText === "1" ? "debug" : "info";

export const webdavIntroductionPath = "assets/webdav-introduction.md";
export const databasePath = "assets/database.db";
export const imagePath = "assets/image/";
export const thumbnailPath = "assets/thumbnail/";
export const aiTranslationPath = "assets/ai-translations/";
export const originalImagePath = "assets/original-image/";
export const galleryInfoPath = "assets/info/";
export const tempPath = "assets/temp/";
export const tempZipPath = "assets/temp.zip";
export const appConfigPath = "config.json";

export const logoColorHex = "#5D1215";

export const searchableCategories: EHSearchedCategory[] = [
  "Doujinshi",
  "Manga",
  "Artist CG",
  "Game CG",
  "Western",
  "Non-H",
  "Image Set",
  "Cosplay",
  "Asian Porn",
  "Misc",
];

export const catTranslations: Record<EHCategory, string> = {
  Doujinshi: "同人志",
  Manga: "漫画",
  "Artist CG": "画师CG",
  "Game CG": "游戏CG",
  Western: "西方",
  "Non-H": "非H",
  "Image Set": "图集",
  Cosplay: "Cosplay",
  "Asian Porn": "亚洲色情",
  Misc: "杂项",
  Private: "私有",
};

export const namespaceTranslations: Record<TagNamespace, string> = {
  artist: "艺术家",
  character: "角色",
  cosplayer: "Coser",
  female: "女性",
  group: "社团",
  language: "语言",
  male: "男性",
  mixed: "混合",
  other: "其他",
  parody: "原作",
  reclass: "重分类",
  temp: "临时",
};

export const namespaceOrderList: TagNamespace[] = [
  "language",
  "female",
  "male",
  "mixed",
  "character",
  "parody",
  "artist",
  "group",
  "cosplayer",
  "other",
  "reclass",
  "temp",
];

export const namespaceColor = {
  artist: $color("#E6D6D0", "#5E544E"),
  character: $color("#D5E4F7", "#49677F"),
  cosplayer: $color("#F5D5E5", "#7F4A6B"),
  female: $color("#FAE0D4", "#906F44"),
  group: $color("#DFD6F7", "#615284"),
  language: $color("#F5D5E5", "#7F4A6B"),
  male: $color("#F9EED8", "#968A4A"),
  mixed: $color("#D7D7D6", "#63666A"),
  other: $color("#FBD6D5", "#925554"),
  parody: $color("#D8E6E2", "#487068"),
  reclass: $color("#FBD6D5", "#925554"),
  temp: $color("#D7D7D6", "#63666A"),
};

export const catColor = {
  Doujinshi: $color("#F44336", "#913127"),
  Manga: $color("#FF9800", "#CE7138"),
  "Artist CG": $color("#FBC02D", "#CA913A"),
  "Game CG": $color("#4CAF50", "#739170"),
  Western: $color("#8BC34A", "#A99E68"),
  "Non-H": $color("#2196F3", "#70A8CB"),
  "Image Set": $color("#3F51B5", "#3B5D9D"),
  Cosplay: $color("#9C27B0", "#62399C"),
  "Asian Porn": $color("#9575CD", "#963C7F"),
  Misc: $color("#F06292", "#BC5B7B"),
  Private: $color("#5A5A5D", "#464649"),
};

export const favcatColor = {
  "0": $color("#5F5F5F"),
  "1": $color("#DE1C31"),
  "2": $color("#F97D1C"),
  "3": $color("#F8B500"),
  "4": $color("#2BAE85"),
  "5": $color("#5BAE23"),
  "6": $color("#22A2C3"),
  "7": $color("#1661AB"),
  "8": $color("#9F3EF9"),
  "9": $color("#EC2D7A"),
  a: $color("#B5A4A4"),
};

export const defaultButtonColor = $color("#282C34", "systemLink");

export const tagColor = {
  selected: $color("systemLink"),
  marked: $color("#FFC107", "#FF6F00"),
  watched: $color("#4CAF50", "#1B5E20"),
  hidden: $color("#F44336", "#B71C1C"),
};

// 颜色相比于tagColor更淡，用于标签背景色（文本颜色为primaryText）
export const tagBgcolor = {
  marked: $color("#FFEB3B", "#FFA000"),
  watched: $color("#8AFF8E", "#00A206"),
  hidden: $color("#FF6830", "#DB592A"),
};

export const ratingColor = $color("#7D78F7", "#7D78F7");

export const invisibleCauseMap = {
  expunged: "已删除",
  replaced: "有新版本",
  private: "私有",
  unknown: "未知原因",
};

export const fixedTabSymbolTitle = {
  front_page: {
    symbol: "house.fill",
    title: "首页",
    color: $color("#62399D"),
  },
  watched: {
    symbol: "bell.fill",
    title: "订阅",
    color: $color("#739271"),
  },
  popular: {
    symbol: "flame.fill",
    title: "热门",
    color: $color("red"),
  },
  favorites: {
    symbol: "heart.fill",
    title: "收藏",
    color: $color("orange"),
  },
  toplist: {
    symbol: "chart.bar.fill",
    title: "排行",
    color: $color("#ffd700"),
  },
  upload: {
    symbol: "cloud.fill",
    title: "我的上传",
    color: $color("#5AC8FA"),
  },
};

// 将语言依据 ISO 639-1 转换为二字母缩写
export const languageAbbreviates: Record<string, string> = {
  afrikaans: "af",
  arabic: "ar",
  bulgarian: "bg",
  bengali: "bn",
  tibetan: "bo",
  bosnian: "bs",
  catalan: "ca",
  cree: "cr",
  czech: "cs",
  welsh: "cy",
  danish: "da",
  german: "de",
  greek: "el",
  english: "en",
  esperanto: "eo",
  spanish: "es",
  estonian: "et",
  persian: "fa",
  finnish: "fi",
  french: "fr",
  irish: "ga",
  gujarati: "gu",
  hebrew: "he",
  hindi: "hi",
  croatian: "hr",
  hungarian: "hu",
  armenian: "hy",
  indonesian: "id",
  icelandic: "is",
  italian: "it",
  japanese: "ja",
  javanese: "jv",
  georgian: "ka",
  kazakh: "kk",
  kannada: "kn",
  korean: "ko",
  kurdish: "ku",
  latin: "la",
  lao: "lo",
  latvian: "lv",
  mongolian: "mn",
  marathi: "mr",
  burmese: "my",
  nepali: "ne",
  dutch: "nl",
  norwegian: "no",
  oromo: "om",
  punjabi: "pa",
  polish: "pl",
  pashto: "ps",
  portuguese: "pt",
  romanian: "ro",
  russian: "ru",
  sanskrit: "sa",
  sango: "sg",
  slovak: "sk",
  slovenian: "sl",
  shona: "sn",
  somali: "so",
  albanian: "sq",
  serbian: "sr",
  swedish: "sv",
  swahili: "sw",
  tamil: "ta",
  telugu: "te",
  thai: "th",
  tigrinya: "ti",
  tagalog: "tl",
  turkish: "tr",
  ukrainian: "uk",
  urdu: "ur",
  vietnamese: "vi",
  yiddish: "yi",
  chinese: "zh",
  zulu: "zu",
};

export const languageCustomSort = ["chinese", "english", "korean", "japanese"];

export const languageTagColor = {
  chinese: $color("#DE2910"),
  japanese: $color("#FFC0CB"),
  korean: $color("#FFA500"),
  english: $color("#00247D"),
  other: $color("#808080"),
};
