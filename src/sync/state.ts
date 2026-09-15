import { dbManager, DatabaseStatement } from "../utils/database";
import { Table, Entity, canonical, tables } from "./domain";
export const meta = <T>(key: string, fallback: T): T => {
  const value = dbManager.query("SELECT value FROM sync_meta WHERE key=?", [key])[0]?.value;
  return value === undefined ? fallback : JSON.parse(value);
};
export const setMeta = (key: string, value: any): DatabaseStatement => ({
  sql: "INSERT INTO sync_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  args: [key, JSON.stringify(value)],
});
export function saveMeta(key: string, value: any) {
  dbManager.transactionUpdate([setMeta(key, value)]);
}
export function stored(storage: "sync_shadow" | "sync_stage", table: Table, id: string): Entity | null {
  const text = dbManager.query(`SELECT payload FROM ${storage} WHERE table_name=? AND entity_id=?`, [table, id])[0]
    ?.payload;
  return text ? JSON.parse(text) : null;
}
export const storeEntity = (storage: "sync_shadow" | "sync_stage", table: Table, e: Entity): DatabaseStatement => ({
  sql: `INSERT INTO ${storage}(table_name,entity_id,payload) VALUES(?,?,?) ON CONFLICT(table_name,entity_id) DO UPDATE SET payload=excluded.payload`,
  args: [table, e.id, canonical(e)],
});
export const suppress = [{ sql: "UPDATE sync_control SET applying=1 WHERE id=1" }];
export const unsuppress = { sql: "UPDATE sync_control SET applying=0 WHERE id=1" };
export const clearDirty = (table: Table, id: string, revision?: number): DatabaseStatement => ({
  sql: `DELETE FROM sync_dirty WHERE table_name=? AND entity_id=?${revision === undefined ? "" : " AND revision=?"}`,
  args: revision === undefined ? [table, id] : [table, id, revision],
});
export const markDirty = (table: Table, id: string): DatabaseStatement => ({
  sql: `INSERT INTO sync_dirty(table_name,entity_id,priority) VALUES(?,?,CASE WHEN COALESCE((SELECT deleted FROM ${table} WHERE id=?),1)=1 THEN ${30 - tables.indexOf(table)} ELSE ${tables.indexOf(table)} END) ON CONFLICT(table_name,entity_id) DO UPDATE SET revision=revision+1,priority=excluded.priority`,
  args: [table, id, id],
});
export const conflict = (table: Table, id: string, reason: string): DatabaseStatement => ({
  sql: "INSERT INTO sync_conflicts(table_name,entity_id,reason) VALUES(?,?,?) ON CONFLICT(table_name,entity_id) DO UPDATE SET reason=excluded.reason",
  args: [table, id, reason],
});
export const clearConflict = (table: Table, id: string): DatabaseStatement => ({
  sql: "DELETE FROM sync_conflicts WHERE table_name=? AND entity_id=?",
  args: [table, id],
});
