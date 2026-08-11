import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import {
  SEARCH_HISTORY_ENTITY_TYPE,
  SearchHistoryPayloadV1,
  V2SearchHistoryRepository,
} from "../repositories/search-history-repository-v2";
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

const DATABASE_PATH = "assets/cloud-sync-phase1-search-history-repository-v2.db";

export interface CloudSyncSearchHistoryRepositoryV2DiagnosticResult {
  ok: true;
  seededCount: number;
  parentTermsAndOutboxAtomic: true;
  versionBoundEnvelope: true;
  localClearWithoutTombstone: true;
  remoteVersionOrdering: true;
  fullRestoreSupported: true;
  rollbackAtomic: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncSearchHistoryRepositoryV2DiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncSearchHistoryRepositoryV2DiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError(`无法清理 v2 搜索历史临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "v2 搜索历史临时库查询"),
        "v2 搜索历史临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "v2 搜索历史临时库事务"),
        `${operation || "v2 搜索历史临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 v2 搜索历史临时库外键"),
      "启用 v2 搜索历史临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function queryCount(database: RepositoryDatabase, sql: string, args?: SqliteValue[]): number {
  const row = database.query(sql, args)[0] as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function execute(queue: SqliteTypes.SqliteQueueInstance, sql: string, operation: string): void {
  withSqliteQueueOperation(queue, (db) => checkedSqliteUpdate(db, sql, undefined, operation), `${operation}队列`);
}

function historyId(sortedFsearch: string): string {
  return $text.SHA256(sortedFsearch).toLowerCase();
}

function createRemoteMutation(
  codec: CloudSyncDiagnosticEntityCodec,
  sortedFsearch: string,
  wallMs: number,
  opId: string,
  term: string,
  lastAccessTime: string,
): RemoteSyncMutation {
  const stableId = historyId(sortedFsearch);
  const version: SyncVersion = {
    objectKey: codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, stableId),
    entityType: SEARCH_HISTORY_ENTITY_TYPE,
    wallMs,
    logicalCounter: 0,
    deviceId: "phase1-device-b",
    deleted: false,
    opId,
  };
  const payload: SearchHistoryPayloadV1 = {
    format: 1,
    historyId: stableId,
    sortedFsearch,
    lastAccessTime,
    searchTerms: [
      {
        namespace: "artist",
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
    envelopeJson: codec.encodeEnvelope(SEARCH_HISTORY_ENTITY_TYPE, payload, version),
  };
}

function populateAndCheck(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    const seededId = historyId("seeded-query");
    database.transaction((transaction) => {
      for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
        transaction.update(statement.sql, undefined, `创建 v2 搜索历史诊断用 ${statement.name}`);
      }
      transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置诊断库版本");
      transaction.update("INSERT INTO search_history (history_id, last_access_time, sorted_fsearch) VALUES (?, ?, ?)", [
        seededId,
        "2026-01-01T00:00:00.000Z",
        "seeded-query",
      ]);
      transaction.update(
        `INSERT INTO search_history_search_terms
         (history_id, term_index, namespace, term, dollar, subtract, tilde)
         VALUES (?, 0, ?, ?, 0, 0, 0)`,
        [seededId, "artist", "seeded"],
      );
    }, "创建 v2 搜索历史诊断库");

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
    const repository = new V2SearchHistoryRepository(database, writer, codec, historyId);

    if (repository.seedExistingHistory() !== 1 || repository.seedExistingHistory() !== 0) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("已有搜索历史 seed 不是可重入操作");
    }
    const local = repository.upsertHistory(
      "artist:alice",
      [
        { namespace: "artist", term: "alpha|beta;gamma", dollar: true, subtract: false, tilde: false },
        { qualifier: "uploader", term: "someone", dollar: false, subtract: true, tilde: false },
      ],
      MutationOrigin.user,
      "2026-02-01T00:00:00.000Z",
    );
    if (!local.changed || local.item.searchTerms[0]?.term !== "alpha|beta;gamma") {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("v2 搜索历史 parent/terms/outbox 没有原子写入");
    }
    const localKey = codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, local.item.historyId);
    const outbox = database.query(
      "SELECT wall_ms, logical_counter, envelope_json FROM sync_outbox WHERE object_key = ?",
      [localKey],
    )[0] as { wall_ms?: number; logical_counter?: number; envelope_json?: string } | undefined;
    if (!outbox?.envelope_json) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("v2 搜索历史缺少 outbox envelope");
    }
    const envelope = JSON.parse(outbox.envelope_json) as {
      objectKey?: string;
      wallMs?: number;
      logicalCounter?: number;
    };
    if (
      envelope.objectKey !== localKey ||
      envelope.wallMs !== outbox.wall_ms ||
      envelope.logicalCounter !== outbox.logical_counter
    ) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("搜索历史 envelope 没有绑定 object key 与 HLC");
    }

    execute(
      queue,
      `CREATE TRIGGER fail_v2_history_term
       BEFORE INSERT ON search_history_search_terms
       WHEN NEW.term = 'force-rollback'
       BEGIN
         SELECT RAISE(ABORT, 'injected v2 history term failure');
       END`,
      "创建 v2 搜索历史 terms 故障触发器",
    );
    let failureRejected = false;
    try {
      repository.upsertHistory(
        "failure-query",
        [{ term: "force-rollback", dollar: false, subtract: false, tilde: false }],
        MutationOrigin.user,
        "2026-02-02T00:00:00.000Z",
      );
    } catch {
      failureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_v2_history_term", "删除 v2 搜索历史 terms 故障触发器");
    const failureId = historyId("failure-query");
    const failureKey = codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, failureId);
    if (
      !failureRejected ||
      queryCount(database, "SELECT COUNT(*) AS count FROM search_history WHERE history_id = ?", [failureId]) !== 0 ||
      queryCount(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?", [failureKey]) !== 0
    ) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("搜索历史 terms 故障没有完整回滚 parent/版本/outbox");
    }

    const outboxFailureId = historyId("outbox-failure-query");
    const outboxFailureKey = codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, outboxFailureId);
    execute(
      queue,
      `CREATE TRIGGER fail_v2_history_outbox
       BEFORE INSERT ON sync_outbox
       WHEN NEW.object_key = '${outboxFailureKey}'
       BEGIN
         SELECT RAISE(ABORT, 'injected v2 history outbox failure');
       END`,
      "创建 v2 搜索历史 outbox 故障触发器",
    );
    let outboxFailureRejected = false;
    try {
      repository.upsertHistory(
        "outbox-failure-query",
        [{ term: "written-before-outbox", dollar: false, subtract: false, tilde: false }],
        MutationOrigin.user,
        "2026-02-03T00:00:00.000Z",
      );
    } catch {
      outboxFailureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_v2_history_outbox", "删除 v2 搜索历史 outbox 故障触发器");
    if (
      !outboxFailureRejected ||
      queryCount(database, "SELECT COUNT(*) AS count FROM search_history WHERE history_id = ?", [outboxFailureId]) !==
        0 ||
      queryCount(database, "SELECT COUNT(*) AS count FROM search_history_search_terms WHERE history_id = ?", [
        outboxFailureId,
      ]) !== 0 ||
      queryCount(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?", [outboxFailureKey]) !== 0
    ) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("搜索历史 outbox 故障没有完整回滚 parent/terms/版本");
    }

    if (!repository.deleteHistoryLocally(local.item.historyId)) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("本机搜索历史删除没有执行");
    }
    if (
      queryCount(database, "SELECT COUNT(*) AS count FROM search_history WHERE history_id = ?", [
        local.item.historyId,
      ]) !== 0 ||
      queryCount(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?", [localKey]) !== 0 ||
      queryCount(database, "SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?", [localKey]) !== 0 ||
      queryCount(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE entity_type = ? AND deleted = 1", [
        SEARCH_HISTORY_ENTITY_TYPE,
      ]) !== 0
    ) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("本机删除产生了云端 tombstone 或遗留同步状态");
    }

    const remote = createRemoteMutation(
      codec,
      "artist:alice",
      2000,
      "10000000-0000-4000-8000-000000000001",
      "remote",
      "2026-03-01T00:00:00.000Z",
    );
    const restored = repository.applyRemoteHistory(remote);
    const duplicate = repository.applyRemoteHistory(remote);
    const stale = repository.applyRemoteHistory(
      createRemoteMutation(
        codec,
        "artist:alice",
        1900,
        "10000000-0000-4000-8000-000000000002",
        "stale",
        "2026-02-20T00:00:00.000Z",
      ),
    );
    if (
      !restored.applied ||
      duplicate.applied ||
      stale.applied ||
      repository.queryHistory()[0]?.searchTerms[0]?.term !== "remote"
    ) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("远端搜索历史新旧/重复顺序或全量重建不正确");
    }

    nowMs = 3000;
    const oldOne = repository.upsertHistory(
      "old-one",
      [{ term: "old-1", dollar: false, subtract: false, tilde: false }],
      MutationOrigin.user,
      "2025-01-01T00:00:00.000Z",
    );
    const oldTwo = repository.upsertHistory(
      "old-two",
      [{ term: "old-2", dollar: false, subtract: false, tilde: false }],
      MutationOrigin.user,
      "2025-02-01T00:00:00.000Z",
    );
    repository.upsertHistory(
      "new-one",
      [{ term: "new", dollar: false, subtract: false, tilde: false }],
      MutationOrigin.user,
      "2026-04-01T00:00:00.000Z",
    );
    if (repository.deleteHistoryBeforeLocally("2026-01-01T00:00:00.000Z") !== 2) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("按时间清理本机搜索历史数量错误");
    }
    for (const item of [oldOne.item, oldTwo.item]) {
      const key = codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, item.historyId);
      if (
        queryCount(database, "SELECT COUNT(*) AS count FROM search_history WHERE history_id = ?", [item.historyId]) !==
          0 ||
        queryCount(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?", [key]) !== 0
      ) {
        throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("按时间清理没有取消本机历史版本/outbox");
      }
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    const repository = new V2SearchHistoryRepository(
      database,
      new SyncMutationWriter({
        deviceId: "phase1-device-a",
        nowMs: () => 4000,
        createOpId: () => "20000000-0000-4000-8000-000000000001",
      }),
      new CloudSyncDiagnosticEntityCodec(),
      historyId,
    );
    const history = repository.queryHistory();
    if (
      history.map((item) => item.sortedFsearch).join("|") !== "new-one|artist:alice|seeded-query" ||
      history.find((item) => item.sortedFsearch === "artist:alice")?.searchTerms[0]?.term !== "remote"
    ) {
      throw new CloudSyncSearchHistoryRepositoryV2DiagnosticError("关闭重开后 v2 搜索历史、terms 或顺序不完整");
    }
  });
}

export function runCloudSyncSearchHistoryRepositoryV2Diagnostic(): CloudSyncSearchHistoryRepositoryV2DiagnosticResult {
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
    seededCount: 1,
    parentTermsAndOutboxAtomic: true,
    versionBoundEnvelope: true,
    localClearWithoutTombstone: true,
    remoteVersionOrdering: true,
    fullRestoreSupported: true,
    rollbackAtomic: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
