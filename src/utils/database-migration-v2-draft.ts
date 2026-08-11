import { DATABASE_V2_DRAFT_SCHEMA_STATEMENTS, DATABASE_V2_DRAFT_USER_VERSION } from "./database-schema-v2-draft";
import type { SqliteTransactionContext } from "./sqlite-safe";

const MIGRATION_TABLE_SUFFIX = "_v2_migration";
const INITIAL_POSITION_GAP = 1024;
const INITIAL_POSITION_WIDTH = 12;

const REPLACED_TABLES = [
  "archive_entries",
  "reading_state",
  "local_gallery_state",
  "archive_taglist",
  "search_history",
  "search_history_search_terms",
  "search_bookmarks",
  "search_bookmarks_search_terms",
  "marked_uploaders",
  "banned_uploaders",
] as const;

const REQUIRED_V1_TABLES = [
  "archives",
  "archive_taglist",
  "search_history",
  "search_history_search_terms",
  "search_bookmarks",
  "search_bookmarks_search_terms",
  "marked_uploaders",
  "banned_uploaders",
] as const;

type ReplacedTableName = (typeof REPLACED_TABLES)[number];

export interface DatabaseV2MigrationDependencies {
  nowIso(): string;
  sha256Hex(value: string): string;
}

export interface DatabaseV2MigrationResult {
  previousVersion: 1;
  currentVersion: 2;
  archiveCount: number;
  archiveTagCount: number;
  historyCount: number;
  historyTermCount: number;
  bookmarkCount: number;
  bookmarkTermCount: number;
  markedUploaderCount: number;
  bannedUploaderCount: number;
  droppedArchiveTagOrphans: number;
  droppedHistoryTermOrphans: number;
  droppedBookmarkTermOrphans: number;
  droppedInvalidMarkedUploaders: number;
  droppedInvalidBannedUploaders: number;
}

export class DatabaseV2MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseV2MigrationError";
  }
}

interface CountRow {
  count: number;
}

interface ArchiveTagJsonRow {
  gid: number;
  taglist: string | null;
}

interface LegacyHistoryRow {
  id: number;
  last_access_time: string | null;
  sorted_fsearch: string | null;
}

interface LegacyBookmarkRow {
  id: number;
  sort_order: number | null;
  sorted_fsearch: string | null;
}

interface LegacySearchTermRow {
  parent_id: number;
  namespace: string | null;
  qualifier: string | null;
  term: string;
  dollar: number | null;
  subtract: number | null;
  tilde: number | null;
}

function migrationTableName(tableName: ReplacedTableName): string {
  return `${tableName}${MIGRATION_TABLE_SUFFIX}`;
}

function schemaStatement(tableName: ReplacedTableName) {
  const statement = DATABASE_V2_DRAFT_SCHEMA_STATEMENTS.find(
    (candidate) => candidate.type === "table" && candidate.name === tableName,
  );
  if (!statement) throw new DatabaseV2MigrationError(`DB v2 草案缺少表定义：${tableName}`);
  return statement;
}

function migrationTableSql(tableName: ReplacedTableName): string {
  let sql = schemaStatement(tableName).sql.replace("CREATE TABLE IF NOT EXISTS", "CREATE TABLE");
  for (const replacedTable of REPLACED_TABLES) {
    sql = sql.replace(new RegExp(`\\b${replacedTable}\\b`, "g"), migrationTableName(replacedTable));
  }
  return sql;
}

function count(transaction: SqliteTransactionContext, sql: string, operation: string): number {
  const value = Number(transaction.query<CountRow>(sql, undefined, operation)[0]?.count);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DatabaseV2MigrationError(`${operation}返回了无效数量`);
  }
  return value;
}

function booleanInteger(value: number | null): number {
  return Number(value !== null && Number(value) !== 0);
}

function requireVersion1(transaction: SqliteTransactionContext): void {
  const version = Number(
    transaction.query<{ user_version: number }>("PRAGMA user_version", undefined, "读取迁移前数据库版本")[0]
      ?.user_version,
  );
  if (version !== 1) {
    throw new DatabaseV2MigrationError(`DB v2 草案迁移只接受 user_version=1，当前为 ${version}`);
  }
}

function requireV1Tables(transaction: SqliteTransactionContext): void {
  const tableNames = new Set(
    transaction
      .query<{ name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        undefined,
        "检查 v1 迁移前提",
      )
      .map((row) => String(row.name)),
  );
  const missing = REQUIRED_V1_TABLES.filter((tableName) => !tableNames.has(tableName));
  if (missing.length !== 0) {
    throw new DatabaseV2MigrationError(`DB v2 草案迁移缺少 v1 表：${missing.join(", ")}`);
  }
}

function validateArchiveRows(transaction: SqliteTransactionContext): void {
  const negativePageCount = count(
    transaction,
    "SELECT COUNT(*) AS count FROM archives WHERE last_read_page < 0",
    "检查旧阅读页码",
  );
  if (negativePageCount !== 0) {
    throw new DatabaseV2MigrationError(`旧 archives 包含 ${negativePageCount} 条负数阅读页码，已停止迁移`);
  }

  const rows = transaction.query<ArchiveTagJsonRow>(
    "SELECT gid, taglist FROM archives WHERE taglist IS NOT NULL AND TRIM(taglist) <> ''",
    undefined,
    "检查旧图库标签 JSON",
  );
  for (const row of rows) {
    try {
      const value = JSON.parse(row.taglist as string);
      if (!Array.isArray(value)) throw new Error("not an array");
    } catch {
      throw new DatabaseV2MigrationError(`旧 archives.gid=${row.gid} 的 taglist 不是有效数组 JSON，已停止迁移`);
    }
  }
}

function createMigrationTables(transaction: SqliteTransactionContext): void {
  for (const tableName of REPLACED_TABLES) {
    transaction.update(migrationTableSql(tableName), undefined, `创建 DB v2 临时表 ${tableName}`);
  }
}

function copyArchives(transaction: SqliteTransactionContext, migrationTime: string): void {
  const archiveEntries = migrationTableName("archive_entries");
  const readingState = migrationTableName("reading_state");
  const localGalleryState = migrationTableName("local_gallery_state");
  const archiveTaglist = migrationTableName("archive_taglist");

  transaction.update(
    `INSERT INTO ${archiveEntries} (
       gid, token, title, english_title, japanese_title, thumbnail_url, category, posted_time,
       visible, rating, is_my_rating, length, torrent_available, favorited, favcat, uploader,
       disowned, taglist_json, comment, refreshed_at
     )
     SELECT
       gid, token, title, english_title, japanese_title, thumbnail_url, category, posted_time,
       CASE WHEN COALESCE(visible, 0) = 0 THEN 0 ELSE 1 END,
       rating,
       CASE WHEN COALESCE(is_my_rating, 0) = 0 THEN 0 ELSE 1 END,
       length,
       CASE WHEN COALESCE(torrent_available, 0) = 0 THEN 0 ELSE 1 END,
       CASE WHEN COALESCE(favorited, 0) = 0 THEN 0 ELSE 1 END,
       favcat, uploader,
       CASE WHEN COALESCE(disowned, 0) = 0 THEN 0 ELSE 1 END,
       CASE WHEN taglist IS NULL OR TRIM(taglist) = '' THEN '[]' ELSE taglist END,
       comment, ?
     FROM archives`,
    [migrationTime],
    "复制图库列表快照",
  );

  transaction.update(
    `INSERT INTO ${readingState} (
       gid, token, first_access_time, last_access_time, readlater, last_read_page
     )
     SELECT
       gid, token,
       COALESCE(first_access_time, last_access_time, ?),
       COALESCE(last_access_time, first_access_time, ?),
       CASE WHEN COALESCE(readlater, 0) = 0 THEN 0 ELSE 1 END,
       COALESCE(last_read_page, 0)
     FROM archives`,
    [migrationTime, migrationTime],
    "复制阅读状态",
  );

  transaction.update(
    `INSERT INTO ${localGalleryState} (gid, downloaded, downloaded_at)
     SELECT
       gid,
       CASE WHEN COALESCE(downloaded, 0) = 0 THEN 0 ELSE 1 END,
       CASE WHEN COALESCE(downloaded, 0) = 0 THEN NULL ELSE ? END
     FROM archives`,
    [migrationTime],
    "复制本机下载状态",
  );

  transaction.update(
    `INSERT INTO ${archiveTaglist} (gid, namespace, tag)
     SELECT source.gid, source.namespace, source.tag
     FROM archive_taglist AS source
     INNER JOIN ${archiveEntries} AS parent ON parent.gid = source.gid`,
    undefined,
    "复制图库标签索引",
  );
}

export function stableSearchEntityId(sortedFsearch: string, sha256Hex: (value: string) => string): string {
  const digest = sha256Hex(sortedFsearch).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new DatabaseV2MigrationError("SHA-256 依赖没有返回 64 位十六进制摘要");
  }
  return digest;
}

export function initialBookmarkPositionKey(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new DatabaseV2MigrationError(`书签位置序号无效：${index}`);
  }
  const value = (index + 1) * INITIAL_POSITION_GAP;
  if (!Number.isSafeInteger(value)) {
    throw new DatabaseV2MigrationError("书签数量超过 position_key 安全范围");
  }
  return value.toString(36).padStart(INITIAL_POSITION_WIDTH, "0");
}

function requireSortedFsearch(value: string | null, entity: string, sourceId: number): string {
  if (value === null) {
    throw new DatabaseV2MigrationError(`旧 ${entity}.id=${sourceId} 缺少 sorted_fsearch，已停止迁移`);
  }
  return value;
}

function copySearchTerms(
  transaction: SqliteTransactionContext,
  sourceTable: "search_history_search_terms" | "search_bookmarks_search_terms",
  sourceParentColumn: "search_history_id" | "search_bookmarks_id",
  targetTable: "search_history_search_terms" | "search_bookmarks_search_terms",
  targetParentColumn: "history_id" | "bookmark_id",
  stableIds: Map<number, string>,
): number {
  const rows = transaction.query<LegacySearchTermRow>(
    `SELECT
       ${sourceParentColumn} AS parent_id,
       namespace, qualifier, term, dollar, subtract, tilde
     FROM ${sourceTable}
     ORDER BY ${sourceParentColumn}, rowid`,
    undefined,
    `读取旧 ${sourceTable}`,
  );
  const nextTermIndex = new Map<number, number>();
  let copied = 0;
  for (const row of rows) {
    const stableId = stableIds.get(Number(row.parent_id));
    if (!stableId) continue;
    const termIndex = nextTermIndex.get(Number(row.parent_id)) ?? 0;
    transaction.update(
      `INSERT INTO ${migrationTableName(targetTable)} (
         ${targetParentColumn}, term_index, namespace, qualifier, term, dollar, subtract, tilde
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stableId,
        termIndex,
        row.namespace,
        row.qualifier,
        row.term,
        booleanInteger(row.dollar),
        booleanInteger(row.subtract),
        booleanInteger(row.tilde),
      ],
      `复制 ${targetTable}`,
    );
    nextTermIndex.set(Number(row.parent_id), termIndex + 1);
    copied += 1;
  }
  return copied;
}

function copySearchHistory(
  transaction: SqliteTransactionContext,
  migrationTime: string,
  sha256Hex: (value: string) => string,
): { parentCount: number; termCount: number } {
  const rows = transaction.query<LegacyHistoryRow>(
    "SELECT id, last_access_time, sorted_fsearch FROM search_history ORDER BY id",
    undefined,
    "读取旧搜索历史",
  );
  const stableIds = new Map<number, string>();
  for (const row of rows) {
    const sortedFsearch = requireSortedFsearch(row.sorted_fsearch, "search_history", row.id);
    const historyId = stableSearchEntityId(sortedFsearch, sha256Hex);
    transaction.update(
      `INSERT INTO ${migrationTableName("search_history")}
       (history_id, last_access_time, sorted_fsearch) VALUES (?, ?, ?)`,
      [historyId, row.last_access_time ?? migrationTime, sortedFsearch],
      "复制搜索历史",
    );
    stableIds.set(Number(row.id), historyId);
  }
  const termCount = copySearchTerms(
    transaction,
    "search_history_search_terms",
    "search_history_id",
    "search_history_search_terms",
    "history_id",
    stableIds,
  );
  return { parentCount: rows.length, termCount };
}

function copySearchBookmarks(
  transaction: SqliteTransactionContext,
  sha256Hex: (value: string) => string,
): { parentCount: number; termCount: number } {
  const rows = transaction.query<LegacyBookmarkRow>(
    `SELECT id, sort_order, sorted_fsearch
     FROM search_bookmarks
     ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order, id`,
    undefined,
    "读取旧搜索书签",
  );
  const stableIds = new Map<number, string>();
  rows.forEach((row, index) => {
    const sortedFsearch = requireSortedFsearch(row.sorted_fsearch, "search_bookmarks", row.id);
    const bookmarkId = stableSearchEntityId(sortedFsearch, sha256Hex);
    transaction.update(
      `INSERT INTO ${migrationTableName("search_bookmarks")}
       (bookmark_id, position_key, sorted_fsearch) VALUES (?, ?, ?)`,
      [bookmarkId, initialBookmarkPositionKey(index), sortedFsearch],
      "复制搜索书签",
    );
    stableIds.set(Number(row.id), bookmarkId);
  });
  const termCount = copySearchTerms(
    transaction,
    "search_bookmarks_search_terms",
    "search_bookmarks_id",
    "search_bookmarks_search_terms",
    "bookmark_id",
    stableIds,
  );
  return { parentCount: rows.length, termCount };
}

function copyUploaders(
  transaction: SqliteTransactionContext,
  sourceTable: "marked_uploaders" | "banned_uploaders",
): number {
  const targetTable = migrationTableName(sourceTable);
  transaction.update(
    `INSERT INTO ${targetTable} (uploader)
     SELECT uploader FROM ${sourceTable}
     WHERE uploader IS NOT NULL AND TRIM(uploader) <> ''
     GROUP BY uploader`,
    undefined,
    `复制 ${sourceTable}`,
  );
  return count(transaction, `SELECT COUNT(*) AS count FROM ${targetTable}`, `统计 ${sourceTable} 迁移结果`);
}

function replaceLegacyTables(transaction: SqliteTransactionContext): void {
  const legacyTables = [
    "archive_taglist",
    "archives",
    "search_history_search_terms",
    "search_history",
    "search_bookmarks_search_terms",
    "search_bookmarks",
    "marked_uploaders",
    "banned_uploaders",
  ];
  for (const tableName of legacyTables) {
    transaction.update(`DROP TABLE ${tableName}`, undefined, `删除已复制的 v1 表 ${tableName}`);
  }
  for (const tableName of REPLACED_TABLES) {
    transaction.update(
      `ALTER TABLE ${migrationTableName(tableName)} RENAME TO ${tableName}`,
      undefined,
      `启用 DB v2 表 ${tableName}`,
    );
  }
}

function applyV2Schema(transaction: SqliteTransactionContext): void {
  for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
    transaction.update(statement.sql, undefined, `建立 DB v2 ${statement.type} ${statement.name}`);
  }
  transaction.update("INSERT INTO sync_clock (id) VALUES (1)", undefined, "初始化同步逻辑时钟");
}

function verifyMigration(
  transaction: SqliteTransactionContext,
  expected: Omit<DatabaseV2MigrationResult, "previousVersion" | "currentVersion">,
): void {
  const checks: [string, number, string][] = [
    ["archive_entries", expected.archiveCount, "图库列表快照"],
    ["reading_state", expected.archiveCount, "阅读状态"],
    ["local_gallery_state", expected.archiveCount, "本机下载状态"],
    ["archive_taglist", expected.archiveTagCount, "图库标签索引"],
    ["search_history", expected.historyCount, "搜索历史"],
    ["search_history_search_terms", expected.historyTermCount, "搜索历史 terms"],
    ["search_bookmarks", expected.bookmarkCount, "搜索书签"],
    ["search_bookmarks_search_terms", expected.bookmarkTermCount, "搜索书签 terms"],
    ["marked_uploaders", expected.markedUploaderCount, "标记上传者"],
    ["banned_uploaders", expected.bannedUploaderCount, "屏蔽上传者"],
  ];
  for (const [tableName, expectedCount, label] of checks) {
    const actual = count(transaction, `SELECT COUNT(*) AS count FROM ${tableName}`, `校验${label}`);
    if (actual !== expectedCount) {
      throw new DatabaseV2MigrationError(`${label}迁移数量不符：预期 ${expectedCount}，实际 ${actual}`);
    }
  }

  const violations = transaction.query("PRAGMA foreign_key_check", undefined, "检查 DB v2 外键");
  if (violations.length !== 0) {
    throw new DatabaseV2MigrationError(`DB v2 外键检查失败：发现 ${violations.length} 条异常`);
  }
}

/**
 * 只执行 v1 → v2 的同步迁移步骤；调用方必须把它包在 withSqliteTransaction 中。
 * 当前仅供 fixture 使用，尚未接入 initializeDatabase。
 */
export function migrateVersion1ToVersion2Draft(
  transaction: SqliteTransactionContext,
  dependencies: DatabaseV2MigrationDependencies,
): DatabaseV2MigrationResult {
  requireVersion1(transaction);
  requireV1Tables(transaction);
  validateArchiveRows(transaction);

  const migrationTime = dependencies.nowIso();
  if (Number.isNaN(Date.parse(migrationTime))) {
    throw new DatabaseV2MigrationError("迁移依赖没有返回有效 ISO 时间");
  }

  const archiveCount = count(transaction, "SELECT COUNT(*) AS count FROM archives", "统计旧图库记录");
  const sourceArchiveTagCount = count(
    transaction,
    "SELECT COUNT(*) AS count FROM archive_taglist",
    "统计旧图库标签索引",
  );
  const archiveTagCount = count(
    transaction,
    `SELECT COUNT(*) AS count
     FROM archive_taglist AS source
     INNER JOIN archives AS parent ON parent.gid = source.gid`,
    "统计有效图库标签索引",
  );
  const sourceHistoryTermCount = count(
    transaction,
    "SELECT COUNT(*) AS count FROM search_history_search_terms",
    "统计旧搜索历史 terms",
  );
  const sourceBookmarkTermCount = count(
    transaction,
    "SELECT COUNT(*) AS count FROM search_bookmarks_search_terms",
    "统计旧搜索书签 terms",
  );
  const sourceMarkedUploaderCount = count(
    transaction,
    "SELECT COUNT(*) AS count FROM marked_uploaders",
    "统计旧标记上传者",
  );
  const sourceBannedUploaderCount = count(
    transaction,
    "SELECT COUNT(*) AS count FROM banned_uploaders",
    "统计旧屏蔽上传者",
  );

  createMigrationTables(transaction);
  copyArchives(transaction, migrationTime);
  const history = copySearchHistory(transaction, migrationTime, dependencies.sha256Hex);
  const bookmarks = copySearchBookmarks(transaction, dependencies.sha256Hex);
  const markedUploaderCount = copyUploaders(transaction, "marked_uploaders");
  const bannedUploaderCount = copyUploaders(transaction, "banned_uploaders");
  replaceLegacyTables(transaction);
  applyV2Schema(transaction);

  const migrationCounts = {
    archiveCount,
    archiveTagCount,
    historyCount: history.parentCount,
    historyTermCount: history.termCount,
    bookmarkCount: bookmarks.parentCount,
    bookmarkTermCount: bookmarks.termCount,
    markedUploaderCount,
    bannedUploaderCount,
    droppedArchiveTagOrphans: sourceArchiveTagCount - archiveTagCount,
    droppedHistoryTermOrphans: sourceHistoryTermCount - history.termCount,
    droppedBookmarkTermOrphans: sourceBookmarkTermCount - bookmarks.termCount,
    droppedInvalidMarkedUploaders: sourceMarkedUploaderCount - markedUploaderCount,
    droppedInvalidBannedUploaders: sourceBannedUploaderCount - bannedUploaderCount,
  };
  verifyMigration(transaction, migrationCounts);
  transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置 DB v2 版本");

  return {
    previousVersion: 1,
    currentVersion: DATABASE_V2_DRAFT_USER_VERSION,
    ...migrationCounts,
  } as DatabaseV2MigrationResult;
}
