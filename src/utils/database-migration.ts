import {
  DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT,
  MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG,
  MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG_FORM,
  MANGA_IMAGE_TRANSLATOR_PRESET_SCRIPT,
  OLD_CUSTOM_AI_TRANSLATION_SCRIPT,
} from "../ai-translations/preset";
import { validateUserCustomScriptText } from "../ai-translations/user-custom-validation";
import {
  executeScript,
  query,
  update,
  scalarNumber,
  splitSqlScript,
  readMigrationAsset,
  stripLeadingSqlComments,
  SqlRow,
  SqlValue,
} from "./sqlite";

export const CURRENT_USER_VERSION = 2;

interface LegacyAiService extends SqlRow {
  id: number;
  name: string;
  selected: number | null;
  script_text: string;
  config_form: string | null;
  config: string | null;
}

interface LegacyWebdavService extends SqlRow {
  legacy_rowid: number;
  name: string | null;
  host: string | null;
  port: number | null;
  https: number | null;
  path: string | null;
  username: string | null;
  password: string | null;
  enabled: number | null;
}

interface LegacyBookmark extends SqlRow {
  legacy_id: number;
  sort_order: number | null;
  sorted_fsearch: string;
}

function assertSourceCanBeRepresented(db: SqliteTypes.SqliteInstance): void {
  const checks: Array<[string, string]> = [
    ["search_history.sorted_fsearch 为空", "SELECT COUNT(*) FROM search_history WHERE sorted_fsearch IS NULL"],
    ["search_bookmarks.sorted_fsearch 为空", "SELECT COUNT(*) FROM search_bookmarks WHERE sorted_fsearch IS NULL"],
    [
      "本地标签的新 ID 存在冲突",
      `SELECT COUNT(*) FROM (
      SELECT namespace || ':' || name FROM marked_tags WHERE tagid IS NULL OR tagid = 0
      GROUP BY namespace || ':' || name HAVING COUNT(*) > 1)`,
    ],
    [
      "标签访问次数的新 ID 存在冲突",
      `SELECT COUNT(*) FROM (
      SELECT qualifier || ':' || namespace || ':' || term FROM tag_access_count
      GROUP BY qualifier || ':' || namespace || ':' || term HAVING COUNT(*) > 1)`,
    ],
    [
      "存在孤立的搜索历史词",
      `SELECT COUNT(*)
       FROM search_history_search_terms AS term
       LEFT JOIN search_history AS history ON history.id = term.search_history_id
       WHERE history.id IS NULL`,
    ],
    [
      "存在孤立的搜索书签词",
      `SELECT COUNT(*)
       FROM search_bookmarks_search_terms AS term
       LEFT JOIN search_bookmarks AS bookmark ON bookmark.id = term.search_bookmarks_id
       WHERE bookmark.id IS NULL`,
    ],
  ];

  for (const [message, sql] of checks) {
    const count = scalarNumber(db, sql);
    if (count !== 0) throw new Error(`${message}，共 ${count} 条；迁移已取消以避免数据丢失`);
  }
}

function canonicalJson(values: unknown[]): string {
  // Arrays preserve field order; null preserves the difference from empty text.
  return JSON.stringify(values);
}

// Frozen v1 defaults: do not import config.ts, which opens the application DB.
const GLOBAL_READER_CONFIG_FIELDS: Array<[string, string | boolean, Array<string | boolean>]> = [
  ["pageDirection", "left_to_right", ["left_to_right", "right_to_left", "vertical"]],
  ["spreadModeEnabled", false, [false, true]],
  ["skipFirstPageInSpread", true, [false, true]],
  ["skipLandscapePagesInSpread", true, [false, true]],
  ["pagingGesture", "tap_and_swipe", ["tap_and_swipe", "swipe", "tap"]],
];

function readLegacyGlobalReaderConfig(db: SqliteTypes.SqliteInstance): SqlValue[] {
  return GLOBAL_READER_CONFIG_FIELDS.map(([key, defaultValue, allowedValues]) => {
    const rows = query(db, "SELECT value FROM config WHERE key = ?", [key]);
    let value: unknown = defaultValue;
    if (rows.length !== 0) {
      try {
        value = JSON.parse(rows[0].value);
      } catch {
        throw new Error(`全局阅读设置 ${key} 不是有效 JSON，迁移已取消`);
      }
    }
    if (!allowedValues.some((allowed) => allowed === value)) {
      throw new Error(`全局阅读设置 ${key} 的值无效，迁移已取消`);
    }
    return typeof value === "boolean" ? Number(value) : (value as string);
  });
}

function migrateGlobalReaderConfig(db: SqliteTypes.SqliteInstance): void {
  const columns = GLOBAL_READER_CONFIG_FIELDS.map(([key]) => key).join(", ");
  update(
    db,
    `INSERT INTO global_reader_config_v2 (id, sync_version, deleted, ${columns})
     VALUES ('1', 0, 0, ?, ?, ?, ?, ?)`,
    readLegacyGlobalReaderConfig(db),
  );
}

function allocateContentId(canonicalContent: string, usedIds: Set<string>): string {
  let id = $text.SHA256(canonicalContent).toLowerCase();
  while (usedIds.has(id)) id = $text.uuid.toLowerCase();
  usedIds.add(id);
  return id;
}

function migrateAiServices(db: SqliteTypes.SqliteInstance): void {
  const services = query(
    db,
    `SELECT id, name, selected, script_text, config_form, config
     FROM ai_translation_services
     ORDER BY id`,
  ) as LegacyAiService[];
  const usedIds = new Set<string>();

  for (const service of services) {
    const id = allocateContentId(
      canonicalJson([
        "ai_translation_service_v2",
        service.name,
        service.script_text,
        service.config_form,
        service.config,
      ]),
      usedIds,
    );
    update(
      db,
      `INSERT INTO ai_translation_services_v2
         (id, sync_version, deleted, name, selected, script_text, config_form, config)
       VALUES (?, 0, 0, ?, ?, ?, ?, ?)`,
      [id, service.name, service.selected === 1 ? 1 : 0, service.script_text, service.config_form, service.config],
    );
  }
}

function migrateWebdavServices(db: SqliteTypes.SqliteInstance): void {
  const services = query(
    db,
    `SELECT rowid AS legacy_rowid, name, host, port, https, path, username, password, enabled
     FROM webdav_services
     ORDER BY rowid`,
  ) as LegacyWebdavService[];
  const usedIds = new Set<string>();
  let enabledAlreadyMigrated = false;

  for (const service of services) {
    const id = allocateContentId(
      canonicalJson([
        "webdav_service_v2",
        service.name,
        service.host,
        service.port,
        service.https,
        service.path,
        service.username,
        service.password,
      ]),
      usedIds,
    );
    const enabled = service.enabled === 1 && !enabledAlreadyMigrated ? 1 : 0;
    if (enabled === 1) enabledAlreadyMigrated = true;
    update(
      db,
      `INSERT INTO webdav_services_v2
         (id, sync_version, deleted, name, host, port, https, path, username, password, enabled)
       VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        service.name,
        service.host,
        service.port,
        service.https === 1 ? 1 : 0,
        service.path,
        service.username,
        service.password,
        enabled,
      ],
    );
  }
}

function positionKeyForIndex(index: number): string {
  // Fixed-width base-36 keys preserve v1 order under ordinary TEXT sorting.
  // The prefix reserves a namespace for this legacy migration key format.
  return `v1:${index.toString(36).padStart(12, "0")}`;
}

function migrateSearchBookmarks(db: SqliteTypes.SqliteInstance): void {
  const bookmarks = query(
    db,
    `SELECT id AS legacy_id, sort_order, sorted_fsearch
     FROM search_bookmarks
     ORDER BY COALESCE(sort_order, 2147483647), id`,
  ) as LegacyBookmark[];

  for (let index = 0; index < bookmarks.length; index += 1) {
    const bookmark = bookmarks[index];
    update(
      db,
      `INSERT INTO search_bookmarks_v2
         (id, sync_version, deleted, position_key)
       VALUES (?, 0, 0, ?)`,
      [bookmark.sorted_fsearch, positionKeyForIndex(index)],
    );

    const terms = query(
      db,
      `SELECT namespace, qualifier, term, dollar, subtract, tilde
       FROM search_bookmarks_search_terms
       WHERE search_bookmarks_id = ?
       ORDER BY rowid`,
      [bookmark.legacy_id],
    );
    for (let termIndex = 0; termIndex < terms.length; termIndex += 1) {
      const term = terms[termIndex];
      update(
        db,
        `INSERT INTO search_bookmarks_search_terms_v2
           (bookmark_id, term_index, namespace, qualifier, term, dollar, subtract, tilde)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bookmark.sorted_fsearch,
          termIndex,
          term.namespace ?? null,
          term.qualifier ?? null,
          term.term,
          term.dollar === 1 ? 1 : 0,
          term.subtract === 1 ? 1 : 0,
          term.tilde === 1 ? 1 : 0,
        ],
      );
    }
  }
}

function validateMigration(db: SqliteTypes.SqliteInstance, progress: (phase: string) => void): void {
  const statements = splitSqlScript(readMigrationAsset("validate-v1-to-v2.sql"));
  for (const [index, statement] of statements.entries()) {
    const name = statement.match(/AS\s+(\w+)\s*$/i)?.[1] ?? stripLeadingSqlComments(statement).split("\n")[0];
    progress(`校验数据 ${index + 1}/${statements.length}: ${name}`);
    const rows = query(db, statement);
    const normalized = stripLeadingSqlComments(statement).toUpperCase();

    if (normalized.startsWith("PRAGMA FOREIGN_KEY_CHECK")) {
      if (rows.length !== 0) throw new Error(`外键检查失败，共 ${rows.length} 条`);
      continue;
    }
    if (normalized.startsWith("PRAGMA INTEGRITY_CHECK")) {
      const result = rows[0] && String(Object.values(rows[0])[0]).toLowerCase();
      if (result !== "ok") throw new Error(`数据库完整性检查失败: ${result ?? "无结果"}`);
      continue;
    }

    for (const row of rows) {
      for (const [name, rawValue] of Object.entries(row)) {
        if (Number(rawValue) !== 0) throw new Error(`迁移验证失败: ${name} = ${String(rawValue)}`);
      }
    }
  }

  const expected = readLegacyGlobalReaderConfig(db);
  const [actual] = query(db, "SELECT * FROM global_reader_config_v2 WHERE id = '1'");
  for (let index = 0; index < GLOBAL_READER_CONFIG_FIELDS.length; index += 1) {
    const [key] = GLOBAL_READER_CONFIG_FIELDS[index];
    if (!actual || actual[key] !== expected[index]) {
      throw new Error(`迁移验证失败: 全局阅读设置 ${key} 与 v1 不一致`);
    }
  }
}

function seedLegacyAiServices(db: SqliteTypes.SqliteInstance): void {
  if (scalarNumber(db, "SELECT COUNT(*) FROM ai_translation_services") !== 0) return;
  let selected = query(db, "SELECT value FROM config WHERE key = 'selectedAiTranslationService'")[0]?.value ?? "";
  const saved = query(db, "SELECT value FROM config WHERE key = 'aiTranslationSavedConfigText'")[0]?.value ?? "{}";
  let config: Record<string, any> = {};
  try {
    selected = JSON.parse(selected);
  } catch {
    /* Earlier v0 builds stored raw text. */
  }
  try {
    const decoded = JSON.parse(saved);
    config = (typeof decoded === "string" ? JSON.parse(decoded) : decoded) ?? {};
  } catch {
    /* v0 tolerated malformed saved config */
  }
  const custom = config["user-custom"] ?? {};
  const validScript =
    typeof custom.scriptText === "string" &&
    custom.scriptText.trim() &&
    custom.scriptText.trim() !== OLD_CUSTOM_AI_TRANSLATION_SCRIPT &&
    validateUserCustomScriptText(custom.scriptText.trim()).ok;
  const services: SqlValue[][] = [
    [
      "manga-image-translator",
      Number(selected === "manga-image-translator"),
      MANGA_IMAGE_TRANSLATOR_PRESET_SCRIPT,
      MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG_FORM,
      JSON.stringify(config["manga-image-translator"] ?? MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG),
    ],
    [
      "自定义脚本",
      Number(selected === "user-custom" && Boolean(validScript)),
      validScript ? custom.scriptText : DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT,
      null,
      null,
    ],
  ];
  for (const args of services)
    update(
      db,
      "INSERT INTO ai_translation_services (name, selected, script_text, config_form, config) VALUES (?, ?, ?, ?, ?)",
      args,
    );
}

function readDatabaseState(db: SqliteTypes.SqliteInstance) {
  const version = scalarNumber(db, "PRAGMA user_version");
  const hasLegacyTables =
    scalarNumber(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'archives'") !== 0;
  const hasViews =
    scalarNumber(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'view' AND name = 'archive_records_v2'") !== 0;
  return { version, ready: version === CURRENT_USER_VERSION && !hasLegacyTables && hasViews };
}

/** Run on the startup worker: opening may also recover an interrupted transaction. */
export function isDatabaseReady(databasePath: string): boolean {
  const db = $sqlite.open(databasePath);
  try {
    return readDatabaseState(db).ready;
  } finally {
    $sqlite.close(db);
  }
}

/** Initialize a new database or atomically upgrade an existing v0/v1 database. */
export function initializeDatabase(databasePath: string, progress: (phase: string) => void = () => {}): void {
  progress("打开数据库，恢复未完成的事务");
  const db = $sqlite.open(databasePath);
  let transactionStarted = false;
  const script = (fileName: string, phase: string) =>
    executeScript(db, fileName, (index, total, sql) => progress(`${phase} ${index}/${total}: ${sql.split("\n")[0]}`));
  try {
    progress("检查数据库版本");
    update(db, "PRAGMA foreign_keys = ON");
    if (scalarNumber(db, "PRAGMA foreign_keys") !== 1) throw new Error("当前 SQLite 连接无法启用外键");
    const { version, ready } = readDatabaseState(db);
    if (![0, 1, CURRENT_USER_VERSION].includes(version)) {
      throw new Error(`未找到从数据库版本 ${version} 到 ${CURRENT_USER_VERSION} 的升级方案`);
    }
    if (ready) return;

    // VACUUM INTO includes committed WAL contents; a plain file copy would not.
    const hasUserTables =
      scalarNumber(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'") !== 0;
    if (hasUserTables) {
      const backupPath = `${databasePath}.before-v2-${$text.uuid}.db`;
      progress("创建迁移前备份");
      update(db, "VACUUM INTO ?", [$file.absolutePath(backupPath)]);
    }
    progress("开始迁移事务");
    update(db, "BEGIN IMMEDIATE");
    transactionStarted = true;
    script("db-v2.sql", "创建 v2 表和视图");
    if (version < CURRENT_USER_VERSION) {
      // v1 received additive tables without version bumps; create any missing ones.
      script("db-v1.sql", "补齐旧版表结构");
      progress("检查旧版数据");
      if (version === 0) seedLegacyAiServices(db);
      assertSourceCanBeRepresented(db);
      script("v1-to-v2.sql", "迁移数据");
      progress("迁移全局阅读设置");
      migrateGlobalReaderConfig(db);
      progress("迁移 AI 服务");
      migrateAiServices(db);
      progress("迁移 WebDAV 服务");
      migrateWebdavServices(db);
      progress("迁移搜索书签");
      migrateSearchBookmarks(db);
      validateMigration(db, progress);
    } else if (scalarNumber(db, "SELECT COUNT(*) FROM global_reader_config_v2") === 0) {
      // Complete a database produced by the earlier standalone migration entry.
      progress("补齐全局阅读设置");
      migrateGlobalReaderConfig(db);
    }
    progress("补齐收藏分类");
    for (let index = 0; index < 10; index += 1) {
      update(db, "INSERT INTO favcat_titles (favcat, title) VALUES (?, ?) ON CONFLICT(favcat) DO NOTHING", [
        index,
        `Favorites ${index}`,
      ]);
    }
    script("db-v1-delete.sql", "清理旧版表");
    progress("清理旧版设置并检查外键");
    for (const [key] of GLOBAL_READER_CONFIG_FIELDS) update(db, "DELETE FROM config WHERE key = ?", [key]);
    if (query(db, "PRAGMA foreign_key_check").length !== 0) throw new Error("迁移后的外键检查失败");
    update(db, `PRAGMA user_version = ${CURRENT_USER_VERSION}`);
    progress("提交迁移事务");
    update(db, "COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) update(db, "ROLLBACK");
    throw error;
  } finally {
    $sqlite.close(db);
  }
}
