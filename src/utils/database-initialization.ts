import {
  DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT,
  MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG,
  MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG_FORM,
  MANGA_IMAGE_TRANSLATOR_PRESET_SCRIPT,
  OLD_CUSTOM_AI_TRANSLATION_SCRIPT,
} from "../ai-translations/preset";
import { validateUserCustomScriptText } from "../ai-translations/user-custom-validation";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

export const CURRENT_USER_VERSION = 1;

export interface DatabaseSchemaStatement {
  name: string;
  type: "table" | "index" | "trigger";
  sql: string;
}

export type DatabaseInitializationKind = "fresh" | "upgraded" | "current";

export interface DatabaseInitializationResult {
  kind: DatabaseInitializationKind;
  previousVersion: number;
  currentVersion: number;
}

export class DatabaseInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseInitializationError";
  }
}

export const CURRENT_SCHEMA_STATEMENTS: DatabaseSchemaStatement[] = [
  {
    name: "archives",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS archives (
      gid INTEGER PRIMARY KEY,
      readlater INTEGER,
      downloaded INTEGER,
      first_access_time TEXT,
      last_access_time TEXT,
      token TEXT,
      title TEXT,
      english_title TEXT,
      japanese_title TEXT,
      thumbnail_url TEXT,
      category TEXT,
      posted_time TEXT,
      visible INTEGER,
      rating REAL,
      is_my_rating INTEGER,
      length INTEGER,
      torrent_available INTEGER,
      favorited INTEGER,
      favcat INTEGER,
      uploader TEXT,
      disowned INTEGER,
      taglist TEXT,
      comment TEXT,
      last_read_page INTEGER
    )`,
  },
  {
    name: "archive_taglist",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS archive_taglist (
      gid INTEGER NOT NULL,
      namespace TEXT NOT NULL,
      tag TEXT NOT NULL,
      UNIQUE(gid, namespace, tag)
    )`,
  },
  {
    name: "config",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
  },
  {
    name: "ai_translation_services",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS ai_translation_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      script_text TEXT NOT NULL,
      config_form TEXT,
      config TEXT
    )`,
  },
  {
    name: "idx_ai_translation_services_single_selected",
    type: "index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_translation_services_single_selected
      ON ai_translation_services(selected)
      WHERE selected = 1`,
  },
  {
    name: "webdav_services",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS webdav_services (
      name TEXT,
      host TEXT,
      port INTEGER,
      https INTEGER,
      path TEXT,
      username TEXT,
      password TEXT,
      enabled INTEGER
    )`,
  },
  {
    name: "translation_data",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS translation_data (
      namespace TEXT NOT NULL,
      name TEXT NOT NULL,
      translation TEXT,
      intro TEXT,
      links TEXT,
      UNIQUE(namespace, name)
    )`,
  },
  {
    name: "marked_tags",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS marked_tags (
      tagid INTEGER,
      namespace TEXT NOT NULL,
      name TEXT NOT NULL,
      watched INTEGER,
      hidden INTEGER,
      color TEXT,
      weight INTEGER,
      UNIQUE(namespace, name)
    )`,
  },
  {
    name: "marked_uploaders",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS marked_uploaders (
      uploader TEXT,
      UNIQUE(uploader)
    )`,
  },
  {
    name: "banned_uploaders",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS banned_uploaders (
      uploader TEXT,
      UNIQUE(uploader)
    )`,
  },
  {
    name: "favcat_titles",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS favcat_titles (
      favcat INTEGER PRIMARY KEY CHECK (favcat >= 0 AND favcat <= 9),
      title TEXT
    )`,
  },
  {
    name: "search_history",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER,
      last_access_time TEXT,
      sorted_fsearch TEXT UNIQUE,
      PRIMARY KEY(id AUTOINCREMENT)
    )`,
  },
  {
    name: "search_history_search_terms",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS search_history_search_terms (
      search_history_id INTEGER,
      namespace TEXT,
      qualifier TEXT,
      term TEXT NOT NULL,
      dollar INTEGER,
      subtract INTEGER,
      tilde INTEGER
    )`,
  },
  {
    name: "search_bookmarks",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS search_bookmarks (
      id INTEGER,
      sort_order INTEGER,
      sorted_fsearch TEXT UNIQUE,
      PRIMARY KEY(id AUTOINCREMENT)
    )`,
  },
  {
    name: "search_bookmarks_search_terms",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS search_bookmarks_search_terms (
      search_bookmarks_id INTEGER,
      namespace TEXT,
      qualifier TEXT,
      term TEXT NOT NULL,
      dollar INTEGER,
      subtract INTEGER,
      tilde INTEGER
    )`,
  },
  {
    name: "tag_access_count",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS tag_access_count (
      namespace TEXT NOT NULL DEFAULT '',
      qualifier TEXT NOT NULL DEFAULT '',
      term TEXT NOT NULL DEFAULT '',
      count INTEGER,
      UNIQUE(namespace, qualifier, term)
    )`,
  },
  {
    name: "download_records",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS download_records (
      gid INTEGER PRIMARY KEY,
      length INTEGER NOT NULL,
      finished INTEGER
    )`,
  },
  {
    name: "gallery_reader_config",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS gallery_reader_config (
      gid INTEGER PRIMARY KEY,
      pageDirection TEXT CHECK (pageDirection IN ('left_to_right', 'right_to_left', 'vertical')),
      spreadModeEnabled INTEGER CHECK (spreadModeEnabled IN (0, 1)),
      skipFirstPageInSpread INTEGER CHECK (skipFirstPageInSpread IN (0, 1)),
      skipLandscapePagesInSpread INTEGER CHECK (skipLandscapePagesInSpread IN (0, 1)),
      pagingGesture TEXT CHECK (pagingGesture IN ('tap_and_swipe', 'swipe', 'tap'))
    )`,
  },
  {
    name: "favorite_images",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS favorite_images (
      gid INTEGER NOT NULL,
      page_index INTEGER NOT NULL,
      favorited_at TEXT NOT NULL,
      PRIMARY KEY (gid, page_index)
    )`,
  },
  {
    name: "enforce_webdav_services_single_enabled_insert",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS enforce_webdav_services_single_enabled_insert
      BEFORE INSERT ON webdav_services
      FOR EACH ROW
      WHEN NEW.enabled = 1
      BEGIN
        SELECT RAISE(ABORT, 'Only one row can have enabled = 1')
        WHERE (SELECT COUNT(*) FROM webdav_services WHERE enabled = 1) >= 1;
      END`,
  },
  {
    name: "enforce_webdav_services_single_enabled_update",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS enforce_webdav_services_single_enabled_update
      BEFORE UPDATE OF enabled ON webdav_services
      FOR EACH ROW
      WHEN NEW.enabled = 1
      BEGIN
        SELECT RAISE(ABORT, 'Only one row can have enabled = 1')
        WHERE EXISTS (
          SELECT 1 FROM webdav_services
          WHERE enabled = 1 AND rowid <> OLD.rowid
        );
      END`,
  },
];

function readUserVersion(db: SqliteTypes.SqliteInstance): number {
  const rows = querySqliteRows<{ user_version: number }>(db, "PRAGMA user_version", undefined, "读取数据库版本");
  const version = Number(rows[0]?.user_version);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new DatabaseInitializationError("数据库 user_version 无效");
  }
  return version;
}

function requireForeignKeysEnabled(db: SqliteTypes.SqliteInstance): void {
  const rows = querySqliteRows<{ foreign_keys: number }>(
    db,
    "PRAGMA foreign_keys",
    undefined,
    "确认数据库外键状态",
  );
  if (Number(rows[0]?.foreign_keys) !== 1) {
    throw new DatabaseInitializationError("当前 SQLite 连接无法启用 foreign_keys");
  }
}

function readUserTableNames(db: SqliteTypes.SqliteInstance): string[] {
  return querySqliteRows<{ name: string }>(
    db,
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
    undefined,
    "识别数据库内容",
  ).map((row) => String(row.name));
}

function applyCurrentSchema(transaction: SqliteTransactionContext): void {
  for (const statement of CURRENT_SCHEMA_STATEMENTS) {
    transaction.update(statement.sql, undefined, `创建 ${statement.type} ${statement.name}`);
  }
}

function seedFavoriteCategories(transaction: SqliteTransactionContext): void {
  const rows = transaction.query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM favcat_titles",
    undefined,
    "检查收藏分类初始值",
  );
  if (Number(rows[0]?.count) !== 0) return;
  for (let favcat = 0; favcat < 10; favcat += 1) {
    transaction.update(
      "INSERT INTO favcat_titles (favcat, title) VALUES (?, ?)",
      [favcat, `Favorites ${favcat}`],
      "写入收藏分类初始值",
    );
  }
}

function buildAITranslationServices(selectedService: string, savedConfigText: string) {
  let savedConfig: Record<string, any> = {};
  try {
    savedConfig = JSON.parse(savedConfigText);
  } catch {
    savedConfig = {};
  }

  const mangaImageTranslatorConfig = savedConfig["manga-image-translator"] ?? MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG;
  const userCustomConfig = savedConfig["user-custom"] ?? {};
  const isScriptTextValid =
    typeof userCustomConfig.scriptText === "string" &&
    userCustomConfig.scriptText.trim() &&
    userCustomConfig.scriptText.trim() !== OLD_CUSTOM_AI_TRANSLATION_SCRIPT &&
    validateUserCustomScriptText(userCustomConfig.scriptText.trim()).ok;
  const userCustomScriptText = isScriptTextValid ? userCustomConfig.scriptText : DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT;

  return [
    {
      name: "manga-image-translator",
      selected: Number(selectedService === "manga-image-translator"),
      scriptText: MANGA_IMAGE_TRANSLATOR_PRESET_SCRIPT,
      configForm: MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG_FORM,
      config: JSON.stringify(mangaImageTranslatorConfig),
    },
    {
      name: "自定义脚本",
      selected: Number(selectedService === "user-custom" && isScriptTextValid),
      scriptText: userCustomScriptText,
      configForm: null,
      config: null,
    },
  ];
}

function seedAITranslationServices(
  transaction: SqliteTransactionContext,
  selectedService: string,
  savedConfigText: string,
): void {
  const rows = transaction.query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM ai_translation_services",
    undefined,
    "检查 AI 翻译服务迁移前提",
  );
  if (Number(rows[0]?.count) !== 0) {
    throw new DatabaseInitializationError("数据库版本为 0，但 AI 翻译服务表已经包含数据；为避免覆盖，请先导出诊断");
  }

  for (const service of buildAITranslationServices(selectedService, savedConfigText)) {
    transaction.update(
      `INSERT INTO ai_translation_services (name, selected, script_text, config_form, config)
       VALUES (?, ?, ?, ?, ?)`,
      [service.name, service.selected, service.scriptText, service.configForm, service.config],
      "迁移 AI 翻译服务",
    );
  }
}

function readLegacyConfig(transaction: SqliteTransactionContext, key: string): string {
  const rows = transaction.query<{ value: string }>(
    "SELECT value FROM config WHERE key = ?",
    [key],
    `读取旧版配置 ${key}`,
  );
  return rows[0]?.value ?? "";
}

function verifyForeignKeys(transaction: SqliteTransactionContext): void {
  const violations = transaction.query("PRAGMA foreign_key_check", undefined, "检查数据库外键");
  if (violations.length !== 0) {
    throw new DatabaseInitializationError(`数据库外键检查失败：发现 ${violations.length} 条异常`);
  }
}

function createFreshDatabase(db: SqliteTypes.SqliteInstance): void {
  withSqliteTransaction(
    db,
    (transaction) => {
      applyCurrentSchema(transaction);
      seedFavoriteCategories(transaction);
      seedAITranslationServices(transaction, "", "{}");
      transaction.update(`PRAGMA user_version = ${CURRENT_USER_VERSION}`, undefined, "设置新数据库版本");
      verifyForeignKeys(transaction);
    },
    "创建新数据库",
  );
}

function upgradeVersion0Database(db: SqliteTypes.SqliteInstance, tableNames: string[]): void {
  if (!tableNames.includes("config")) {
    throw new DatabaseInitializationError("数据库版本为 0，但缺少 config 表；为避免误判为空库，已停止迁移");
  }

  withSqliteTransaction(
    db,
    (transaction) => {
      const selectedService = readLegacyConfig(transaction, "selectedAiTranslationService");
      const savedConfigText = readLegacyConfig(transaction, "aiTranslationSavedConfigText") || "{}";
      applyCurrentSchema(transaction);
      seedFavoriteCategories(transaction);
      seedAITranslationServices(transaction, selectedService, savedConfigText);
      transaction.update("PRAGMA user_version = 1", undefined, "更新数据库版本到 1");
      verifyForeignKeys(transaction);
    },
    "数据库 v0 到 v1 迁移",
  );
}

function ensureCurrentDatabase(db: SqliteTypes.SqliteInstance): void {
  withSqliteTransaction(
    db,
    (transaction) => {
      applyCurrentSchema(transaction);
      seedFavoriteCategories(transaction);
      verifyForeignKeys(transaction);
    },
    "检查当前数据库 schema",
  );
}

export function initializeDatabase(queue: SqliteTypes.SqliteQueueInstance): DatabaseInitializationResult {
  return withSqliteQueueOperation(
    queue,
    (db) => {
      checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用数据库外键");
      requireForeignKeysEnabled(db);
      const previousVersion = readUserVersion(db);
      const tableNames = readUserTableNames(db);
      const isEmpty = tableNames.length === 0;

      if (isEmpty) {
        if (previousVersion !== 0) {
          throw new DatabaseInitializationError(`数据库没有业务表，但 user_version=${previousVersion}；已停止自动创建`);
        }
        createFreshDatabase(db);
        return { kind: "fresh", previousVersion, currentVersion: CURRENT_USER_VERSION };
      }

      if (previousVersion > CURRENT_USER_VERSION) {
        throw new DatabaseInitializationError(
          `数据库版本 ${previousVersion} 高于当前支持的 ${CURRENT_USER_VERSION}；请使用更新版本的 JSEhViewer`,
        );
      }

      if (previousVersion === 0) {
        upgradeVersion0Database(db, tableNames);
        return { kind: "upgraded", previousVersion, currentVersion: CURRENT_USER_VERSION };
      }

      if (previousVersion !== CURRENT_USER_VERSION) {
        throw new DatabaseInitializationError(
          `未找到从数据库版本 ${previousVersion} 到 ${CURRENT_USER_VERSION} 的升级方案`,
        );
      }

      ensureCurrentDatabase(db);
      return { kind: "current", previousVersion, currentVersion: CURRENT_USER_VERSION };
    },
    "初始化数据库",
  );
}
