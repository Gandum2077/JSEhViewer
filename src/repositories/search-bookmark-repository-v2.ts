import { EHQualifier, EHSearchTerm, TagNamespace } from "ehentai-parser";
import { SqliteTransactionContext } from "../utils/sqlite-safe";
import {
  bookmarkPositionKeyAfter,
  bookmarkPositionKeyForIndex,
  requireBookmarkPositionKey,
} from "./bookmark-position-key";
import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";
import { SyncEntityEnvelopeCodec } from "./sync-entity-envelope-codec";
import { RemoteApplyResult, RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "./sync-mutation-writer";

export const SEARCH_BOOKMARK_ENTITY_TYPE = "search.bookmark.v1";

export interface SearchBookmarkTermPayloadV1 {
  namespace: string | null;
  qualifier: string | null;
  term: string;
  dollar: boolean;
  subtract: boolean;
  tilde: boolean;
}

export interface SearchBookmarkPayloadV1 {
  format: 1;
  bookmarkId: string;
  positionKey: string;
  sortedFsearch: string;
  searchTerms: SearchBookmarkTermPayloadV1[];
}

export interface V2SearchBookmarkItem {
  bookmarkId: string;
  positionKey: string;
  sortedFsearch: string;
  searchTerms: EHSearchTerm[];
}

export interface AddV2SearchBookmarkResult {
  inserted: boolean;
  item: V2SearchBookmarkItem;
  version?: SyncVersion;
}

export interface ApplyRemoteSearchBookmarkResult extends RemoteApplyResult {
  bookmarkId: string;
  membershipPresent: boolean;
}

interface SearchBookmarkRow {
  bookmark_id: string;
  position_key: string;
  sorted_fsearch: string;
}

interface SearchBookmarkTermRow {
  bookmark_id: string;
  term_index: number;
  namespace: string | null;
  qualifier: string | null;
  term: string;
  dollar: number;
  subtract: number;
  tilde: number;
}

export type SearchBookmarkIdDeriver = (sortedFsearch: string) => string;

function requireString(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`${name}必须是${allowEmpty ? "" : "非空"}字符串`);
  }
  return value;
}

function requireBookmarkId(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("搜索书签稳定 ID 必须是 64 位小写 SHA-256 十六进制字符串");
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

function termPayload(term: EHSearchTerm): SearchBookmarkTermPayloadV1 {
  return {
    namespace: term.namespace ?? null,
    qualifier: term.qualifier ?? null,
    term: requireString(term.term, "搜索词", true),
    dollar: Boolean(term.dollar),
    subtract: Boolean(term.subtract),
    tilde: Boolean(term.tilde),
  };
}

function parseTermPayload(value: unknown, index: number): SearchBookmarkTermPayloadV1 {
  if (typeof value !== "object" || value === null) {
    throw new Error(`搜索书签第 ${index + 1} 个 term 格式无效`);
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

function toSearchTerm(term: SearchBookmarkTermPayloadV1): EHSearchTerm {
  return {
    namespace: term.namespace === null ? undefined : (term.namespace as TagNamespace),
    qualifier: term.qualifier === null ? undefined : (term.qualifier as EHQualifier),
    term: term.term,
    dollar: term.dollar,
    subtract: term.subtract,
    tilde: term.tilde,
  };
}

function parsePayload(value: unknown): SearchBookmarkPayloadV1 {
  if (typeof value !== "object" || value === null) throw new Error("搜索书签同步 payload 格式无效");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== 1 || !Array.isArray(candidate.searchTerms)) {
    throw new Error("搜索书签同步 payload 版本或 terms 格式无效");
  }
  return {
    format: 1,
    bookmarkId: requireBookmarkId(requireString(candidate.bookmarkId, "搜索书签 ID")),
    positionKey: requireBookmarkPositionKey(requireString(candidate.positionKey, "书签 position key")),
    sortedFsearch: requireString(candidate.sortedFsearch, "规范化搜索查询", true),
    searchTerms: candidate.searchTerms.map(parseTermPayload),
  };
}

function payloadFor(item: V2SearchBookmarkItem): SearchBookmarkPayloadV1 {
  return {
    format: 1,
    bookmarkId: item.bookmarkId,
    positionKey: item.positionKey,
    sortedFsearch: item.sortedFsearch,
    searchTerms: item.searchTerms.map(termPayload),
  };
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
  bookmarkId: string,
  searchTerms: readonly SearchBookmarkTermPayloadV1[],
): void {
  searchTerms.forEach((term, termIndex) => {
    transaction.update(
      `INSERT INTO search_bookmarks_search_terms
       (bookmark_id, term_index, namespace, qualifier, term, dollar, subtract, tilde)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookmarkId,
        termIndex,
        term.namespace,
        term.qualifier,
        term.term,
        Number(term.dollar),
        Number(term.subtract),
        Number(term.tilde),
      ],
      "写入 v2 搜索书签 term",
    );
  });
}

function writeBookmark(transaction: SqliteTransactionContext, payload: SearchBookmarkPayloadV1): void {
  transaction.update(
    `INSERT INTO search_bookmarks (bookmark_id, position_key, sorted_fsearch)
     VALUES (?, ?, ?)
     ON CONFLICT(bookmark_id) DO UPDATE SET
       position_key = excluded.position_key,
       sorted_fsearch = excluded.sorted_fsearch`,
    [payload.bookmarkId, payload.positionKey, payload.sortedFsearch],
    "写入 v2 搜索书签 parent",
  );
  transaction.update("DELETE FROM search_bookmarks_search_terms WHERE bookmark_id = ?", [payload.bookmarkId]);
  insertTerms(transaction, payload.bookmarkId, payload.searchTerms);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return values.size === left.length && right.every((value) => values.has(value));
}

export class V2SearchBookmarkRepository {
  constructor(
    private readonly database: RepositoryDatabase,
    private readonly syncWriter: SyncMutationWriter,
    private readonly codec: SyncEntityEnvelopeCodec,
    private readonly deriveBookmarkId: SearchBookmarkIdDeriver,
  ) {}

  queryBookmarks(): V2SearchBookmarkItem[] {
    const parents = this.database.query(
      `SELECT bookmark_id, position_key, sorted_fsearch
       FROM search_bookmarks
       ORDER BY position_key, bookmark_id`,
    ) as SearchBookmarkRow[];
    if (parents.length === 0) return [];
    const terms = this.database.query(
      `SELECT bookmark_id, term_index, namespace, qualifier, term, dollar, subtract, tilde
       FROM search_bookmarks_search_terms
       ORDER BY bookmark_id, term_index`,
    ) as SearchBookmarkTermRow[];
    const termsByBookmark = new Map<string, EHSearchTerm[]>();
    for (const row of terms) {
      const values = termsByBookmark.get(row.bookmark_id) ?? [];
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
      termsByBookmark.set(row.bookmark_id, values);
    }
    return parents.map((row) => ({
      bookmarkId: row.bookmark_id,
      positionKey: requireBookmarkPositionKey(row.position_key),
      sortedFsearch: row.sorted_fsearch,
      searchTerms: termsByBookmark.get(row.bookmark_id) ?? [],
    }));
  }

  addBookmark(sortedFsearch: string, searchTerms: EHSearchTerm[], origin: MutationOrigin): AddV2SearchBookmarkResult {
    this.requireLocalUserOrigin(origin);
    const bookmarkId = this.stableId(sortedFsearch);
    return this.database.transaction((transaction) => {
      this.requireNoStableIdCollision(transaction, { bookmarkId, sortedFsearch });
      const existing = this.readPayload(transaction, bookmarkId);
      if (existing) return { inserted: false, item: this.itemFromPayload(existing) };
      const last = transaction.query<{ position_key: string }>(
        "SELECT position_key FROM search_bookmarks ORDER BY position_key DESC, bookmark_id DESC LIMIT 1",
      )[0];
      const item: V2SearchBookmarkItem = {
        bookmarkId,
        positionKey: bookmarkPositionKeyAfter(last?.position_key),
        sortedFsearch,
        searchTerms: this.normalizeTerms(searchTerms),
      };
      const payload = payloadFor(item);
      writeBookmark(transaction, payload);
      const version = this.recordLocalPayload(transaction, payload, MutationOrigin.user);
      return { inserted: true, item, version };
    }, "原子新增 v2 搜索书签与 outbox");
  }

  seedExistingBookmarks(): number {
    return this.database.transaction((transaction) => {
      const rows = transaction.query<SearchBookmarkRow>(
        `SELECT bookmark_id, position_key, sorted_fsearch
         FROM search_bookmarks
         ORDER BY position_key, bookmark_id`,
      );
      let seeded = 0;
      for (const row of rows) {
        const bookmarkId = requireBookmarkId(row.bookmark_id);
        requireBookmarkPositionKey(row.position_key);
        if (this.stableId(row.sorted_fsearch) !== bookmarkId) {
          throw new Error("迁移后的搜索书签稳定 ID 与规范化查询不匹配");
        }
        const objectKey = this.objectKey(bookmarkId);
        const existingVersion = transaction.query<{ found: number }>(
          "SELECT 1 AS found FROM sync_versions WHERE object_key = ? LIMIT 1",
          [objectKey],
        )[0];
        if (existingVersion) continue;
        const payload = this.readPayload(transaction, bookmarkId);
        if (!payload) throw new Error("读取迁移搜索书签 payload 失败");
        this.recordLocalPayload(transaction, payload, MutationOrigin.migrationSeed);
        seeded += 1;
      }
      return seeded;
    }, "seed v2 搜索书签同步状态");
  }

  deleteBookmark(bookmarkId: string, origin: MutationOrigin): boolean {
    this.requireLocalUserOrigin(origin);
    requireBookmarkId(bookmarkId);
    return this.database.transaction((transaction) => {
      const payload = this.readPayload(transaction, bookmarkId);
      if (!payload) return false;
      transaction.update("DELETE FROM search_bookmarks WHERE bookmark_id = ?", [bookmarkId]);
      this.recordLocalPayload(transaction, payload, MutationOrigin.user, true);
      return true;
    }, "原子删除 v2 搜索书签并写入 tombstone");
  }

  reorderBookmarks(bookmarkIds: string[], origin: MutationOrigin): number {
    this.requireLocalUserOrigin(origin);
    bookmarkIds.forEach(requireBookmarkId);
    return this.database.transaction((transaction) => {
      const existingIds = transaction
        .query<{ bookmark_id: string }>("SELECT bookmark_id FROM search_bookmarks ORDER BY position_key, bookmark_id")
        .map((row) => row.bookmark_id);
      if (!sameIds(bookmarkIds, existingIds)) throw new Error("书签重排必须且只能包含全部现有书签稳定 ID");
      let changed = 0;
      bookmarkIds.forEach((bookmarkId, index) => {
        const payload = this.readPayload(transaction, bookmarkId);
        if (!payload) throw new Error("书签重排时找不到目标 payload");
        const nextPositionKey = bookmarkPositionKeyForIndex(index);
        if (payload.positionKey === nextPositionKey) return;
        const nextPayload = { ...payload, positionKey: nextPositionKey };
        transaction.update("UPDATE search_bookmarks SET position_key = ? WHERE bookmark_id = ?", [
          nextPositionKey,
          bookmarkId,
        ]);
        this.recordLocalPayload(transaction, nextPayload, MutationOrigin.user);
        changed += 1;
      });
      return changed;
    }, "原子重排 v2 搜索书签与各项 outbox");
  }

  applyRemoteBookmark(mutation: RemoteSyncMutation): ApplyRemoteSearchBookmarkResult {
    if (mutation.entityType !== SEARCH_BOOKMARK_ENTITY_TYPE) {
      throw new Error("远端 change 的 entity type 不是 search bookmark v1");
    }
    const version = asVersion(mutation);
    const payload = parsePayload(
      this.codec.decodeEnvelope(SEARCH_BOOKMARK_ENTITY_TYPE, mutation.envelopeJson, version),
    );
    if (this.stableId(payload.sortedFsearch) !== payload.bookmarkId) {
      throw new Error("搜索书签 payload 的稳定 ID 与规范化查询不匹配");
    }
    if (this.objectKey(payload.bookmarkId) !== mutation.objectKey) {
      throw new Error("搜索书签 payload 与 object key 不匹配");
    }
    return this.database.transaction((transaction) => {
      this.requireNoStableIdCollision(transaction, payload);
      const result = this.syncWriter.applyRemoteMutation(transaction, mutation, (businessTransaction) => {
        if (mutation.deleted) {
          businessTransaction.update("DELETE FROM search_bookmarks WHERE bookmark_id = ?", [payload.bookmarkId]);
        } else {
          writeBookmark(businessTransaction, payload);
        }
      });
      const membershipPresent = Boolean(
        transaction.query<{ found: number }>("SELECT 1 AS found FROM search_bookmarks WHERE bookmark_id = ? LIMIT 1", [
          payload.bookmarkId,
        ])[0],
      );
      return { ...result, bookmarkId: payload.bookmarkId, membershipPresent };
    }, "原子应用远端 search bookmark change");
  }

  private requireLocalUserOrigin(origin: MutationOrigin): void {
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.user) {
      throw new Error("v2 搜索书签的本机操作只接受 user 来源；远端 change 必须携带版本元数据");
    }
  }

  private stableId(sortedFsearch: string): string {
    requireString(sortedFsearch, "规范化搜索查询", true);
    return requireBookmarkId(this.deriveBookmarkId(sortedFsearch).toLowerCase());
  }

  private objectKey(bookmarkId: string): string {
    return this.codec.deriveObjectKey(SEARCH_BOOKMARK_ENTITY_TYPE, bookmarkId);
  }

  private normalizeTerms(searchTerms: EHSearchTerm[]): EHSearchTerm[] {
    if (!Array.isArray(searchTerms)) throw new Error("搜索书签 terms 必须是数组");
    return searchTerms.map(termPayload).map(toSearchTerm);
  }

  private itemFromPayload(payload: SearchBookmarkPayloadV1): V2SearchBookmarkItem {
    return {
      bookmarkId: payload.bookmarkId,
      positionKey: payload.positionKey,
      sortedFsearch: payload.sortedFsearch,
      searchTerms: payload.searchTerms.map(toSearchTerm),
    };
  }

  private recordLocalPayload(
    transaction: SqliteTransactionContext,
    payload: SearchBookmarkPayloadV1,
    origin: typeof MutationOrigin.user | typeof MutationOrigin.migrationSeed,
    deleted = false,
  ): SyncVersion {
    return this.syncWriter.recordLocalMutation(transaction, {
      origin,
      objectKey: this.objectKey(payload.bookmarkId),
      entityType: SEARCH_BOOKMARK_ENTITY_TYPE,
      deleted,
      createEnvelopeJson: (createdVersion) =>
        this.codec.encodeEnvelope(SEARCH_BOOKMARK_ENTITY_TYPE, payload, createdVersion),
    });
  }

  private readPayload(transaction: SqliteTransactionContext, bookmarkId: string): SearchBookmarkPayloadV1 | undefined {
    const row = transaction.query<SearchBookmarkRow>(
      `SELECT bookmark_id, position_key, sorted_fsearch
       FROM search_bookmarks WHERE bookmark_id = ?`,
      [bookmarkId],
    )[0];
    if (!row) return undefined;
    const terms = transaction
      .query<SearchBookmarkTermRow>(
        `SELECT bookmark_id, term_index, namespace, qualifier, term, dollar, subtract, tilde
         FROM search_bookmarks_search_terms
         WHERE bookmark_id = ?
         ORDER BY term_index`,
        [bookmarkId],
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
      bookmarkId: row.bookmark_id,
      positionKey: requireBookmarkPositionKey(row.position_key),
      sortedFsearch: row.sorted_fsearch,
      searchTerms: terms,
    };
  }

  private requireNoStableIdCollision(
    transaction: SqliteTransactionContext,
    payload: Pick<SearchBookmarkPayloadV1, "bookmarkId" | "sortedFsearch">,
  ): void {
    const conflict = transaction.query<{ bookmark_id: string }>(
      "SELECT bookmark_id FROM search_bookmarks WHERE sorted_fsearch = ? AND bookmark_id <> ? LIMIT 1",
      [payload.sortedFsearch, payload.bookmarkId],
    )[0];
    if (conflict) throw new Error("规范化搜索查询与另一个书签稳定 ID 冲突");
    const sameId = transaction.query<{ sorted_fsearch: string }>(
      "SELECT sorted_fsearch FROM search_bookmarks WHERE bookmark_id = ? LIMIT 1",
      [payload.bookmarkId],
    )[0];
    if (sameId && sameId.sorted_fsearch !== payload.sortedFsearch) {
      throw new Error("搜索书签稳定 ID 发生 SHA-256 碰撞");
    }
  }
}
