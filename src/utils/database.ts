import { databasePath } from "./glv";
import { initializeDatabase } from "./database-migration";
import { query, update } from "./sqlite";
import { readDeviceId } from "./device-identity";

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
    update(this._db, "BEGIN IMMEDIATE");
    try {
      for (const statement of statements) {
        update(
          this._db,
          statement.sql,
          statement.args?.map((value) => value ?? null),
        );
      }
      update(this._db, "COMMIT");
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

export const dbManager = new DBManager();
