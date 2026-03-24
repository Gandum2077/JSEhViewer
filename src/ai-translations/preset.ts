export const DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT = `async (imageData, config) => {
  // 在此处编写自定义翻译的逻辑
  // 此函数将使用eval()直接运行，请只修改函数内的部分
  return newImageData;
}`;

export const OLD_CUSTOM_AI_TRANSLATION_SCRIPT = `async (imageData) => {
  // 在此处编写自定义翻译的逻辑
  // 此函数将使用eval()直接运行，请只修改函数内的部分
  return newImageData;
}`;

export const MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG_FORM = `[
  {
    "type": "string",
    "title": "HOST",
    "key": "host",
    "default": "192.168.1.1"
  },
  {
    "type": "integer",
    "title": "PORT",
    "key": "port",
    "min": 1,
    "max": 65535,
    "default": 5003
  },
  {
    "type": "boolean",
    "title": "HTTPS",
    "key": "https",
    "default": false
  },
  {
    "type": "list",
    "title": "翻译服务",
    "key": "translator",
    "items": [
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
      "original"
    ],
    "default": 3
  },
  {
    "type": "list",
    "title": "目标语言",
    "key": "target_lang",
    "items": [
      "简体中文",
      "繁體中文",
      "日本語",
      "English",
      "한국어",
      "Tiếng Việt",
      "čeština",
      "Nederlands",
      "français",
      "Deutsch",
      "magyar nyelv",
      "italiano",
      "polski",
      "português",
      "limba română",
      "русский язык",
      "español",
      "Türk dili",
      "Indonesia"
    ],
    "default": 0
  },
  {
    "type": "list",
    "title": "检测器",
    "key": "detector",
    "items": ["默认", "CTD"],
    "default": 0
  },
  {
    "type": "list",
    "title": "检测尺寸",
    "key": "detection_size",
    "items": ["1024", "1536", "2048", "2560"],
    "default": 1
  },
  {
    "type": "list",
    "title": "文字方向",
    "key": "direction",
    "items": ["自动", "水平", "垂直"],
    "default": 0
  }
]`;

export const MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG = {
  host: "192.168.1.1",
  port: 5003,
  https: false,
  translator: 3,
  target_lang: 0,
  detector: 0,
  detection_size: 1,
  direction: 0,
};

export const MANGA_IMAGE_TRANSLATOR_PRESET_SCRIPT = `async (imageData, config) => {
  // [manga-image-translator](https://github.com/zyddnys/manga-image-translator)是一个自动翻译并嵌字的项目。  
  // 请参考 GitHub 项目的说明进行本地部署。
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
    url: (config.https ? "https" : "http") + "://" + config.host + ":" + config.port + "/translate/with-form/image/stream",
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
}`;

export const CONFIG_FORM_TEMPLATE = `[
  {
    "type": "string",
    "title": "HOST",
    "key": "host",
    "default": "192.168.1.1"
  },
  {
    "type": "integer",
    "title": "PORT",
    "key": "port",
    "min": 1,
    "max": 65535,
    "default": 5003
  },
  {
    "type": "boolean",
    "title": "HTTPS",
    "key": "https",
    "default": false
  },
  {
    "type": "list",
    "title": "列表",
    "key": "list",
    "items": ["列表项1", "列表项2", "列表项3"],
    "default": 0
  }
]`;
