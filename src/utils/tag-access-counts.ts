import type { EHSearchTerm } from "ehentai-parser";
import { dbManager, DatabaseStatement } from "./database";

export interface TagAccessCount {
  id: string;
  device_id: string;
  namespace: string;
  qualifier: string;
  term: string;
  count: number;
  sync_version: number;
  deleted: number;
}

function component(value: string, maximum: number, minimum = 0): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    /[:\0]/.test(value) ||
    encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, "x").length > maximum
  )
    throw new Error("标签计数组成部分无效或超长，不能包含冒号");
  return value;
}

export function tagAccessCountId(deviceId: string, qualifier: string, namespace: string, term: string): string {
  return [
    component(deviceId, 200, 1),
    component(qualifier, 512),
    component(namespace, 512),
    component(term, 2048),
  ].join(":");
}

export function incrementLocalTagAccessCounts(tags: EHSearchTerm[]): void {
  const deviceId = dbManager.deviceId;
  dbManager.batchUpdate(
    `INSERT INTO tag_access_count_v2 (id,device_id,namespace,qualifier,term,count) VALUES (?,?,?,?,?,1)
     ON CONFLICT(device_id,namespace,qualifier,term) DO UPDATE SET deleted=0,count=count+1`,
    tags.map((tag) => {
      const namespace = tag.namespace || "",
        qualifier = tag.qualifier || "",
        term = tag.term || "";
      return [tagAccessCountId(deviceId, qualifier, namespace, term), deviceId, namespace, qualifier, term];
    }),
  );
}

/** Only these components are eligible for upload; never upload displayed totals. */
export function getLocalTagAccessCounts(): TagAccessCount[] {
  return dbManager.query("SELECT * FROM tag_access_count_v2 WHERE device_id=? AND deleted=0 ORDER BY id", [
    dbManager.deviceId,
  ]) as TagAccessCount[];
}

/** Complete counter payloads from the Worker; repeated/out-of-order pages are safe. */
export function applyRemoteTagAccessCounts(rows: TagAccessCount[], replaceOtherDevices = false): void {
  const statements: DatabaseStatement[] = rows.map((row) => {
    if (
      row.id !== tagAccessCountId(row.device_id, row.qualifier, row.namespace, row.term) ||
      !Number.isSafeInteger(row.count) ||
      row.count < 0 ||
      !Number.isSafeInteger(row.sync_version) ||
      row.sync_version < 0 ||
      row.deleted !== 0
    )
      throw new Error("云端标签计数无效");
    return {
      sql: `INSERT INTO tag_access_count_v2 (id,device_id,namespace,qualifier,term,count,sync_version,deleted)
        VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET
        count=MAX(count,excluded.count),sync_version=MAX(sync_version,excluded.sync_version),deleted=0`,
      args: [row.id, row.device_id, row.namespace, row.qualifier, row.term, row.count, row.sync_version],
    };
  });
  // Use only after a complete cloud snapshot, or to discard another endpoint's cache.
  // Own counters survive replacement, including visits made while downloading.
  if (replaceOtherDevices)
    statements.unshift({
      sql: "DELETE FROM tag_access_count_v2 WHERE device_id<>?",
      args: [dbManager.deviceId],
    });
  dbManager.transactionUpdate(statements);
}
