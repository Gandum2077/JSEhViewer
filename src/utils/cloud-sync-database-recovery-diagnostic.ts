import { checkedSqliteUpdate, querySqliteRows } from "./sqlite-safe";
import {
  collectDatabaseStartupDiagnostic,
  databaseRecoveryInstructions,
  DatabaseRecoveryDependencies,
  DatabaseRecoveryInspector,
} from "./database-recovery";

const DATABASE_PATH = "assets/cloud-sync-phase1-recovery-diagnostic.db";
const BACKUP_PATH = "assets/cloud-sync-phase1-recovery-diagnostic.backup.db";
const FIXTURE_SECRETS = [
  "ipb_member_id=123; ipb_pass_hash=very-private-cookie",
  "bootstrap_secret=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  "password=private-webdav-password",
  "apikey=private-ai-api-key",
];

export interface CloudSyncDatabaseRecoveryDiagnosticResult {
  ok: true;
  startupFailureClassified: true;
  secretsRedacted: true;
  metadataOnly: true;
  backupPreserved: true;
  noAutomaticRestore: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncDatabaseRecoveryDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncDatabaseRecoveryDiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-wal`, `${path}-shm`, `${path}.tmp`];
}

function removeFiles(): void {
  for (const path of [...databaseFiles(DATABASE_PATH), ...databaseFiles(BACKUP_PATH)]) {
    if ($file.exists(path) && !$file.delete(path)) {
      throw new CloudSyncDatabaseRecoveryDiagnosticError(`无法清理数据库恢复诊断临时文件：${path}`);
    }
  }
}

function createFixture(): void {
  const database = $sqlite.open(DATABASE_PATH);
  try {
    checkedSqliteUpdate(database, "CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT)");
    checkedSqliteUpdate(database, "CREATE TABLE plugin_custom_state (value TEXT)");
    checkedSqliteUpdate(database, "INSERT INTO config (key, value) VALUES (?, ?)", ["cookie", FIXTURE_SECRETS[0]]);
    checkedSqliteUpdate(database, "INSERT INTO config (key, value) VALUES (?, ?)", ["ai", FIXTURE_SECRETS[3]]);
    checkedSqliteUpdate(database, "PRAGMA user_version = 1");
  } finally {
    database.close();
  }
  if (!$file.copy({ src: DATABASE_PATH, dst: BACKUP_PATH }) || !$file.exists(BACKUP_PATH)) {
    throw new CloudSyncDatabaseRecoveryDiagnosticError("无法创建数据库恢复诊断备份 fixture");
  }
}

function dependencies(): DatabaseRecoveryDependencies {
  return {
    files: $file,
    openDatabase(path: string): DatabaseRecoveryInspector {
      const database = $sqlite.open(path);
      return {
        query<T extends Record<string, unknown>>(sql: string): T[] {
          return querySqliteRows<T>(database, sql, undefined, "读取数据库恢复诊断 fixture");
        },
        close: () => database.close(),
      };
    },
    nowIso: () => "2026-08-12T00:00:00.000Z",
    appVersion: "phase1-diagnostic",
  };
}

function runCheck(): void {
  createFixture();
  const error = new Error(
    `SQLite migration failed: ${FIXTURE_SECRETS[1]} ${FIXTURE_SECRETS[2]} https://example.test/recover?token=${FIXTURE_SECRETS[3]}`,
  );
  error.name = "DatabaseInitializationError";
  const diagnostic = collectDatabaseStartupDiagnostic(error, dependencies(), {
    database: DATABASE_PATH,
    backup: BACKUP_PATH,
  });
  const exported = JSON.stringify(diagnostic);
  const instructions = databaseRecoveryInstructions(diagnostic);
  if (FIXTURE_SECRETS.some((secret) => exported.includes(secret) || instructions.includes(secret))) {
    throw new CloudSyncDatabaseRecoveryDiagnosticError("脱敏数据库诊断泄漏了 fixture secret");
  }
  if (
    diagnostic.error.code !== "database-initialization-failed" ||
    !diagnostic.writes_blocked ||
    !diagnostic.files.database_exists ||
    !diagnostic.files.pre_sync_backup_exists ||
    diagnostic.sqlite.user_version !== 1 ||
    diagnostic.sqlite.quick_check !== "ok" ||
    diagnostic.sqlite.known_tables_present.join(",") !== "config" ||
    diagnostic.sqlite.unknown_table_count !== 1 ||
    diagnostic.recovery.preferred_copy !== "pre-sync-backup" ||
    diagnostic.recovery.automatic_restore_performed !== false ||
    diagnostic.recovery.secrets_included !== false
  ) {
    throw new CloudSyncDatabaseRecoveryDiagnosticError("数据库启动恢复诊断分类、元数据或备份状态不正确");
  }
  const cookieValue = $sqlite.open(DATABASE_PATH);
  try {
    const preserved =
      querySqliteRows<{ value: string }>(
        cookieValue,
        "SELECT value FROM config WHERE key = 'cookie'",
        undefined,
        "读取恢复诊断原库 sentinel",
      )[0]?.value === FIXTURE_SECRETS[0];
    if (!preserved) throw new CloudSyncDatabaseRecoveryDiagnosticError("诊断检查修改了原数据库 fixture");
  } finally {
    cookieValue.close();
  }
}

export function runCloudSyncDatabaseRecoveryDiagnostic(): CloudSyncDatabaseRecoveryDiagnosticResult {
  const startedAt = Date.now();
  removeFiles();
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    runCheck();
  } catch (error) {
    operationError = error;
  }
  try {
    removeFiles();
  } catch (error) {
    cleanupError = error;
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return {
    ok: true,
    startupFailureClassified: true,
    secretsRedacted: true,
    metadataOnly: true,
    backupPreserved: true,
    noAutomaticRestore: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
