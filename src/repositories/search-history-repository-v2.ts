import { EHQualifier, EHSearchTerm, TagNamespace } from "ehentai-parser";
import { SqliteTransactionContext } from "../utils/sqlite-safe";
import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";
import { SyncEntityEnvelopeCodec } from "./sync-entity-envelope-codec";
import { RemoteApplyResult, RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "./sync-mutation-writer";

export const SEARCH_HISTORY_ENTITY_TYPE = "search.history.v1";

export interface SearchHistoryTermPayloadV1 {
  namespace: string | null;
  qualifier: string | null;
  term: string;
  dollar: boolean;
  subtract: boolean;
  tilde: boolean;
}

export interface SearchHistoryPayloadV1 {
  format: 1;
  historyId: string;
  sortedFsearch: string;
  lastAccessTime: string;
  searchTerms: SearchHistoryTermPayloadV1[];
}

export interface V2SearchHistoryItem {
  historyId: string;
  lastAccessTime: string;
  sortedFsearch: string;
  searchTerms: EHSearchTerm[];
}

export interface UpsertV2SearchHistoryResult {
  changed: boolean;
  item: V2SearchHistoryItem;
  version?: SyncVersion;
}

export interface ApplyRemoteSearchHistoryResult extends RemoteApplyResult {
  item: V2SearchHistoryItem;
}

interface SearchHistoryRow {
  history_id: string;
  last_access_time: string;
  sorted_fsearch: string;
}

interface SearchHistoryTermRow {
  history_id: string;
  term_index: number;
  namespace: string | null;
  qualifier: string | null;
  term: string;
  dollar: number;
  subtract: number;
  tilde: number;
}

export type SearchHistoryIdDeriver = (sortedFsearch: string) => string;

function requireString(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`${name}必须是${allowEmpty ? "" : "非空"}字符串`);
  }
  return value;
}

function requireHistoryId(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("搜索历史稳定 ID 必须是 64 位小写 SHA-256 十六进制字符串");
  }
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name}必须是布尔值`);
  return value;
}

function requireOptionalString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${name}必须是字符串或 null`);
  return value;
}

function termPayload(term: EHSearchTerm): SearchHistoryTermPayloadV1 {
  return {
    namespace: term.namespace ?? null,
    qualifier: term.qualifier ?? null,
    term: requireString(term.term, "搜索词", true),
    dollar: Boolean(term.dollar),
    subtract: Boolean(term.subtract),
    tilde: Boolean(term.tilde),
  };
}

function parseTermPayload(value: unknown, index: number): SearchHistoryTermPayloadV1 {
  if (typeof value !== "object" || value === null) {
    throw new Error(`搜索历史第 ${index + 1} 个 term 格式无效`);
  }
  const candidate = value as Record<string, unknown>;
  return {
    namespace: requireOptionalString(candidate.namespace, "搜索词 namespace"),
    qualifier: requireOptionalString(candidate.qualifier, "搜索词 qualifier"),
    term: requireString(candidate.term, "搜索词", true),
    dollar: requireBoolean(candidate.dollar, "搜索词 dollar"),
    subtract: requireBoolean(candidate.subtract, "搜索词 subtract"),
    tilde: requireBoolean(candidate.tilde, "搜索词 tilde"),
  };
}

function toSearchTerm(term: SearchHistoryTermPayloadV1): EHSearchTerm {
  return {
    namespace: term.namespace === null ? undefined : (term.namespace as TagNamespace),
    qualifier: term.qualifier === null ? undefined : (term.qualifier as EHQualifier),
    term: term.term,
    dollar: term.dollar,
    subtract: term.subtract,
    tilde: term.tilde,
  };
}

function parsePayload(value: unknown): SearchHistoryPayloadV1 {
  if (typeof value !== "object" || value === null) throw new Error("搜索历史同步 payload 格式无效");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== 1 || !Array.isArray(candidate.searchTerms)) {
    throw new Error("搜索历史同步 payload 版本或 terms 格式无效");
  }
  return {
    format: 1,
    historyId: requireHistoryId(requireString(candidate.historyId, "搜索历史 ID")),
    sortedFsearch: requireString(candidate.sortedFsearch, "规范化搜索查询", true),
    lastAccessTime: requireString(candidate.lastAccessTime, "搜索历史访问时间"),
    searchTerms: candidate.searchTerms.map(parseTermPayload),
  };
}

function payloadFor(item: V2SearchHistoryItem): SearchHistoryPayloadV1 {
  return {
    format: 1,
    historyId: item.historyId,
    sortedFsearch: item.sortedFsearch,
    lastAccessTime: item.lastAccessTime,
    searchTerms: item.searchTerms.map(termPayload),
  };
}

function samePayload(left: SearchHistoryPayloadV1, right: SearchHistoryPayloadV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asVersion(mutation: RemoteSyncMutation): SyncVersion {
  return {
    objectKey: mutation.objectKey,
    entityType: mutation.entityType,
    wallMs: mutation.wallMs,
    logicalCounter: mutation.logicalCounter,
    deviceId: mutation.deviceId,
    deleted: mutation.deleted,
    opId: mutation.opId,
  };
}

function insertTerms(
  transaction: SqliteTransactionContext,
  historyId: string,
  searchTerms: readonly SearchHistoryTermPayloadV1[],
): void {
  searchTerms.forEach((term, termIndex) => {
    transaction.update(
      `INSERT INTO search_history_search_terms
       (history_id, term_index, namespace, qualifier, term, dollar, subtract, tilde)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        historyId,
        termIndex,
        term.namespace,
        term.qualifier,
        term.term,
        Number(term.dollar),
        Number(term.subtract),
        Number(term.tilde),
      ],
      "写入 v2 搜索历史 term",
    );
  });
}

function writeHistory(transaction: SqliteTransactionContext, payload: SearchHistoryPayloadV1): void {
  transaction.update(
    `INSERT INTO search_history (history_id, last_access_time, sorted_fsearch)
     VALUES (?, ?, ?)
     ON CONFLICT(history_id) DO UPDATE SET
       last_access_time = excluded.last_access_time,
       sorted_fsearch = excluded.sorted_fsearch`,
    [payload.historyId, payload.lastAccessTime, payload.sortedFsearch],
    "写入 v2 搜索历史 parent",
  );
  transaction.update("DELETE FROM search_history_search_terms WHERE history_id = ?", [payload.historyId]);
  insertTerms(transaction, payload.historyId, payload.searchTerms);
}

export class V2SearchHistoryRepository {
  constructor(
    private readonly database: RepositoryDatabase,
    private readonly syncWriter: SyncMutationWriter,
    private readonly codec: SyncEntityEnvelopeCodec,
    private readonly deriveHistoryId: SearchHistoryIdDeriver,
  ) {}

  queryHistory(): V2SearchHistoryItem[] {
    const parents = this.database.query(
      `SELECT history_id, last_access_time, sorted_fsearch
       FROM search_history
       ORDER BY last_access_time DESC, history_id DESC`,
    ) as SearchHistoryRow[];
    if (parents.length === 0) return [];
    const terms = this.database.query(
      `SELECT history_id, term_index, namespace, qualifier, term, dollar, subtract, tilde
       FROM search_history_search_terms
       ORDER BY history_id, term_index`,
    ) as SearchHistoryTermRow[];
    const termsByHistory = new Map<string, EHSearchTerm[]>();
    for (const row of terms) {
      const values = termsByHistory.get(row.history_id) ?? [];
      values.push(
        toSearchTerm({
          namespace: row.namespace,
          qualifier: row.qualifier,
          term: row.term,
          dollar: row.dollar === 1,
          subtract: row.subtract === 1,
          tilde: row.tilde === 1,
        }),
      );
      termsByHistory.set(row.history_id, values);
    }
    return parents.map((row) => ({
      historyId: row.history_id,
      lastAccessTime: row.last_access_time,
      sortedFsearch: row.sorted_fsearch,
      searchTerms: termsByHistory.get(row.history_id) ?? [],
    }));
  }

  upsertHistory(
    sortedFsearch: string,
    searchTerms: EHSearchTerm[],
    origin: MutationOrigin,
    lastAccessTime = new Date().toISOString(),
  ): UpsertV2SearchHistoryResult {
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.user) {
      throw new Error("v2 搜索历史的本机写入只接受 user 来源；远端 change 必须携带版本元数据");
    }
    const item = this.createItem(sortedFsearch, searchTerms, lastAccessTime);
    const payload = payloadFor(item);
    return this.database.transaction((transaction) => {
      const existing = this.readPayload(transaction, item.historyId);
      if (existing && samePayload(existing, payload)) return { changed: false, item };
      this.requireNoStableIdCollision(transaction, payload);
      writeHistory(transaction, payload);
      const objectKey = this.codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, item.historyId);
      const version = this.syncWriter.recordLocalMutation(transaction, {
        origin: MutationOrigin.user,
        objectKey,
        entityType: SEARCH_HISTORY_ENTITY_TYPE,
        deleted: false,
        createEnvelopeJson: (createdVersion) =>
          this.codec.encodeEnvelope(SEARCH_HISTORY_ENTITY_TYPE, payload, createdVersion),
      });
      return { changed: true, item, version };
    }, "原子保存 v2 搜索历史与 outbox");
  }

  seedExistingHistory(): number {
    return this.database.transaction((transaction) => {
      const rows = transaction.query<SearchHistoryRow>(
        `SELECT history_id, last_access_time, sorted_fsearch
         FROM search_history
         ORDER BY last_access_time, history_id`,
      );
      let seeded = 0;
      for (const row of rows) {
        const historyId = requireHistoryId(row.history_id);
        const expectedId = this.stableId(row.sorted_fsearch);
        if (historyId !== expectedId) throw new Error("迁移后的搜索历史稳定 ID 与规范化查询不匹配");
        const objectKey = this.codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, historyId);
        const existingVersion = transaction.query<{ found: number }>(
          "SELECT 1 AS found FROM sync_versions WHERE object_key = ? LIMIT 1",
          [objectKey],
        )[0];
        if (existingVersion) continue;
        const payload = this.readPayload(transaction, historyId);
        if (!payload) throw new Error("读取迁移搜索历史 payload 失败");
        this.syncWriter.recordLocalMutation(transaction, {
          origin: MutationOrigin.migrationSeed,
          objectKey,
          entityType: SEARCH_HISTORY_ENTITY_TYPE,
          deleted: false,
          createEnvelopeJson: (createdVersion) =>
            this.codec.encodeEnvelope(SEARCH_HISTORY_ENTITY_TYPE, payload, createdVersion),
        });
        seeded += 1;
      }
      return seeded;
    }, "seed v2 搜索历史同步状态");
  }

  deleteHistoryLocally(historyId: string): boolean {
    requireHistoryId(historyId);
    return this.database.transaction((transaction) => {
      const existing = transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM search_history WHERE history_id = ? LIMIT 1",
        [historyId],
      )[0];
      if (!existing) return false;
      transaction.update("DELETE FROM search_history WHERE history_id = ?", [historyId], "仅删除本机 v2 搜索历史");
      this.syncWriter.discardLocalObject(transaction, {
        origin: MutationOrigin.localMaintenance,
        objectKey: this.codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, historyId),
      });
      return true;
    }, "原子删除本机 v2 搜索历史并取消未发送版本");
  }

  deleteHistoryBeforeLocally(before: string): number {
    requireString(before, "搜索历史清理时间");
    return this.database.transaction((transaction) => {
      const historyIds = transaction
        .query<{ history_id: string }>("SELECT history_id FROM search_history WHERE last_access_time < ?", [before])
        .map((row) => requireHistoryId(row.history_id));
      for (const historyId of historyIds) {
        transaction.update("DELETE FROM search_history WHERE history_id = ?", [historyId]);
        this.syncWriter.discardLocalObject(transaction, {
          origin: MutationOrigin.localMaintenance,
          objectKey: this.codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, historyId),
        });
      }
      return historyIds.length;
    }, "原子清理本机旧搜索历史并取消未发送版本");
  }

  applyRemoteHistory(mutation: RemoteSyncMutation): ApplyRemoteSearchHistoryResult {
    if (mutation.entityType !== SEARCH_HISTORY_ENTITY_TYPE) {
      throw new Error("远端 change 的 entity type 不是 search history v1");
    }
    if (mutation.deleted) {
      throw new Error("search history v1 不接受云端 tombstone；清空历史只能是本机维护操作");
    }
    const version = asVersion(mutation);
    const payload = parsePayload(this.codec.decodeEnvelope(SEARCH_HISTORY_ENTITY_TYPE, mutation.envelopeJson, version));
    if (this.stableId(payload.sortedFsearch) !== payload.historyId) {
      throw new Error("搜索历史 payload 的稳定 ID 与规范化查询不匹配");
    }
    const expectedObjectKey = this.codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, payload.historyId);
    if (expectedObjectKey !== mutation.objectKey) throw new Error("搜索历史 payload 与 object key 不匹配");
    return this.database.transaction((transaction) => {
      this.requireNoStableIdCollision(transaction, payload);
      const result = this.syncWriter.applyRemoteMutation(transaction, mutation, (businessTransaction) => {
        writeHistory(businessTransaction, payload);
      });
      return { ...result, item: this.itemFromPayload(payload) };
    }, "原子应用远端 search history change");
  }

  private stableId(sortedFsearch: string): string {
    requireString(sortedFsearch, "规范化搜索查询", true);
    return requireHistoryId(this.deriveHistoryId(sortedFsearch).toLowerCase());
  }

  private createItem(sortedFsearch: string, searchTerms: EHSearchTerm[], lastAccessTime: string): V2SearchHistoryItem {
    requireString(lastAccessTime, "搜索历史访问时间");
    if (!Array.isArray(searchTerms)) throw new Error("搜索历史 terms 必须是数组");
    const payloadTerms = searchTerms.map(termPayload);
    return {
      historyId: this.stableId(sortedFsearch),
      lastAccessTime,
      sortedFsearch,
      searchTerms: payloadTerms.map(toSearchTerm),
    };
  }

  private itemFromPayload(payload: SearchHistoryPayloadV1): V2SearchHistoryItem {
    return {
      historyId: payload.historyId,
      lastAccessTime: payload.lastAccessTime,
      sortedFsearch: payload.sortedFsearch,
      searchTerms: payload.searchTerms.map(toSearchTerm),
    };
  }

  private readPayload(transaction: SqliteTransactionContext, historyId: string): SearchHistoryPayloadV1 | undefined {
    const row = transaction.query<SearchHistoryRow>(
      `SELECT history_id, last_access_time, sorted_fsearch
       FROM search_history WHERE history_id = ?`,
      [historyId],
    )[0];
    if (!row) return undefined;
    const terms = transaction
      .query<SearchHistoryTermRow>(
        `SELECT history_id, term_index, namespace, qualifier, term, dollar, subtract, tilde
         FROM search_history_search_terms
         WHERE history_id = ?
         ORDER BY term_index`,
        [historyId],
      )
      .map((term) => ({
        namespace: term.namespace,
        qualifier: term.qualifier,
        term: term.term,
        dollar: term.dollar === 1,
        subtract: term.subtract === 1,
        tilde: term.tilde === 1,
      }));
    return {
      format: 1,
      historyId: row.history_id,
      sortedFsearch: row.sorted_fsearch,
      lastAccessTime: row.last_access_time,
      searchTerms: terms,
    };
  }

  private requireNoStableIdCollision(
    transaction: SqliteTransactionContext,
    payload: Pick<SearchHistoryPayloadV1, "historyId" | "sortedFsearch">,
  ): void {
    const conflict = transaction.query<{ history_id: string }>(
      "SELECT history_id FROM search_history WHERE sorted_fsearch = ? AND history_id <> ? LIMIT 1",
      [payload.sortedFsearch, payload.historyId],
    )[0];
    if (conflict) throw new Error("规范化搜索查询与另一个稳定 ID 冲突");
    const sameId = transaction.query<{ sorted_fsearch: string }>(
      "SELECT sorted_fsearch FROM search_history WHERE history_id = ? LIMIT 1",
      [payload.historyId],
    )[0];
    if (sameId && sameId.sorted_fsearch !== payload.sortedFsearch) {
      throw new Error("搜索历史稳定 ID 发生 SHA-256 碰撞");
    }
  }
}
