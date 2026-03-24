# 自定义你的 AI 翻译

如果你已经有自己的 AI 翻译接口，可以通过这份说明为本应用配置自定义 AI 翻译服务。你需要提供两部分内容：

1. 一个匿名异步函数，用来接收图片并返回翻译后的图片。
2. 一个可选的配置表单定义，用来让常用参数可以在界面中直接修改。

下面会分别说明这两部分的格式和写法，并附上完整示例，方便你直接参考。

## 匿名函数

你需要实现一个匿名异步函数，格式如下：

```javascript
async (imageData, config) => {
  // 你的代码
  return translatedImageData;
};
```

这个函数会接收两个参数：

- `imageData`：必填，原始图片的 `$data` 对象。
- `config`：选填，来自配置表单的配置对象。

函数的返回值需要是翻译后图片的 `$data` 对象。

你可以使用 JSBox 自带的模块来完成逻辑，例如 `$http`、`$imagekit`、`$xml` 等。

注意：这个函数会通过 `eval()` 直接执行，因此请只修改函数内部的实现逻辑，保留外层函数结构不变。

## 配置表单定义

你可以额外提供一个 JSON 数组，用来描述配置表单。
这会提供一个图形界面来修改参数，从而不需要每次都修改代码。结果会传入匿名函数的 `config` 参数中。

如果不需要配置表单，可以直接省略。

支持四种表单项类型：`string`、`integer`、`boolean` 和 `list`。

每个表单项都必须包含以下字段：

- `type`：表单项类型。
- `title`：界面上显示的名称。
- `key`：配置项的键名，函数中可通过 `config[key]` 读取。
- `default`：默认值。

额外说明：

- `integer` 类型还可以包含 `min` 和 `max`，用于限制输入范围。
- `list` 类型必须包含 `items`，用于描述可选项列表。

每种类型的 `default` 需要与类型匹配：

- `string` 的 `default` 需要是一个字符串。
- `integer` 的 `default` 需要是一个整数，并且在 `min` 和 `max` 范围内（如果有的话）。
- `boolean` 的 `default` 只能是 `true` 或 `false`。
- `list` 的 `default` 需要是一个整数，表示默认选项在 `items` 中的索引。

示例：

```json
[
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
]
```

对应的 `config` 参数示例：

```javascript
{
  host: "192.168.1.1",
  port: 5003,
  https: false,
  translator: 2
}
```

## 参考案例

下面是一组完整示例（manga-image-translator），包含匿名函数和对应的配置表单。

匿名函数部分：

```javascript
async (imageData, config) => {
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
    url:
      (config.https ? "https" : "http") + "://" + config.host + ":" + config.port + "/translate/with-form/image/stream",
    form: payload,
    files: [
      {
        data: imageData,
        name: "image",
      },
    ],
  });
  const ba = r.rawData.byteArray;

  const startIndex = ba.findIndex((n) => n === 137); // 0x89

  const pngFileMagicBytes = [137, 80, 78, 71, 13, 10, 26, 10];
  if (startIndex !== -1 && !ba.slice(startIndex, startIndex + 8).find((n, x) => n !== pngFileMagicBytes[x])) {
    return $data({
      byteArray: ba.slice(startIndex),
    });
  } else {
    throw new Error("No image data in response");
  }
};
```

配置表单部分：

```json
[
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
]
```
