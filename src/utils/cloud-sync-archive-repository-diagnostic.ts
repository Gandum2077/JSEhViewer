import { ArchiveRepository } from "../repositories/archive-repository";
import { MutationOrigin } from "../repositories/mutation-origin";
import { DBArchiveItem } from "../types";
import { CURRENT_SCHEMA_STATEMENTS } from "./database-initialization";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const DATABASE_PATH = "assets/cloud-sync-phase1-archive-repository.db";
const FIXTURE_COUNT = 6;

export interface CloudSyncArchiveRepositoryDiagnosticResult {
  ok: true;
  archiveCount: number;
  atomicSaveAndRollback: true;
  filteringAndPagination: true;
  maintenanceSemantics: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncArchiveRepositoryDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncArchiveRepositoryDiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncArchiveRepositoryDiagnosticError(`无法清理 repository 临时数据库：${file}`);
    }
  }
}

function createRepository(queue: SqliteTypes.SqliteQueueInstance): ArchiveRepository {
  return new ArchiveRepository({
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "repository 临时库查询"),
        "repository 临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "repository 临时库事务"),
        `${operation || "repository 临时库事务"}队列`,
      );
    },
  });
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 repository 临时库外键"),
      "启用 repository 临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function archive(gid: number, overrides: Partial<DBArchiveItem> = {}): DBArchiveItem {
  return {
    gid,
    readlater: false,
    downloaded: false,
    first_access_time: `2026-01-${String(gid).padStart(2, "0")}T00:00:00.000Z`,
    last_access_time: `2026-01-${String(gid).padStart(2, "0")}T00:00:00.000Z`,
    token: `token-${gid}`,
    title: `archive-${gid}`,
    english_title: `english-${gid}`,
    japanese_title: `japanese-${gid}`,
    thumbnail_url: `https://example.test/${gid}.jpg`,
    category: "Manga",
    posted_time: "2025-12-01T00:00:00.000Z",
    visible: true,
    rating: 4,
    is_my_rating: false,
    length: 40 + gid,
    torrent_available: false,
    favorited: false,
    uploader: `uploader-${gid}`,
    disowned: false,
    taglist: [{ namespace: "artist", tags: [`artist-${gid}`] }],
    comment: "",
    last_read_page: gid,
    ...overrides,
  };
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
              transaction.update(statement.sql, undefined, `创建 repository 诊断用 ${statement.name}`);
            }
            transaction.update("PRAGMA user_version = 1", undefined, "设置 repository 诊断库版本");
          },
          "创建 repository 诊断库",
        ),
      "创建 repository 诊断库队列",
    );

    const repository = createRepository(queue);
    repository.save(
      archive(1, {
        title: "repository replacement",
        taglist: [{ namespace: "language", tags: ["chinese", "translated"] }],
      }),
      MutationOrigin.user,
    );

    let rollbackRejected = false;
    try {
      repository.save(
        archive(1, {
          title: "partial write must rollback",
          taglist: [{ namespace: "artist", tags: [null] }] as any,
        }),
        MutationOrigin.user,
        true,
      );
    } catch {
      rollbackRejected = true;
    }
    const afterRollback = repository.get(1);
    if (!rollbackRejected || afterRollback?.title !== "repository replacement") {
      throw new CloudSyncArchiveRepositoryDiagnosticError("图库行与标签索引没有在故障后完整回滚");
    }

    for (let gid = 2; gid <= FIXTURE_COUNT; gid += 1) {
      repository.save(archive(gid), MutationOrigin.migrationSeed);
    }
    const firstPage = repository.query({ fromPage: 0, toPage: 0, pageSize: 2, sort: "first_access_time" });
    const filtered = repository.queryGids({
      fromPage: 0,
      toPage: 0,
      searchTerms: [{ qualifier: "tag", namespace: "language", term: "chinese", dollar: true } as any],
    });
    if (firstPage.length !== 2 || filtered.length !== 1 || filtered[0] !== 1) {
      throw new CloudSyncArchiveRepositoryDiagnosticError("repository 筛选或自定义分页结果不正确");
    }

    // gid=1 是后续关闭重开的持久化哨兵；通过 repository 明确标记为本机下载项，
    // 避免让持久化检查依赖另一张表的原始 SQL fixture。
    repository.update(1, { downloaded: true }, MutationOrigin.localMaintenance);
    repository.update(2, { downloaded: true }, MutationOrigin.localMaintenance);
    withSqliteQueueOperation(
      queue,
      (db) => {
        checkedSqliteUpdate(
          db,
          "INSERT INTO favorite_images (gid, page_index, favorited_at) VALUES (?, ?, ?)",
          [3, 0, "2026-01-01T00:00:00.000Z"],
          "写入 repository 图片收藏 fixture",
        );
      },
      "写入 repository 图片收藏 fixture 队列",
    );
    const removable = repository.findOldRemovableGids("2026-12-01T00:00:00.000Z");
    if (removable.includes(1) || removable.includes(2) || removable.includes(3) || !removable.includes(4)) {
      throw new CloudSyncArchiveRepositoryDiagnosticError("本机维护删除没有正确保护下载项或图片收藏");
    }
    repository.deleteMany(removable, MutationOrigin.localMaintenance, true);
    if (repository.get(4)) {
      throw new CloudSyncArchiveRepositoryDiagnosticError("本机维护删除没有移除预期图库记录");
    }
    const beforeClose = repository.get(1);
    if (!beforeClose) {
      throw new CloudSyncArchiveRepositoryDiagnosticError("关闭前持久化哨兵已被维护性删除");
    }
    if (beforeClose.title !== "repository replacement") {
      throw new CloudSyncArchiveRepositoryDiagnosticError("关闭前持久化哨兵标题不完整");
    }
    if (beforeClose.taglist.length !== 1 || beforeClose.taglist[0]?.tags.length !== 2) {
      throw new CloudSyncArchiveRepositoryDiagnosticError("关闭前持久化哨兵标签列表不完整");
    }
  });
}

function checkReopenAndCleanup(): void {
  withQueue((queue) => {
    const repository = createRepository(queue);
    const first = repository.get(1);
    if (!first) {
      throw new CloudSyncArchiveRepositoryDiagnosticError("关闭重开后持久化哨兵不存在");
    }
    if (first.title !== "repository replacement") {
      throw new CloudSyncArchiveRepositoryDiagnosticError("关闭重开后持久化哨兵标题不完整");
    }
    if (first.taglist.length !== 1 || first.taglist[0]?.tags.length !== 2) {
      throw new CloudSyncArchiveRepositoryDiagnosticError("关闭重开后持久化哨兵标签列表不完整");
    }
    if (repository.getMetadataByGids([1]).get(1)?.title !== "japanese-1") {
      throw new CloudSyncArchiveRepositoryDiagnosticError("图库列表元数据读取结果不正确");
    }
    repository.clearAllLocalData(MutationOrigin.localMaintenance);
    if (repository.count({ fromPage: 0, toPage: 0 }) !== 0) {
      throw new CloudSyncArchiveRepositoryDiagnosticError("清除本机图库相关数据后仍有残留记录");
    }
  });
}

export function runCloudSyncArchiveRepositoryDiagnostic(): CloudSyncArchiveRepositoryDiagnosticResult {
  const startedAt = Date.now();
  removeDatabase(DATABASE_PATH);
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    populateAndCheck();
    checkReopenAndCleanup();
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
    archiveCount: FIXTURE_COUNT,
    atomicSaveAndRollback: true,
    filteringAndPagination: true,
    maintenanceSemantics: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
