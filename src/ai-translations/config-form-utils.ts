import type { AITranslationConfigFormItem, AITranslationService } from "../types";

/**
 * 仅把“字段缺失”和“字段存在但值为 falsy”区分开，避免把 `false`、`0`、空字符串误判成未配置。
 */
function hasOwnConfigValue(config: Record<string, any> | undefined, key: string) {
  return Object.prototype.hasOwnProperty.call(config ?? {}, key);
}

/**
 * 校验单个配置值是否仍然符合表单定义。
 * 这里既用于编辑页回填，也用于服务列表摘要展示，避免旧数据或脏数据直接进入 UI。
 */
export function isValidAITranslationConfigValue(item: AITranslationConfigFormItem, value: any): boolean {
  switch (item.type) {
    case "string":
      return typeof value === "string";
    case "integer":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        (item.min === undefined || value >= item.min) &&
        (item.max === undefined || value <= item.max)
      );
    case "boolean":
      return typeof value === "boolean";
    case "list":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < item.items.length;
  }
}

/**
 * 读取单个配置项的当前值。
 * 如果配置对象中不存在该字段，或字段值已经不再满足表单约束，则统一回退到 `default`。
 */
export function getAITranslationConfigValue<T extends AITranslationConfigFormItem>(
  item: T,
  config?: Record<string, any>,
): T["default"] {
  const value = hasOwnConfigValue(config, item.key) ? config?.[item.key] : undefined;
  return (isValidAITranslationConfigValue(item, value) ? value : item.default) as T["default"];
}

/**
 * 按照配置表单定义重新生成一份干净的配置对象。
 * 这样保存时只会保留 schema 中声明过的字段，并且每个字段都能保证有合法值。
 */
export function buildAITranslationConfig(
  configForm?: AITranslationConfigFormItem[],
  config?: Record<string, any>,
): Record<string, any> | undefined {
  if (!configForm?.length) {
    return undefined;
  }

  return Object.fromEntries(configForm.map((item) => [item.key, getAITranslationConfigValue(item, config)]));
}

/**
 * 把配置值转换成适合显示在 Picker 卡片摘要中的文本。
 * 文本展示基于归一化后的值，因此缺失值和非法值会先回退到默认值再格式化。
 */
function formatAITranslationConfigValue(item: AITranslationConfigFormItem, config?: Record<string, any>) {
  switch (item.type) {
    case "string": {
      const value = getAITranslationConfigValue(item, config);
      return value.trim() ? value : "未填写";
    }
    case "integer":
      return String(getAITranslationConfigValue(item, config));
    case "boolean":
      return getAITranslationConfigValue(item, config) ? "开启" : "关闭";
    case "list": {
      const value = getAITranslationConfigValue(item, config);
      return item.items[value] ?? "未选择";
    }
  }
}

/**
 * 提取所有标记了 `summary: true` 的配置项，并拼成服务卡片上的摘要文案。
 */
export function buildAITranslationSummary(service: Pick<AITranslationService, "configForm" | "config">) {
  const summaryItems = (service.configForm ?? []).filter((item) => item.summary);
  if (!summaryItems.length) {
    return "";
  }

  return summaryItems
    .map((item) => `${item.title}: ${formatAITranslationConfigValue(item, service.config)}`)
    .join(" · ");
}
