import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import { SyncMutationWriter } from "../repositories/sync-mutation-writer";
import { DATABASE_V2_DRAFT_SCHEMA_STATEMENTS, DATABASE_V2_DRAFT_USER_VERSION } from "./database-schema-v2-draft";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const DATABASE_PATH = "assets/cloud-sync-phase1-mutation-writer.db";

export interface CloudSyncMutationWriterDiagnosticResult {
  ok: true;
  hlcMonotonic: true;
  outboxCoalesced: true;
  lateAcknowledgementSafe: true;
  tombstonePersisted: true;
  localDiscarded: true;
  remoteOrdering: true;
  rollbackAtomic: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncMutationWriterDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncMutationWriterDiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncMutationWriterDiagnosticError(`无法清理同步写入内核临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "同步写入内核临时库查询"),
        "同步写入内核临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "同步写入内核临时库事务"),
        `${operation || "同步写入内核临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用同步写入内核临时库外键"),
      "启用同步写入内核临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function queryOne<T extends Record<string, any>>(database: RepositoryDatabase, sql: string, args?: SqliteValue[]): T {
  const row = database.query(sql, args)[0] as T | undefined;
  if (!row) throw new CloudSyncMutationWriterDiagnosticError("同步写入内核诊断缺少预期数据库行");
  return row;
}

function execute(queue: SqliteTypes.SqliteQueueInstance, sql: string, operation: string): void {
  withSqliteQueueOperation(queue, (db) => checkedSqliteUpdate(db, sql, undefined, operation), `${operation}队列`);
}

function populateAndCheck(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    database.transaction((transaction) => {
      for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
        transaction.update(statement.sql, undefined, `创建同步写入内核诊断用 ${statement.name}`);
      }
      transaction.update(
        "CREATE TABLE sync_fixture (object_key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        undefined,
        "创建同步写入内核业务 fixture",
      );
      transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置诊断库版本");
    }, "创建同步写入内核诊断库");

    let nowMs = 1000;
    let opSequence = 0;
    const writer = new SyncMutationWriter({
      deviceId: "phase1-device-a",
      nowMs: () => nowMs,
      createOpId: () => {
        opSequence += 1;
        return `00000000-0000-4000-8000-${String(opSequence).padStart(12, "0")}`;
      },
    });

    const first = database.transaction((transaction) => {
      transaction.update("INSERT INTO sync_fixture (object_key, value) VALUES (?, ?)", ["alpha", "local-1"]);
      return writer.recordLocalMutation(transaction, {
        origin: MutationOrigin.user,
        objectKey: "alpha",
        entityType: "fixture.v1",
        deleted: false,
        createEnvelopeJson: () => '{"value":"local-1"}',
      });
    }, "检查业务写入与 outbox 原子提交");
    const second = database.transaction((transaction) => {
      transaction.update("UPDATE sync_fixture SET value = ? WHERE object_key = ?", ["local-2", "alpha"]);
      return writer.recordLocalMutation(transaction, {
        origin: MutationOrigin.user,
        objectKey: "alpha",
        entityType: "fixture.v1",
        deleted: false,
        createEnvelopeJson: () => '{"value":"local-2"}',
      });
    }, "检查同对象 outbox 合并");
    const alphaOutbox = queryOne<{ op_id: string; logical_counter: number }>(
      database,
      "SELECT op_id, logical_counter FROM sync_outbox WHERE object_key = ?",
      ["alpha"],
    );
    if (
      first.wallMs !== 1000 ||
      first.logicalCounter !== 0 ||
      second.wallMs !== 1000 ||
      second.logicalCounter !== 1 ||
      alphaOutbox.op_id !== second.opId ||
      alphaOutbox.logical_counter !== 1 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 1
    ) {
      throw new CloudSyncMutationWriterDiagnosticError("HLC 同毫秒推进或 outbox 合并结果不正确");
    }
    database.transaction((transaction) => writer.acknowledgeOperations(transaction, [first.opId]), "检查迟到的旧 ACK");
    if (
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?", [
          "alpha",
        ]).count,
      ) !== 1
    ) {
      throw new CloudSyncMutationWriterDiagnosticError("迟到的旧 ACK 删除了合并后的新 outbox");
    }

    nowMs = 900;
    const backwards = database.transaction((transaction) => {
      transaction.update("INSERT INTO sync_fixture (object_key, value) VALUES (?, ?)", ["beta", "local"]);
      return writer.recordLocalMutation(transaction, {
        origin: MutationOrigin.migrationSeed,
        objectKey: "beta",
        entityType: "fixture.v1",
        deleted: false,
        createEnvelopeJson: () => '{"value":"local"}',
      });
    }, "检查系统时间倒退时的 HLC");
    if (backwards.wallMs !== 1000 || backwards.logicalCounter !== 2) {
      throw new CloudSyncMutationWriterDiagnosticError("系统时间倒退时 HLC 发生倒退");
    }
    database.transaction((transaction) => {
      transaction.update("DELETE FROM sync_fixture WHERE object_key = ?", ["beta"]);
      writer.discardLocalObject(transaction, { origin: MutationOrigin.user, objectKey: "beta" });
    }, "检查搜索历史式本机丢弃");
    if (
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = 'beta'")
          .count,
      ) !== 0 ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = 'beta'")
          .count,
      ) !== 0
    ) {
      throw new CloudSyncMutationWriterDiagnosticError("本机删除没有取消版本与待发送操作");
    }

    nowMs = 2000;
    database.transaction((transaction) => {
      transaction.update("INSERT INTO sync_fixture (object_key, value) VALUES (?, ?)", ["gamma", "local"]);
      writer.recordLocalMutation(transaction, {
        origin: MutationOrigin.user,
        objectKey: "gamma",
        entityType: "fixture.v1",
        deleted: false,
        createEnvelopeJson: () => '{"value":"local"}',
      });
    }, "创建远端顺序诊断 fixture");

    execute(
      queue,
      `CREATE TRIGGER fail_sync_outbox_diagnostic
       BEFORE INSERT ON sync_outbox
       WHEN NEW.object_key = 'failure'
       BEGIN
         SELECT RAISE(ABORT, 'injected sync outbox failure');
       END`,
      "创建同步写入内核故障触发器",
    );
    let failureRejected = false;
    try {
      database.transaction((transaction) => {
        transaction.update("INSERT INTO sync_fixture (object_key, value) VALUES (?, ?)", ["failure", "rollback"]);
        writer.recordLocalMutation(transaction, {
          origin: MutationOrigin.user,
          objectKey: "failure",
          entityType: "fixture.v1",
          deleted: false,
          createEnvelopeJson: () => "{}",
        });
      }, "注入同步写入内核故障");
    } catch {
      failureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_sync_outbox_diagnostic", "删除同步写入内核故障触发器");
    if (
      !failureRejected ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_fixture WHERE object_key = 'failure'")
          .count,
      ) !== 0 ||
      Number(
        queryOne<{ count: number }>(
          database,
          "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = 'failure'",
        ).count,
      ) !== 0
    ) {
      throw new CloudSyncMutationWriterDiagnosticError("outbox 故障没有完整回滚业务行与版本");
    }

    let remoteCallbackCount = 0;
    const stale = database.transaction(
      (transaction) =>
        writer.applyRemoteMutation(
          transaction,
          {
            origin: MutationOrigin.remote,
            objectKey: "gamma",
            entityType: "fixture.v1",
            wallMs: 1999,
            logicalCounter: 99,
            deviceId: "phase1-device-b",
            deleted: false,
            opId: "10000000-0000-4000-8000-000000000001",
            envelopeJson: '{"value":"stale"}',
          },
          (businessTransaction) => {
            remoteCallbackCount += 1;
            businessTransaction.update("UPDATE sync_fixture SET value = 'stale' WHERE object_key = 'gamma'");
          },
        ),
      "检查陈旧远端版本",
    );
    const newerRemote = {
      origin: MutationOrigin.remote,
      objectKey: "gamma",
      entityType: "fixture.v1",
      wallMs: 3000,
      logicalCounter: 5,
      deviceId: "phase1-device-b",
      deleted: false,
      opId: "10000000-0000-4000-8000-000000000002",
      envelopeJson: '{"value":"remote"}',
    } as const;
    const newer = database.transaction(
      (transaction) =>
        writer.applyRemoteMutation(transaction, newerRemote, (businessTransaction) => {
          remoteCallbackCount += 1;
          businessTransaction.update("UPDATE sync_fixture SET value = 'remote' WHERE object_key = 'gamma'");
        }),
      "检查较新远端版本",
    );
    const duplicate = database.transaction(
      (transaction) =>
        writer.applyRemoteMutation(transaction, newerRemote, () => {
          remoteCallbackCount += 1;
        }),
      "检查重复远端版本",
    );
    if (
      stale.applied ||
      !newer.applied ||
      duplicate.applied ||
      remoteCallbackCount !== 1 ||
      queryOne<{ value: string }>(database, "SELECT value FROM sync_fixture WHERE object_key = 'gamma'").value !==
        "remote" ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = 'gamma'")
          .count,
      ) !== 0
    ) {
      throw new CloudSyncMutationWriterDiagnosticError("远端版本比较、幂等 apply 或 outbox 取消不正确");
    }

    database.transaction((transaction) => {
      transaction.update("DELETE FROM sync_fixture WHERE object_key = ?", ["alpha"]);
      writer.recordLocalMutation(transaction, {
        origin: MutationOrigin.user,
        objectKey: "alpha",
        entityType: "fixture.v1",
        deleted: true,
        createEnvelopeJson: () => '{"identity":"alpha"}',
      });
    }, "检查通用 tombstone");
    const tombstone = queryOne<{ deleted: number; envelope_json: string | null }>(
      database,
      "SELECT deleted, envelope_json FROM sync_outbox WHERE object_key = 'alpha'",
    );
    if (tombstone.deleted !== 1 || tombstone.envelope_json !== '{"identity":"alpha"}') {
      throw new CloudSyncMutationWriterDiagnosticError("跨设备删除没有留下正确的通用 tombstone");
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    const gamma = queryOne<{ value: string }>(database, "SELECT value FROM sync_fixture WHERE object_key = 'gamma'");
    const gammaVersion = queryOne<{ wall_ms: number; logical_counter: number; device_id: string }>(
      database,
      "SELECT wall_ms, logical_counter, device_id FROM sync_versions WHERE object_key = 'gamma'",
    );
    const alphaVersion = queryOne<{ deleted: number }>(
      database,
      "SELECT deleted FROM sync_versions WHERE object_key = 'alpha'",
    );
    if (
      gamma.value !== "remote" ||
      gammaVersion.wall_ms !== 3000 ||
      gammaVersion.logical_counter !== 5 ||
      gammaVersion.device_id !== "phase1-device-b" ||
      alphaVersion.deleted !== 1 ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_fixture WHERE object_key = 'alpha'")
          .count,
      ) !== 0
    ) {
      throw new CloudSyncMutationWriterDiagnosticError("关闭重开后业务数据、远端版本或 tombstone 不完整");
    }
  });
}

export function runCloudSyncMutationWriterDiagnostic(): CloudSyncMutationWriterDiagnosticResult {
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
    hlcMonotonic: true,
    outboxCoalesced: true,
    lateAcknowledgementSafe: true,
    tombstonePersisted: true,
    localDiscarded: true,
    remoteOrdering: true,
    rollbackAtomic: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
