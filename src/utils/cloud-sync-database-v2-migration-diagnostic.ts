import {
  DatabaseV2MigrationError,
  migrateVersion1ToVersion2Draft,
  stableSearchEntityId,
} from "./database-migration-v2-draft";
import { CURRENT_SCHEMA_STATEMENTS } from "./database-initialization";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const SUCCESS_DATABASE_PATH = "assets/cloud-sync-phase1-migration-v2-success.db";
const ROLLBACK_DATABASE_PATH = "assets/cloud-sync-phase1-migration-v2-rollback.db";
const MIGRATION_TIME = "2026-08-11T12:34:56.000Z";
const ARCHIVE_FIXTURE_COUNT = 40;
const HISTORY_FIXTURE_COUNT = 24;

export interface CloudSyncDatabaseV2MigrationDiagnosticResult {
  ok: true;
  successMigrationPersisted: true;
  rollbackComplete: true;
  stableIdsAndOrder: true;
  localOnlyTablesPreserved: true;
  cleanupComplete: true;
  archiveCount: number;
  historyCount: number;
  durationMs: number;
}

export class CloudSyncDatabaseV2MigrationDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncDatabaseV2MigrationDiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncDatabaseV2MigrationDiagnosticError(`无法清理 DB v2 临时数据库：${file}`);
    }
  }
}

function withQueue<T>(path: string, callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(path);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 DB v2 临时库外键"),
      "启用 DB v2 临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function withTemporaryDatabase<T>(path: string, callback: () => T): T {
  removeDatabase(path);
  let result: T;
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    result = callback();
  } catch (error) {
    operationError = error;
  }
  try {
    removeDatabase(path);
  } catch (error) {
    cleanupError = error;
  }
  if (operationError) {
    if (cleanupError) {
      const operationMessage = operationError instanceof Error ? operationError.message : String(operationError);
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      throw new CloudSyncDatabaseV2MigrationDiagnosticError(`${operationMessage}；同时清理失败：${cleanupMessage}`);
    }
    throw operationError;
  }
  if (cleanupError) throw cleanupError;
  return result!;
}

function queryOne<T extends Record<string, any>>(
  queue: SqliteTypes.SqliteQueueInstance,
  sql: string,
  args?: (string | number | boolean | null | undefined)[],
): T {
  const rows = withSqliteQueueOperation(
    queue,
    (db) => querySqliteRows<T>(db, sql, args, "读取 DB v2 临时库"),
    "读取 DB v2 临时库队列",
  );
  if (!rows[0]) throw new CloudSyncDatabaseV2MigrationDiagnosticError("DB v2 临时库没有返回预期行");
  return rows[0];
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
        "读取 DB v2 临时库 schema",
      ).map((row) => `${row.type}|${row.name}|${row.tbl_name}|${String(row.sql).replace(/\s+/g, " ").trim()}`),
    "读取 DB v2 临时库 schema 队列",
  );
}

function applyV1Schema(transaction: SqliteTransactionContext): void {
  for (const statement of CURRENT_SCHEMA_STATEMENTS) {
    transaction.update(statement.sql, undefined, `创建 DB v2 诊断用 v1 ${statement.name}`);
  }
  transaction.update("PRAGMA user_version = 1", undefined, "设置 DB v2 诊断用 v1 版本");
}

function insertArchiveFixture(transaction: SqliteTransactionContext, gid: number): void {
  transaction.update(
    `INSERT INTO archives (
       gid, readlater, downloaded, first_access_time, last_access_time, token, title,
       thumbnail_url, category, visible, rating, is_my_rating, length, torrent_available,
       favorited, uploader, disowned, taglist, comment, last_read_page
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      gid,
      gid === 1 ? 1 : 0,
      gid === 1 ? 1 : 0,
      gid === 2 ? null : "2026-07-01T00:00:00.000Z",
      gid === 2 ? null : "2026-07-02T00:00:00.000Z",
      `token-${gid}`,
      `archive-${gid}`,
      `https://example.test/${gid}.jpg`,
      "manga",
      1,
      4.5,
      0,
      20 + gid,
      0,
      0,
      `uploader-${gid}`,
      0,
      gid === 1 ? JSON.stringify([{ namespace: "artist", tags: ["alice"] }]) : "[]",
      "",
      gid % 10,
    ],
    "写入 DB v2 图库 fixture",
  );
}

function populateSuccessFixture(transaction: SqliteTransactionContext): void {
  applyV1Schema(transaction);
  for (let gid = 1; gid <= ARCHIVE_FIXTURE_COUNT; gid += 1) insertArchiveFixture(transaction, gid);
  transaction.update(
    "INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)",
    [1, "artist", "alice"],
    "写入有效图库标签 fixture",
  );
  transaction.update(
    "INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)",
    [9999, "artist", "orphan"],
    "写入孤儿图库标签 fixture",
  );

  for (let index = 0; index < HISTORY_FIXTURE_COUNT; index += 1) {
    const sortedFsearch = index === 0 ? "artist:alice" : `tag-${index}`;
    transaction.update(
      "INSERT INTO search_history (id, last_access_time, sorted_fsearch) VALUES (?, ?, ?)",
      [index + 1, index === 0 ? null : "2026-07-03T00:00:00.000Z", sortedFsearch],
      "写入搜索历史 fixture",
    );
    transaction.update(
      `INSERT INTO search_history_search_terms
       (search_history_id, namespace, qualifier, term, dollar, subtract, tilde)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [index + 1, index === 0 ? "artist" : null, null, index === 0 ? "alice" : `tag-${index}`, 0, 0, 0],
      "写入搜索历史 term fixture",
    );
  }
  transaction.update(
    `INSERT INTO search_history_search_terms
     (search_history_id, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?)`,
    [9999, "orphan", 0, 0, 0],
    "写入孤儿搜索历史 term fixture",
  );

  transaction.update(
    "INSERT INTO search_bookmarks (id, sort_order, sorted_fsearch) VALUES (?, ?, ?)",
    [1, 10, "language:chinese"],
    "写入第一条书签 fixture",
  );
  transaction.update(
    "INSERT INTO search_bookmarks (id, sort_order, sorted_fsearch) VALUES (?, ?, ?)",
    [2, -1, "artist:bob"],
    "写入第二条书签 fixture",
  );
  transaction.update(
    `INSERT INTO search_bookmarks_search_terms
     (search_bookmarks_id, namespace, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, "language", "chinese", 0, 0, 0],
    "写入第一条书签 term fixture",
  );
  transaction.update(
    `INSERT INTO search_bookmarks_search_terms
     (search_bookmarks_id, namespace, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?)`,
    [2, "artist", "bob", 0, 0, 0],
    "写入第二条书签 term fixture",
  );

  transaction.update("INSERT INTO marked_uploaders (uploader) VALUES (?)", ["alice"]);
  transaction.update("INSERT INTO marked_uploaders (uploader) VALUES (NULL)");
  transaction.update("INSERT INTO banned_uploaders (uploader) VALUES (?)", ["mallory"]);
  transaction.update("INSERT INTO config (key, value) VALUES (?, ?)", ["syncMyTags", "false"]);
  transaction.update(
    `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [7, "artist", "local-tag", 1, 0, "#123456", 10],
  );
  transaction.update(
    `INSERT INTO ai_translation_services (name, selected, script_text, config_form, config)
     VALUES (?, ?, ?, ?, ?)`,
    ["diagnostic-ai", 1, "local script", "{}", JSON.stringify({ apiKey: "diagnostic-local-only" })],
  );
  transaction.update(
    `INSERT INTO webdav_services (name, host, port, https, path, username, password, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["diagnostic-webdav", "dav.example.test", 443, 1, "/backup", "user", "diagnostic-password", 1],
  );
  transaction.update(
    `INSERT INTO gallery_reader_config
     (gid, pageDirection, spreadModeEnabled, skipFirstPageInSpread, skipLandscapePagesInSpread, pagingGesture)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [1, "right_to_left", 1, 0, 1, "tap_and_swipe"],
  );
}

function requireNoForeignKeyViolations(queue: SqliteTypes.SqliteQueueInstance): void {
  const violations = withSqliteQueueOperation(
    queue,
    (db) => querySqliteRows(db, "PRAGMA foreign_key_check", undefined, "检查 DB v2 临时库外键"),
    "检查 DB v2 临时库外键队列",
  );
  if (violations.length !== 0) {
    throw new CloudSyncDatabaseV2MigrationDiagnosticError(`DB v2 临时库存在 ${violations.length} 条外键异常`);
  }
}

function checkSuccessfulMigration(): void {
  withTemporaryDatabase(SUCCESS_DATABASE_PATH, () => {
    withQueue(SUCCESS_DATABASE_PATH, (queue) => {
      withSqliteQueueOperation(queue, (db) =>
        withSqliteTransaction(db, populateSuccessFixture, "创建 DB v2 成功迁移 fixture"),
      );
      const result = withSqliteQueueOperation(queue, (db) =>
        withSqliteTransaction(
          db,
          (transaction) =>
            migrateVersion1ToVersion2Draft(transaction, {
              nowIso: () => MIGRATION_TIME,
              sha256Hex: (value) => $text.SHA256(value),
            }),
          "执行 DB v2 成功迁移 fixture",
        ),
      );
      if (
        result.archiveCount !== ARCHIVE_FIXTURE_COUNT ||
        result.historyCount !== HISTORY_FIXTURE_COUNT ||
        result.droppedArchiveTagOrphans !== 1 ||
        result.droppedHistoryTermOrphans !== 1 ||
        result.droppedInvalidMarkedUploaders !== 1
      ) {
        throw new CloudSyncDatabaseV2MigrationDiagnosticError("DB v2 迁移数量或边缘清理结果不符合预期");
      }
    });

    withQueue(SUCCESS_DATABASE_PATH, (queue) => {
      const version = queryOne<{ user_version: number }>(queue, "PRAGMA user_version");
      const archive = queryOne<{ title: string; refreshed_at: string }>(
        queue,
        "SELECT title, refreshed_at FROM archive_entries WHERE gid = ?",
        [1],
      );
      const reading = queryOne<{ first_access_time: string; last_read_page: number }>(
        queue,
        "SELECT first_access_time, last_read_page FROM reading_state WHERE gid = ?",
        [2],
      );
      const local = queryOne<{ downloaded: number; downloaded_at: string }>(
        queue,
        "SELECT downloaded, downloaded_at FROM local_gallery_state WHERE gid = ?",
        [1],
      );
      const historyId = stableSearchEntityId("artist:alice", (value) => $text.SHA256(value));
      const history = queryOne<{ last_access_time: string }>(
        queue,
        "SELECT last_access_time FROM search_history WHERE history_id = ?",
        [historyId],
      );
      const bookmarks = withSqliteQueueOperation(
        queue,
        (db) =>
          querySqliteRows<{ sorted_fsearch: string; position_key: string }>(
            db,
            "SELECT sorted_fsearch, position_key FROM search_bookmarks ORDER BY position_key",
            undefined,
            "检查 DB v2 书签顺序",
          ),
        "检查 DB v2 书签顺序队列",
      );
      const ai = queryOne<{ config: string }>(queue, "SELECT config FROM ai_translation_services WHERE name = ?", [
        "diagnostic-ai",
      ]);
      const webdav = queryOne<{ password: string }>(queue, "SELECT password FROM webdav_services WHERE name = ?", [
        "diagnostic-webdav",
      ]);
      const markedTag = queryOne<{ color: string }>(
        queue,
        "SELECT color FROM marked_tags WHERE namespace = ? AND name = ?",
        ["artist", "local-tag"],
      );
      const reader = queryOne<{ pageDirection: string }>(
        queue,
        "SELECT pageDirection FROM gallery_reader_config WHERE gid = ?",
        [1],
      );
      const clock = queryOne<{ id: number; wall_ms: number; logical_counter: number }>(
        queue,
        "SELECT * FROM sync_clock",
      );
      if (
        Number(version.user_version) !== 2 ||
        archive.title !== "archive-1" ||
        archive.refreshed_at !== MIGRATION_TIME ||
        reading.first_access_time !== MIGRATION_TIME ||
        Number(reading.last_read_page) !== 2 ||
        Number(local.downloaded) !== 1 ||
        local.downloaded_at !== MIGRATION_TIME ||
        history.last_access_time !== MIGRATION_TIME ||
        bookmarks.length !== 2 ||
        bookmarks[0]?.sorted_fsearch !== "artist:bob" ||
        bookmarks[1]?.sorted_fsearch !== "language:chinese" ||
        ai.config !== JSON.stringify({ apiKey: "diagnostic-local-only" }) ||
        webdav.password !== "diagnostic-password" ||
        markedTag.color !== "#123456" ||
        reader.pageDirection !== "right_to_left" ||
        Number(clock.id) !== 1 ||
        Number(clock.wall_ms) !== 0 ||
        Number(clock.logical_counter) !== 0
      ) {
        throw new CloudSyncDatabaseV2MigrationDiagnosticError("DB v2 迁移结果在关闭重开后不完整");
      }
      requireNoForeignKeyViolations(queue);
    });
  });
}

function populateRollbackFixture(transaction: SqliteTransactionContext): void {
  applyV1Schema(transaction);
  insertArchiveFixture(transaction, 501);
  transaction.update(
    "INSERT INTO search_history (id, last_access_time, sorted_fsearch) VALUES (?, ?, ?)",
    [1, "2026-07-01T00:00:00.000Z", "must-rollback"],
    "写入 DB v2 回滚搜索历史 fixture",
  );
}

function checkFailedMigrationRollback(): void {
  withTemporaryDatabase(ROLLBACK_DATABASE_PATH, () => {
    let beforeFingerprint: string[] = [];
    withQueue(ROLLBACK_DATABASE_PATH, (queue) => {
      withSqliteQueueOperation(queue, (db) =>
        withSqliteTransaction(db, populateRollbackFixture, "创建 DB v2 回滚 fixture"),
      );
      beforeFingerprint = schemaFingerprint(queue);
      let rejected = false;
      try {
        withSqliteQueueOperation(queue, (db) =>
          withSqliteTransaction(
            db,
            (transaction) =>
              migrateVersion1ToVersion2Draft(transaction, {
                nowIso: () => MIGRATION_TIME,
                sha256Hex: () => "invalid-digest",
              }),
            "执行 DB v2 故障回滚 fixture",
          ),
        );
      } catch (error) {
        rejected = error instanceof DatabaseV2MigrationError && error.message.includes("SHA-256");
      }
      if (!rejected) {
        throw new CloudSyncDatabaseV2MigrationDiagnosticError("DB v2 注入故障没有按预期拒绝迁移");
      }
      if (JSON.stringify(schemaFingerprint(queue)) !== JSON.stringify(beforeFingerprint)) {
        throw new CloudSyncDatabaseV2MigrationDiagnosticError("DB v2 注入故障后 schema 没有完整回滚");
      }
    });

    withQueue(ROLLBACK_DATABASE_PATH, (queue) => {
      const version = queryOne<{ user_version: number }>(queue, "PRAGMA user_version");
      const archive = queryOne<{ title: string }>(queue, "SELECT title FROM archives WHERE gid = ?", [501]);
      if (
        Number(version.user_version) !== 1 ||
        archive.title !== "archive-501" ||
        JSON.stringify(schemaFingerprint(queue)) !== JSON.stringify(beforeFingerprint) ||
        schemaFingerprint(queue).some((line) => line.includes("_v2_migration"))
      ) {
        throw new CloudSyncDatabaseV2MigrationDiagnosticError("DB v2 注入故障在关闭重开后没有完整回滚");
      }
      requireNoForeignKeyViolations(queue);
    });
  });
}

export function runCloudSyncDatabaseV2MigrationDiagnostic(): CloudSyncDatabaseV2MigrationDiagnosticResult {
  const startedAt = Date.now();
  checkSuccessfulMigration();
  checkFailedMigrationRollback();
  return {
    ok: true,
    successMigrationPersisted: true,
    rollbackComplete: true,
    stableIdsAndOrder: true,
    localOnlyTablesPreserved: true,
    cleanupComplete: true,
    archiveCount: ARCHIVE_FIXTURE_COUNT,
    historyCount: HISTORY_FIXTURE_COUNT,
    durationMs: Date.now() - startedAt,
  };
}
