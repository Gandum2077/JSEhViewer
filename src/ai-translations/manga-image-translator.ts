import { AITranslationConfig } from "../types";

const description = `# Image/Manga Translator
[manga-image-translator](https://github.com/zyddnys/manga-image-translator)是一个自动翻译并嵌字的项目。

请参考 GitHub 项目的说明进行本地部署，推荐用 Docker 进行部署。

请注意：
- Papago 无需额外配置即可使用。
- 其他的在线翻译服务需要在环境变量中设置 API Key 或其他参数，具体请参考官方文档。
- 首次使用某个离线模型，会先下载该模型，这可能需要较长时间。建议先在本地模式运行一次，来完成模型的下载。`;

const langMap = new Map([
  ["CHS", "简体中文"],
  ["CHT", "繁體中文"],
  ["JPN", "日本語"],
  ["ENG", "English"],
  ["KOR", "한국어"],
  ["VIN", "Tiếng Việt"],
  ["CSY", "čeština"],
  ["NLD", "Nederlands"],
  ["FRA", "français"],
  ["DEU", "Deutsch"],
  ["HUN", "magyar nyelv"],
  ["ITA", "italiano"],
  ["PLK", "polski"],
  ["PTB", "português"],
  ["ROM", "limba română"],
  ["RUS", "русский язык"],
  ["ESP", "español"],
  ["TRK", "Türk dili"],
  ["IND", "Indonesia"],
]);

const translators = [
  "youdao",
  "baidu",
  "deepl",
  "papago",
  "caiyun",
  "gpt3.5",
  "gpt4",
  "sakura",
  "deepseek",
  "ollama",
  "offline",
  "sugoi",
  "m2m100",
  "m2m100_big",
  "none",
  "original",
];

export const config: AITranslationConfig = {
  name: "manga-image-translator",
  title: "manga-image-translator",
  link: "https://github.com/zyddnys/manga-image-translator",
  description,
  rows: [
    {
      type: "string",
      title: "HOST",
      key: "host",
      value: "192.168.1.1",
    },
    {
      type: "integer",
      title: "PORT",
      key: "port",
      min: 1,
      max: 65535,
      value: 5003,
    },
    {
      type: "boolean",
      title: "HTTPS",
      key: "https",
      value: false,
    },
    {
      type: "list",
      title: "翻译服务",
      key: "translator",
      items: translators,
      value: 3,
    },
    {
      type: "list",
      title: "目标语言",
      key: "target_lang",
      items: Array.from(langMap.values()),
      value: 0,
    },
    {
      type: "list",
      title: "检测器",
      key: "detector",
      items: ["默认", "CTD"],
      value: 0,
    },
    {
      type: "list",
      title: "检测尺寸",
      key: "detection_size",
      items: ["1024", "1536", "2048", "2560"],
      value: 1,
    },
    {
      type: "list",
      title: "文字方向",
      key: "direction",
      items: ["自动", "水平", "垂直"],
      value: 0,
    },
  ],
};

export async function translate(
  config: {
    host: string;
    port: number;
    https: boolean;
    translator: number;
    target_lang: number;
    detector: number;
    detection_size: number;
    direction: number;
  },
  imageData: NSData
): Promise<NSData> {
  const payload = {
    config: JSON.stringify({
      detector: {
        detector: ["default", "ctd"][config.detector],
        detection_size: [1024, 1536, 2048, 2560][config.detection_size],
      },
      render: {
        direction: ["auto", "horizontal", "vertical"][config.direction],
      },
      translator: {
        translator: translators[config.translator],
        target_lang: Array.from(langMap.keys())[config.target_lang],
      },
    }),
  };

  const r = await $http.post({
    url: `${config.https ? "https" : "http"}://${config.host}:${config.port}/translate/with-form/image/stream`,
    form: payload,
    files: [
      {
        data: imageData,
        name: "image",
      },
    ],
  });
  const ba = r.rawData.byteArray;

  const startIndex = ba.findIndex((n) => n === 137); //0x89

  const pngFileMagicBytes = [137, 80, 78, 71, 13, 10, 26, 10];
  if (startIndex !== -1 && !ba.slice(startIndex, startIndex + 8).find((n, x) => n !== pngFileMagicBytes[x])) {
    return $data({
      byteArray: ba.slice(startIndex),
    });
  } else {
    throw new Error("No image data in response");
  }
}
