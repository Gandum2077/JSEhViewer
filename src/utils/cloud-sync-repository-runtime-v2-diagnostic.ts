import { RepositoryDatabase } from "../repositories/repository-database";
import { createV2RepositoryRuntime, V2RepositoryRuntime } from "../repositories/repository-runtime";
import {
  exerciseV2RepositoryRuntime,
  verifyPersistedV2RepositoryRuntime,
  V2RepositoryRuntimeExpectedState,
} from "../repositories/repository-runtime-v2-check";
import { SyncMutationWriter } from "../repositories/sync-mutation-writer";
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

const DATABASE_PATH = "assets/cloud-sync-phase1-repository-runtime-v2.db";

export interface CloudSyncRepositoryRuntimeV2DiagnosticResult {
  ok: true;
  fiveAdaptersAssembled: true;
  sharedDatabaseClockAndCodec: true;
  configManagerPathsCompatible: true;
  localAndUpstreamModesIsolated: true;
  seededObjects: number;
  entityTypes: number;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncRepositoryRuntimeV2DiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncRepositoryRuntimeV2DiagnosticError";
  }
}

function databaseFiles(): string[] {
  return [DATABASE_PATH, `${DATABASE_PATH}-journal`, `${DATABASE_PATH}-shm`, `${DATABASE_PATH}-wal`];
}

function removeDatabase(): void {
  for (const file of databaseFiles()) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncRepositoryRuntimeV2DiagnosticError(`无法清理 v2 Repository runtime 临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "v2 Repository runtime 临时库查询"),
        "v2 Repository runtime 临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "v2 Repository runtime 临时库事务"),
        `${operation || "v2 Repository runtime 临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 v2 Repository runtime 临时库外键"),
      "启用 v2 Repository runtime 临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function stableId(value: string): string {
  return $text.SHA256(value).toLowerCase();
}

function createRuntime(database: RepositoryDatabase): V2RepositoryRuntime {
  let opSequence = 0;
  return createV2RepositoryRuntime({
    database,
    syncWriter: new SyncMutationWriter({
      deviceId: "phase1-runtime-device",
      nowMs: () => 5000,
      createOpId: () => {
        opSequence += 1;
        return `00000000-0000-4000-8002-${String(opSequence).padStart(12, "0")}`;
      },
    }),
    codec: new CloudSyncDiagnosticEntityCodec(),
    deriveSearchId: stableId,
    nowIso: () => "2026-08-12T13:00:00.000Z",
  });
}

function populateAndCheck(): {
  expected: V2RepositoryRuntimeExpectedState;
  seededObjects: number;
  entityTypes: number;
} {
  return withQueue((queue) => {
    const database = createDatabase(queue);
    database.transaction((transaction) => {
      for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
        transaction.update(statement.sql, undefined, `创建 runtime 诊断用 ${statement.name}`);
      }
      transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置诊断库版本");
    }, "创建 v2 Repository runtime 诊断库");
    const result = exerciseV2RepositoryRuntime(createRuntime(database), database, stableId);
    return result;
  });
}

function checkReopen(expected: V2RepositoryRuntimeExpectedState): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    verifyPersistedV2RepositoryRuntime(createRuntime(database), database, expected);
  });
}

export function runCloudSyncRepositoryRuntimeV2Diagnostic(): CloudSyncRepositoryRuntimeV2DiagnosticResult {
  const startedAt = Date.now();
  removeDatabase();
  let operationError: unknown;
  let cleanupError: unknown;
  let seededObjects = 0;
  let entityTypes = 0;
  try {
    const result = populateAndCheck();
    seededObjects = result.seededObjects;
    entityTypes = result.entityTypes;
    checkReopen(result.expected);
  } catch (error) {
    operationError = error;
  }
  try {
    removeDatabase();
  } catch (error) {
    cleanupError = error;
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return {
    ok: true,
    fiveAdaptersAssembled: true,
    sharedDatabaseClockAndCodec: true,
    configManagerPathsCompatible: true,
    localAndUpstreamModesIsolated: true,
    seededObjects,
    entityTypes,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
