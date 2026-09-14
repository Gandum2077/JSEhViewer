import type { AITranslationConfigFormItem, AITranslationService } from "../types";
import { getAITranslationConfigValue } from "./config-form-utils";

const KEYCHAIN_DOMAIN = "JSEhViewer.ai-translation";
const keyForService = (id: string) => `service:${id}`;

export function splitAITranslationConfig(service: Pick<AITranslationService, "configForm" | "config">) {
  const fields = (service.configForm ?? []).filter(
    (item): item is Extract<AITranslationConfigFormItem, { type: "string" }> =>
      item.type === "string" && item.secure === true,
  );
  const keys = new Set(fields.map((item) => item.key));
  return {
    configForm: service.configForm?.map((item) =>
      item.type === "string" && item.secure ? { ...item, default: "" } : item,
    ),
    config: service.config
      ? Object.fromEntries(Object.entries(service.config).filter(([key]) => !keys.has(key)))
      : undefined,
    secrets: Object.fromEntries(fields.map((item) => [item.key, getAITranslationConfigValue(item, service.config)])),
    hasPersistedSecrets:
      fields.some((item) => Object.prototype.hasOwnProperty.call(service.config ?? {}, item.key)) ||
      fields.some((item) => item.default !== ""),
  };
}

export function readAITranslationSecrets(id: string): Record<string, string> {
  const raw = $keychain.get(keyForService(id), KEYCHAIN_DOMAIN);
  if (!raw) return {};
  const values: unknown = JSON.parse(raw);
  if (
    !values ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    Object.values(values).some((v) => typeof v !== "string")
  ) {
    throw new Error("AI 翻译敏感配置格式无效");
  }
  return values as Record<string, string>;
}

/** Write secrets first; if the SQL transaction fails, restore the previous entry. */
export function saveAITranslationSecrets(id: string, secrets: Record<string, string>, saveDatabase: () => void): void {
  const key = keyForService(id);
  const previous = $keychain.get(key, KEYCHAIN_DOMAIN);
  const next = Object.keys(secrets).length ? JSON.stringify(secrets) : undefined;
  const write = (value: string | undefined) => {
    if (value) {
      if (!$keychain.set(key, value, KEYCHAIN_DOMAIN)) throw new Error("无法保存 AI 翻译敏感配置");
    } else if ($keychain.get(key, KEYCHAIN_DOMAIN) && !$keychain.remove(key, KEYCHAIN_DOMAIN)) {
      throw new Error("无法删除 AI 翻译敏感配置");
    }
  };
  if (previous === next || (!previous && !next)) {
    saveDatabase();
    return;
  }
  write(next);
  try {
    saveDatabase();
  } catch (error) {
    write(previous);
    throw error;
  }
}
