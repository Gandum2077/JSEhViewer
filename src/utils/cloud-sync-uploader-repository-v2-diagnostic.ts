import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import { RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "../repositories/sync-mutation-writer";
import { MARKED_UPLOADER_ENTITY_TYPE, V2UploaderRepository } from "../repositories/uploader-repository-v2";
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

const DATABASE_PATH = "assets/cloud-sync-phase1-uploader-repository-v2.db";

export interface CloudSyncUploaderRepositoryV2DiagnosticResult {
  ok: true;
  seededCount: number;
  localAtomic: true;
  versionBoundEnvelope: true;
  tombstoneIdentity: true;
  remoteOrdering: true;
  bannedIsolation: true;
  rollbackAtomic: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncUploaderRepositoryV2DiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncUploaderRepositoryV2DiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError(`无法清理 v2 上传者临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "v2 上传者临时库查询"),
        "v2 上传者临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "v2 上传者临时库事务"),
        `${operation || "v2 上传者临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 v2 上传者临时库外键"),
      "启用 v2 上传者临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function queryOne<T extends Record<string, any>>(database: RepositoryDatabase, sql: string, args?: SqliteValue[]): T {
  const row = database.query(sql, args)[0] as T | undefined;
  if (!row) throw new CloudSyncUploaderRepositoryV2DiagnosticError("v2 上传者诊断缺少预期数据库行");
  return row;
}

function execute(queue: SqliteTypes.SqliteQueueInstance, sql: string, operation: string): void {
  withSqliteQueueOperation(queue, (db) => checkedSqliteUpdate(db, sql, undefined, operation), `${operation}队列`);
}

function createRemoteMutation(
  codec: CloudSyncDiagnosticEntityCodec,
  uploader: string,
  wallMs: number,
  opId: string,
  deleted = false,
  logicalCounter = 0,
): RemoteSyncMutation {
  const version: SyncVersion = {
    objectKey: codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, uploader),
    entityType: MARKED_UPLOADER_ENTITY_TYPE,
    wallMs,
    logicalCounter,
    deviceId: "phase1-device-b",
    deleted,
    opId,
  };
  return {
    ...version,
    origin: MutationOrigin.remote,
    envelopeJson: codec.encodeEnvelope(MARKED_UPLOADER_ENTITY_TYPE, { format: 1, uploader }, version),
  };
}

function populateAndCheck(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    database.transaction((transaction) => {
      for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
        transaction.update(statement.sql, undefined, `创建 v2 上传者诊断用 ${statement.name}`);
      }
      transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置诊断库版本");
      transaction.update("INSERT INTO marked_uploaders (uploader) VALUES (?)", ["seeded"]);
    }, "创建 v2 上传者诊断库");

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
    const repository = new V2UploaderRepository(database, writer, codec);

    if (repository.seedExistingMarkedUploaders() !== 1 || repository.seedExistingMarkedUploaders() !== 0) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("已有标记上传者 seed 不是可重入操作");
    }
    if (!repository.addMarkedUploader("alice", MutationOrigin.user)) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("v2 用户标记没有写入业务表和 outbox");
    }
    const aliceKey = codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, "alice");
    const aliceOutbox = queryOne<{ envelope_json: string; wall_ms: number; logical_counter: number }>(
      database,
      "SELECT envelope_json, wall_ms, logical_counter FROM sync_outbox WHERE object_key = ?",
      [aliceKey],
    );
    const aliceEnvelope = JSON.parse(aliceOutbox.envelope_json) as {
      objectKey?: string;
      wallMs?: number;
      logicalCounter?: number;
    };
    if (
      aliceEnvelope.objectKey !== aliceKey ||
      aliceEnvelope.wallMs !== aliceOutbox.wall_ms ||
      aliceEnvelope.logicalCounter !== aliceOutbox.logical_counter
    ) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("实体 envelope 没有绑定写入内核生成的 object key 与 HLC");
    }

    const failureKey = codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, "failure");
    execute(
      queue,
      `CREATE TRIGGER fail_v2_uploader_outbox
       BEFORE INSERT ON sync_outbox
       WHEN NEW.object_key = '${failureKey}'
       BEGIN
         SELECT RAISE(ABORT, 'injected v2 uploader outbox failure');
       END`,
      "创建 v2 上传者 outbox 故障触发器",
    );
    let localFailureRejected = false;
    try {
      repository.addMarkedUploader("failure", MutationOrigin.user);
    } catch {
      localFailureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_v2_uploader_outbox", "删除 v2 上传者 outbox 故障触发器");
    if (
      !localFailureRejected ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM marked_uploaders WHERE uploader = ?", [
          "failure",
        ]).count,
      ) !== 0 ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?", [
          failureKey,
        ]).count,
      ) !== 0
    ) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("v2 上传者 outbox 故障没有完整回滚业务行与版本");
    }

    nowMs = 1100;
    if (!repository.deleteMarkedUploader("alice", MutationOrigin.user)) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("v2 用户删除没有写入 tombstone");
    }
    const tombstone = queryOne<{
      envelope_json: string | null;
      wall_ms: number;
      logical_counter: number;
      device_id: string;
      last_op_id: string;
    }>(
      database,
      `SELECT outbox.envelope_json, versions.wall_ms, versions.logical_counter,
              versions.device_id, versions.last_op_id
       FROM sync_versions AS versions
       JOIN sync_outbox AS outbox USING (object_key)
       WHERE object_key = ? AND versions.deleted = 1`,
      [aliceKey],
    );
    if (!tombstone.envelope_json) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("不透明 tombstone 没有携带加密实体身份");
    }
    const decodedTombstone = codec.decodeEnvelope(MARKED_UPLOADER_ENTITY_TYPE, tombstone.envelope_json, {
      objectKey: aliceKey,
      entityType: MARKED_UPLOADER_ENTITY_TYPE,
      wallMs: tombstone.wall_ms,
      logicalCounter: tombstone.logical_counter,
      deviceId: tombstone.device_id,
      deleted: true,
      opId: tombstone.last_op_id,
    }) as { uploader?: string };
    if (decodedTombstone.uploader !== "alice") {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("无法从 tombstone 恢复实体身份");
    }

    const stale = repository.applyRemoteMarkedUploader(
      createRemoteMutation(codec, "alice", 1099, "10000000-0000-4000-8000-000000000001", false, 99),
    );
    const newer = repository.applyRemoteMarkedUploader(
      createRemoteMutation(codec, "alice", 1200, "10000000-0000-4000-8000-000000000002"),
    );
    const duplicate = repository.applyRemoteMarkedUploader(
      createRemoteMutation(codec, "alice", 1200, "10000000-0000-4000-8000-000000000002"),
    );
    const remoteDelete = repository.applyRemoteMarkedUploader(
      createRemoteMutation(codec, "alice", 1300, "10000000-0000-4000-8000-000000000003", true),
    );
    if (
      stale.applied ||
      stale.membershipPresent ||
      !newer.applied ||
      !newer.membershipPresent ||
      duplicate.applied ||
      !remoteDelete.applied ||
      remoteDelete.membershipPresent
    ) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("远端 marked uploader 版本顺序或重复 apply 不正确");
    }

    nowMs = 2000;
    if (!repository.addMarkedUploader("carol", MutationOrigin.user)) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("无法创建上游屏蔽冲突 fixture");
    }
    const carolKey = codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, "carol");
    const banned = repository.replaceBannedUploaders(["carol"], MutationOrigin.upstreamMirror);
    const blockedRemote = repository.applyRemoteMarkedUploader(
      createRemoteMutation(codec, "carol", 2100, "10000000-0000-4000-8000-000000000004"),
    );
    if (
      banned.removedMarkedUploaders.join("|") !== "carol" ||
      !blockedRemote.applied ||
      !blockedRemote.blockedByBannedUploader ||
      blockedRemote.membershipPresent ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?", [
          carolKey,
        ]).count,
      ) !== 0 ||
      queryOne<{ deleted: number }>(database, "SELECT deleted FROM sync_versions WHERE object_key = ?", [carolKey])
        .deleted !== 0
    ) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("上游屏蔽冲突产生了错误 tombstone、outbox 或本机标记");
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    const marked = database.query("SELECT uploader FROM marked_uploaders ORDER BY rowid") as { uploader: string }[];
    const banned = database.query("SELECT uploader FROM banned_uploaders ORDER BY rowid") as { uploader: string }[];
    const versions = database.query("SELECT object_key, wall_ms, deleted FROM sync_versions ORDER BY object_key") as {
      object_key: string;
      wall_ms: number;
      deleted: number;
    }[];
    if (
      marked.map((row) => row.uploader).join("|") !== "seeded" ||
      banned.map((row) => row.uploader).join("|") !== "carol" ||
      !versions.some((row) => row.wall_ms === 1300 && row.deleted === 1) ||
      !versions.some((row) => row.wall_ms === 2100 && row.deleted === 0) ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 1
    ) {
      throw new CloudSyncUploaderRepositoryV2DiagnosticError("关闭重开后 v2 业务行、版本或 outbox 不完整");
    }
  });
}

export function runCloudSyncUploaderRepositoryV2Diagnostic(): CloudSyncUploaderRepositoryV2DiagnosticResult {
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
    localAtomic: true,
    versionBoundEnvelope: true,
    tombstoneIdentity: true,
    remoteOrdering: true,
    bannedIsolation: true,
    rollbackAtomic: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
