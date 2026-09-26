import { dbManager, DatabaseTransaction } from "../utils/database";
import { splitAITranslationConfig } from "../ai-translations/secure-config";
import { SYNC_TABLES, tableSpec, localColumns, TableSpec } from "./schema";

export interface CloudRecord {
  tablename: string;
  id: string;
  content?: Record<string, any>;
  sync_version: number;
  deleted: boolean;
}
export interface Pending {
  tablename: string;
  id: string;
  revision: number;
  base_version: number;
  conflict: string | null;
  forced: number;
  // A previously unseen local tag tombstone needs create then delete because
  // the generic server cannot delete a key that has never existed.
  bootstrapDelete?: boolean;
}
export const metaStatement = (key: string, value: unknown) => ({
  sql: "INSERT INTO sync_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  args: [key, JSON.stringify(value)],
});
export function setMeta(tx: DatabaseTransaction, key: string, value: unknown) {
  const s = metaStatement(key, value);
  tx.execute(s.sql, s.args);
}
export function getMeta<T>(key: string, fallback: T): T {
  const row = dbManager.query("SELECT value FROM sync_meta WHERE key=?", [key])[0];
  return row ? JSON.parse(row.value) : fallback;
}
export function selectedTables(): string[] {
  return dbManager.query("SELECT tablename FROM sync_enabled ORDER BY tablename").map((r) => r.tablename);
}
const columnCache = new Map<string, string[]>();
export function columns(spec: TableSpec) {
  if (!columnCache.has(spec.name))
    columnCache.set(
      spec.name,
      dbManager
        .query(`PRAGMA table_info(${spec.name})`)
        .map((r) => r.name as string)
        .filter((c) => !localColumns.has(c)),
    );
  return columnCache.get(spec.name)!;
}
export function localRecord(table: string, id: string, includeDeleted = false): Omit<CloudRecord, "sync_version"> {
  const spec = tableSpec(table);
  const row = dbManager.query(`SELECT * FROM ${spec.name} WHERE id=?`, [id])[0];
  if (!row || (row.deleted && !includeDeleted)) return { tablename: table, id, deleted: true };
  const content: Record<string, any> = Object.fromEntries(columns(spec).map((c) => [c, row[c]]));
  if ("children" in spec) {
    const c = spec.children;
    content.children = dbManager.query(
      `SELECT ${c.fields.join(",")} FROM ${c.table} WHERE ${c.key}=? ORDER BY ${c.fields.join(",")}`,
      [id],
    );
  }
  try {
    sanitizeService(table, content);
  } catch {
    throw new Error("本地 AI 配置格式无效，请在服务设置中修复");
  }
  return { tablename: table, id, deleted: false, content };
}
function sanitizeService(table: string, content: Record<string, any>) {
  if (table !== "ai_translation_services_v2") return;
  const split = splitAITranslationConfig({
    configForm: content.config_form ? JSON.parse(content.config_form) : undefined,
    config: content.config ? JSON.parse(content.config) : undefined,
  });
  content.config_form = split.configForm ? JSON.stringify(split.configForm) : null;
  content.config = split.config ? JSON.stringify(split.config) : null;
}
export function unpack(row: Record<string, any>): CloudRecord {
  return {
    tablename: row.tablename,
    id: row.id,
    sync_version: row.sync_version,
    deleted: !!row.deleted,
    ...(row.deleted ? {} : { content: JSON.parse(row.content) }),
  };
}
export function mirror(table: string, id: string): CloudRecord | undefined {
  const row = dbManager.query("SELECT * FROM sync_mirror WHERE tablename=? AND id=?", [table, id])[0];
  return row ? unpack(row) : undefined;
}
export function saveRecord(tx: DatabaseTransaction, target: "sync_stage" | "sync_mirror", row: CloudRecord) {
  if (
    typeof row.tablename !== "string" ||
    typeof row.id !== "string" ||
    !Number.isSafeInteger(row.sync_version) ||
    row.sync_version < 1 ||
    typeof row.deleted !== "boolean" ||
    (!row.deleted && !Object.prototype.hasOwnProperty.call(row, "content"))
  )
    throw new Error("同步响应记录格式无效");
  tx.execute(
    `INSERT INTO ${target}(tablename,id,content,sync_version,deleted) VALUES(?,?,?,?,?)
    ON CONFLICT(tablename,id) DO UPDATE SET content=excluded.content,sync_version=excluded.sync_version,deleted=excluded.deleted
    WHERE excluded.sync_version>${target}.sync_version`,
    [row.tablename, row.id, row.deleted ? null : JSON.stringify(row.content), row.sync_version, Number(row.deleted)],
  );
}
export function equalRecord(a: Pick<CloudRecord, "content" | "deleted">, b: Pick<CloudRecord, "content" | "deleted">) {
  const canonical = (value: any): any =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, canonical(value[k])]),
          )
        : value;
  return (
    a.deleted === b.deleted &&
    (a.deleted || JSON.stringify(canonical(a.content)) === JSON.stringify(canonical(b.content)))
  );
}
export function logRecord(tx: DatabaseTransaction, table: string, id: string, code: string) {
  tx.execute(
    "INSERT INTO sync_log(tablename,id,code,updated_at) VALUES(?,?,?,?) ON CONFLICT(tablename,id) DO UPDATE SET code=excluded.code,updated_at=excluded.updated_at",
    [table, id, code, new Date().toISOString()],
  );
}
/** Keep cloud records even if a business projection cannot be applied. Never log
 * SQL, credentials, remote contents, or raw transport errors. */
export function applyMirror(tx: DatabaseTransaction, keys?: Pick<CloudRecord, "tablename" | "id">[]): Set<string> {
  const changed = new Set<string>();
  for (const spec of SYNC_TABLES) {
    if (!tx.query("SELECT 1 FROM sync_enabled WHERE tablename=?", [spec.name]).length) continue;
    // Retry previously rejected rows, then only visit keys downloaded this round.
    // Source PKs drive the joins; pagination never rescans the entire mirror.
    for (const source of ["sync_log", ...(keys ? [] : ["sync_stage"])]) {
      let after: string | undefined;
      while (true) {
        const rows = tx.query(
          `SELECT m.* FROM ${source} s CROSS JOIN sync_mirror m
           LEFT JOIN ${spec.name} b ON b.id=m.id
           WHERE s.tablename=? ${after === undefined ? "" : "AND s.id>?"}
           AND m.tablename=s.tablename AND m.id=s.id
           ${source === "sync_log" ? "" : "AND (b.id IS NULL OR b.sync_version<>m.sync_version)"}
           AND NOT EXISTS(SELECT 1 FROM sync_pending p WHERE p.tablename=m.tablename AND p.id=m.id)
           ORDER BY s.id LIMIT 100`,
          after === undefined ? [spec.name] : [spec.name, after],
        );
        if (!rows.length) break;
        if (applyPage(tx, spec, rows)) changed.add(spec.name);
        after = rows[rows.length - 1].id;
      }
    }
    for (const key of keys ?? [])
      if (key.tablename === spec.name) {
        const rows = tx.query(
          `SELECT m.* FROM sync_mirror m WHERE tablename=? AND id=?
        AND NOT EXISTS(SELECT 1 FROM sync_pending p WHERE p.tablename=m.tablename AND p.id=m.id)`,
          [key.tablename, key.id],
        );
        if (rows.length && applyPage(tx, spec, rows)) changed.add(spec.name);
      }
  }
  return changed;
}

function dataError(error: unknown) {
  return /constraint|约束|同步内容|FOREIGN KEY/i.test(String(error));
}
function applyPage(tx: DatabaseTransaction, spec: TableSpec, rows: Record<string, any>[]): boolean {
  // Normal pages use a handful of native SQLite calls instead of a JS/native
  // round-trip per field/child/record. A bad page falls back to record isolation.
  tx.execute("SAVEPOINT sync_page");
  try {
    applyBulk(tx, spec, rows.map(unpack));
    tx.execute(`DELETE FROM sync_log WHERE tablename=? AND id IN (${rows.map(() => "?").join(",")})`, [
      spec.name,
      ...rows.map((r) => r.id),
    ]);
    tx.execute("RELEASE sync_page");
    return true;
  } catch (error) {
    tx.execute("ROLLBACK TO sync_page");
    tx.execute("RELEASE sync_page");
    if (!dataError(error)) throw error;
  }
  let changed = false;
  for (const row of rows) {
    tx.execute("SAVEPOINT sync_record");
    try {
      applyRecord(tx, spec, unpack(row));
      tx.execute("DELETE FROM sync_log WHERE tablename=? AND id=?", [spec.name, row.id]);
      tx.execute("RELEASE sync_record");
      changed = true;
    } catch (error) {
      tx.execute("ROLLBACK TO sync_record");
      tx.execute("RELEASE sync_record");
      if (!dataError(error)) throw error;
      logRecord(tx, spec.name, row.id, /FOREIGN KEY/i.test(String(error)) ? "FOREIGN_KEY" : "INVALID_CONTENT");
    }
  }
  return changed;
}

function insertRows(tx: DatabaseTransaction, table: string, names: string[], values: any[][], upsert = false) {
  // Below the variable limit on supported iOS SQLite versions, including wide rows.
  const batchSize = Math.max(1, Math.floor(900 / names.length));
  for (let offset = 0; offset < values.length; offset += batchSize) {
    const batch = values.slice(offset, offset + batchSize);
    tx.execute(
      `INSERT INTO ${table}(${names.join(",")}) VALUES ${batch.map(() => `(${names.map(() => "?").join(",")})`).join(",")}
      ${
        upsert
          ? `ON CONFLICT(id) DO UPDATE SET ${names
              .slice(1)
              .map((c) => `${c}=excluded.${c}`)
              .join(",")}`
          : ""
      }`,
      batch.flat(),
    );
  }
}
function applyBulk(tx: DatabaseTransaction, spec: TableSpec, rows: CloudRecord[]) {
  const live = rows.filter((r) => !r.deleted),
    deleted = rows.filter((r) => r.deleted);
  const fields = columns(spec);
  for (const row of live) validateContent(spec, row);
  insertRows(
    tx,
    spec.name,
    ["id", "sync_version", "deleted", ...fields],
    live.map((r) => [r.id, r.sync_version, 0, ...fields.map((f) => r.content![f])]),
    true,
  );
  if ("children" in spec && live.length) {
    const c = spec.children;
    tx.execute(
      `DELETE FROM ${c.table} WHERE ${c.key} IN (${live.map(() => "?").join(",")})`,
      live.map((r) => r.id),
    );
    insertRows(
      tx,
      c.table,
      [c.key, ...c.fields],
      live.flatMap((r) =>
        r.content!.children.map((child: Record<string, any>) => [r.id, ...c.fields.map((f) => child[f])]),
      ),
    );
  }
  if (spec.name === "global_reader_config_v2" || spec.name === "local_marked_tags_v2") {
    for (const row of deleted) applyRecord(tx, spec, row);
  } else if (deleted.length) {
    const off =
      spec.name === "webdav_services_v2"
        ? ",enabled=0"
        : spec.name === "ai_translation_services_v2"
          ? ",selected=0"
          : "";
    tx.execute(
      `UPDATE ${spec.name} SET deleted=1,sync_version=CASE id ${deleted.map(() => "WHEN ? THEN ?").join(" ")} END${off}
      WHERE id IN (${deleted.map(() => "?").join(",")})`,
      [...deleted.flatMap((r) => [r.id, r.sync_version]), ...deleted.map((r) => r.id)],
    );
  }
}

function validateContent(spec: TableSpec, row: CloudRecord) {
  const content = row.content,
    fields = columns(spec);
  if (spec.name === "global_reader_config_v2" && row.id !== "1") throw new Error("同步内容的全局设置 ID 无效");
  if (
    !content ||
    Array.isArray(content) ||
    typeof content !== "object" ||
    fields.some((c) => !Object.prototype.hasOwnProperty.call(content, c))
  )
    throw new Error("同步内容缺少业务字段");
  for (const field of fields)
    if (content[field] !== null && !["string", "number", "boolean"].includes(typeof content[field]))
      throw new Error("同步内容字段类型无效");
  try {
    sanitizeService(spec.name, content);
  } catch {
    throw new Error("同步内容的 AI 配置无效");
  }
  if ("children" in spec) {
    const c = spec.children;
    if (!Array.isArray(content.children)) throw new Error("同步内容缺少附属记录");
    for (const child of content.children)
      if (
        !child ||
        c.fields.some(
          (f) =>
            !Object.prototype.hasOwnProperty.call(child, f) ||
            (child[f] !== null && !["string", "number", "boolean"].includes(typeof child[f])),
        )
      )
        throw new Error("同步内容附属记录无效");
  }
}

export function applyRecord(tx: DatabaseTransaction, spec: TableSpec, row: CloudRecord) {
  if (spec.name === "global_reader_config_v2" && row.id !== "1") throw new Error("同步内容的全局设置 ID 无效");
  if (row.deleted) {
    if (spec.name === "local_marked_tags_v2") {
      const separator = row.id.indexOf(":");
      if (separator < 1) throw new Error("同步内容的标签 ID 无效");
      tx.execute(
        `INSERT INTO local_marked_tags_v2(id,namespace,name,sync_version,deleted) VALUES(?,?,?,?,1)
        ON CONFLICT(id) DO UPDATE SET deleted=1,sync_version=excluded.sync_version`,
        [row.id, row.id.slice(0, separator), row.id.slice(separator + 1), row.sync_version],
      );
    } else if (spec.name === "global_reader_config_v2") {
      const defaults = tx.query(`PRAGMA table_info(${spec.name})`).filter((c) => !localColumns.has(c.name));
      tx.execute(
        `UPDATE ${spec.name} SET ${defaults.map((c) => `${c.name}=${c.dflt_value}`).join(",")},sync_version=? WHERE id='1'`,
        [row.sync_version],
      );
    } else {
      const off =
        spec.name === "webdav_services_v2"
          ? ",enabled=0"
          : spec.name === "ai_translation_services_v2"
            ? ",selected=0"
            : "";
      tx.execute(`UPDATE ${spec.name} SET deleted=1,sync_version=?${off} WHERE id=?`, [row.sync_version, row.id]);
    }
    return;
  }
  validateContent(spec, row);
  const content = row.content!,
    fields = columns(spec);
  const names = ["id", "sync_version", "deleted", ...fields];
  tx.execute(
    `INSERT INTO ${spec.name}(${names.join(",")}) VALUES(${names.map(() => "?").join(",")})
    ON CONFLICT(id) DO UPDATE SET ${names
      .slice(1)
      .map((c) => `${c}=excluded.${c}`)
      .join(",")}`,
    [row.id, row.sync_version, 0, ...fields.map((c) => content[c])],
  );
  if ("children" in spec) {
    const c = spec.children;
    if (!Array.isArray(content.children)) throw new Error("同步内容缺少附属记录");
    tx.execute(`DELETE FROM ${c.table} WHERE ${c.key}=?`, [row.id]);
    for (const child of content.children) {
      if (
        !child ||
        c.fields.some(
          (f) =>
            !Object.prototype.hasOwnProperty.call(child, f) ||
            (child[f] !== null && !["string", "number", "boolean"].includes(typeof child[f])),
        )
      )
        throw new Error("同步内容附属记录无效");
      tx.execute(
        `INSERT INTO ${c.table}(${c.key},${c.fields.join(",")}) VALUES(?,${c.fields.map(() => "?").join(",")})`,
        [row.id, ...c.fields.map((f) => child[f])],
      );
    }
  }
}

export function selectTables(names: string[]) {
  for (const name of names) tableSpec(name);
  if (names.some((name) => "parent" in tableSpec(name)) && !names.includes("archive_entries_v2"))
    throw new Error("请先选择图库记录");
  if (getMeta("inflight", null)) throw new Error("请先同步，确认上次未完成的上传请求");
  const old = selectedTables();
  dbManager.atomic((tx) => {
    tx.execute("DELETE FROM sync_enabled");
    for (const name of new Set(names)) {
      tx.execute("INSERT INTO sync_enabled VALUES(?)", [name]);
      if (old.includes(name)) continue;
      // Existing local contents become explicit initial upload intent. Subsequent
      // pulls cannot silently replace them; identical records are elided later.
      const own = name === "tag_access_count_v2" ? " AND device_id=?" : "";
      tx.execute(
        `INSERT OR IGNORE INTO sync_pending(tablename,id,revision,base_version)
        SELECT ?,id,(SELECT tick FROM sync_control WHERE id=1),COALESCE((SELECT sync_version FROM sync_mirror WHERE tablename=? AND id=${name}.id),0)
        FROM ${name} WHERE 1=1${own}`,
        own ? [name, name, dbManager.deviceId] : [name, name],
      );
    }
    setMeta(tx, "needsTables", [
      ...new Set([
        ...getMeta<string[]>("needsTables", []).filter((name) => names.includes(name)),
        ...names.filter((name) => !old.includes(name)),
      ]),
    ]);
  });
}
