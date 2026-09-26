import { configManager } from "../utils/config";
import { appLog } from "../utils/tools";

const sensitiveFields = new Set([
  "authorization",
  "masterkey",
  "apikey",
  "password",
  "secret",
  "token",
  "cookie",
  "setcookie",
]);

/** Build a separate log snapshot; never mutate request headers or persisted retry bytes. */
export function syncLog(event: string, details: unknown, level: "info" | "error", masterKey?: string) {
  try {
    if (!masterKey) {
      try {
        masterKey = configManager.syncCredentials?.masterKey;
      } catch {}
    }
    const seen = new Set<object>();
    const redactText = (text: string) => {
      const masked = masterKey
        ? /^[0-9a-f]{64}$/i.test(masterKey)
          ? text.replace(new RegExp(masterKey, "gi"), "[REDACTED]")
          : text.split(masterKey).join("[REDACTED]")
        : text.replace(/\b[0-9a-f]{64}\b/gi, "[REDACTED]");
      return masked.replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [REDACTED]");
    };
    const redact = (value: any): any => {
      if (typeof value === "string") return redactText(value);
      if (!value || typeof value !== "object") return value;
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
      const source =
        value instanceof Error || Object.prototype.toString.call(value) === "[object Error]"
          ? { ...value, name: value.name, message: value.message, stack: value.stack }
          : value;
      const result = Array.isArray(source)
        ? source.map(redact)
        : Object.fromEntries(
            Object.entries(source).map(([key, item]) => [
              redactText(key),
              sensitiveFields.has(key.replace(/[-_]/g, "").toLowerCase())
                ? "[REDACTED]"
                : key === "responsePreview" && typeof item === "string"
                  ? redactText(item).slice(0, 4000)
                  : redact(item),
            ]),
          );
      seen.delete(value);
      return result;
    };
    appLog({ scope: "cloudflare-sync", event, details: redact(details) }, level);
  } catch {
    // Logging failure must not change write retries, cursor commits or UI locks.
  }
}
