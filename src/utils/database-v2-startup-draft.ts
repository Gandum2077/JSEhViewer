import { MarkedTagMode } from "../repositories/marked-tag-repository";
import { RepositoryDatabase } from "../repositories/repository-database";
import { V2RepositoryRuntime } from "../repositories/repository-runtime";
import { DatabaseBackupResult } from "./database-backup";
import {
  DatabaseV2MigrationDependencies,
  DatabaseV2MigrationResult,
  migrateVersion1ToVersion2Draft,
} from "./database-migration-v2-draft";
import { DATABASE_V2_DRAFT_USER_VERSION } from "./database-schema-v2-draft";

export const DATABASE_V2_STARTUP_PHASES = [
  "backup",
  "database-open",
  "migration",
  "runtime",
  "seed-archives",
  "seed-history",
  "seed-bookmarks",
  "seed-uploaders",
  "seed-local-tags",
  "ready",
] as const;

export type DatabaseV2StartupPhase = (typeof DATABASE_V2_STARTUP_PHASES)[number];
export type DatabaseV2StartupBoundary = "before" | "after";

export interface DatabaseV2StartupCheckpoint {
  phase: DatabaseV2StartupPhase;
  boundary: DatabaseV2StartupBoundary;
}

export interface DatabaseV2StartupSession {
  database: RepositoryDatabase;
  close(): void;
}

export interface DatabaseV2StartupDependencies {
  ensureBackup(): DatabaseBackupResult;
  /** 必须确认备份是可读的 v1 SQLite；已有但损坏或版本错误时必须抛错。 */
  verifyBackup(): void;
  openSession(): DatabaseV2StartupSession;
  createRuntime(database: RepositoryDatabase): V2RepositoryRuntime;
  migration: DatabaseV2MigrationDependencies;
  /** 仅供 fixture/真机诊断注入“进程在边界被杀掉”。正式启动不传。 */
  checkpoint?(checkpoint: DatabaseV2StartupCheckpoint): void;
}

export interface DatabaseV2SeedSummary {
  archiveEntries: number;
  readingProgress: number;
  readLater: number;
  history: number;
  bookmarks: number;
  uploaders: number;
  localTags: number;
  total: number;
}

export interface DatabaseV2StartupResult {
  backupResult: DatabaseBackupResult;
  openedAtVersion: 1 | 2;
  migrationPerformed: boolean;
  migrationResult?: DatabaseV2MigrationResult;
  markedTagMode: MarkedTagMode;
  seed: DatabaseV2SeedSummary;
  runtime: V2RepositoryRuntime;
  session: DatabaseV2StartupSession;
  completedPhases: DatabaseV2StartupPhase[];
}

export class DatabaseV2StartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseV2StartupError";
  }
}

function requireSafeCount(value: unknown, name: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new DatabaseV2StartupError(`${name}返回了无效数量`);
  }
  return count;
}

function firstValue(row: Record<string, unknown> | undefined): unknown {
  if (!row) return undefined;
  return Object.values(row)[0];
}

function readUserVersion(database: RepositoryDatabase): number {
  const version = Number(firstValue(database.query("PRAGMA user_version")[0]));
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new DatabaseV2StartupError("数据库 user_version 无效");
  }
  return version;
}

/**
 * syncMyTags 是整张 marked_tags 表的模式开关：true/1 为网站镜像，false/0/缺失为本地同步。
 * 迁移启动期间不猜测其他形状，损坏值必须停止，避免把网站镜像 seed 到 D1。
 */
export function readDatabaseV2MarkedTagMode(database: RepositoryDatabase): MarkedTagMode {
  const row = database.query("SELECT value FROM config WHERE key = ?", ["syncMyTags"])[0] as
    | { value?: unknown }
    | undefined;
  if (!row || row.value === null || row.value === undefined || row.value === "") return MarkedTagMode.localSync;
  let value: unknown;
  try {
    value = JSON.parse(String(row.value));
  } catch {
    throw new DatabaseV2StartupError("config.syncMyTags 不是有效 JSON，已停止 seed");
  }
  if (value === true || value === 1) return MarkedTagMode.upstreamMirror;
  if (value === false || value === 0) return MarkedTagMode.localSync;
  throw new DatabaseV2StartupError("config.syncMyTags 不是布尔值，已停止 seed");
}

function seedTotal(seed: Omit<DatabaseV2SeedSummary, "total">): DatabaseV2SeedSummary {
  return {
    ...seed,
    total: Object.values(seed).reduce((sum, value) => sum + requireSafeCount(value, "seed"), 0),
  };
}

function requireReady(database: RepositoryDatabase, runtime: V2RepositoryRuntime, markedTagMode: MarkedTagMode): void {
  if (runtime.schemaVersion !== DATABASE_V2_DRAFT_USER_VERSION) {
    throw new DatabaseV2StartupError("v2 启动状态机装配了错误的 Repository runtime");
  }
  if (readUserVersion(database) !== DATABASE_V2_DRAFT_USER_VERSION) {
    throw new DatabaseV2StartupError("v2 启动完成时数据库版本不是 2");
  }
  const quickCheck = String(firstValue(database.query("PRAGMA quick_check(1)")[0]) ?? "").toLowerCase();
  if (quickCheck !== "ok") throw new DatabaseV2StartupError("v2 启动完成时 SQLite quick_check 未通过");
  const foreignKeyViolations = database.query("PRAGMA foreign_key_check").length;
  if (foreignKeyViolations !== 0) {
    throw new DatabaseV2StartupError(`v2 启动完成时发现 ${foreignKeyViolations} 条外键异常`);
  }
  const clockRows = requireSafeCount(
    (database.query("SELECT COUNT(*) AS count FROM sync_clock WHERE id = 1")[0] as { count?: unknown } | undefined)
      ?.count,
    "sync_clock 检查",
  );
  if (clockRows !== 1) throw new DatabaseV2StartupError("v2 启动完成时缺少唯一的 HLC 时钟行");
  const brokenOutboxLinks = requireSafeCount(
    (
      database.query(
        `SELECT COUNT(*) AS count
         FROM sync_outbox AS outbox
         LEFT JOIN sync_versions AS versions ON versions.object_key = outbox.object_key
         WHERE versions.object_key IS NULL
            OR versions.last_op_id <> outbox.op_id
            OR versions.wall_ms <> outbox.wall_ms
            OR versions.logical_counter <> outbox.logical_counter
            OR versions.device_id <> outbox.device_id
            OR versions.deleted <> outbox.deleted`,
      )[0] as { count?: unknown } | undefined
    )?.count,
    "outbox 关联检查",
  );
  if (brokenOutboxLinks !== 0) {
    throw new DatabaseV2StartupError(`v2 启动完成时发现 ${brokenOutboxLinks} 条 outbox/version 不一致`);
  }

  const archive = runtime.adapters.archive.seedExistingArchives();
  const repeatedSeed =
    archive.archiveEntries +
    archive.readingProgress +
    archive.readLater +
    runtime.adapters.searchHistory.seedExistingHistory() +
    runtime.adapters.searchBookmark.seedExistingBookmarks() +
    runtime.adapters.uploader.seedExistingMarkedUploaders() +
    (markedTagMode === MarkedTagMode.localSync
      ? runtime.adapters.markedTag.seedExistingLocalTags(MarkedTagMode.localSync)
      : 0);
  if (repeatedSeed !== 0) {
    throw new DatabaseV2StartupError(`v2 启动就绪复核又 seed 了 ${repeatedSeed} 个对象`);
  }
}

/**
 * v1 → v2 启动草案。持久化进度由三类既有事实表示：
 * 1. 一次性备份文件；2. PRAGMA user_version；3. 每个对象的 sync_versions 行。
 * 因此不需要一张容易与真实状态分叉的额外“迁移进度表”。
 *
 * 任何失败都会关闭本次 session。下次调用会验证同一份 v1 备份、跳过已提交的迁移，
 * 并依靠各 Adapter 的原子、可重入 seed 只补缺失对象。
 */
export function startDatabaseV2Draft(dependencies: DatabaseV2StartupDependencies): DatabaseV2StartupResult {
  const completedPhases: DatabaseV2StartupPhase[] = [];
  let session: DatabaseV2StartupSession | undefined;
  const run = <T>(phase: DatabaseV2StartupPhase, operation: () => T): T => {
    dependencies.checkpoint?.({ phase, boundary: "before" });
    const result = operation();
    completedPhases.push(phase);
    dependencies.checkpoint?.({ phase, boundary: "after" });
    return result;
  };

  try {
    const backupResult = run("backup", () => {
      const result = dependencies.ensureBackup();
      dependencies.verifyBackup();
      return result;
    });
    run("database-open", () => {
      // Assign before the phase's `after` checkpoint. A simulated/process failure at that
      // boundary must still let the catch path close the newly opened queue.
      session = dependencies.openSession();
    });
    const activeSession = session;
    if (!activeSession) throw new DatabaseV2StartupError("数据库 session 没有成功打开");
    const openedAtVersion = readUserVersion(activeSession.database);
    if (openedAtVersion !== 1 && openedAtVersion !== DATABASE_V2_DRAFT_USER_VERSION) {
      throw new DatabaseV2StartupError(`v2 启动只接受 user_version=1 或 2，当前为 ${openedAtVersion}`);
    }

    let migrationResult: DatabaseV2MigrationResult | undefined;
    run("migration", () => {
      if (openedAtVersion === 1) {
        migrationResult = activeSession.database.transaction(
          (transaction) => migrateVersion1ToVersion2Draft(transaction, dependencies.migration),
          "数据库 v1 到 v2 启动迁移",
        );
      }
      if (readUserVersion(activeSession.database) !== DATABASE_V2_DRAFT_USER_VERSION) {
        throw new DatabaseV2StartupError("数据库 v1 到 v2 迁移没有完整提交");
      }
    });

    const runtime = run("runtime", () => dependencies.createRuntime(activeSession.database));
    const markedTagMode = readDatabaseV2MarkedTagMode(activeSession.database);
    const archive = run("seed-archives", () => runtime.adapters.archive.seedExistingArchives());
    const history = run("seed-history", () => runtime.adapters.searchHistory.seedExistingHistory());
    const bookmarks = run("seed-bookmarks", () => runtime.adapters.searchBookmark.seedExistingBookmarks());
    const uploaders = run("seed-uploaders", () => runtime.adapters.uploader.seedExistingMarkedUploaders());
    const localTags = run("seed-local-tags", () =>
      markedTagMode === MarkedTagMode.localSync
        ? runtime.adapters.markedTag.seedExistingLocalTags(MarkedTagMode.localSync)
        : 0,
    );
    const seed = seedTotal({
      archiveEntries: archive.archiveEntries,
      readingProgress: archive.readingProgress,
      readLater: archive.readLater,
      history,
      bookmarks,
      uploaders,
      localTags,
    });
    run("ready", () => requireReady(activeSession.database, runtime, markedTagMode));

    return {
      backupResult,
      openedAtVersion,
      migrationPerformed: openedAtVersion === 1,
      migrationResult,
      markedTagMode,
      seed,
      runtime,
      session: activeSession,
      completedPhases,
    };
  } catch (error) {
    try {
      session?.close();
    } catch {
      // 保留原始启动错误；恢复诊断会单独检查文件状态。
    }
    throw error;
  }
}
