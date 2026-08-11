import { MarkedTag } from "../types";
import { MarkedTagMode, MarkedTagRepository } from "../repositories/marked-tag-repository";
import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import { CURRENT_SCHEMA_STATEMENTS } from "./database-initialization";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const DATABASE_PATH = "assets/cloud-sync-phase1-marked-tag-repository.db";
const LOCAL_TAG_COUNT = 4;
const UPSTREAM_TAG_COUNT = 3;

export interface CloudSyncMarkedTagRepositoryDiagnosticResult {
  ok: true;
  localTagCount: number;
  upstreamTagCount: number;
  modeIsolation: true;
  reloginClear: true;
  mirrorRollbackAtomic: true;
  remoteRebuild: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncMarkedTagRepositoryDiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncMarkedTagRepositoryDiagnosticError";
  }
}

function tag(
  tagid: number,
  namespace: MarkedTag["namespace"],
  name: string,
  overrides: Partial<MarkedTag> = {},
): MarkedTag {
  return {
    tagid,
    namespace,
    name,
    watched: false,
    hidden: false,
    color: "",
    weight: 0,
    ...overrides,
  };
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncMarkedTagRepositoryDiagnosticError(`无法清理 marked tags repository 临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "marked tags repository 临时库查询"),
        "marked tags repository 临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "marked tags repository 临时库事务"),
        `${operation || "marked tags repository 临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 marked tags 临时库外键"),
      "启用 marked tags 临时库外键队列",
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
              transaction.update(statement.sql, undefined, `创建 marked tags repository 诊断用 ${statement.name}`);
            }
            transaction.update("PRAGMA user_version = 1", undefined, "设置 marked tags repository 诊断库版本");
          },
          "创建 marked tags repository 诊断库",
        ),
      "创建 marked tags repository 诊断库队列",
    );

    const repository = new MarkedTagRepository(createDatabase(queue));
    repository.upsertLocalTag(tag(0, "artist", "local-a"), MarkedTagMode.localSync, MutationOrigin.user);
    repository.upsertLocalTag(tag(0, "female", "local-b"), MarkedTagMode.localSync, MutationOrigin.remote);
    repository.upsertLocalTag(tag(0, "language", "local-c"), MarkedTagMode.localSync, MutationOrigin.migrationSeed);
    repository.upsertLocalTag(
      tag(0, "artist", "local-a", { watched: true, weight: 7 }),
      MarkedTagMode.localSync,
      MutationOrigin.user,
    );
    if (repository.queryMarkedTags().length !== 3 || repository.queryMarkedTags()[0].weight !== 7) {
      throw new CloudSyncMarkedTagRepositoryDiagnosticError("本地标签模式 UPSERT 或来源处理失败");
    }
    let crossModeRejected = false;
    try {
      repository.replaceUpstreamMirror(
        [tag(1, "artist", "wrong-mode")],
        MarkedTagMode.localSync,
        MutationOrigin.upstreamMirror,
      );
    } catch {
      crossModeRejected = true;
    }
    if (!crossModeRejected) {
      throw new CloudSyncMarkedTagRepositoryDiagnosticError("本地标签模式接受了上游整表镜像");
    }
    if (repository.clearForRelogin(MutationOrigin.localMaintenance) !== 3 || repository.queryMarkedTags().length) {
      throw new CloudSyncMarkedTagRepositoryDiagnosticError("重新登录没有清空本地标签整表");
    }

    repository.replaceUpstreamMirror(
      [
        tag(101, "artist", "upstream-a", { watched: true }),
        tag(102, "male", "upstream-b", { hidden: true }),
        tag(103, "group", "upstream-c", { weight: -4 }),
      ],
      MarkedTagMode.upstreamMirror,
      MutationOrigin.upstreamMirror,
    );
    repository.updateUpstreamTag(
      tag(102, "male", "upstream-b", { watched: true, weight: 9 }),
      MarkedTagMode.upstreamMirror,
      MutationOrigin.upstreamMirror,
    );
    execute(
      queue,
      `CREATE TRIGGER fail_marked_tag_repository_diagnostic
       BEFORE INSERT ON marked_tags
       WHEN NEW.name = 'force-rollback'
       BEGIN
         SELECT RAISE(ABORT, 'injected marked tag repository failure');
       END`,
      "创建 marked tags repository 故障触发器",
    );
    let mirrorFailureRejected = false;
    try {
      repository.replaceUpstreamMirror(
        [tag(201, "artist", "replacement"), tag(202, "artist", "force-rollback")],
        MarkedTagMode.upstreamMirror,
        MutationOrigin.upstreamMirror,
      );
    } catch {
      mirrorFailureRejected = true;
    }
    if (
      !mirrorFailureRejected ||
      repository
        .queryMarkedTags()
        .map((item) => item.name)
        .join("|") !== "upstream-a|upstream-b|upstream-c"
    ) {
      throw new CloudSyncMarkedTagRepositoryDiagnosticError("E-Hentai 标签镜像故障没有完整回滚");
    }
    execute(queue, "DROP TRIGGER fail_marked_tag_repository_diagnostic", "删除 marked tags repository 故障触发器");

    if (
      repository.clearForRelogin(MutationOrigin.localMaintenance) !== UPSTREAM_TAG_COUNT ||
      repository.queryMarkedTags().length
    ) {
      throw new CloudSyncMarkedTagRepositoryDiagnosticError("切换标签模式前没有清空 E-Hentai 镜像");
    }
    for (const item of [
      tag(0, "artist", "cloud-a"),
      tag(0, "female", "cloud-b"),
      tag(0, "language", "cloud-c"),
      tag(0, "parody", "cloud-d"),
    ]) {
      repository.upsertLocalTag(item, MarkedTagMode.localSync, MutationOrigin.remote);
    }
    if (repository.queryMarkedTags().length !== LOCAL_TAG_COUNT) {
      throw new CloudSyncMarkedTagRepositoryDiagnosticError("切回本地模式后 D1 远端重建不完整");
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const names = new MarkedTagRepository(createDatabase(queue))
      .queryMarkedTags()
      .map((item) => item.name)
      .join("|");
    if (names !== "cloud-a|cloud-b|cloud-c|cloud-d") {
      throw new CloudSyncMarkedTagRepositoryDiagnosticError("关闭重开后本地标签远端重建结果不完整");
    }
  });
}

export function runCloudSyncMarkedTagRepositoryDiagnostic(): CloudSyncMarkedTagRepositoryDiagnosticResult {
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
    localTagCount: LOCAL_TAG_COUNT,
    upstreamTagCount: UPSTREAM_TAG_COUNT,
    modeIsolation: true,
    reloginClear: true,
    mirrorRollbackAtomic: true,
    remoteRebuild: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
