import { dbManager, DatabaseStatement } from "../utils/database";
import { fields, tables, Table, Entity, canonical, same } from "./domain";

export function safeEntity(table: Table, raw: Entity): Entity {
  if (
    !tables.includes(table) ||
    typeof raw.id !== "string" ||
    !Number.isSafeInteger(raw.sync_version) ||
    raw.sync_version < 0 ||
    ![0, 1].includes(raw.deleted)
  )
    throw new Error("云端记录格式无效");
  const result: Entity = { id: raw.id, sync_version: raw.sync_version, deleted: raw.deleted };
  for (const [key, rule] of Object.entries(fields[table]) as [string, any][]) {
    let v = raw[key] === undefined ? (rule.default ?? null) : raw[key];
    if (v === null && rule.nullable) {
      result[key] = v;
      continue;
    }
    if (rule.kind === "text" || rule.kind === "taglist" || rule.kind === "search_terms") {
      if (
        typeof v !== "string" ||
        v.includes("\0") ||
        utf8Length(v) > (rule.max ?? 65536) ||
        v.length < (rule.min ?? 0) ||
        (rule.values && !rule.values.includes(v))
      )
        throw new Error("记录文本格式无效或超出云端限制");
      if (rule.kind !== "text") {
        const array = JSON.parse(v);
        if (!Array.isArray(array)) throw new Error("附属记录格式无效");
        v = normalizeAttachment(rule.kind, array);
      }
    } else if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      (rule.kind === "integer" && (!Number.isSafeInteger(v) || v < rule.min || v > rule.max))
    )
      throw new Error("记录数值格式无效");
    result[key] = v;
  }
  if (table === "ai_translation_services_v2") {
    const form = result.config_form ? JSON.parse(result.config_form) : [];
    const config = result.config ? JSON.parse(result.config) : {};
    if (!Array.isArray(form) || !config || typeof config !== "object" || Array.isArray(config))
      throw new Error("AI 服务配置格式无效");
    for (const item of form)
      if (item.type === "string" && item.secure === true) {
        delete config[item.key];
        item.default = "";
      }
    if (result.config_form !== null) result.config_form = canonical(form);
    if (result.config !== null) result.config = canonical(config);
  }
  return result;
}
function normalizeAttachment(kind: "taglist" | "search_terms", array: any[]): string {
  const text = (value: any, max: number, min = 0) => {
    if (typeof value !== "string" || value.includes("\0") || value.length < min || utf8Length(value) > max)
      throw new Error("附属记录文本格式无效");
    return value;
  };
  if (array.length > (kind === "taglist" ? 256 : 100)) throw new Error("附属记录数量超出限制");
  if (kind === "taglist") {
    const namespaces = new Set<string>();
    let total = 0;
    const groups = array
      .map((g) => {
        const namespace = text(g.namespace, 512);
        if (namespaces.has(namespace) || !Array.isArray(g.tags) || g.tags.length > 256) throw new Error("标签格式无效");
        namespaces.add(namespace);
        total += g.tags.length;
        const tags = g.tags.map((v: any) => text(v, 512, 1)).sort();
        if (new Set(tags).size !== tags.length || total > 4096) throw new Error("标签重复或超出限制");
        return { namespace, tags };
      })
      .filter((g) => g.tags.length)
      .sort((a, b) => (a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : 0));
    return canonical(groups);
  }
  return canonical(
    array.map((t) => {
      const result: any = {
        term: text(t.term, 2048),
        namespace: t.namespace == null ? null : text(t.namespace, 512),
        qualifier: t.qualifier == null ? null : text(t.qualifier, 512),
      };
      for (const k of ["dollar", "subtract", "tilde"]) {
        const flag = t[k] ?? 0;
        if (flag !== 0 && flag !== 1) throw new Error("搜索词标记无效");
        result[k] = flag;
      }
      return result;
    }),
  );
}
export const utf8Length = (s: string) => encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, "x").length;
export const dataOf = (table: Table, e: Entity) => Object.fromEntries(Object.keys(fields[table]).map((k) => [k, e[k]]));
export const equalEntity = (a: Entity | null, b: Entity | null) =>
  a === null || b === null ? a === b : same({ ...a, sync_version: 0 }, { ...b, sync_version: 0 });
export function localEntity(table: Table, id: string): Entity | null {
  const row = dbManager.query(`SELECT * FROM ${table} WHERE id=?`, [id])[0];
  if (!row) return null;
  if (table === "archive_entries_v2") {
    const groups: Record<string, string[]> = Object.create(null);
    for (const tag of dbManager.query(
      "SELECT namespace,tag FROM archive_taglist_v2 WHERE id=? ORDER BY namespace,tag",
      [id],
    ))
      (groups[tag.namespace] ??= []).push(tag.tag);
    row.taglist_json = canonical(Object.entries(groups).map(([namespace, tags]) => ({ namespace, tags })));
  }
  if (table === "search_history_v2" || table === "search_bookmarks_v2") {
    const history = table === "search_history_v2";
    row.search_terms_json = canonical(
      dbManager.query(
        `SELECT namespace,qualifier,term,dollar,subtract,tilde FROM ${history ? "search_history_search_terms_v2" : "search_bookmarks_search_terms_v2"} WHERE ${history ? "history_id" : "bookmark_id"}=? ORDER BY term_index`,
        [id],
      ),
    );
  }
  return safeEntity(table, row as Entity);
}
export function entityStatements(table: Table, e: Entity): DatabaseStatement[] {
  const keys = Object.keys(fields[table]).filter((k) => !k.endsWith("_json"));
  const columns = ["id", "sync_version", "deleted", ...keys];
  const statements: DatabaseStatement[] = [
    {
      sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${columns
        .slice(1)
        .map((k) => `${k}=excluded.${k}`)
        .join(",")}`,
      args: columns.map((k) => e[k]),
    },
  ];
  if (table === "archive_entries_v2") {
    statements.push({ sql: "DELETE FROM archive_taglist_v2 WHERE id=?", args: [e.id] });
    for (const group of JSON.parse(e.taglist_json))
      for (const tag of group.tags)
        statements.push({
          sql: "INSERT INTO archive_taglist_v2(id,namespace,tag) VALUES(?,?,?)",
          args: [e.id, group.namespace, tag],
        });
  }
  if (table === "search_history_v2" || table === "search_bookmarks_v2") {
    const history = table === "search_history_v2",
      child = history ? "search_history_search_terms_v2" : "search_bookmarks_search_terms_v2",
      key = history ? "history_id" : "bookmark_id";
    statements.push({ sql: `DELETE FROM ${child} WHERE ${key}=?`, args: [e.id] });
    JSON.parse(e.search_terms_json).forEach((term: any, index: number) =>
      statements.push({
        sql: `INSERT INTO ${child}(${key},term_index,namespace,qualifier,term,dollar,subtract,tilde) VALUES(?,?,?,?,?,?,?,?)`,
        args: [
          e.id,
          index,
          term.namespace ?? null,
          term.qualifier ?? null,
          term.term,
          term.dollar ?? 0,
          term.subtract ?? 0,
          term.tilde ?? 0,
        ],
      }),
    );
  }
  return statements;
}
/** Three-way merge: concurrent changes to different fields are preserved. */
export function mergeEntity(
  table: Table,
  base: Entity | null,
  local: Entity | null,
  remote: Entity,
): { entity: Entity; conflict: boolean } {
  if (!local) return { entity: remote, conflict: false };
  if (table === "tag_access_count_v2")
    return { entity: { ...remote, count: Math.max(local.count, remote.count) }, conflict: false };
  if (equalEntity(local, base)) return { entity: remote, conflict: false };
  if (equalEntity(local, remote)) return { entity: remote, conflict: false };
  if (local.deleted !== remote.deleted) return { entity: local, conflict: true };
  const next = { ...remote };
  let conflict = false;
  for (const key of Object.keys(fields[table])) {
    const a = local[key],
      b = remote[key],
      before = base?.[key];
    if (same(a, b) || same(a, before)) continue;
    if (same(b, before)) {
      next[key] = a;
      continue;
    }
    if ((key === "last_access_time" || key === "first_access_time") && typeof a === "string" && typeof b === "string")
      next[key] = key === "last_access_time" ? (a > b ? a : b) : a < b ? a : b;
    else if (table === "archive_read_state_v2" && key === "last_read_page")
      next[key] = local.last_access_time > remote.last_access_time ? a : b;
    else {
      next[key] = a;
      conflict = true;
    }
  }
  return { entity: next, conflict };
}
export function parentOf(table: Table, id: string): string | null {
  if (
    [
      "archive_read_state_v2",
      "archive_favorite_state_v2",
      "archive_rate_state_v2",
      "gallery_reader_config_v2",
    ].includes(table)
  )
    return id;
  if (table === "favorite_images_v2") return id.split(":")[0];
  return null;
}
