import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import { V2SearchBookmarkRepository } from "../repositories/search-bookmark-repository-v2";
import { V2SearchHistoryRepository } from "../repositories/search-history-repository-v2";
import { V2SearchRepositoryFacade } from "../repositories/search-repository-v2-facade";
import { SyncMutationWriter } from "../repositories/sync-mutation-writer";
import { SearchEntityId } from "../types";
import { CloudSyncDiagnosticEntityCodec } from "./cloud-sync-diagnostic-entity-codec";
import { DATABASE_V2_DRAFT_SCHEMA_STATEMENTS, DATABASE_V2_DRAFT_USER_VERSION } from "./database-schema-v2-draft";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const DATABASE_PATH = "assets/cloud-sync-phase1-v2-business-paths.db";

export interface CloudSyncV2BusinessPathDiagnosticResult {
  ok: true;
  stableStringIds: true;
  uiFacadeCompatible: true;
  recentTermsCompatible: true;
  bookmarkReorderAndTombstone: true;
  legacyNumericIdsRejected: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncV2BusinessPathDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncV2BusinessPathDiagnosticError";
  }
}

function databaseFiles(): string[] {
  return [DATABASE_PATH, `${DATABASE_PATH}-journal`, `${DATABASE_PATH}-shm`, `${DATABASE_PATH}-wal`];
}

function removeDatabase(): void {
  for (const file of databaseFiles()) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncV2BusinessPathDiagnosticError(`无法清理 v2 业务契约临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "v2 业务契约临时库查询"),
        "v2 业务契约临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "v2 业务契约临时库事务"),
        `${operation || "v2 业务契约临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 v2 业务契约临时库外键"),
      "启用 v2 业务契约临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function stableId(value: string): string {
  return $text.SHA256(value).toLowerCase();
}

function createFacade(database: RepositoryDatabase): V2SearchRepositoryFacade {
  let opSequence = 0;
  const codec = new CloudSyncDiagnosticEntityCodec();
  const writer = new SyncMutationWriter({
    deviceId: "phase1-business-path-device",
    nowMs: () => 3000,
    createOpId: () => {
      opSequence += 1;
      return `00000000-0000-4000-8000-${String(opSequence).padStart(12, "0")}`;
    },
  });
  return new V2SearchRepositoryFacade(
    new V2SearchHistoryRepository(database, writer, codec, stableId),
    new V2SearchBookmarkRepository(database, writer, codec, stableId),
  );
}

interface PersistedFixture {
  historyId: SearchEntityId;
  bookmarkIds: SearchEntityId[];
}

function populateAndCheck(): PersistedFixture {
  return withQueue((queue) => {
    const database = createDatabase(queue);
    database.transaction((transaction) => {
      for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
        transaction.update(statement.sql, undefined, `创建 v2 业务契约诊断用 ${statement.name}`);
      }
      transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置诊断库版本");
    }, "创建 v2 业务契约诊断库");

    const facade = createFacade(database);
    const oldHistory = facade.upsertHistory(
      "business-path-old",
      [{ namespace: "artist", term: "old", dollar: false, subtract: false, tilde: false }],
      MutationOrigin.user,
      "2026-08-11T00:00:00.000Z",
    );
    const latestHistory = facade.upsertHistory(
      "business-path-latest",
      [{ qualifier: "uploader", term: "latest", dollar: false, subtract: false, tilde: false }],
      MutationOrigin.user,
      "2026-08-12T00:00:00.000Z",
    );
    if (typeof latestHistory.id !== "string" || !/^[0-9a-f]{64}$/u.test(latestHistory.id)) {
      throw new CloudSyncV2BusinessPathDiagnosticError("v2 搜索历史稳定 ID 没有转换为 UI 可携带的字符串");
    }
    const uiCarrier = { label: { info: { id: latestHistory.id } } };
    if (uiCarrier.label.info.id !== facade.queryHistory()[0]?.id) {
      throw new CloudSyncV2BusinessPathDiagnosticError("搜索历史稳定 ID 穿过 UI info 后发生变化");
    }
    if (facade.getSomeLastAccessSearchTerms(1)[0]?.term !== "latest") {
      throw new CloudSyncV2BusinessPathDiagnosticError("v2 最近搜索词兼容查询结果不正确");
    }
    let numericHistoryRejected = false;
    try {
      facade.deleteHistoryLocally(1);
    } catch {
      numericHistoryRejected = true;
    }
    if (!numericHistoryRejected) throw new CloudSyncV2BusinessPathDiagnosticError("v2 搜索历史错误接受了数字旧 ID");
    facade.deleteHistoryLocally(oldHistory.id);

    for (const value of ["business-bookmark-a", "business-bookmark-b", "business-bookmark-c"]) {
      if (
        !facade.addBookmark(value, [{ term: value, dollar: false, subtract: false, tilde: false }], MutationOrigin.user)
      ) {
        throw new CloudSyncV2BusinessPathDiagnosticError("通过统一业务接口新增 v2 搜索书签失败");
      }
    }
    const original = facade.queryBookmarks();
    if (
      original.length !== 3 ||
      original.some((item) => typeof item.id !== "string") ||
      original.map((item) => item.sort_order).join(",") !== "0,1,2"
    ) {
      throw new CloudSyncV2BusinessPathDiagnosticError("v2 书签没有转换为 UI 兼容顺序或稳定 ID");
    }
    const reversed = original.map((item) => item.id).reverse();
    facade.reorderBookmarks(reversed, MutationOrigin.user);
    if (
      facade
        .queryBookmarks()
        .map((item) => item.id)
        .join(",") !== reversed.join(",")
    ) {
      throw new CloudSyncV2BusinessPathDiagnosticError("通过统一业务接口重排 v2 书签失败");
    }
    let numericBookmarkRejected = false;
    try {
      facade.deleteBookmark(1, MutationOrigin.user);
    } catch {
      numericBookmarkRejected = true;
    }
    if (!numericBookmarkRejected) throw new CloudSyncV2BusinessPathDiagnosticError("v2 搜索书签错误接受了数字旧 ID");
    facade.deleteBookmark(reversed[0], MutationOrigin.user);
    const tombstone = database.query("SELECT deleted FROM sync_versions WHERE object_key = ?", [
      `diagnostic:search.bookmark.v1:${reversed[0]}`,
    ])[0] as { deleted?: number } | undefined;
    if (Number(tombstone?.deleted) !== 1) {
      throw new CloudSyncV2BusinessPathDiagnosticError("通过统一业务接口删除书签没有生成 tombstone");
    }
    return { historyId: latestHistory.id, bookmarkIds: reversed.slice(1) };
  });
}

function checkReopen(expected: PersistedFixture): void {
  withQueue((queue) => {
    const facade = createFacade(createDatabase(queue));
    if (facade.queryHistory()[0]?.id !== expected.historyId) {
      throw new CloudSyncV2BusinessPathDiagnosticError("关闭重开后搜索历史稳定 ID 或业务行不完整");
    }
    if (
      facade
        .queryBookmarks()
        .map((item) => item.id)
        .join(",") !== expected.bookmarkIds.join(",")
    ) {
      throw new CloudSyncV2BusinessPathDiagnosticError("关闭重开后搜索书签稳定 ID 或顺序不完整");
    }
  });
}

export function runCloudSyncV2BusinessPathDiagnostic(): CloudSyncV2BusinessPathDiagnosticResult {
  const startedAt = Date.now();
  removeDatabase();
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    checkReopen(populateAndCheck());
  } catch (error) {
    operationError = error;
  }
  try {
    removeDatabase();
  } catch (error) {
    cleanupError = error;
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return {
    ok: true,
    stableStringIds: true,
    uiFacadeCompatible: true,
    recentTermsCompatible: true,
    bookmarkReorderAndTombstone: true,
    legacyNumericIdsRejected: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
