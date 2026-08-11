export type SqliteValue = string | number | boolean | null | undefined;

export interface SqliteStatement {
  sql: string;
  args?: SqliteValue[];
}

export interface SqliteTransactionContext {
  query<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    args?: SqliteValue[],
    operation?: string,
  ): T[];
  update(sql: string, args?: SqliteValue[], operation?: string): void;
}

/**
 * 数据库错误只包含调用方提供的操作名称和 SQLite 错误，不包含 SQL 参数。
 * config、Cookie、密码等值可能位于参数中，不能进入日志或诊断摘要。
 */
export class SqliteOperationError extends Error {
  readonly operation: string;
  readonly sqliteError?: string;

  constructor(operation: string, sqliteError?: string) {
    super(`${operation}失败${sqliteError ? `：${sqliteError}` : ""}`);
    this.name = "SqliteOperationError";
    this.operation = operation;
    this.sqliteError = sqliteError;
  }
}

function toQuery(sql: string, args?: SqliteValue[]): string | SqliteTypes.Query {
  return args === undefined ? sql : { sql, args };
}

function toUpdateQuery(sql: string, args?: SqliteValue[]): string | SqliteTypes.UpdateQuery {
  return args === undefined ? sql : { sql, args };
}

function errorText(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return undefined;
}

export function checkedSqliteUpdate(
  db: SqliteTypes.SqliteInstance,
  sql: string,
  args?: SqliteValue[],
  operation = "数据库更新",
): void {
  let updateResult: SqliteTypes.UpdateResult;
  try {
    updateResult = db.update(toUpdateQuery(sql, args));
  } catch (error) {
    throw new SqliteOperationError(operation, errorText(error));
  }

  if (!updateResult || updateResult.result !== true) {
    throw new SqliteOperationError(operation, updateResult?.error || "SQLite 未返回成功结果");
  }
}

export function querySqliteRows<T extends Record<string, any> = Record<string, any>>(
  db: SqliteTypes.SqliteInstance,
  sql: string,
  args?: SqliteValue[],
  operation = "数据库查询",
): T[] {
  const rows: T[] = [];
  let callbackCompleted = false;
  let queryError: SqliteOperationError | undefined;

  try {
    db.query(toQuery(sql, args), (rs, err) => {
      callbackCompleted = true;
      if (err) {
        queryError = new SqliteOperationError(operation, err);
        if (rs) rs.close();
        return;
      }
      if (!rs) {
        queryError = new SqliteOperationError(operation, "SQLite 未返回结果集");
        return;
      }

      try {
        while (rs.next()) rows.push(rs.values as unknown as T);
      } catch (error) {
        queryError = new SqliteOperationError(operation, errorText(error));
      } finally {
        rs.close();
      }
    });
  } catch (error) {
    throw new SqliteOperationError(operation, errorText(error));
  }

  // JSBox 当前的 SQLite query callback 是同步回调，现有数据访问层依赖该行为。
  // 若未来运行时改变语义，应显式失败，不能悄悄返回空数组。
  if (!callbackCompleted) {
    throw new SqliteOperationError(operation, "SQLite 查询回调未同步完成");
  }
  if (queryError) throw queryError;
  return rows;
}

export function withSqliteQueueOperation<T>(
  queue: SqliteTypes.SqliteQueueInstance,
  callback: (db: SqliteTypes.SqliteInstance) => T,
  operation = "数据库队列操作",
): T {
  let callbackCompleted = false;
  let callbackFailed = false;
  let callbackError: unknown;
  let callbackResult: T | undefined;

  try {
    queue.operations((db) => {
      try {
        callbackResult = callback(db);
      } catch (error) {
        callbackFailed = true;
        callbackError = error;
      } finally {
        callbackCompleted = true;
      }
    });
  } catch (error) {
    throw new SqliteOperationError(operation, errorText(error));
  }

  if (!callbackCompleted) {
    throw new SqliteOperationError(operation, "SQLite 队列回调未同步完成");
  }
  if (callbackFailed) throw callbackError;
  return callbackResult as T;
}

export function withSqliteTransaction<T>(
  db: SqliteTypes.SqliteInstance,
  callback: (transaction: SqliteTransactionContext) => T,
  operation = "数据库事务",
): T {
  let transactionStarted = false;
  try {
    db.beginTransaction();
    transactionStarted = true;

    const context: SqliteTransactionContext = {
      query: <Row extends Record<string, any>>(
        sql: string,
        args?: SqliteValue[],
        queryOperation = `${operation}中的查询`,
      ) => querySqliteRows<Row>(db, sql, args, queryOperation),
      update: (sql: string, args?: SqliteValue[], updateOperation = `${operation}中的更新`) =>
        checkedSqliteUpdate(db, sql, args, updateOperation),
    };

    const result = callback(context);
    if (result && typeof (result as any).then === "function") {
      throw new SqliteOperationError(operation, "事务 callback 必须同步完成");
    }
    db.commit();
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        db.rollback();
      } catch (rollbackError) {
        const original = errorText(error) || "原事务失败";
        const rollback = errorText(rollbackError) || "回滚失败";
        throw new SqliteOperationError(`${operation}回滚`, `${original}；${rollback}`);
      }
    }
    throw error;
  }
}
