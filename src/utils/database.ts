import { databasePath } from "./glv";

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
            last_read_page INTEGER
            )`);
  // 标签表，用于搜索
  db.update(`CREATE TABLE IF NOT EXISTS archive_taglist (
            gid INTEGER NOT NULL,
            namespace TEXT,
            tag TEXT,
            UNIQUE(gid, namespace, tag)
            )`);
  // 设置表
  db.update(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
            )`);
  // webdavServices
  db.update(`CREATE TABLE IF NOT EXISTS webdav_services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            url TEXT,
            username TEXT,
            password TEXT
            )`);
  // 翻译表
  db.update(`CREATE TABLE IF NOT EXISTS translation_data (
            namespace TEXT,
            name TEXT,
            translation TEXT,
            intro TEXT,
            links TEXT,
            UNIQUE(namespace, name)
            )`);
  // 标记的标签
  db.update(`CREATE TABLE IF NOT EXISTS marked_tags (
            tagid INTEGER,
            namespace TEXT,
            name TEXT,
            watched INTEGER,
            hidden INTEGER,
            color TEXT,
            weight INTEGER,
            UNIQUE(namespace, name)
            )`);
  // 额外保存的标签
  // 用户主动保存的标签（保存前要查重），对于不出现在翻译表中标签进行标记时，也要先保存到这里
  db.update(`CREATE TABLE IF NOT EXISTS extra_saved_tags (
            namespace TEXT,
            name TEXT,
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
  db.update(`CREATE TABLE favcat_titles (
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
            term TEXT,
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
            term TEXT,
            dollar INTEGER,
            subtract INTEGER,
            tilde INTEGER
            )`);
  // 标签访问次数统计
  db.update(`CREATE TABLE IF NOT EXISTS tag_access_count (
            namespace TEXT,
            qualifier TEXT,
            term TEXT,
            count INTEGER,
            UNIQUE(namespace, qualifier, term)
            )`);
  $sqlite.close(db);
}

// 打开数据库
function openDB() {
  return $sqlite.open(databasePath);
}

// 关闭数据库
function closeDB(db: SqliteTypes.SqliteInstance) {
  $sqlite.close(db);
}

// 查询数据库
function queryDB(db: SqliteTypes.SqliteInstance, sql: string, args?: any[]) {
  const result: Record<string, any>[] = [];
  const options = args ? { sql, args } : sql;
  db.query(options, (rs, err) => {
    if(rs === null) {
      console.log(options)
    }
    while (rs.next()) {
      const values = rs.values;
      result.push(values);
    }
    rs.close();
  }
  );
  return result;
}

// 更新数据库
function updateDB(db: SqliteTypes.SqliteInstance, sql: string, args?: any[]) {
  const options = args ? { sql, args } : sql;
  db.beginTransaction();
  db.update(options);
  db.commit();
}

// 批量更新数据库
function updateDBBatch(db: SqliteTypes.SqliteInstance, sql: string, manyArgs: any[][]) {
  db.beginTransaction();
  for (const args of manyArgs) {
    db.update({ sql, args });
  }
  db.commit();
}


class DBManager {
  private __db: SqliteTypes.SqliteInstance;
  constructor() {
    createDB();
    this.__db = openDB();
  }

  close() {
    closeDB(this.__db);
  }

  query(sql: string, args?: any[]) {
    return queryDB(this.__db, sql, args);
  }

  update(sql: string, args?: (string | number | boolean | null | undefined)[]) {
    return updateDB(this.__db, sql, args);
  }

  batchUpdate(sql: string, manyArgs: (string | number | boolean | null | undefined)[][]) {
    return updateDBBatch(this.__db, sql, manyArgs);
  }
}

export const dbManager = new DBManager();