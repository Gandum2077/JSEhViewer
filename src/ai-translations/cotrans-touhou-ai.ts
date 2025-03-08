import { AITranslationConfig } from "../types";

const description = `# Cotrans
[manga-image-translator](https://github.com/zyddnys/manga-image-translator)是一个自动翻译并嵌字的项目，[cotrans.touhou.ai](https://cotrans.touhou.ai/)是它的官方演示站点。

请注意，此服务在多人同时使用时需要排队等待，如果当前等待数量过多会失败。建议有条件的用户使用[manga-image-translator](https://github.com/zyddnys/manga-image-translator)自行搭建服务。

此服务不支持并发请求。

请支持该项目：

- Ko-fi: <https://ko-fi.com/voilelabs>
- Patreon: <https://www.patreon.com/voilelabs>
- 爱发电: <https://afdian.net/@voilelabs>
`;

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
]);

const detectionSizeMap = new Map([
  ["S", "1024px"],
  ["M", "1536px"],
  ["L", "2048px"],
  ["X", "2560px"],
]);

const detectorMap = new Map([
  ["default", "Default"],
  ["ctd", "Comic Text Detector"],
]);

const directionMap = new Map([
  ["default", "Follow language"],
  ["auto", "Follow image"],
  ["h", "All horizontal"],
  ["v", "All vertical"],
]);

const translators = new Map([
  ["none", "Remove text"],
  ["gpt3.5", "GPT-3.5"],
  ["youdao", "Youdao"],
  ["baidu", "Baidu"],
  ["google", "Google"],
  ["deepl", "DeepL"],
  ["papago", "Papago"],
  ["offline", "Sugoi / M2M100"],
  ["original", "Untranslated"],
]);

export const config: AITranslationConfig = {
  name: "cotrans.touhou.ai",
  title: "cotrans.touhou.ai",
  link: "https://cotrans.touhou.ai",
  description,
  rows: [
    {
      type: "list",
      title: "Language",
      key: "target_language",
      items: Array.from(langMap.values()),
      value: 0,
    },
    {
      type: "list",
      title: "Detection Resolution",
      key: "size",
      items: Array.from(detectionSizeMap.values()),
      value: 1,
    },
    {
      type: "list",
      title: "Text Detector",
      key: "detector",
      items: Array.from(detectorMap.values()),
      value: 0,
    },
    {
      type: "list",
      title: "Text Direction",
      key: "direction",
      items: Array.from(directionMap.values()),
      value: 0,
    },
    {
      type: "list",
      title: "Translator",
      key: "translator",
      items: Array.from(translators.values()),
      value: 1,
    },
  ],
};

export async function translate(
  config: {
    target_language: number;
    size: number;
    detector: number;
    direction: number;
    translator: number;
  },
  imageData: NSData
) {
  const target_language = Array.from(langMap.keys())[config.target_language];
  const size = Array.from(detectionSizeMap.keys())[config.size];
  const detector = Array.from(detectorMap.keys())[config.detector];
  const direction = Array.from(directionMap.keys())[config.direction];
  const translator = Array.from(translators.keys())[config.translator];
  const uploadUrl = "https://api.cotrans.touhou.ai/task/upload/v1";
  const ext = imageData.info.mimeType.split("/")[1];
  const resp = await $http.post({
    url: uploadUrl,
    files: [
      {
        data: imageData,
        name: "file",
        filename: "image." + ext,
      },
    ],
    form: {
      target_language,
      detector,
      direction,
      translator,
      size,
    },
  });
  if (resp.error) throw new Error("Fail to upload image");
  const data = resp.data;
  if ("id" in data) {
    await $wait(10);
    const taskId = data.id;
    const statusUrl = `https://api.cotrans.touhou.ai/task/${taskId}/status/v1`;
    for (let i = 0; i < 4; i++) {
      const statusResp = await $http.get({ url: statusUrl });
      if (statusResp.error) throw new Error("Fail to get task status");
      const statusData = statusResp.data;
      if ("result" in statusData && "translation_mask" in statusData.result) {
        const translation_mask = statusData.result.translation_mask;
        const pngResp = await $http.get({ url: translation_mask });
        if (pngResp.error) throw new Error("Fail to download image");
        const pngData = pngResp.rawData;
        const image1 = imageData.image;
        const image2 = pngData.image;
        if (!image1 || !image2) throw new Error("Fail to download images");
        const combined = $imagekit.combine(image1, image2, 8);
        return combined.jpg(1); // 输出结果不能是$image, 需要转换为$data
      } else {
        await $wait(10);
      }
    }
    throw new Error("Timeout");
  } else {
    throw new Error("Fail to upload image");
  }
}
