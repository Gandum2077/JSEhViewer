import { MarkedTag } from "../types";
import { MarkedTagMode } from "../repositories/marked-tag-repository";
import {
  LOCAL_MARKED_TAG_ENTITY_TYPE,
  LocalMarkedTagPayloadV1,
  V2MarkedTagRepository,
} from "../repositories/marked-tag-repository-v2";
import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import { RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "../repositories/sync-mutation-writer";
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

const DATABASE_PATH = "assets/cloud-sync-phase1-marked-tag-repository-v2.db";

export interface CloudSyncMarkedTagRepositoryV2DiagnosticResult {
  ok: true;
  seededCount: number;
  localAtomic: true;
  payloadExcludesUpstreamId: true;
  tombstoneIdentity: true;
  remoteOrdering: true;
  modeIsolation: true;
  reloginDiscard: true;
  rollbackAtomic: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncMarkedTagRepositoryV2DiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncMarkedTagRepositoryV2DiagnosticError";
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

function payload(
  namespace: MarkedTag["namespace"],
  name: string,
  overrides: Partial<LocalMarkedTagPayloadV1> = {},
): LocalMarkedTagPayloadV1 {
  return {
    format: 1,
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
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError(`无法清理 v2 本地标签临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "v2 本地标签临时库查询"),
        "v2 本地标签临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "v2 本地标签临时库事务"),
        `${operation || "v2 本地标签临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 v2 本地标签临时库外键"),
      "启用 v2 本地标签临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function queryOne<T extends Record<string, any>>(database: RepositoryDatabase, sql: string, args?: SqliteValue[]): T {
  const row = database.query(sql, args)[0] as T | undefined;
  if (!row) throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("v2 本地标签诊断缺少预期数据库行");
  return row;
}

function execute(queue: SqliteTypes.SqliteQueueInstance, sql: string, operation: string): void {
  withSqliteQueueOperation(queue, (db) => checkedSqliteUpdate(db, sql, undefined, operation), `${operation}队列`);
}

function objectKey(
  codec: CloudSyncDiagnosticEntityCodec,
  namespace: MarkedTag["namespace"],
  name: string,
): string {
  return codec.deriveObjectKey(LOCAL_MARKED_TAG_ENTITY_TYPE, JSON.stringify([namespace, name]));
}

function createRemoteMutation(
  codec: CloudSyncDiagnosticEntityCodec,
  payloadValue: LocalMarkedTagPayloadV1,
  wallMs: number,
  opId: string,
  deleted = false,
  logicalCounter = 0,
): RemoteSyncMutation {
  const version: SyncVersion = {
    objectKey: objectKey(codec, payloadValue.namespace, payloadValue.name),
    entityType: LOCAL_MARKED_TAG_ENTITY_TYPE,
    wallMs,
    logicalCounter,
    deviceId: "phase1-device-b",
    deleted,
    opId,
  };
  return {
    ...version,
    origin: MutationOrigin.remote,
    envelopeJson: codec.encodeEnvelope(LOCAL_MARKED_TAG_ENTITY_TYPE, payloadValue, version),
  };
}

function populateAndCheck(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    database.transaction((transaction) => {
      for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
        transaction.update(statement.sql, undefined, `创建 v2 本地标签诊断用 ${statement.name}`);
      }
      transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置诊断库版本");
      transaction.update(
        `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [701, "artist", "seeded-a", 1, 0, "#111111", 3],
      );
      transaction.update(
        `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [702, "female", "seeded-b", 0, 1, "", -2],
      );
    }, "创建 v2 本地标签诊断库");

    let nowMs = 1000;
    let opSequence = 0;
    const codec = new CloudSyncDiagnosticEntityCodec();
    const writer = new SyncMutationWriter({
      deviceId: "phase1-device-a",
      nowMs: () => nowMs,
      createOpId: () => {
        opSequence += 1;
        return `00000000-0000-4000-8000-${String(opSequence).padStart(12, "0")}`;
      },
    });
    const repository = new V2MarkedTagRepository(database, writer, codec);

    if (
      repository.seedExistingLocalTags(MarkedTagMode.localSync) !== 2 ||
      repository.seedExistingLocalTags(MarkedTagMode.localSync) !== 0
    ) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("已有本地标签 seed 不是可重入操作");
    }
    const seededAKey = objectKey(codec, "artist", "seeded-a");
    const seeded = queryOne<{
      envelope_json: string;
      wall_ms: number;
      logical_counter: number;
      device_id: string;
      deleted: number;
      last_op_id: string;
    }>(
      database,
      `SELECT outbox.envelope_json, versions.wall_ms, versions.logical_counter,
              versions.device_id, versions.deleted, versions.last_op_id
       FROM sync_outbox AS outbox JOIN sync_versions AS versions USING (object_key)
       WHERE outbox.object_key = ?`,
      [seededAKey],
    );
    const decodedSeed = codec.decodeEnvelope(LOCAL_MARKED_TAG_ENTITY_TYPE, seeded.envelope_json, {
      objectKey: seededAKey,
      entityType: LOCAL_MARKED_TAG_ENTITY_TYPE,
      wallMs: seeded.wall_ms,
      logicalCounter: seeded.logical_counter,
      deviceId: seeded.device_id,
      deleted: seeded.deleted === 1,
      opId: seeded.last_op_id,
    }) as Record<string, unknown>;
    if ("tagid" in decodedSeed || decodedSeed.name !== "seeded-a") {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("E-Hentai tagid 进入了本地标签同步 payload");
    }

    nowMs = 1100;
    repository.upsertLocalTag(
      tag(0, "language", "local-c", { watched: true, color: "#123456", weight: 8 }),
      MarkedTagMode.localSync,
      MutationOrigin.user,
    );
    const failureKey = objectKey(codec, "artist", "failure");
    execute(
      queue,
      `CREATE TRIGGER fail_v2_marked_tag_outbox
       BEFORE INSERT ON sync_outbox
       WHEN NEW.object_key = '${failureKey}'
       BEGIN
         SELECT RAISE(ABORT, 'injected v2 marked tag outbox failure');
       END`,
      "创建 v2 本地标签 outbox 故障触发器",
    );
    let localFailureRejected = false;
    try {
      repository.upsertLocalTag(
        tag(0, "artist", "failure"),
        MarkedTagMode.localSync,
        MutationOrigin.user,
      );
    } catch {
      localFailureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_v2_marked_tag_outbox", "删除 v2 本地标签 outbox 故障触发器");
    if (
      !localFailureRejected ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM marked_tags WHERE name = 'failure'").count) !==
        0 ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?", [
          failureKey,
        ]).count,
      ) !== 0
    ) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("本地标签 outbox 故障没有完整回滚业务行与版本");
    }

    nowMs = 1200;
    if (!repository.deleteLocalTag("artist", "seeded-a", MarkedTagMode.localSync, MutationOrigin.user)) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("用户删除本地标签没有生成 tombstone");
    }
    const tombstone = queryOne<{
      envelope_json: string;
      wall_ms: number;
      logical_counter: number;
      device_id: string;
      last_op_id: string;
    }>(
      database,
      `SELECT outbox.envelope_json, versions.wall_ms, versions.logical_counter,
              versions.device_id, versions.last_op_id
       FROM sync_versions AS versions JOIN sync_outbox AS outbox USING (object_key)
       WHERE versions.object_key = ? AND versions.deleted = 1`,
      [seededAKey],
    );
    const decodedTombstone = codec.decodeEnvelope(LOCAL_MARKED_TAG_ENTITY_TYPE, tombstone.envelope_json, {
      objectKey: seededAKey,
      entityType: LOCAL_MARKED_TAG_ENTITY_TYPE,
      wallMs: tombstone.wall_ms,
      logicalCounter: tombstone.logical_counter,
      deviceId: tombstone.device_id,
      deleted: true,
      opId: tombstone.last_op_id,
    }) as Record<string, unknown>;
    if (decodedTombstone.namespace !== "artist" || decodedTombstone.name !== "seeded-a") {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("本地标签 tombstone 无法恢复实体身份");
    }

    const stale = repository.applyRemoteLocalTag(
      createRemoteMutation(
        codec,
        payload("artist", "seeded-a"),
        1199,
        "10000000-0000-4000-8000-000000000001",
        false,
        99,
      ),
      MarkedTagMode.localSync,
    );
    const newer = repository.applyRemoteLocalTag(
      createRemoteMutation(
        codec,
        payload("artist", "seeded-a", { watched: true, color: "#abcdef", weight: 9 }),
        1300,
        "10000000-0000-4000-8000-000000000002",
      ),
      MarkedTagMode.localSync,
    );
    const duplicate = repository.applyRemoteLocalTag(
      createRemoteMutation(
        codec,
        payload("artist", "seeded-a", { watched: true, color: "#abcdef", weight: 9 }),
        1300,
        "10000000-0000-4000-8000-000000000002",
      ),
      MarkedTagMode.localSync,
    );
    const remoteDelete = repository.applyRemoteLocalTag(
      createRemoteMutation(
        codec,
        payload("artist", "seeded-a"),
        1400,
        "10000000-0000-4000-8000-000000000003",
        true,
      ),
      MarkedTagMode.localSync,
    );
    if (
      stale.applied ||
      stale.membershipPresent ||
      !newer.applied ||
      !newer.membershipPresent ||
      duplicate.applied ||
      !remoteDelete.applied ||
      remoteDelete.membershipPresent
    ) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("远端本地标签版本顺序或重复 apply 不正确");
    }

    const rowsBeforeFailedClear = Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM marked_tags").count);
    const versionsBeforeFailedClear = Number(
      queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions").count,
    );
    const outboxBeforeFailedClear = Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count);
    execute(
      queue,
      `CREATE TRIGGER fail_v2_marked_tag_relogin_clear
       BEFORE DELETE ON marked_tags
       WHEN OLD.name = 'local-c'
       BEGIN
         SELECT RAISE(ABORT, 'injected v2 marked tag relogin clear failure');
       END`,
      "创建 v2 本地标签重新登录故障触发器",
    );
    let clearFailureRejected = false;
    try {
      repository.clearForRelogin(MutationOrigin.localMaintenance);
    } catch {
      clearFailureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_v2_marked_tag_relogin_clear", "删除 v2 本地标签重新登录故障触发器");
    if (
      !clearFailureRejected ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM marked_tags").count) !==
        rowsBeforeFailedClear ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions").count) !==
        versionsBeforeFailedClear ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !==
        outboxBeforeFailedClear
    ) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("重新登录故障没有完整回滚业务表、版本和 outbox");
    }

    if (repository.clearForRelogin(MutationOrigin.localMaintenance) !== rowsBeforeFailedClear) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("重新登录清理返回的标签数量不正确");
    }
    if (
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions").count) !== 0 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 0
    ) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("重新登录清理产生了 tombstone 或保留了旧 outbox");
    }

    repository.replaceUpstreamMirror(
      [
        tag(801, "artist", "upstream-a", { watched: true }),
        tag(802, "male", "upstream-b", { hidden: true }),
        tag(803, "group", "upstream-c", { weight: -4 }),
      ],
      MarkedTagMode.upstreamMirror,
      MutationOrigin.upstreamMirror,
    );
    if (
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions").count) !== 0 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 0
    ) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("E-Hentai My Tags 镜像错误进入同步状态");
    }

    if (repository.clearForRelogin(MutationOrigin.localMaintenance) !== 3) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("切回本地模式前没有清空 My Tags 镜像");
    }
    repository.applyRemoteLocalTag(
      createRemoteMutation(
        codec,
        payload("artist", "cloud-a", { watched: true, color: "#010203", weight: 4 }),
        2000,
        "10000000-0000-4000-8000-000000000004",
      ),
      MarkedTagMode.localSync,
    );
    repository.applyRemoteLocalTag(
      createRemoteMutation(
        codec,
        payload("female", "cloud-b", { hidden: true, weight: -3 }),
        2001,
        "10000000-0000-4000-8000-000000000005",
      ),
      MarkedTagMode.localSync,
    );
    if (
      repository.queryMarkedTags().map((item) => item.name).join("|") !== "cloud-a|cloud-b" ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions").count) !== 2 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 0
    ) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("切回本地模式后云端快照重建不完整");
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    const repository = new V2MarkedTagRepository(
      database,
      new SyncMutationWriter({
        deviceId: "phase1-reopen",
        nowMs: () => 3000,
        createOpId: () => "20000000-0000-4000-8000-000000000001",
      }),
      new CloudSyncDiagnosticEntityCodec(),
    );
    if (
      repository.queryMarkedTags().map((item) => item.name).join("|") !== "cloud-a|cloud-b" ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions").count) !== 2 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 0
    ) {
      throw new CloudSyncMarkedTagRepositoryV2DiagnosticError("关闭重开后本地标签、版本或 outbox 不完整");
    }
  });
}

export function runCloudSyncMarkedTagRepositoryV2Diagnostic(): CloudSyncMarkedTagRepositoryV2DiagnosticResult {
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
    seededCount: 2,
    localAtomic: true,
    payloadExcludesUpstreamId: true,
    tombstoneIdentity: true,
    remoteOrdering: true,
    modeIsolation: true,
    reloginDiscard: true,
    rollbackAtomic: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
