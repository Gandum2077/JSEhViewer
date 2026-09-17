import { databasePath } from "./glv";
import { initializeDatabase } from "./database-migration";
import { query, update } from "./sqlite";
import { readDeviceId } from "./device-identity";
import { initializeSyncSchema } from "../sync/schema";

export function createDB() {
  initializeDatabase(databasePath);
}

export type DatabaseStatement = { sql: string; args?: any[] };

export class DBManager {
  private _db: SqliteTypes.SqliteInstance;
  readonly deviceId: string;

  constructor(path = databasePath) {
    initializeDatabase(path);
    this._db = $sqlite.open(path);
    try {
      update(this._db, "PRAGMA foreign_keys = ON");
      if (query(this._db, "PRAGMA foreign_keys")[0]?.foreign_keys !== 1) {
        throw new Error("当前 SQLite 连接无法启用外键");
      }
      const deviceId = readDeviceId(this._db);
      if (!deviceId) throw new Error("数据库缺少本机设备标识");
      this.deviceId = deviceId;
      initializeSyncSchema(this._db);
    } catch (error) {
      $sqlite.close(this._db);
      throw error;
    }
  }

  close() {
    $sqlite.close(this._db);
  }

  query(sql: string, args?: any[]) {
    return query(
      this._db,
      sql,
      args?.map((value) => value ?? null),
    );
  }

  update(sql: string, args?: any[]) {
    return this.transactionUpdate([{ sql, args }]);
  }

  transactionUpdate(statements: DatabaseStatement[]) {
    if (statements.length === 0) return;
    return this.atomic((tx) => {
      for (const statement of statements) tx.execute(statement.sql, statement.args);
    });
  }

  /** Synchronous callback only: never hold a SQLite transaction over network I/O. */
  atomic<T>(work: (tx: DatabaseTransaction) => T, applyingRemote = false): T {
    update(this._db, "BEGIN IMMEDIATE");
    try {
      if (applyingRemote) update(this._db, "UPDATE sync_control SET applying=1 WHERE id=1");
      const result = work({
        query: (sql, args) => this.query(sql, args),
        execute: (sql, args) =>
          update(
            this._db,
            sql,
            args?.map((value) => value ?? null),
          ),
      });
      if (applyingRemote) update(this._db, "UPDATE sync_control SET applying=0 WHERE id=1");
      update(this._db, "COMMIT");
      return result;
    } catch (error) {
      update(this._db, "ROLLBACK");
      throw error;
    }
  }

  batchUpdate(sql: string, manyArgs: any[][]) {
    return this.transactionUpdate(manyArgs.map((args) => ({ sql, args })));
  }

  batchInsert(tableName: string, columns: string[], manyArgs: any[][]) {
    // Bind one row at a time within one transaction, respecting iOS variable limits.
    return this.batchUpdate(
      `INSERT INTO ${tableName} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
      manyArgs,
    );
  }
}

export interface DatabaseTransaction {
  query(sql: string, args?: any[]): Record<string, any>[];
  execute(sql: string, args?: any[]): void;
}

export const dbManager = new DBManager();
