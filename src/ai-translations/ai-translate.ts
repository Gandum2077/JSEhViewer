import * as MangaImageTranslator from "./manga-image-translator";
import * as CotransTouhouAi from "./cotrans-touhou-ai";
import * as UserCustom from "./user-custom";
import { appLog } from "../utils/tools";
import { configManager } from "../utils/config";

async function _translate(serviceName: string, config: any, imageData: NSData) {
  switch (serviceName) {
    case "manga-image-translator":
      return await MangaImageTranslator.translate(config, imageData);
    case "cotrans.touhou.ai":
      return await CotransTouhouAi.translate(config, imageData);
    case "user-custom":
      return await UserCustom.translate(config, imageData);
    default:
      throw new Error(`未找到名为${serviceName}的翻译服务`);
  }
}

export async function aiTranslate(path: string): Promise<{
    success: true,
    data: NSData
  } | {
    success: false,
    message: string
  }> {
  if (!$file.exists(path)) {
    throw new Error("未找到图片");
  }
  const imageData = $file.read(path);
  const serviceName = configManager.selectedAiTranslationService;
  if (!serviceName) {
    throw new Error("未选择翻译服务");
  }
  const config = configManager.aiTranslationServiceConfig[serviceName];
  if (!config) {
    throw new Error("未找到翻译服务配置");
  };
  // 前面三种错误，需要在调用该函数之前避免，所以这里不需要处理
  try {
    const newImageData = await _translate(serviceName, config, imageData);
    return {
      success: true,
      data: newImageData
    }
  } catch (e: any) {
    appLog(e, "error");
    return {
      success: false,
      message: e.message
    }
  }
}
