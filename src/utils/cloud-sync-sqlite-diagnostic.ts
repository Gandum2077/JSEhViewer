const DIAGNOSTIC_DATABASE_PATH = "assets/cloud-sync-phase0-sqlite-check.db";
const DIAGNOSTIC_DATABASE_FILES = [
  DIAGNOSTIC_DATABASE_PATH,
  `${DIAGNOSTIC_DATABASE_PATH}-journal`,
  `${DIAGNOSTIC_DATABASE_PATH}-shm`,
  `${DIAGNOSTIC_DATABASE_PATH}-wal`,
];

export interface CloudSyncSqliteDiagnosticResult {
  ok: true;
  queueOrdered: true;
  commitPersisted: true;
  updateErrorReported: true;
  rollbackComplete: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncSqliteDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncSqliteDiagnosticError";
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function requireUpdate(result: SqliteTypes.UpdateResult, operation: string): void {
  if (!result.result) {
    throw new CloudSyncSqliteDiagnosticError(`${operation}失败：${result.error || "SQLite 未返回错误详情"}`);
  }
}

function removeDiagnosticFiles(): void {
  for (const path of DIAGNOSTIC_DATABASE_FILES) {
    if ($file.exists(path) && !$file.delete(path)) {
      throw new CloudSyncSqliteDiagnosticError(`无法清理临时 SQLite 文件：${path}`);
    }
  }
}

function readDiagnosticRows(db: SqliteTypes.SqliteInstance): { id: number; value: string }[] {
  const rows: { id: number; value: string }[] = [];
  let queryCompleted = false;
  let queryError: string | undefined;

  db.query("SELECT id, value FROM phase0_check ORDER BY id", (rs, err) => {
    queryCompleted = true;
    if (err) {
      queryError = err;
      return;
    }
    try {
      while (rs.next()) {
        rows.push({ id: Number(rs.get("id")), value: String(rs.get("value")) });
      }
    } finally {
      rs.close();
    }
  });

  if (!queryCompleted) {
    throw new CloudSyncSqliteDiagnosticError("SQLite query callback 没有在 dbQueue 操作内完成。");
  }
  if (queryError) {
    throw new CloudSyncSqliteDiagnosticError(`读取临时 SQLite 数据失败：${queryError}`);
  }
  return rows;
}

/**
 * Verifies the JSBox SQLite behavior required by Phase 1 without opening or
 * modifying assets/database.db. The temporary database and its sidecars are
 * removed on both success and failure.
 */
export function runCloudSyncSqliteDiagnostic(): CloudSyncSqliteDiagnosticResult {
  const startedAt = Date.now();
  removeDiagnosticFiles();

  let queue: SqliteTypes.SqliteQueueInstance | undefined;
  let testError: unknown;
  let cleanupError: unknown;
  let queueOrdered = false;
  let commitPersisted = false;
  let updateErrorReported = false;
  let rollbackComplete = false;

  try {
    queue = $sqlite.dbQueue(DIAGNOSTIC_DATABASE_PATH);
    const operationOrder: number[] = [];

    queue.operations((db) => {
      operationOrder.push(1);
      requireUpdate(
        db.update("CREATE TABLE phase0_check (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE)"),
        "创建临时表",
      );
    });

    queue.operations((db) => {
      operationOrder.push(2);
      db.beginTransaction();
      let committed = false;
      try {
        requireUpdate(
          db.update({
            sql: "INSERT INTO phase0_check (id, value) VALUES (?, ?)",
            args: [1, "committed"],
          }),
          "提交事务写入",
        );
        db.commit();
        committed = true;
      } finally {
        if (!committed) db.rollback();
      }
    });

    let rowsAfterCommit: { id: number; value: string }[] = [];
    queue.operations((db) => {
      operationOrder.push(3);
      rowsAfterCommit = readDiagnosticRows(db);
    });
    commitPersisted =
      rowsAfterCommit.length === 1 && rowsAfterCommit[0]?.id === 1 && rowsAfterCommit[0]?.value === "committed";
    if (!commitPersisted) {
      throw new CloudSyncSqliteDiagnosticError(
        `显式 commit 后预期 1 行，实际 ${rowsAfterCommit.length} 行：${rowsAfterCommit.map((row) => row.id).join(",") || "空"}`,
      );
    }

    queue.operations((db) => {
      operationOrder.push(4);
      db.beginTransaction();
      try {
        requireUpdate(
          db.update({
            sql: "INSERT INTO phase0_check (id, value) VALUES (?, ?)",
            args: [2, "must-rollback"],
          }),
          "回滚事务首笔写入",
        );
        const constraintFailure = db.update({
          sql: "INSERT INTO phase0_check (id, value) VALUES (?, ?)",
          args: [3, "must-rollback"],
        });
        updateErrorReported = !constraintFailure.result && Boolean(constraintFailure.error);
        if (!updateErrorReported) {
          throw new CloudSyncSqliteDiagnosticError("唯一约束失败没有通过 { result, error } 返回");
        }
      } finally {
        db.rollback();
      }
    });

    let rows: { id: number; value: string }[] = [];
    queue.operations((db) => {
      operationOrder.push(5);
      rows = readDiagnosticRows(db);
    });

    queueOrdered = operationOrder.join(",") === "1,2,3,4,5";
    rollbackComplete =
      rows.length === 1 &&
      rows[0]?.id === 1 &&
      rows[0]?.value === "committed" &&
      !rows.some((row) => row.id === 2 || row.id === 3);

    if (!queueOrdered) {
      throw new CloudSyncSqliteDiagnosticError(`dbQueue 执行顺序异常：${operationOrder.join(" → ") || "无回调"}`);
    }
    if (!rollbackComplete) {
      throw new CloudSyncSqliteDiagnosticError(
        `显式 rollback 后预期只保留 id=1，实际 ${rows.length} 行：${rows.map((row) => row.id).join(",") || "空"}`,
      );
    }
  } catch (error) {
    testError = error;
  } finally {
    try {
      queue?.close();
    } catch (error) {
      cleanupError = error;
    }
    try {
      removeDiagnosticFiles();
    } catch (error) {
      cleanupError = cleanupError ?? error;
    }
  }

  if (testError) {
    const suffix = cleanupError ? `；同时清理失败：${errorText(cleanupError)}` : "";
    throw new CloudSyncSqliteDiagnosticError(`${errorText(testError)}${suffix}`);
  }
  if (cleanupError) {
    throw new CloudSyncSqliteDiagnosticError(`SQLite 检查完成，但临时文件清理失败：${errorText(cleanupError)}`);
  }

  return {
    ok: true,
    queueOrdered: true,
    commitPersisted: true,
    updateErrorReported: true,
    rollbackComplete: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
