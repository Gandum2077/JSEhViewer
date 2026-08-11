import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import { SearchRepository } from "../repositories/search-repository";
import { CURRENT_SCHEMA_STATEMENTS } from "./database-initialization";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const DATABASE_PATH = "assets/cloud-sync-phase1-search-repository.db";
const HISTORY_FIXTURE_COUNT = 8;
const BOOKMARK_FIXTURE_COUNT = 4;

export interface CloudSyncSearchRepositoryDiagnosticResult {
  ok: true;
  historyCount: number;
  bookmarkCount: number;
  parentAndTermsAtomic: true;
  termOrderAndPunctuation: true;
  localHistoryDeletion: true;
  bookmarkReorderAtomic: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncSearchRepositoryDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncSearchRepositoryDiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncSearchRepositoryDiagnosticError(`无法清理搜索 repository 临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "搜索 repository 临时库查询"),
        "搜索 repository 临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "搜索 repository 临时库事务"),
        `${operation || "搜索 repository 临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用搜索 repository 临时库外键"),
      "启用搜索 repository 临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function populateAndCheck(): void {
  withQueue((queue) => {
    withSqliteQueueOperation(
      queue,
      (db) =>
        withSqliteTransaction(
          db,
          (transaction) => {
            for (const statement of CURRENT_SCHEMA_STATEMENTS) {
              transaction.update(statement.sql, undefined, `创建搜索 repository 诊断用 ${statement.name}`);
            }
            transaction.update("PRAGMA user_version = 1", undefined, "设置搜索 repository 诊断库版本");
          },
          "创建搜索 repository 诊断库",
        ),
      "创建搜索 repository 诊断库队列",
    );

    const repository = new SearchRepository(createDatabase(queue));
    const delimiterTerms = [
      { namespace: "artist" as const, term: "alpha|beta;gamma", dollar: true, subtract: false, tilde: false },
      { qualifier: "uploader" as const, term: "someone", dollar: false, subtract: true, tilde: false },
    ];
    const first = repository.upsertHistory(
      "diagnostic-history-1",
      delimiterTerms,
      MutationOrigin.user,
      "2026-01-01T00:00:00.000Z",
    );
    for (let index = 2; index <= HISTORY_FIXTURE_COUNT; index += 1) {
      repository.upsertHistory(
        `diagnostic-history-${index}`,
        [{ term: `term-${index}`, dollar: false, subtract: false, tilde: false }],
        MutationOrigin.user,
        `2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      );
    }

    let historyRollbackRejected = false;
    try {
      repository.upsertHistory(
        "diagnostic-history-1",
        [{ term: null }] as any,
        MutationOrigin.remote,
        "2026-02-01T00:00:00.000Z",
      );
    } catch {
      historyRollbackRejected = true;
    }
    const afterRollback = repository.queryHistory().find((item) => item.id === first.id);
    if (
      !historyRollbackRejected ||
      afterRollback?.last_access_time !== "2026-01-01T00:00:00.000Z" ||
      afterRollback.searchTerms[0]?.term !== "alpha|beta;gamma" ||
      afterRollback.searchTerms[1]?.term !== "someone"
    ) {
      throw new CloudSyncSearchRepositoryDiagnosticError("搜索历史 parent 与 terms 没有在故障后完整回滚");
    }

    const deleted = repository.queryHistory().find((item) => item.sorted_fsearch === "diagnostic-history-2");
    if (!deleted) throw new CloudSyncSearchRepositoryDiagnosticError("找不到本机删除 fixture");
    repository.deleteHistoryLocally(deleted.id);
    const database = createDatabase(queue);
    const deletedParentCount = Number(
      database.query("SELECT COUNT(*) AS count FROM search_history WHERE id = ?", [deleted.id])[0]?.count,
    );
    const deletedTermCount = Number(
      database.query("SELECT COUNT(*) AS count FROM search_history_search_terms WHERE search_history_id = ?", [
        deleted.id,
      ])[0]?.count,
    );
    if (deletedParentCount !== 0 || deletedTermCount !== 0 || repository.queryHistory().length !== 7) {
      throw new CloudSyncSearchRepositoryDiagnosticError("本机删除没有原子移除目标 history/terms");
    }

    for (let index = 1; index <= BOOKMARK_FIXTURE_COUNT; index += 1) {
      repository.addBookmark(
        `diagnostic-bookmark-${index}`,
        index === 1
          ? delimiterTerms
          : [{ term: `bookmark-term-${index}`, dollar: false, subtract: false, tilde: false }],
        MutationOrigin.user,
      );
    }
    const initialIds = repository.queryBookmarks().map((item) => item.id);
    const reversedIds = [...initialIds].reverse();
    repository.reorderBookmarks(reversedIds, MutationOrigin.user);
    let invalidReorderRejected = false;
    try {
      repository.reorderBookmarks(reversedIds.slice(1), MutationOrigin.user);
    } catch {
      invalidReorderRejected = true;
    }
    if (
      !invalidReorderRejected ||
      repository
        .queryBookmarks()
        .map((item) => item.id)
        .some((id, index) => id !== reversedIds[index])
    ) {
      throw new CloudSyncSearchRepositoryDiagnosticError("非法书签重排没有完整拒绝或破坏了原顺序");
    }

    let bookmarkRollbackRejected = false;
    try {
      repository.addBookmark("diagnostic-broken-bookmark", [{ term: null }] as any, MutationOrigin.user);
    } catch {
      bookmarkRollbackRejected = true;
    }
    if (
      !bookmarkRollbackRejected ||
      repository.queryBookmarks().some((item) => item.sorted_fsearch === "diagnostic-broken-bookmark")
    ) {
      throw new CloudSyncSearchRepositoryDiagnosticError("书签 parent 与 terms 没有在故障后完整回滚");
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const repository = new SearchRepository(createDatabase(queue));
    const history = repository.queryHistory();
    const bookmarks = repository.queryBookmarks();
    const firstHistory = history.find((item) => item.sorted_fsearch === "diagnostic-history-1");
    const firstBookmark = bookmarks.find((item) => item.sorted_fsearch === "diagnostic-bookmark-1");
    if (
      history.length !== HISTORY_FIXTURE_COUNT - 1 ||
      bookmarks.length !== BOOKMARK_FIXTURE_COUNT ||
      firstHistory?.searchTerms[0]?.term !== "alpha|beta;gamma" ||
      firstHistory.searchTerms[1]?.term !== "someone" ||
      firstBookmark?.searchTerms[0]?.term !== "alpha|beta;gamma"
    ) {
      throw new CloudSyncSearchRepositoryDiagnosticError("关闭重开后搜索历史、书签或 terms 不完整");
    }
    if (!bookmarks.every((item, index) => item.sort_order === index)) {
      throw new CloudSyncSearchRepositoryDiagnosticError("关闭重开后书签顺序不连续");
    }
  });
}

export function runCloudSyncSearchRepositoryDiagnostic(): CloudSyncSearchRepositoryDiagnosticResult {
  const startedAt = Date.now();
  removeDatabase(DATABASE_PATH);
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    populateAndCheck();
    checkReopen();
  } catch (error) {
    operationError = error;
  }
  try {
    removeDatabase(DATABASE_PATH);
  } catch (error) {
    cleanupError = error;
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return {
    ok: true,
    historyCount: HISTORY_FIXTURE_COUNT,
    bookmarkCount: BOOKMARK_FIXTURE_COUNT,
    parentAndTermsAtomic: true,
    termOrderAndPunctuation: true,
    localHistoryDeletion: true,
    bookmarkReorderAtomic: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
