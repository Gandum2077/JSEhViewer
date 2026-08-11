import {
  DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT,
  MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG,
  MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG_FORM,
  MANGA_IMAGE_TRANSLATOR_PRESET_SCRIPT,
  OLD_CUSTOM_AI_TRANSLATION_SCRIPT,
} from "../ai-translations/preset";
import { validateUserCustomScriptText } from "../ai-translations/user-custom-validation";
import { databasePath } from "./glv";
import {
  querySqliteRows,
  SqliteStatement,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

// 当前数据库版本，写在数据库文件中
// 当出现不兼容更新时，更新数据库版本，并且提供对应的升级方案
// 如果是兼容更新，不升级数据库版本
const CURRENT_USER_VERSION = 1;

// 创建数据库
export function createDB() {
  const db = $sqlite.open(databasePath);
  // 存档表，用于存储图库信息
  db.update(`CREATE TABLE IF NOT EXISTS archives (
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
            )`);
  // 标签表，用于搜索
  db.update(`CREATE TABLE IF NOT EXISTS archive_taglist (
            gid INTEGER NOT NULL,
            namespace TEXT NOT NULL,
            tag TEXT NOT NULL,
            UNIQUE(gid, namespace, tag)
            )`);
  // 设置表
  db.update(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
            )`);
  // AI翻译服务配置表
  db.update(`CREATE TABLE IF NOT EXISTS ai_translation_services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
            script_text TEXT NOT NULL,
            config_form TEXT,
            config TEXT
            )`);
  db.update(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_translation_services_single_selected
            ON ai_translation_services(selected)
            WHERE selected = 1;`);
  // webdavServices
  db.update(`CREATE TABLE IF NOT EXISTS webdav_services (
            name TEXT,
            host TEXT,
            port INTEGER,
            https INTEGER,
            path TEXT,
            username TEXT,
            password TEXT,
            enabled INTEGER
            )`);
  // 翻译表
  db.update(`CREATE TABLE IF NOT EXISTS translation_data (
            namespace TEXT NOT NULL,
            name TEXT NOT NULL,
            translation TEXT,
            intro TEXT,
            links TEXT,
            UNIQUE(namespace, name)
            )`);
  // 标记的标签
  db.update(`CREATE TABLE IF NOT EXISTS marked_tags (
            tagid INTEGER,
            namespace TEXT NOT NULL,
            name TEXT NOT NULL,
            watched INTEGER,
            hidden INTEGER,
            color TEXT,
            weight INTEGER,
            UNIQUE(namespace, name)
            )`);
  // 标记的上传者 只保存于本地
  db.update(`CREATE TABLE IF NOT EXISTS marked_uploaders (
            uploader TEXT,
            UNIQUE(uploader)
            )`);
  // 被禁止的上传者 和ehentai同步
  db.update(`CREATE TABLE IF NOT EXISTS banned_uploaders (
            uploader TEXT,
            UNIQUE(uploader)
            )`);
  // favcat_titles 和ehentai同步
  db.update(`CREATE TABLE IF NOT EXISTS favcat_titles (
              favcat INTEGER PRIMARY KEY CHECK (favcat >=0 AND favcat <= 9),
              title TEXT
            );`);
  // 搜索页历史记录
  // last_access_time 是最后一次访问的时间
  // sorted_fsearch 是searchTerms的排序后组装的字符串，具有唯一性
  db.update(`CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER,
            last_access_time TEXT,
            sorted_fsearch TEXT UNIQUE,
            PRIMARY KEY(id AUTOINCREMENT)
            )`);
  // 搜索页历史记录中的searchTerms
  db.update(`CREATE TABLE IF NOT EXISTS search_history_search_terms (
            search_history_id INTEGER,
            namespace TEXT,
            qualifier TEXT,
            term TEXT NOT NULL,
            dollar INTEGER,
            subtract INTEGER,
            tilde INTEGER
            )`);
  // 搜索页书签
  db.update(`CREATE TABLE IF NOT EXISTS search_bookmarks (
            id INTEGER,
            sort_order INTEGER,
            sorted_fsearch TEXT UNIQUE,
            PRIMARY KEY(id AUTOINCREMENT)
            )`);
  // 搜索页书签中的searchTerms
  db.update(`CREATE TABLE IF NOT EXISTS search_bookmarks_search_terms (
            search_bookmarks_id INTEGER,
            namespace TEXT,
            qualifier TEXT,
            term TEXT NOT NULL,
            dollar INTEGER,
            subtract INTEGER,
            tilde INTEGER
            )`);
  // 标签访问次数统计
  // 此表要求namespace, qualifier, term不能为null，且组合是唯一的
  db.update(`CREATE TABLE IF NOT EXISTS tag_access_count (
            namespace TEXT NOT NULL default '',
            qualifier TEXT NOT NULL default '',
            term TEXT NOT NULL default '',
            count INTEGER,
            UNIQUE(namespace, qualifier, term)
            )`);
  // 下载记录表
  // 只记录gid和finished，供下次启动时恢复下载使用
  db.update(`CREATE TABLE IF NOT EXISTS download_records (
            gid INTEGER PRIMARY KEY,
            length INTEGER NOT NULL,
            finished INTEGER
            )`);
  // 对特定图库生效的阅读配置表
  // pageDirection: "left_to_right" | "right_to_left" | "vertical"; // 翻页方向
  // spreadModeEnabled: boolean; // 双页模式
  // skipFirstPageInSpread: boolean; // 双页模式中跳过首页
  // skipLandscapePagesInSpread: boolean; // 双页模式中跳过横图
  // pagingGesture: "tap_and_swipe" | "swipe" | "tap"; // 翻页手势
  db.update(`CREATE TABLE IF NOT EXISTS gallery_reader_config (
            gid INTEGER PRIMARY KEY,
            pageDirection TEXT CHECK (pageDirection IN ('left_to_right', 'right_to_left', 'vertical')),
            spreadModeEnabled INTEGER CHECK (spreadModeEnabled IN (0, 1)),
            skipFirstPageInSpread INTEGER CHECK (skipFirstPageInSpread IN (0, 1)),
            skipLandscapePagesInSpread INTEGER CHECK (skipLandscapePagesInSpread IN (0, 1)),
            pagingGesture TEXT CHECK (pagingGesture IN ('tap_and_swipe', 'swipe', 'tap'))
            )`);
  // 图片收藏表
  db.update(`CREATE TABLE IF NOT EXISTS favorite_images (
            gid INTEGER NOT NULL,
            page_index INTEGER NOT NULL,
            favorited_at TEXT NOT NULL,
            PRIMARY KEY (gid, page_index)
            );`);

  // 创建 trigger，限制 webdav_services 表的 enabled 最多只能有一行。
  // SQLite 一个 trigger 只能对应 INSERT 或 UPDATE，不能写成 "INSERT OR UPDATE"。
  db.update(`CREATE TRIGGER IF NOT EXISTS enforce_webdav_services_single_enabled_insert
            BEFORE INSERT ON webdav_services
            FOR EACH ROW
            WHEN NEW.enabled = 1
            BEGIN
                SELECT RAISE(ABORT, 'Only one row can have enabled = 1')
                WHERE (SELECT COUNT(*) FROM webdav_services WHERE enabled = 1) >= 1;
            END;`);
  db.update(`CREATE TRIGGER IF NOT EXISTS enforce_webdav_services_single_enabled_update
            BEFORE UPDATE OF enabled ON webdav_services
            FOR EACH ROW
            WHEN NEW.enabled = 1
            BEGIN
                SELECT RAISE(ABORT, 'Only one row can have enabled = 1')
                WHERE EXISTS (
                  SELECT 1 FROM webdav_services
                  WHERE enabled = 1 AND rowid <> OLD.rowid
                );
            END;`);
  // 写入favcat_titles的初始值
  const r = queryDB(db, "SELECT COUNT(*) as count FROM favcat_titles") as { count: number }[];
  if (!r.at(0)?.count) {
    insertDBBatch(
      db,
      "favcat_titles",
      ["favcat", "title"],
      [...Array(10)].map((_, i) => {
        return [i, "Favorites " + i];
      }),
    );
  }

  $sqlite.close(db);
}

// 查询数据库
function queryDB(db: SqliteTypes.SqliteInstance, sql: string, args?: any[]) {
  return querySqliteRows(db, sql, args);
}

// 更新数据库
function updateDB(db: SqliteTypes.SqliteInstance, sql: string, args?: any[]) {
  return withSqliteTransaction(db, (transaction) => transaction.update(sql, args), "单条数据库更新");
}

// 批量更新数据库
function updateDBBatch(db: SqliteTypes.SqliteInstance, sql: string, manyArgs: any[][]) {
  return withSqliteTransaction(
    db,
    (transaction) => {
      for (const args of manyArgs) transaction.update(sql, args);
    },
    "批量数据库更新",
  );
}

function transactionUpdateDB(db: SqliteTypes.SqliteInstance, statements: SqliteStatement[]) {
  return withSqliteTransaction(
    db,
    (transaction) => {
      for (const statement of statements) transaction.update(statement.sql, statement.args);
    },
    "多语句数据库更新",
  );
}

/**
 * 大规模插入数据(只能执行基本的插入操作)
 * @param db 数据库实例
 * @param tableName 表名
 * @param columns 列名, 需要按照正确的顺序来排列
 * @param manyArgs 数据, 和列名对应
 */
function insertDBBatch(db: SqliteTypes.SqliteInstance, tableName: string, columns: string[], manyArgs: any[][]) {
  const batchSize = 10000;
  const sql0 = `INSERT INTO ${tableName} (${columns.join(",")}) VALUES `;
  const columnQuotes = "(" + columns.map(() => "?").join(",") + ")";
  return withSqliteTransaction(
    db,
    (transaction) => {
      // 分批插入
      for (let i = 0; i < manyArgs.length; i += batchSize) {
        const batchArgs = manyArgs.slice(i, i + batchSize);
        const sql = sql0 + batchArgs.map(() => columnQuotes).join(",");
        transaction.update(sql, batchArgs.flat());
      }
    },
    `批量写入 ${tableName}`,
  );
}

class DBManager {
  private _queue: SqliteTypes.SqliteQueueInstance;
  constructor() {
    createDB();
    this._queue = $sqlite.dbQueue(databasePath);
    this.checkDBUpdate();
  }

  close() {
    this._queue.close();
  }

  checkDBUpdate() {
    let user_version = (this.query("PRAGMA user_version;") as [{ user_version: number }])[0].user_version;
    if (user_version === CURRENT_USER_VERSION) return;
    // 按照顺序依次提升版本
    if (user_version === 0) {
      this.upgradeUserVersionFrom0To1();
      user_version = 1;
    }
    if (user_version !== CURRENT_USER_VERSION) {
      throw new Error(`未找到从数据库版本 ${user_version} 到 ${CURRENT_USER_VERSION} 的升级方案`);
    }
  }

  private upgradeUserVersionFrom0To1() {
    const r0 = this.query("SELECT value FROM config WHERE key = ?", ["selectedAiTranslationService"]) as {
      value: string;
    }[];
    const r1 = this.query("SELECT value FROM config WHERE key = ?", ["aiTranslationSavedConfigText"]) as {
      value: string;
    }[];
    const selectedService = r0[0]?.value || "";
    const savedConfigText = r1[0]?.value || "{}";

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

    this.transaction((transaction) => {
      const services = [
        {
          name: "manga-image-translator",
          selected: Number(selectedService === "manga-image-translator"),
          script_text: MANGA_IMAGE_TRANSLATOR_PRESET_SCRIPT,
          config_form: MANGA_IMAGE_TRANSLATOR_PRESET_CONFIG_FORM,
          config: JSON.stringify(mangaImageTranslatorConfig),
        },
        {
          name: "自定义脚本",
          selected: Number(selectedService === "user-custom" && isScriptTextValid),
          script_text: userCustomScriptText,
          config_form: null,
          config: null,
        },
      ];

      for (const service of services) {
        transaction.update(
          `INSERT INTO ai_translation_services (name, selected, script_text, config_form, config)
           VALUES (?, ?, ?, ?, ?)`,
          [service.name, service.selected, service.script_text, service.config_form, service.config],
          "迁移 AI 翻译服务",
        );
      }

      transaction.update("PRAGMA user_version = 1;", undefined, "更新数据库版本");
    }, "数据库 v0 到 v1 迁移");
  }

  query(sql: string, args?: any[]) {
    return withSqliteQueueOperation(this._queue, (db) => queryDB(db, sql, args), "数据库查询队列");
  }

  update(sql: string, args?: SqliteValue[]) {
    return withSqliteQueueOperation(this._queue, (db) => updateDB(db, sql, args), "数据库更新队列");
  }

  batchUpdate(sql: string, manyArgs: SqliteValue[][]) {
    return withSqliteQueueOperation(this._queue, (db) => updateDBBatch(db, sql, manyArgs), "批量数据库更新队列");
  }

  transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation = "业务数据库事务") {
    return withSqliteQueueOperation(
      this._queue,
      (db) => withSqliteTransaction(db, callback, operation),
      `${operation}队列`,
    );
  }

  transactionUpdate(statements: SqliteStatement[]) {
    return withSqliteQueueOperation(this._queue, (db) => transactionUpdateDB(db, statements), "多语句数据库更新队列");
  }

  batchInsert(tableName: string, columns: string[], manyArgs: SqliteValue[][]) {
    return withSqliteQueueOperation(
      this._queue,
      (db) => insertDBBatch(db, tableName, columns, manyArgs),
      `批量写入 ${tableName} 队列`,
    );
  }
}

export const dbManager = new DBManager();
