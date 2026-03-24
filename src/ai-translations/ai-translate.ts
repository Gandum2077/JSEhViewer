import { appLog } from "../utils/tools";
import { configManager } from "../utils/config";

async function translate({
  imageData,
  scriptText,
  config,
}: {
  imageData: NSData;
  scriptText: string;
  config?: Record<string, any>;
}) {
  let getTranslatedImageData: ((imageData: NSData, config?: Record<string, any>) => Promise<NSData>) | undefined;
  // 将scriptText作为代码执行
  eval("getTranslatedImageData = " + scriptText);
  // 此时scriptText应该定义了一个名为`getTranslatedImageData`的异步函数，检测是否定义
  if (!getTranslatedImageData || typeof getTranslatedImageData !== "function") {
    throw new Error("函数错误");
  }
  const data = await getTranslatedImageData(imageData, config);
  if (data && data.image) {
    return data;
  } else {
    throw new Error("未返回有效数据");
  }
}

export async function aiTranslate(path: string): Promise<
  | {
      success: true;
      data: NSData;
    }
  | {
      success: false;
      message: string;
    }
> {
  if (!$file.exists(path)) {
    throw new Error("未找到图片");
  }
  const imageData = $file.read(path);
  const serviceName = configManager.selectedAiTranslationServiceName;
  if (!serviceName) {
    throw new Error("未选择翻译服务");
  }
  const service = configManager.aiTranslationServices.find((n) => n.name === serviceName);
  if (!service) {
    throw new Error("未找到翻译服务配置");
  }
  // 前面三种错误，需要在调用该函数之前避免，所以这里不需要处理
  try {
    const newImageData = await translate({ imageData, scriptText: service.scriptText, config: service.config });
    return {
      success: true,
      data: newImageData,
    };
  } catch (e: any) {
    appLog(e, "error");
    return {
      success: false,
      message: e.message,
    };
  }
}
