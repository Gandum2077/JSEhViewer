import { SqliteTransactionContext, SqliteValue } from "../utils/sqlite-safe";

export interface RepositoryDatabase {
  query(sql: string, args?: SqliteValue[]): Record<string, any>[];
  transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T;
}
