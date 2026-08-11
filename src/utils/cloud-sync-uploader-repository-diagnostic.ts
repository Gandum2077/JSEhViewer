import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import { UploaderRepository } from "../repositories/uploader-repository";
import { CURRENT_SCHEMA_STATEMENTS } from "./database-initialization";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const DATABASE_PATH = "assets/cloud-sync-phase1-uploader-repository.db";
const FINAL_MARKED_COUNT = 4;
const FINAL_BANNED_COUNT = 2;

export interface CloudSyncUploaderRepositoryDiagnosticResult {
  ok: true;
  markedCount: number;
  bannedCount: number;
  mutationOrigins: true;
  mirrorRollbackAtomic: true;
  collisionCleanup: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncUploaderRepositoryDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncUploaderRepositoryDiagnosticError";
  }
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncUploaderRepositoryDiagnosticError(`无法清理上传者 repository 临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "上传者 repository 临时库查询"),
        "上传者 repository 临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "上传者 repository 临时库事务"),
        `${operation || "上传者 repository 临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用上传者 repository 临时库外键"),
      "启用上传者 repository 临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function execute(queue: SqliteTypes.SqliteQueueInstance, sql: string, operation: string): void {
  withSqliteQueueOperation(queue, (db) => checkedSqliteUpdate(db, sql, undefined, operation), `${operation}队列`);
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
              transaction.update(statement.sql, undefined, `创建上传者 repository 诊断用 ${statement.name}`);
            }
            transaction.update("PRAGMA user_version = 1", undefined, "设置上传者 repository 诊断库版本");
          },
          "创建上传者 repository 诊断库",
        ),
      "创建上传者 repository 诊断库队列",
    );

    const repository = new UploaderRepository(createDatabase(queue));
    for (const uploader of ["alice", "bob", "carol", "dave", "erin"]) {
      if (!repository.addMarkedUploader(uploader, MutationOrigin.user)) {
        throw new CloudSyncUploaderRepositoryDiagnosticError("无法创建标记上传者 fixture");
      }
    }
    if (repository.addMarkedUploader("alice", MutationOrigin.user)) {
      throw new CloudSyncUploaderRepositoryDiagnosticError("重复标记上传者没有幂等忽略");
    }
    if (!repository.deleteMarkedUploader("erin", MutationOrigin.user)) {
      throw new CloudSyncUploaderRepositoryDiagnosticError("用户来源取消标记失败");
    }
    if (!repository.addMarkedUploader("erin", MutationOrigin.remote)) {
      throw new CloudSyncUploaderRepositoryDiagnosticError("远端来源恢复标记失败");
    }

    repository.replaceBannedUploaders(["legacy-ban"], MutationOrigin.upstreamMirror);
    execute(
      queue,
      `CREATE TRIGGER fail_uploader_repository_diagnostic
       BEFORE INSERT ON banned_uploaders
       WHEN NEW.uploader = 'force-rollback'
       BEGIN
         SELECT RAISE(ABORT, 'injected uploader repository failure');
       END`,
      "创建上传者 repository 故障触发器",
    );
    let mirrorFailureRejected = false;
    try {
      repository.replaceBannedUploaders(["new-ban", "force-rollback"], MutationOrigin.upstreamMirror);
    } catch {
      mirrorFailureRejected = true;
    }
    if (
      !mirrorFailureRejected ||
      repository.queryBannedUploaders().join("|") !== "legacy-ban" ||
      repository.queryMarkedUploaders().length !== 5
    ) {
      throw new CloudSyncUploaderRepositoryDiagnosticError("上游镜像刷新故障没有完整回滚");
    }
    execute(queue, "DROP TRIGGER fail_uploader_repository_diagnostic", "删除上传者 repository 故障触发器");
    const cleared = repository.replaceBannedUploaders([], MutationOrigin.upstreamMirror);
    if (cleared.bannedUploaders.length !== 0 || cleared.markedUploaders.length !== 5) {
      throw new CloudSyncUploaderRepositoryDiagnosticError("空的上游屏蔽名单没有清除旧本机镜像");
    }

    let wrongOriginRejected = false;
    try {
      repository.replaceBannedUploaders(["wrong-origin"], MutationOrigin.user);
    } catch {
      wrongOriginRejected = true;
    }
    if (!wrongOriginRejected) {
      throw new CloudSyncUploaderRepositoryDiagnosticError("上游屏蔽镜像接受了错误的变更来源");
    }

    const result = repository.replaceBannedUploaders(
      ["alice", "remote-ban", "remote-ban"],
      MutationOrigin.upstreamMirror,
    );
    if (
      result.bannedUploaders.join("|") !== "alice|remote-ban" ||
      result.removedMarkedUploaders.join("|") !== "alice" ||
      result.markedUploaders.length !== FINAL_MARKED_COUNT ||
      repository.addMarkedUploader("alice", MutationOrigin.remote)
    ) {
      throw new CloudSyncUploaderRepositoryDiagnosticError("屏蔽镜像去重、冲突清理或本机屏蔽保护失败");
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const repository = new UploaderRepository(createDatabase(queue));
    const marked = repository.queryMarkedUploaders();
    const banned = repository.queryBannedUploaders();
    if (
      marked.length !== FINAL_MARKED_COUNT ||
      banned.length !== FINAL_BANNED_COUNT ||
      marked.includes("alice") ||
      banned.join("|") !== "alice|remote-ban"
    ) {
      throw new CloudSyncUploaderRepositoryDiagnosticError("关闭重开后上传者标记或屏蔽镜像不完整");
    }
  });
}

export function runCloudSyncUploaderRepositoryDiagnostic(): CloudSyncUploaderRepositoryDiagnosticResult {
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
    markedCount: FINAL_MARKED_COUNT,
    bannedCount: FINAL_BANNED_COUNT,
    mutationOrigins: true,
    mirrorRollbackAtomic: true,
    collisionCleanup: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
