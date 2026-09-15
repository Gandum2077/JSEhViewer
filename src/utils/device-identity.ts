import { query, update } from "./sqlite";

// Local metadata; never upload config or copy this identity to another device.
export const DEVICE_ID_CONFIG_KEY = "_sync_device_id";

export function readDeviceId(db: SqliteTypes.SqliteInstance): string | undefined {
  const row = query(db, "SELECT value FROM config WHERE key = ?", [DEVICE_ID_CONFIG_KEY])[0];
  if (!row) return;
  let id: unknown;
  try {
    id = JSON.parse(row.value);
  } catch {
    throw new Error("本机设备标识无效");
  }
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error("本机设备标识无效");
  return id;
}

/** Call inside the database migration transaction, before importing counters. */
export function ensureDeviceId(db: SqliteTypes.SqliteInstance): string {
  const existing = readDeviceId(db);
  if (existing) return existing;
  const id = $text.uuid.toLowerCase();
  update(db, "INSERT INTO config(key,value) VALUES (?,?)", [DEVICE_ID_CONFIG_KEY, JSON.stringify(id)]);
  return id;
}
