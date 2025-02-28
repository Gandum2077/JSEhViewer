# 自定义你的 AI 翻译

你需要自行实现一个匿名异步函数，其输入为当前页面图片的`$data`，其输出为翻译后图片的`$data`。

你可以使用 JSBox 自带的模块来完成它，比如`$http`、`$imagekit`、`$xml`。

此函数将使用`eval()`直接运行，请只修改函数内的部分，保留如下内容

```javascript
async (imageData) => {
  // 在此处编写自定义翻译的逻辑
};
```

以下为参考案例:

```javascript
async (imageData) => {
  const target_language = "CHS";
  const size = "M";
  const detector = "default";
  const direction = "default";
  const translator = "youdao";
  const uploadUrl = "https://api.cotrans.touhou.ai/task/upload/v1";
  const ext = imageData.info.mimeType.split("/")[1];
  const resp = await $http.post({
    url: uploadUrl,
    files: [
      {
        data: imageData,
        name: "file",
        filename: "image." + ext
      }
    ],
    form: {
      target_language,
      detector,
      direction,
      translator,
      size
    }
  });
  if (resp.error) throw new Error("Fail to upload image");
  const data = resp.data;
  if ("id" in data) {
    await $wait(15);
    const taskId = data.id;
    const statusUrl = 'https://api.cotrans.touhou.ai/task/' + taskId + '/status/v1';
    for (let i = 0; i < 6; i++) {
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
        const combined = $imagekit.combine(image1, image2, 8);
        return combined.jpg(1); // 输出结果不能是$image, 需要转换为$data
      } else {
        await $wait(5);
      }
    }
    throw new Error("Timeout");
  } else {
    throw new Error("Fail to upload image");
  }
};
```