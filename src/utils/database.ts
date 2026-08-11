import { ensurePreSyncDatabaseBackup } from "./database-backup";
import { initializeDatabase } from "./database-initialization";
import { databasePath } from "./glv";
import {
  querySqliteRows,
  SqliteStatement,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

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
    ensurePreSyncDatabaseBackup($file, databasePath);
    this._queue = $sqlite.dbQueue(databasePath);
    try {
      initializeDatabase(this._queue);
    } catch (error) {
      this._queue.close();
      throw error;
    }
  }

  close() {
    this._queue.close();
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
