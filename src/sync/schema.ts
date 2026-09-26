import { query, update } from "../utils/sqlite";

// Names are a closed application whitelist, never interpolated from network data.
export const SYNC_TABLES = [
  {
    name: "archive_entries_v2",
    title: "图库记录",
    children: { table: "archive_taglist_v2", key: "id", fields: ["namespace", "tag"] },
  },
  { name: "archive_read_state_v2", title: "阅读进度", parent: true },
  { name: "archive_favorite_state_v2", title: "图库收藏状态", parent: true },
  { name: "archive_rate_state_v2", title: "图库评分", parent: true },
  { name: "gallery_reader_config_v2", title: "单个图库阅读设置", parent: true },
  { name: "favorite_images_v2", title: "图片收藏", parent: true },
  { name: "global_reader_config_v2", title: "全局阅读设置" },
  {
    name: "search_history_v2",
    title: "搜索历史",
    children: {
      table: "search_history_search_terms_v2",
      key: "history_id",
      fields: ["term_index", "namespace", "qualifier", "term", "dollar", "subtract", "tilde"],
    },
  },
  {
    name: "search_bookmarks_v2",
    title: "搜索书签",
    children: {
      table: "search_bookmarks_search_terms_v2",
      key: "bookmark_id",
      fields: ["term_index", "namespace", "qualifier", "term", "dollar", "subtract", "tilde"],
    },
  },
  { name: "local_marked_tags_v2", title: "本地标签标记" },
  { name: "marked_uploaders_v2", title: "上传者标记" },
  { name: "tag_access_count_v2", title: "标签访问次数" },
  { name: "webdav_services_v2", title: "WebDAV 服务" },
  { name: "ai_translation_services_v2", title: "AI 翻译服务" },
] as const;

export type TableSpec = (typeof SYNC_TABLES)[number];
export function tableSpec(name: string): TableSpec {
  const spec = SYNC_TABLES.find((t) => t.name === name);
  if (!spec) throw new Error("不支持的同步表");
  return spec;
}

export const localColumns = new Set(["id", "sync_version", "deleted", "selected", "enabled"]);

/** Installed after business migrations, before any business writes. Triggers capture
 * intent in the same transaction, including changes to aggregate child tables. */
export function initializeSyncSchema(db: SqliteTypes.SqliteInstance) {
  update(db, "BEGIN IMMEDIATE");
  try {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS sync_control (id INTEGER PRIMARY KEY CHECK(id=1), applying INTEGER NOT NULL DEFAULT 0, tick INTEGER NOT NULL DEFAULT 0)",
      "INSERT OR IGNORE INTO sync_control(id) VALUES(1)",
      "CREATE TABLE IF NOT EXISTS sync_enabled (tablename TEXT PRIMARY KEY)",
      "CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS sync_mirror (tablename TEXT NOT NULL,id TEXT NOT NULL,content TEXT,sync_version INTEGER NOT NULL,deleted INTEGER NOT NULL,PRIMARY KEY(tablename,id))",
      "CREATE TABLE IF NOT EXISTS sync_stage (tablename TEXT NOT NULL,id TEXT NOT NULL,content TEXT,sync_version INTEGER NOT NULL,deleted INTEGER NOT NULL,PRIMARY KEY(tablename,id))",
      "CREATE TABLE IF NOT EXISTS sync_pending (tablename TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,base_version INTEGER NOT NULL,conflict TEXT,forced INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tablename,id))",
      "CREATE INDEX IF NOT EXISTS sync_pending_ready ON sync_pending(tablename,revision,id) WHERE conflict IS NULL",
      "CREATE TABLE IF NOT EXISTS sync_log (tablename TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tablename,id))",
    ])
      update(db, sql);
    for (const spec of SYNC_TABLES) {
      const columns = query(db, `PRAGMA table_info(${spec.name})`)
        .map((c) => c.name as string)
        .filter((c) => !localColumns.has(c));
      const sources = [
        { table: spec.name, key: "id", columns: [...columns, "deleted"] },
        ...("children" in spec
          ? [{ table: spec.children.table, key: spec.children.key, columns: [...spec.children.fields] }]
          : []),
      ];
      for (const source of sources)
        for (const event of ["INSERT", "UPDATE", "DELETE"]) {
          const ref = event === "DELETE" ? "OLD" : "NEW";
          const changed =
            event === "UPDATE" ? ` AND (${source.columns.map((c) => `OLD.${c} IS NOT NEW.${c}`).join(" OR ")})` : "";
          const own =
            spec.name === "tag_access_count_v2"
              ? ` AND ${ref}.device_id=json_extract((SELECT value FROM config WHERE key='_sync_device_id'),'$')`
              : "";
          update(
            db,
            `CREATE TRIGGER IF NOT EXISTS sync_track_${source.table}_${event}
          AFTER ${event} ON ${source.table}
          WHEN (SELECT applying FROM sync_control WHERE id=1)=0
            AND EXISTS(SELECT 1 FROM sync_enabled WHERE tablename='${spec.name}')${changed}${own}
          BEGIN
            UPDATE sync_control SET tick=tick+1 WHERE id=1;
            INSERT INTO sync_pending(tablename,id,revision,base_version)
              VALUES('${spec.name}',${ref}.${source.key},(SELECT tick FROM sync_control WHERE id=1),
                COALESCE((SELECT sync_version FROM sync_mirror WHERE tablename='${spec.name}' AND id=${ref}.${source.key}),0))
              ON CONFLICT(tablename,id) DO UPDATE SET revision=excluded.revision;
          END`,
          );
        }
    }
    update(db, "COMMIT");
  } catch (e) {
    update(db, "ROLLBACK");
    throw e;
  }
}
