import { bookmarkPositionKeyForIndex } from "../repositories/bookmark-position-key";
import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import {
  SEARCH_BOOKMARK_ENTITY_TYPE,
  SearchBookmarkPayloadV1,
  V2SearchBookmarkRepository,
} from "../repositories/search-bookmark-repository-v2";
import { RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "../repositories/sync-mutation-writer";
import { CloudSyncDiagnosticEntityCodec } from "./cloud-sync-diagnostic-entity-codec";
import { DATABASE_V2_DRAFT_SCHEMA_STATEMENTS, DATABASE_V2_DRAFT_USER_VERSION } from "./database-schema-v2-draft";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const DATABASE_PATH = "assets/cloud-sync-phase1-search-bookmark-repository-v2.db";

export interface CloudSyncSearchBookmarkRepositoryV2DiagnosticResult {
  ok: true;
  seededCount: number;
  parentTermsAndOutboxAtomic: true;
  deterministicPositionKeys: true;
  reorderAtomic: true;
  tombstoneIdentity: true;
  remoteVersionOrdering: true;
  concurrentPositionPreserved: true;
  rollbackAtomic: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncSearchBookmarkRepositoryV2DiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncSearchBookmarkRepositoryV2DiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError(`无法清理 v2 搜索书签临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "v2 搜索书签临时库查询"),
        "v2 搜索书签临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "v2 搜索书签临时库事务"),
        `${operation || "v2 搜索书签临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 v2 搜索书签临时库外键"),
      "启用 v2 搜索书签临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function execute(queue: SqliteTypes.SqliteQueueInstance, sql: string, operation: string): void {
  withSqliteQueueOperation(queue, (db) => checkedSqliteUpdate(db, sql, undefined, operation), `${operation}队列`);
}

function queryCount(database: RepositoryDatabase, sql: string, args?: SqliteValue[]): number {
  return Number((database.query(sql, args)[0] as { count?: number } | undefined)?.count ?? 0);
}

function bookmarkId(sortedFsearch: string): string {
  return $text.SHA256(sortedFsearch).toLowerCase();
}

function remoteMutation(
  codec: CloudSyncDiagnosticEntityCodec,
  sortedFsearch: string,
  positionKey: string,
  term: string,
  wallMs: number,
  opId: string,
  deleted = false,
): RemoteSyncMutation {
  const stableId = bookmarkId(sortedFsearch);
  const version: SyncVersion = {
    objectKey: codec.deriveObjectKey(SEARCH_BOOKMARK_ENTITY_TYPE, stableId),
    entityType: SEARCH_BOOKMARK_ENTITY_TYPE,
    wallMs,
    logicalCounter: 0,
    deviceId: "phase1-device-b",
    deleted,
    opId,
  };
  const payload: SearchBookmarkPayloadV1 = {
    format: 1,
    bookmarkId: stableId,
    positionKey,
    sortedFsearch,
    searchTerms: [
      {
        namespace: null,
        qualifier: null,
        term,
        dollar: false,
        subtract: false,
        tilde: false,
      },
    ],
  };
  return {
    ...version,
    origin: MutationOrigin.remote,
    envelopeJson: codec.encodeEnvelope(SEARCH_BOOKMARK_ENTITY_TYPE, payload, version),
  };
}

function populateAndCheck(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    database.transaction((transaction) => {
      for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
        transaction.update(statement.sql, undefined, `创建 v2 搜索书签诊断用 ${statement.name}`);
      }
      transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置诊断库版本");
      ["bookmark-a", "bookmark-b", "bookmark-c"].forEach((sortedFsearch, index) => {
        const stableId = bookmarkId(sortedFsearch);
        transaction.update(
          "INSERT INTO search_bookmarks (bookmark_id, position_key, sorted_fsearch) VALUES (?, ?, ?)",
          [stableId, bookmarkPositionKeyForIndex(index), sortedFsearch],
        );
        transaction.update(
          `INSERT INTO search_bookmarks_search_terms
           (bookmark_id, term_index, term, dollar, subtract, tilde)
           VALUES (?, 0, ?, 0, 0, 0)`,
          [stableId, sortedFsearch],
        );
      });
    }, "创建 v2 搜索书签诊断库");

    let nowMs = 1000;
    let opSequence = 0;
    const codec = new CloudSyncDiagnosticEntityCodec();
    const writer = new SyncMutationWriter({
      deviceId: "phase1-device-a",
      nowMs: () => nowMs,
      createOpId: () => {
        opSequence += 1;
        return `00000000-0000-4000-8000-${String(opSequence).padStart(12, "0")}`;
      },
    });
    const repository = new V2SearchBookmarkRepository(database, writer, codec, bookmarkId);
    if (repository.seedExistingBookmarks() !== 3 || repository.seedExistingBookmarks() !== 0) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("已有搜索书签 seed 不是可重入操作");
    }

    const added = repository.addBookmark(
      "bookmark-d",
      [
        { namespace: "artist", term: "alpha|beta;gamma", dollar: true, subtract: false, tilde: false },
        { qualifier: "uploader", term: "someone", dollar: false, subtract: true, tilde: false },
      ],
      MutationOrigin.user,
    );
    if (!added.inserted || added.item.positionKey !== bookmarkPositionKeyForIndex(3)) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("新增书签没有原子写入 parent/terms/position/outbox");
    }
    const addedKey = codec.deriveObjectKey(SEARCH_BOOKMARK_ENTITY_TYPE, added.item.bookmarkId);
    const outbox = database.query(
      "SELECT wall_ms, logical_counter, envelope_json FROM sync_outbox WHERE object_key = ?",
      [addedKey],
    )[0] as { wall_ms?: number; logical_counter?: number; envelope_json?: string } | undefined;
    if (!outbox?.envelope_json) throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("新增书签缺少 outbox");
    const envelope = JSON.parse(outbox.envelope_json) as {
      objectKey?: string;
      wallMs?: number;
      logicalCounter?: number;
    };
    if (
      envelope.objectKey !== addedKey ||
      envelope.wallMs !== outbox.wall_ms ||
      envelope.logicalCounter !== outbox.logical_counter
    ) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("书签 envelope 没有绑定 object key 与 HLC");
    }

    const failureId = bookmarkId("add-failure");
    const failureKey = codec.deriveObjectKey(SEARCH_BOOKMARK_ENTITY_TYPE, failureId);
    execute(
      queue,
      `CREATE TRIGGER fail_v2_bookmark_outbox
       BEFORE INSERT ON sync_outbox
       WHEN NEW.object_key = '${failureKey}'
       BEGIN
         SELECT RAISE(ABORT, 'injected v2 bookmark outbox failure');
       END`,
      "创建 v2 搜索书签 outbox 故障触发器",
    );
    let addFailureRejected = false;
    try {
      repository.addBookmark(
        "add-failure",
        [{ term: "written-before-outbox", dollar: false, subtract: false, tilde: false }],
        MutationOrigin.user,
      );
    } catch {
      addFailureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_v2_bookmark_outbox", "删除 v2 搜索书签 outbox 故障触发器");
    if (
      !addFailureRejected ||
      queryCount(database, "SELECT COUNT(*) AS count FROM search_bookmarks WHERE bookmark_id = ?", [failureId]) !== 0 ||
      queryCount(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?", [failureKey]) !== 0
    ) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("书签 outbox 故障没有完整回滚业务行和版本");
    }

    const initial = repository.queryBookmarks();
    nowMs = 1100;
    const reversedIds = [...initial].reverse().map((item) => item.bookmarkId);
    if (repository.reorderBookmarks(reversedIds, MutationOrigin.user) !== 4) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("书签重排没有逐项生成版本");
    }
    if (
      repository
        .queryBookmarks()
        .some(
          (item, index) =>
            item.bookmarkId !== reversedIds[index] || item.positionKey !== bookmarkPositionKeyForIndex(index),
        )
    ) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("书签重排后的稳定顺序或 position key 错误");
    }
    let invalidReorderRejected = false;
    try {
      repository.reorderBookmarks(reversedIds.slice(1), MutationOrigin.user);
    } catch {
      invalidReorderRejected = true;
    }
    if (!invalidReorderRejected) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("不完整书签重排没有被拒绝");
    }

    const rollbackKey = codec.deriveObjectKey(SEARCH_BOOKMARK_ENTITY_TYPE, bookmarkId("bookmark-c"));
    execute(
      queue,
      `CREATE TRIGGER fail_v2_bookmark_reorder
       BEFORE INSERT ON sync_outbox
       WHEN NEW.object_key = '${rollbackKey}'
       BEGIN
         SELECT RAISE(ABORT, 'injected v2 bookmark reorder failure');
       END`,
      "创建 v2 搜索书签重排故障触发器",
    );
    const orderBeforeFailure = repository.queryBookmarks().map((item) => `${item.bookmarkId}:${item.positionKey}`);
    let reorderFailureRejected = false;
    try {
      repository.reorderBookmarks([...reversedIds].reverse(), MutationOrigin.user);
    } catch {
      reorderFailureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_v2_bookmark_reorder", "删除 v2 搜索书签重排故障触发器");
    if (
      !reorderFailureRejected ||
      repository
        .queryBookmarks()
        .map((item) => `${item.bookmarkId}:${item.positionKey}`)
        .join("|") !== orderBeforeFailure.join("|")
    ) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("书签重排中途失败没有完整回滚所有位置");
    }

    const bookmarkB = repository.queryBookmarks().find((item) => item.sortedFsearch === "bookmark-b");
    if (!bookmarkB || !repository.deleteBookmark(bookmarkB.bookmarkId, MutationOrigin.user)) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("本机书签删除没有写入 tombstone");
    }
    const bKey = codec.deriveObjectKey(SEARCH_BOOKMARK_ENTITY_TYPE, bookmarkB.bookmarkId);
    const tombstone = database.query(
      `SELECT versions.wall_ms, versions.logical_counter, versions.device_id, versions.last_op_id,
              outbox.envelope_json
       FROM sync_versions AS versions
       JOIN sync_outbox AS outbox USING (object_key)
       WHERE versions.object_key = ? AND versions.deleted = 1`,
      [bKey],
    )[0] as
      | {
          wall_ms: number;
          logical_counter: number;
          device_id: string;
          last_op_id: string;
          envelope_json: string;
        }
      | undefined;
    if (!tombstone) throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("找不到书签 tombstone");
    const tombstonePayload = codec.decodeEnvelope(SEARCH_BOOKMARK_ENTITY_TYPE, tombstone.envelope_json, {
      objectKey: bKey,
      entityType: SEARCH_BOOKMARK_ENTITY_TYPE,
      wallMs: tombstone.wall_ms,
      logicalCounter: tombstone.logical_counter,
      deviceId: tombstone.device_id,
      deleted: true,
      opId: tombstone.last_op_id,
    }) as { bookmarkId?: string };
    if (tombstonePayload.bookmarkId !== bookmarkB.bookmarkId) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("无法从书签 tombstone 恢复实体身份");
    }

    const stale = repository.applyRemoteBookmark(
      remoteMutation(
        codec,
        "bookmark-b",
        bookmarkPositionKeyForIndex(3),
        "stale",
        1099,
        "10000000-0000-4000-8000-000000000001",
      ),
    );
    const newer = remoteMutation(
      codec,
      "bookmark-b",
      bookmarkPositionKeyForIndex(1),
      "remote-b",
      1300,
      "10000000-0000-4000-8000-000000000002",
    );
    const restored = repository.applyRemoteBookmark(newer);
    const duplicate = repository.applyRemoteBookmark(newer);
    const remoteDelete = repository.applyRemoteBookmark(
      remoteMutation(
        codec,
        "bookmark-b",
        bookmarkPositionKeyForIndex(1),
        "remote-b",
        1400,
        "10000000-0000-4000-8000-000000000003",
        true,
      ),
    );
    if (
      stale.applied ||
      stale.membershipPresent ||
      !restored.applied ||
      duplicate.applied ||
      remoteDelete.membershipPresent
    ) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("远端书签新旧/重复版本或删除顺序错误");
    }

    const tiedPosition = bookmarkPositionKeyForIndex(8);
    ["concurrent-a", "concurrent-b"].forEach((name, index) => {
      repository.applyRemoteBookmark(
        remoteMutation(
          codec,
          name,
          tiedPosition,
          name,
          1500 + index,
          `10000000-0000-4000-8000-${String(4 + index).padStart(12, "0")}`,
        ),
      );
    });
    const tied = repository.queryBookmarks().filter((item) => item.positionKey === tiedPosition);
    if (
      tied.length !== 2 ||
      tied.map((item) => item.bookmarkId).join("|") !==
        tied
          .map((item) => item.bookmarkId)
          .sort()
          .join("|")
    ) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("并发相同 position key 丢失书签或顺序不确定");
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const repository = new V2SearchBookmarkRepository(
      createDatabase(queue),
      new SyncMutationWriter({
        deviceId: "phase1-device-a",
        nowMs: () => 2000,
        createOpId: () => "20000000-0000-4000-8000-000000000001",
      }),
      new CloudSyncDiagnosticEntityCodec(),
      bookmarkId,
    );
    const bookmarks = repository.queryBookmarks();
    if (
      bookmarks.length !== 5 ||
      bookmarks.some((item) => item.sortedFsearch === "bookmark-b") ||
      !bookmarks.some(
        (item) => item.sortedFsearch === "bookmark-d" && item.searchTerms[0]?.term === "alpha|beta;gamma",
      ) ||
      bookmarks.filter((item) => item.positionKey === bookmarkPositionKeyForIndex(8)).length !== 2
    ) {
      throw new CloudSyncSearchBookmarkRepositoryV2DiagnosticError("关闭重开后 v2 搜索书签、terms 或并发位置不完整");
    }
  });
}

export function runCloudSyncSearchBookmarkRepositoryV2Diagnostic(): CloudSyncSearchBookmarkRepositoryV2DiagnosticResult {
  const startedAt = Date.now();
  removeDatabase(DATABASE_PATH);
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    populateAndCheck();
    checkReopen();
  } catch (error) {
    operationError = error;
  }
  try {
    removeDatabase(DATABASE_PATH);
  } catch (error) {
    cleanupError = error;
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return {
    ok: true,
    seededCount: 3,
    parentTermsAndOutboxAtomic: true,
    deterministicPositionKeys: true,
    reorderAtomic: true,
    tombstoneIdentity: true,
    remoteVersionOrdering: true,
    concurrentPositionPreserved: true,
    rollbackAtomic: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
