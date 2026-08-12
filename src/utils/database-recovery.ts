import { PRE_SYNC_DATABASE_BACKUP_PATH } from "./database-backup";
import { querySqliteRows } from "./sqlite-safe";

export const MAIN_DATABASE_PATH = "assets/database.db";
export const DATABASE_DIAGNOSTIC_EXPORT_NAME = "jsehviewer-database-startup-diagnostic.json";

const KNOWN_TABLE_NAMES = [
  "archives",
  "archive_entries",
  "reading_state",
  "local_gallery_state",
  "archive_taglist",
  "config",
  "ai_translation_services",
  "webdav_services",
  "translation_data",
  "marked_tags",
  "marked_uploaders",
  "banned_uploaders",
  "favcat_titles",
  "search_history",
  "search_history_terms",
  "search_bookmarks",
  "search_bookmark_terms",
  "tag_access_count",
  "download_records",
  "gallery_reader_config",
  "favorite_images",
  "sync_profile",
  "sync_clock",
  "sync_versions",
  "sync_outbox",
] as const;

export interface DatabaseRecoveryFileOperations {
  exists(path: string): boolean;
}

export interface DatabaseRecoveryInspector {
  query<T extends Record<string, unknown>>(sql: string): T[];
  close(): void;
}

export interface DatabaseRecoveryDependencies {
  files: DatabaseRecoveryFileOperations;
  openDatabase(path: string): DatabaseRecoveryInspector;
  nowIso(): string;
  appVersion?: string;
}

export interface DatabaseRecoveryPaths {
  database: string;
  backup: string;
}

export interface DatabaseStartupDiagnostic {
  format: 1;
  kind: "database-startup-failure";
  generated_at: string;
  app_version: string | null;
  writes_blocked: true;
  error: {
    code: "database-backup-failed" | "database-initialization-failed" | "sqlite-failed" | "unknown";
    name: string;
    message: string;
  };
  files: {
    database_exists: boolean;
    database_journal_exists: boolean;
    database_wal_exists: boolean;
    database_shm_exists: boolean;
    pre_sync_backup_exists: boolean;
    unfinished_backup_exists: boolean;
  };
  sqlite: {
    inspected: boolean;
    user_version: number | null;
    table_count: number | null;
    known_tables_present: string[];
    unknown_table_count: number | null;
    quick_check: "ok" | "failed" | "unavailable";
    foreign_key_violation_count: number | null;
    inspection_error: string | null;
  };
  recovery: {
    automatic_restore_performed: false;
    preferred_copy: "pre-sync-backup" | "current-database" | "none";
    secrets_included: false;
  };
}

function asErrorName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return "UnknownError";
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "数据库启动失败，但没有可用的错误说明";
}

export function sanitizeDatabaseDiagnosticText(value: string): string {
  return value
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/giu, "$1?<query-redacted>")
    .replace(/\b(Bearer)\s+[^\s,;]+/giu, "$1 <redacted>")
    .replace(
      /\b(bootstrap[_-]?secret|master[_-]?key|recovery[_-]?secret|device[_-]?token|authorization|cookie|api[_-]?key|apikey|password)\b\s*[:=]\s*[^\s,;}]*/giu,
      "$1=<redacted>",
    )
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/gu, "<redacted>")
    .slice(0, 500);
}

function errorCode(error: unknown): DatabaseStartupDiagnostic["error"]["code"] {
  const name = asErrorName(error);
  if (name === "DatabaseBackupError") return "database-backup-failed";
  if (name === "DatabaseInitializationError") return "database-initialization-failed";
  if (/sqlite/iu.test(name) || /sqlite/iu.test(asErrorMessage(error))) return "sqlite-failed";
  return "unknown";
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstValue(row: Record<string, unknown> | undefined): unknown {
  if (!row) return undefined;
  return Object.values(row)[0];
}

export function collectDatabaseStartupDiagnostic(
  error: unknown,
  dependencies: DatabaseRecoveryDependencies,
  paths: DatabaseRecoveryPaths = { database: MAIN_DATABASE_PATH, backup: PRE_SYNC_DATABASE_BACKUP_PATH },
): DatabaseStartupDiagnostic {
  const databaseExists = dependencies.files.exists(paths.database);
  const backupExists = dependencies.files.exists(paths.backup);
  const sqlite: DatabaseStartupDiagnostic["sqlite"] = {
    inspected: false,
    user_version: null,
    table_count: null,
    known_tables_present: [],
    unknown_table_count: null,
    quick_check: "unavailable",
    foreign_key_violation_count: null,
    inspection_error: null,
  };

  if (databaseExists) {
    let inspector: DatabaseRecoveryInspector | undefined;
    try {
      inspector = dependencies.openDatabase(paths.database);
      const versionRow = inspector.query<Record<string, unknown>>("PRAGMA user_version")[0];
      const tableRows = inspector.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      const tableNames = tableRows.map((row) => String(row.name));
      const knownSet = new Set<string>(KNOWN_TABLE_NAMES);
      const quickCheckRow = inspector.query<Record<string, unknown>>("PRAGMA quick_check(1)")[0];
      const foreignKeyRows = inspector.query<Record<string, unknown>>("PRAGMA foreign_key_check");
      sqlite.inspected = true;
      sqlite.user_version = numberOrNull(firstValue(versionRow));
      sqlite.table_count = tableNames.length;
      sqlite.known_tables_present = tableNames.filter((name) => knownSet.has(name)).sort();
      sqlite.unknown_table_count = tableNames.filter((name) => !knownSet.has(name)).length;
      sqlite.quick_check = String(firstValue(quickCheckRow)).toLowerCase() === "ok" ? "ok" : "failed";
      sqlite.foreign_key_violation_count = foreignKeyRows.length;
    } catch (inspectionError) {
      sqlite.inspection_error = sanitizeDatabaseDiagnosticText(asErrorMessage(inspectionError));
    } finally {
      try {
        inspector?.close();
      } catch (closeError) {
        sqlite.inspection_error ??= sanitizeDatabaseDiagnosticText(asErrorMessage(closeError));
      }
    }
  }

  return {
    format: 1,
    kind: "database-startup-failure",
    generated_at: dependencies.nowIso(),
    app_version: dependencies.appVersion || null,
    writes_blocked: true,
    error: {
      code: errorCode(error),
      name: sanitizeDatabaseDiagnosticText(asErrorName(error)),
      message: sanitizeDatabaseDiagnosticText(asErrorMessage(error)),
    },
    files: {
      database_exists: databaseExists,
      database_journal_exists: dependencies.files.exists(`${paths.database}-journal`),
      database_wal_exists: dependencies.files.exists(`${paths.database}-wal`),
      database_shm_exists: dependencies.files.exists(`${paths.database}-shm`),
      pre_sync_backup_exists: backupExists,
      unfinished_backup_exists: dependencies.files.exists(`${paths.backup}.tmp`),
    },
    sqlite,
    recovery: {
      automatic_restore_performed: false,
      preferred_copy: backupExists ? "pre-sync-backup" : databaseExists ? "current-database" : "none",
      secrets_included: false,
    },
  };
}

export function createJsboxDatabaseRecoveryDependencies(): DatabaseRecoveryDependencies {
  return {
    files: $file,
    openDatabase(path: string): DatabaseRecoveryInspector {
      const database = $sqlite.open(path);
      return {
        query<T extends Record<string, unknown>>(sql: string): T[] {
          return querySqliteRows<T>(database, sql, undefined, "读取数据库启动诊断元数据");
        },
        close(): void {
          database.close();
        },
      };
    },
    nowIso: () => new Date().toISOString(),
    appVersion: $addin.current.version,
  };
}

export function databaseRecoveryInstructions(diagnostic: DatabaseStartupDiagnostic): string {
  const copy =
    diagnostic.recovery.preferred_copy === "pre-sync-backup"
      ? "升级前备份可用；请优先把它导出到只有你能访问的位置。"
      : diagnostic.recovery.preferred_copy === "current-database"
        ? "没有检测到升级前备份；请先导出当前数据库原件。"
        : "没有检测到可导出的数据库文件，请只导出脱敏诊断。";
  return [
    "1. 不要卸载 JSEhViewer、清除脚本数据或手工替换数据库。",
    "2. 先导出脱敏诊断 JSON；它只含版本、表名白名单和检查结论，不含业务行或密钥。",
    `3. ${copy}`,
    "4. 数据库文件包含 Cookie、API Key 和密码，只能保存到私密位置，不能附在公开 Issue。",
    "5. 更新到修复版本后点击重新启动。恢复页不会自动用旧备份覆盖当前数据库。",
  ].join("\n");
}
