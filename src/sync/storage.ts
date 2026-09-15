import { query, update } from "../utils/sqlite";
import { fields, tables } from "./domain";

/** DB-owned triggers capture final entity dirtiness in the same business transaction. */
export function initializeSyncStorage(db: SqliteTypes.SqliteInstance) {
  if (query(db, "SELECT name FROM sqlite_master WHERE name='sync_control'").length) return;
  update(db, "BEGIN IMMEDIATE");
  try {
    for (const sql of [
      "CREATE TABLE sync_control(id INTEGER PRIMARY KEY CHECK(id=1),applying INTEGER NOT NULL DEFAULT 0)",
      "INSERT INTO sync_control(id) VALUES(1)",
      "CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
      "CREATE TABLE sync_dirty(table_name TEXT NOT NULL,entity_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,priority INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(table_name,entity_id))",
      "CREATE INDEX sync_dirty_priority ON sync_dirty(priority,entity_id)",
      "CREATE TABLE sync_shadow(table_name TEXT NOT NULL,entity_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(table_name,entity_id))",
      "CREATE TABLE sync_stage(table_name TEXT NOT NULL,entity_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(table_name,entity_id))",
      "CREATE TABLE sync_conflicts(table_name TEXT NOT NULL,entity_id TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(table_name,entity_id))",
    ])
      update(db, sql);
    for (const table of tables) {
      const columns = Object.keys(fields[table]).filter((k) => !k.endsWith("_json"));
      for (const [event, ref, condition] of [
        ["INSERT", "NEW", "1"],
        ["DELETE", "OLD", "1"],
        ["UPDATE", "NEW", ["id", "deleted", ...columns].map((k) => `OLD.${k} IS NOT NEW.${k}`).join(" OR ")],
      ])
        update(
          db,
          `CREATE TRIGGER sync_${table}_${event} AFTER ${event} ON ${table}
        WHEN (SELECT applying FROM sync_control WHERE id=1)=0 AND (${condition}) BEGIN
        INSERT INTO sync_dirty(table_name,entity_id,priority) VALUES('${table}',${ref}.id,${event === "DELETE" ? 30 - tables.indexOf(table) : `CASE WHEN ${ref}.deleted=1 THEN ${30 - tables.indexOf(table)} ELSE ${tables.indexOf(table)} END`})
        ON CONFLICT(table_name,entity_id) DO UPDATE SET revision=revision+1,priority=excluded.priority;
        ${event === "UPDATE" ? `INSERT INTO sync_dirty(table_name,entity_id,priority) SELECT '${table}',OLD.id,${30 - tables.indexOf(table)} WHERE OLD.id IS NOT NEW.id ON CONFLICT(table_name,entity_id) DO UPDATE SET revision=revision+1,priority=excluded.priority;` : ""} END`,
        );
    }
    for (const [child, parent, key] of [
      ["archive_taglist_v2", "archive_entries_v2", "id"],
      ["search_history_search_terms_v2", "search_history_v2", "history_id"],
      ["search_bookmarks_search_terms_v2", "search_bookmarks_v2", "bookmark_id"],
    ])
      for (const [event, ref] of [
        ["INSERT", "NEW"],
        ["DELETE", "OLD"],
        ["UPDATE", "NEW"],
      ])
        update(
          db,
          `CREATE TRIGGER sync_${child}_${event} AFTER ${event} ON ${child}
        WHEN (SELECT applying FROM sync_control WHERE id=1)=0 BEGIN
        INSERT INTO sync_dirty(table_name,entity_id,priority) VALUES('${parent}',${ref}.${key},CASE WHEN COALESCE((SELECT deleted FROM ${parent} WHERE id=${ref}.${key}),1)=1 THEN ${30 - tables.indexOf(parent as keyof typeof fields)} ELSE ${tables.indexOf(parent as keyof typeof fields)} END)
        ON CONFLICT(table_name,entity_id) DO UPDATE SET revision=revision+1,priority=excluded.priority;
        ${event === "UPDATE" ? `INSERT INTO sync_dirty(table_name,entity_id,priority) SELECT '${parent}',OLD.${key},${tables.indexOf(parent as keyof typeof fields)} WHERE OLD.${key} IS NOT NEW.${key} ON CONFLICT(table_name,entity_id) DO UPDATE SET revision=revision+1,priority=excluded.priority;` : ""} END`,
        );
    update(db, "COMMIT");
  } catch (e) {
    update(db, "ROLLBACK");
    throw e;
  }
}
