import type { AITranslationConfigFormItem, AITranslationService } from "../types";
import { getAITranslationConfigValue } from "./config-form-utils";

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

/** Reconcile the current schema with local values, including secure -> ordinary changes.
 * Explicit values (even an empty string) win. Removed secret fields must not leak into SQL.
 */
export function mergeAITranslationSecrets(
  service: Pick<AITranslationService, "configForm" | "config">,
  saved: Record<string, string> = {},
) {
  const keys = new Set((service.configForm ?? []).map((item) => item.key));
  const retained = Object.fromEntries(Object.entries(saved).filter(([key]) => keys.has(key)));
  const config = service.config
    ? Object.fromEntries(
        Object.entries(service.config).filter(
          ([key]) => keys.has(key) || !Object.prototype.hasOwnProperty.call(saved, key),
        ),
      )
    : undefined;
  return {
    ...service,
    config: Object.keys(retained).length ? { ...retained, ...config } : config,
  };
}
