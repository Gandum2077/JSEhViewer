import { MarkedTagMode } from "../repositories/marked-tag-repository";
import { RepositoryDatabase } from "../repositories/repository-database";
import { createV2RepositoryRuntime, V2RepositoryRuntime } from "../repositories/repository-runtime";
import { SyncMutationWriter } from "../repositories/sync-mutation-writer";
import { ensurePreSyncDatabaseBackup } from "./database-backup";
import { CURRENT_SCHEMA_STATEMENTS } from "./database-initialization";
import {
  DATABASE_V2_STARTUP_PHASES,
  DatabaseV2StartupCheckpoint,
  startDatabaseV2Draft,
} from "./database-v2-startup-draft";
import { CloudSyncDiagnosticEntityCodec } from "./cloud-sync-diagnostic-entity-codec";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const TEMPLATE_PATH = "assets/cloud-sync-phase1-database-startup-v2-template.db";
const DATABASE_PATH = "assets/cloud-sync-phase1-database-startup-v2.db";
const BACKUP_PATH = "assets/cloud-sync-phase1-database-startup-v2.backup.db";
const MIGRATION_TIME = "2026-08-12T14:30:00.000Z";

export interface CloudSyncDatabaseV2StartupDiagnosticResult {
  ok: true;
  crashBoundaries: number;
  migrationRollbackComplete: true;
  backupPreservedAsV1: true;
  localSeededObjects: 7;
  upstreamMirrorSeededObjects: 6;
  repeatedStartupSeededObjects: 0;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncDatabaseV2StartupDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncDatabaseV2StartupDiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncDatabaseV2StartupDiagnosticError(`无法清理 v2 启动状态机临时文件：${file}`);
    }
  }
}

function removeAllTemporaryFiles(): void {
  removeDatabase(TEMPLATE_PATH);
  removeDatabase(DATABASE_PATH);
  removeDatabase(BACKUP_PATH);
  const unfinishedBackup = `${BACKUP_PATH}.tmp`;
  if ($file.exists(unfinishedBackup) && !$file.delete(unfinishedBackup)) {
    throw new CloudSyncDatabaseV2StartupDiagnosticError("无法清理 v2 启动状态机未完成备份");
  }
}

function createRepositoryDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "v2 启动状态机临时库查询"),
        "v2 启动状态机临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "v2 启动状态机临时库事务"),
        `${operation || "v2 启动状态机临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(path: string, callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(path);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 v2 启动状态机临时库外键"),
      "启用 v2 启动状态机临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function applyV1Fixture(transaction: SqliteTransactionContext, syncMyTags: boolean): void {
  for (const statement of CURRENT_SCHEMA_STATEMENTS) {
    transaction.update(statement.sql, undefined, `创建 v2 启动状态机诊断用 v1 ${statement.name}`);
  }
  transaction.update("PRAGMA user_version = 1", undefined, "设置 v2 启动状态机诊断用 v1 版本");
  transaction.update(
    `INSERT INTO archives
     (gid, readlater, downloaded, first_access_time, last_access_time, token, title, taglist, last_read_page)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      901,
      1,
      1,
      "2026-08-01T00:00:00.000Z",
      "2026-08-10T00:00:00.000Z",
      "startup-token",
      "startup-title",
      JSON.stringify([{ namespace: "artist", tags: ["startup-artist"] }]),
      23,
    ],
  );
  transaction.update("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)", [
    901,
    "artist",
    "startup-artist",
  ]);
  transaction.update("INSERT INTO search_history (id, last_access_time, sorted_fsearch) VALUES (?, ?, ?)", [
    1,
    "2026-08-10T00:00:00.000Z",
    "artist:startup-history",
  ]);
  transaction.update(
    `INSERT INTO search_history_search_terms
     (search_history_id, namespace, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, "artist", "startup-history", 1, 0, 0],
  );
  transaction.update("INSERT INTO search_bookmarks (id, sort_order, sorted_fsearch) VALUES (?, ?, ?)", [
    1,
    0,
    "language:startup-bookmark",
  ]);
  transaction.update(
    `INSERT INTO search_bookmarks_search_terms
     (search_bookmarks_id, namespace, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, "language", "startup-bookmark", 0, 0, 0],
  );
  transaction.update("INSERT INTO marked_uploaders (uploader) VALUES (?)", ["startup-uploader"]);
  transaction.update(
    `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [991, "artist", "startup-tag", 1, 0, "#123456", 3],
  );
  transaction.update(
    "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ["syncMyTags", JSON.stringify(syncMyTags)],
  );
}

function createTemplate(syncMyTags: boolean): void {
  removeDatabase(TEMPLATE_PATH);
  withQueue(TEMPLATE_PATH, (queue) => {
    const database = createRepositoryDatabase(queue);
    database.transaction((transaction) => applyV1Fixture(transaction, syncMyTags), "创建 v2 启动状态机 v1 fixture");
  });
}

function resetScenarioFromTemplate(): void {
  removeDatabase(DATABASE_PATH);
  removeDatabase(BACKUP_PATH);
  if (!$file.copy({ src: TEMPLATE_PATH, dst: DATABASE_PATH }) || !$file.exists(DATABASE_PATH)) {
    throw new CloudSyncDatabaseV2StartupDiagnosticError("无法复制 v2 启动状态机 fixture");
  }
}

interface DatabaseInspection {
  version: number;
  quickCheck: string;
  versions: number;
  outbox: number;
  markedTags: number;
}

function inspectDatabase(path: string): DatabaseInspection {
  const database = $sqlite.open(path);
  try {
    const version = Number(querySqliteRows<{ user_version: number }>(database, "PRAGMA user_version")[0]?.user_version);
    const quickRow = querySqliteRows<Record<string, unknown>>(database, "PRAGMA quick_check(1)")[0];
    const quickCheck = String(quickRow ? Object.values(quickRow)[0] : "");
    const tables = new Set(
      querySqliteRows<{ name: string }>(
        database,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      ).map((row) => String(row.name)),
    );
    const count = (table: string): number =>
      tables.has(table)
        ? Number(querySqliteRows<{ count: number }>(database, `SELECT COUNT(*) AS count FROM ${table}`)[0]?.count ?? 0)
        : 0;
    return {
      version,
      quickCheck,
      versions: count("sync_versions"),
      outbox: count("sync_outbox"),
      markedTags: count("marked_tags"),
    };
  } finally {
    database.close();
  }
}

let runtimeSequence = 0;

function createRuntime(database: RepositoryDatabase): V2RepositoryRuntime {
  runtimeSequence += 1;
  return createV2RepositoryRuntime({
    database,
    syncWriter: new SyncMutationWriter({
      deviceId: `phase1-startup-device-${runtimeSequence}`,
      nowMs: () => 7000,
      createOpId: () => $text.uuid,
    }),
    codec: new CloudSyncDiagnosticEntityCodec(),
    deriveSearchId: (value) => $text.SHA256(value).toLowerCase(),
    nowIso: () => MIGRATION_TIME,
  });
}

function startupDependencies(checkpoint?: (value: DatabaseV2StartupCheckpoint) => void, invalidDigest = false) {
  return {
    ensureBackup: () => ensurePreSyncDatabaseBackup($file, DATABASE_PATH, BACKUP_PATH),
    verifyBackup: () => {
      const backup = inspectDatabase(BACKUP_PATH);
      if (backup.version !== 1 || backup.quickCheck.toLowerCase() !== "ok" || backup.markedTags !== 1) {
        throw new CloudSyncDatabaseV2StartupDiagnosticError("一次性升级前备份不是完整可读的 v1 fixture");
      }
    },
    openSession: () => {
      const queue = $sqlite.dbQueue(DATABASE_PATH);
      try {
        withSqliteQueueOperation(
          queue,
          (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用启动 session 外键"),
          "启用启动 session 外键队列",
        );
      } catch (error) {
        queue.close();
        throw error;
      }
      return { database: createRepositoryDatabase(queue), close: () => queue.close() };
    },
    createRuntime,
    migration: {
      nowIso: () => MIGRATION_TIME,
      sha256Hex: invalidDigest ? () => "invalid-digest" : (value: string) => $text.SHA256(value),
    },
    checkpoint,
  };
}

function startAndClose(checkpoint?: (value: DatabaseV2StartupCheckpoint) => void, invalidDigest = false) {
  const result = startDatabaseV2Draft(startupDependencies(checkpoint, invalidDigest));
  result.session.close();
  return result;
}

function expectFailure(operation: () => void, message: string): void {
  let failed = false;
  try {
    operation();
  } catch {
    failed = true;
  }
  if (!failed) throw new CloudSyncDatabaseV2StartupDiagnosticError(message);
}

function checkCrashBoundary(phase: (typeof DATABASE_V2_STARTUP_PHASES)[number], boundary: "before" | "after"): void {
  resetScenarioFromTemplate();
  let injected = false;
  expectFailure(() => {
    startAndClose((checkpoint) => {
      if (!injected && checkpoint.phase === phase && checkpoint.boundary === boundary) {
        injected = true;
        throw new Error(`模拟进程退出：${phase}/${boundary}`);
      }
    });
  }, `没有在 ${phase}/${boundary} 边界停止`);
  if (!injected) throw new CloudSyncDatabaseV2StartupDiagnosticError(`没有到达 ${phase}/${boundary} 故障边界`);

  const recovered = startAndClose();
  if (recovered.completedPhases.join("|") !== DATABASE_V2_STARTUP_PHASES.join("|")) {
    throw new CloudSyncDatabaseV2StartupDiagnosticError(`${phase}/${boundary} 恢复没有走完全部启动阶段`);
  }
  const current = inspectDatabase(DATABASE_PATH);
  const backup = inspectDatabase(BACKUP_PATH);
  if (current.version !== 2 || current.versions !== 7 || current.outbox !== 7) {
    throw new CloudSyncDatabaseV2StartupDiagnosticError(`${phase}/${boundary} 恢复后的 v2 同步状态不完整`);
  }
  if (backup.version !== 1 || backup.quickCheck.toLowerCase() !== "ok" || backup.markedTags !== 1) {
    throw new CloudSyncDatabaseV2StartupDiagnosticError(`${phase}/${boundary} 恢复覆盖或损坏了升级前备份`);
  }
  const repeated = startAndClose();
  if (repeated.openedAtVersion !== 2 || repeated.seed.total !== 0) {
    throw new CloudSyncDatabaseV2StartupDiagnosticError(`${phase}/${boundary} 恢复后的再次启动重复迁移或 seed`);
  }
}

export function runCloudSyncDatabaseV2StartupDiagnostic(): CloudSyncDatabaseV2StartupDiagnosticResult {
  const startedAt = Date.now();
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    removeAllTemporaryFiles();
    createTemplate(false);
    for (const phase of DATABASE_V2_STARTUP_PHASES) {
      checkCrashBoundary(phase, "before");
      checkCrashBoundary(phase, "after");
    }

    resetScenarioFromTemplate();
    expectFailure(() => startAndClose(undefined, true), "迁移内部故障没有停止启动");
    const rolledBack = inspectDatabase(DATABASE_PATH);
    if (rolledBack.version !== 1 || rolledBack.versions !== 0 || rolledBack.outbox !== 0) {
      throw new CloudSyncDatabaseV2StartupDiagnosticError("迁移内部故障没有完整回滚到 v1");
    }
    const localResult = startAndClose();
    if (
      localResult.markedTagMode !== MarkedTagMode.localSync ||
      localResult.seed.total !== 7 ||
      inspectDatabase(DATABASE_PATH).versions !== 7
    ) {
      throw new CloudSyncDatabaseV2StartupDiagnosticError("本地标签模式没有完整 seed 七个同步对象");
    }

    createTemplate(true);
    resetScenarioFromTemplate();
    const mirrorResult = startAndClose();
    const mirrorInspection = inspectDatabase(DATABASE_PATH);
    if (
      mirrorResult.markedTagMode !== MarkedTagMode.upstreamMirror ||
      mirrorResult.seed.localTags !== 0 ||
      mirrorResult.seed.total !== 6 ||
      mirrorInspection.versions !== 6 ||
      mirrorInspection.markedTags !== 1
    ) {
      throw new CloudSyncDatabaseV2StartupDiagnosticError("syncMyTags=1 的网站镜像错误地进入了本地标签 seed");
    }
  } catch (error) {
    operationError = error;
  }
  try {
    removeAllTemporaryFiles();
  } catch (error) {
    cleanupError = error;
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return {
    ok: true,
    crashBoundaries: DATABASE_V2_STARTUP_PHASES.length * 2,
    migrationRollbackComplete: true,
    backupPreservedAsV1: true,
    localSeededObjects: 7,
    upstreamMirrorSeededObjects: 6,
    repeatedStartupSeededObjects: 0,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
