import { CURRENT_SCHEMA_STATEMENTS, DatabaseInitializationError, initializeDatabase } from "./database-initialization";
import { querySqliteRows, withSqliteQueueOperation, withSqliteTransaction } from "./sqlite-safe";

const DATABASE_PATHS = {
  fresh: "assets/cloud-sync-phase1-init-fresh.db",
  version0: "assets/cloud-sync-phase1-init-v0.db",
  version1: "assets/cloud-sync-phase1-init-v1.db",
  unknown: "assets/cloud-sync-phase1-init-unknown.db",
};

export interface CloudSyncDatabaseInitializationDiagnosticResult {
  ok: true;
  freshCreated: true;
  version0Migrated: true;
  version1Idempotent: true;
  unknownVersionRejected: true;
  schemaConsistent: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncDatabaseInitializationDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncDatabaseInitializationDiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncDatabaseInitializationDiagnosticError(`无法清理临时数据库：${file}`);
    }
  }
}

function schemaSql(name: string): string {
  const statement = CURRENT_SCHEMA_STATEMENTS.find((candidate) => candidate.name === name);
  if (!statement) throw new CloudSyncDatabaseInitializationDiagnosticError(`找不到测试 schema：${name}`);
  return statement.sql;
}

function schemaFingerprint(queue: SqliteTypes.SqliteQueueInstance): string[] {
  return withSqliteQueueOperation(
    queue,
    (db) =>
      querySqliteRows<{ type: string; name: string; tbl_name: string; sql: string }>(
        db,
        `SELECT type, name, tbl_name, sql
         FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%'
         ORDER BY type, name`,
        undefined,
        "读取临时数据库 schema",
      ).map((row) => `${row.type}|${row.name}|${row.tbl_name}|${String(row.sql).replace(/\s+/g, " ").trim()}`),
    "读取临时数据库 schema 队列",
  );
}

function queryOne<T extends Record<string, any>>(
  queue: SqliteTypes.SqliteQueueInstance,
  sql: string,
  args?: (string | number | boolean | null | undefined)[],
): T {
  const rows = withSqliteQueueOperation(queue, (db) => querySqliteRows<T>(db, sql, args), "读取临时数据库");
  if (!rows[0]) throw new CloudSyncDatabaseInitializationDiagnosticError("临时数据库没有返回预期行");
  return rows[0];
}

function requireNoForeignKeyViolations(queue: SqliteTypes.SqliteQueueInstance): void {
  const rows = withSqliteQueueOperation(
    queue,
    (db) => querySqliteRows(db, "PRAGMA foreign_key_check"),
    "检查临时数据库外键",
  );
  if (rows.length !== 0) {
    throw new CloudSyncDatabaseInitializationDiagnosticError(`临时数据库存在 ${rows.length} 条外键异常`);
  }
}

function withTemporaryQueue<T>(path: string, callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  removeDatabase(path);
  const queue = $sqlite.dbQueue(path);
  let result: T;
  let operationFailed = false;
  let operationError: unknown;
  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    result = callback(queue);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }
  try {
    queue.close();
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  }
  try {
    removeDatabase(path);
  } catch (error) {
    cleanupFailed = true;
    cleanupError = cleanupError ?? error;
  }
  if (operationFailed) throw operationError;
  if (cleanupFailed) throw cleanupError;
  return result!;
}

function checkFreshDatabase(): string[] {
  return withTemporaryQueue(DATABASE_PATHS.fresh, (queue) => {
    const result = initializeDatabase(queue);
    if (result.kind !== "fresh" || result.currentVersion !== 1) {
      throw new CloudSyncDatabaseInitializationDiagnosticError("空库没有直接创建为当前版本");
    }
    const favcats = queryOne<{ count: number }>(queue, "SELECT COUNT(*) AS count FROM favcat_titles");
    const services = queryOne<{ count: number }>(queue, "SELECT COUNT(*) AS count FROM ai_translation_services");
    if (Number(favcats.count) !== 10 || Number(services.count) !== 2) {
      throw new CloudSyncDatabaseInitializationDiagnosticError("空库初始数据不完整");
    }
    requireNoForeignKeyViolations(queue);
    return schemaFingerprint(queue);
  });
}

function checkVersion0Migration(expectedFingerprint: string[]): void {
  withTemporaryQueue(DATABASE_PATHS.version0, (queue) => {
    withSqliteQueueOperation(queue, (db) => {
      withSqliteTransaction(db, (transaction) => {
        transaction.update(schemaSql("archives"), undefined, "创建 v0 archives fixture");
        transaction.update(schemaSql("config"), undefined, "创建 v0 config fixture");
        transaction.update(
          "INSERT INTO archives (gid, title, last_read_page) VALUES (?, ?, ?)",
          [123, "legacy archive", 17],
          "写入 v0 sentinel",
        );
        transaction.update(
          "INSERT INTO config (key, value) VALUES (?, ?)",
          ["selectedAiTranslationService", "manga-image-translator"],
          "写入 v0 选择项",
        );
        transaction.update(
          "INSERT INTO config (key, value) VALUES (?, ?)",
          ["aiTranslationSavedConfigText", JSON.stringify({ "manga-image-translator": { host: "10.0.0.2" } })],
          "写入 v0 配置",
        );
      });
    });

    const result = initializeDatabase(queue);
    const archive = queryOne<{ title: string; last_read_page: number }>(
      queue,
      "SELECT title, last_read_page FROM archives WHERE gid = ?",
      [123],
    );
    const selected = queryOne<{ selected: number }>(
      queue,
      "SELECT selected FROM ai_translation_services WHERE name = ?",
      ["manga-image-translator"],
    );
    if (
      result.kind !== "upgraded" ||
      archive.title !== "legacy archive" ||
      Number(archive.last_read_page) !== 17 ||
      Number(selected.selected) !== 1
    ) {
      throw new CloudSyncDatabaseInitializationDiagnosticError("v0 数据没有完整迁移到 v1");
    }
    if (JSON.stringify(schemaFingerprint(queue)) !== JSON.stringify(expectedFingerprint)) {
      throw new CloudSyncDatabaseInitializationDiagnosticError("v0 升级后的 schema 与 fresh schema 不一致");
    }
    requireNoForeignKeyViolations(queue);
  });
}

function checkVersion1Idempotence(expectedFingerprint: string[]): void {
  withTemporaryQueue(DATABASE_PATHS.version1, (queue) => {
    withSqliteQueueOperation(queue, (db) => {
      withSqliteTransaction(db, (transaction) => {
        transaction.update(schemaSql("archives"), undefined, "创建 v1 archives fixture");
        transaction.update(schemaSql("config"), undefined, "创建 v1 config fixture");
        transaction.update("INSERT INTO archives (gid, title) VALUES (?, ?)", [456, "v1 sentinel"]);
        transaction.update("PRAGMA user_version = 1", undefined, "设置 v1 fixture 版本");
      });
    });

    const result = initializeDatabase(queue);
    const archive = queryOne<{ title: string }>(queue, "SELECT title FROM archives WHERE gid = ?", [456]);
    const services = queryOne<{ count: number }>(queue, "SELECT COUNT(*) AS count FROM ai_translation_services");
    if (result.kind !== "current" || archive.title !== "v1 sentinel" || Number(services.count) !== 0) {
      throw new CloudSyncDatabaseInitializationDiagnosticError("v1 检查改变了既有数据或擅自重建 AI 服务");
    }
    if (JSON.stringify(schemaFingerprint(queue)) !== JSON.stringify(expectedFingerprint)) {
      throw new CloudSyncDatabaseInitializationDiagnosticError("v1 修复后的 schema 与 fresh schema 不一致");
    }
    requireNoForeignKeyViolations(queue);
  });
}

function checkUnknownVersionRejection(): void {
  withTemporaryQueue(DATABASE_PATHS.unknown, (queue) => {
    withSqliteQueueOperation(queue, (db) => {
      withSqliteTransaction(db, (transaction) => {
        transaction.update("CREATE TABLE sentinel (value TEXT NOT NULL)", undefined, "创建未知版本 fixture");
        transaction.update("INSERT INTO sentinel (value) VALUES (?)", ["unchanged"]);
        transaction.update("PRAGMA user_version = 99", undefined, "设置未知版本 fixture");
      });
    });
    const before = schemaFingerprint(queue);
    let rejected = false;
    try {
      initializeDatabase(queue);
    } catch (error) {
      rejected = error instanceof DatabaseInitializationError && error.message.includes("高于当前支持");
    }
    const version = queryOne<{ user_version: number }>(queue, "PRAGMA user_version");
    const sentinel = queryOne<{ value: string }>(queue, "SELECT value FROM sentinel");
    if (
      !rejected ||
      Number(version.user_version) !== 99 ||
      sentinel.value !== "unchanged" ||
      JSON.stringify(schemaFingerprint(queue)) !== JSON.stringify(before)
    ) {
      throw new CloudSyncDatabaseInitializationDiagnosticError("未知版本没有在零 schema 写入的情况下停止");
    }
  });
}

export function runCloudSyncDatabaseInitializationDiagnostic(): CloudSyncDatabaseInitializationDiagnosticResult {
  const startedAt = Date.now();
  const freshFingerprint = checkFreshDatabase();
  checkVersion0Migration(freshFingerprint);
  checkVersion1Idempotence(freshFingerprint);
  checkUnknownVersionRejection();
  return {
    ok: true,
    freshCreated: true,
    version0Migrated: true,
    version1Idempotent: true,
    unknownVersionRejected: true,
    schemaConsistent: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
