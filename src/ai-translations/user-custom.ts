import { AITranslationConfig } from "../types";

export const config: AITranslationConfig = {
  name: 'user-custom',
  title: '自定义',
  link: '',
  description: $file.read("assets/user-custom-description.md").string || "",
  rows: []
}

export async function translate(config: { scriptText: string }, imageData: NSData) {
  let getTranslatedImageData: ((imageData: NSData) => Promise<NSData>) | undefined;
  // 将scriptText作为代码执行
  eval('getTranslatedImageData = ' + config.scriptText);
  // 此时scriptText应该定义了一个名为`getTranslatedImageData`的异步函数，检测是否定义
  if (!getTranslatedImageData || typeof getTranslatedImageData !== "function") {
    throw new Error("未找到getTranslatedImageData函数");
  }
  const data = await getTranslatedImageData(imageData);
  if (data && data.image) {
    return data;
  } else {
    throw new Error("getTranslatedImageData函数未返回有效数据");
  }
}