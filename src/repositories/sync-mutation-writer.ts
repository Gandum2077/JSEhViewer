import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { SqliteTransactionContext } from "../utils/sqlite-safe";

export interface SyncVersion {
  objectKey: string;
  entityType: string;
  wallMs: number;
  logicalCounter: number;
  deviceId: string;
  deleted: boolean;
  opId: string;
}

export interface LocalSyncMutation {
  origin: typeof MutationOrigin.user | typeof MutationOrigin.migrationSeed;
  objectKey: string;
  entityType: string;
  deleted: boolean;
  envelopeJson?: string | null;
}

export interface RemoteSyncMutation extends SyncVersion {
  origin: typeof MutationOrigin.remote;
  envelopeJson?: string | null;
}

export interface LocalSyncDiscard {
  origin: typeof MutationOrigin.user | typeof MutationOrigin.localMaintenance;
  objectKey: string;
}

export interface SyncMutationRuntime {
  deviceId: string;
  nowMs: () => number;
  createOpId: () => string;
  formatCreatedAt?: (wallMs: number) => string;
}

export interface RemoteApplyResult {
  applied: boolean;
  version: SyncVersion;
}

interface StoredVersionRow {
  object_key: string;
  entity_type: string;
  wall_ms: number;
  logical_counter: number;
  device_id: string;
  deleted: number;
  last_op_id: string;
}

interface ClockRow {
  wall_ms: number;
  logical_counter: number;
}

interface ClockValue {
  wallMs: number;
  logicalCounter: number;
}

export class SyncMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncMutationError";
  }
}

function requireNonEmpty(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SyncMutationError(`${name}不能为空`);
  }
  return value;
}

function requireClockInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SyncMutationError(`${name}必须是非负安全整数`);
  }
  return value;
}

function incrementLogical(value: number): number {
  if (value >= Number.MAX_SAFE_INTEGER) {
    throw new SyncMutationError("HLC logical counter 已达到安全整数上限");
  }
  return value + 1;
}

function requireEnvelope(deleted: boolean, envelopeJson?: string | null): string | null {
  if (deleted) {
    if (envelopeJson !== undefined && envelopeJson !== null) {
      throw new SyncMutationError("删除操作不能携带同步 payload");
    }
    return null;
  }
  if (typeof envelopeJson !== "string" || envelopeJson.length === 0) {
    throw new SyncMutationError("非删除操作必须携带同步 payload");
  }
  return envelopeJson;
}

function rowToVersion(row: StoredVersionRow): SyncVersion {
  return {
    objectKey: row.object_key,
    entityType: row.entity_type,
    wallMs: row.wall_ms,
    logicalCounter: row.logical_counter,
    deviceId: row.device_id,
    deleted: row.deleted === 1,
    opId: row.last_op_id,
  };
}

function compareVersions(left: SyncVersion, right: SyncVersion): number {
  if (left.wallMs !== right.wallMs) return left.wallMs < right.wallMs ? -1 : 1;
  if (left.logicalCounter !== right.logicalCounter) {
    return left.logicalCounter < right.logicalCounter ? -1 : 1;
  }
  if (left.deviceId === right.deviceId) return 0;
  return left.deviceId < right.deviceId ? -1 : 1;
}

function readStoredVersion(transaction: SqliteTransactionContext, objectKey: string): SyncVersion | undefined {
  const row = transaction.query<StoredVersionRow>(
    `SELECT object_key, entity_type, wall_ms, logical_counter, device_id, deleted, last_op_id
     FROM sync_versions
     WHERE object_key = ?`,
    [objectKey],
    "读取对象同步版本",
  )[0];
  return row ? rowToVersion(row) : undefined;
}

function requireSameEntityType(existing: SyncVersion | undefined, entityType: string): void {
  if (existing && existing.entityType !== entityType) {
    throw new SyncMutationError("同一 object key 不能改变 entity type");
  }
}

export class SyncMutationWriter {
  private readonly _deviceId: string;
  private readonly _nowMs: () => number;
  private readonly _createOpId: () => string;
  private readonly _formatCreatedAt: (wallMs: number) => string;

  constructor(runtime: SyncMutationRuntime) {
    this._deviceId = requireNonEmpty(runtime.deviceId, "device id");
    this._nowMs = runtime.nowMs;
    this._createOpId = runtime.createOpId;
    this._formatCreatedAt = runtime.formatCreatedAt || ((wallMs) => new Date(wallMs).toISOString());
  }

  recordLocalMutation(transaction: SqliteTransactionContext, mutation: LocalSyncMutation): SyncVersion {
    requireMutationOrigin(mutation.origin);
    if (mutation.origin !== MutationOrigin.user && mutation.origin !== MutationOrigin.migrationSeed) {
      throw new SyncMutationError("只有用户操作或首次迁移 seed 可以写入 outbox");
    }
    const objectKey = requireNonEmpty(mutation.objectKey, "object key");
    const entityType = requireNonEmpty(mutation.entityType, "entity type");
    const envelopeJson = requireEnvelope(mutation.deleted, mutation.envelopeJson);
    const existing = readStoredVersion(transaction, objectKey);
    requireSameEntityType(existing, entityType);
    const clock = this._advanceClock(transaction, existing);
    const opId = requireNonEmpty(this._createOpId(), "operation id");
    const version: SyncVersion = {
      objectKey,
      entityType,
      wallMs: clock.wallMs,
      logicalCounter: clock.logicalCounter,
      deviceId: this._deviceId,
      deleted: mutation.deleted,
      opId,
    };

    this._upsertVersion(transaction, version);
    transaction.update(
      `INSERT INTO sync_outbox
       (op_id, object_key, wall_ms, logical_counter, device_id, deleted, envelope_json,
        created_at, attempt_count, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
       ON CONFLICT(object_key) DO UPDATE SET
         op_id = excluded.op_id,
         wall_ms = excluded.wall_ms,
         logical_counter = excluded.logical_counter,
         device_id = excluded.device_id,
         deleted = excluded.deleted,
         envelope_json = excluded.envelope_json,
         created_at = excluded.created_at,
         attempt_count = 0,
         next_attempt_at = NULL`,
      [
        version.opId,
        version.objectKey,
        version.wallMs,
        version.logicalCounter,
        version.deviceId,
        version.deleted ? 1 : 0,
        envelopeJson,
        this._formatCreatedAt(requireClockInteger(this._nowMs(), "当前时间")),
      ],
      "写入或合并同步 outbox",
    );
    return version;
  }

  applyRemoteMutation(
    transaction: SqliteTransactionContext,
    mutation: RemoteSyncMutation,
    applyBusinessMutation: (transaction: SqliteTransactionContext) => void,
  ): RemoteApplyResult {
    requireMutationOrigin(mutation.origin);
    if (mutation.origin !== MutationOrigin.remote) {
      throw new SyncMutationError("远端 apply 必须明确使用 remote 来源");
    }
    const remote: SyncVersion = {
      objectKey: requireNonEmpty(mutation.objectKey, "object key"),
      entityType: requireNonEmpty(mutation.entityType, "entity type"),
      wallMs: requireClockInteger(mutation.wallMs, "远端 wall time"),
      logicalCounter: requireClockInteger(mutation.logicalCounter, "远端 logical counter"),
      deviceId: requireNonEmpty(mutation.deviceId, "远端 device id"),
      deleted: mutation.deleted,
      opId: requireNonEmpty(mutation.opId, "远端 operation id"),
    };
    requireEnvelope(remote.deleted, mutation.envelopeJson);
    const existing = readStoredVersion(transaction, remote.objectKey);
    requireSameEntityType(existing, remote.entityType);
    this._advanceClock(transaction, remote);

    if (existing && compareVersions(remote, existing) <= 0) {
      return { applied: false, version: existing };
    }

    applyBusinessMutation(transaction);
    transaction.update(
      "DELETE FROM sync_outbox WHERE object_key = ?",
      [remote.objectKey],
      "取消被远端获胜版本取代的 outbox",
    );
    this._upsertVersion(transaction, remote);
    return { applied: true, version: remote };
  }

  acknowledgeOperations(transaction: SqliteTransactionContext, opIds: readonly string[]): void {
    const uniqueOpIds = new Set(opIds.map((opId) => requireNonEmpty(opId, "acknowledged operation id")));
    for (const opId of uniqueOpIds) {
      transaction.update("DELETE FROM sync_outbox WHERE op_id = ?", [opId], "确认同步 outbox 操作");
    }
  }

  discardLocalObject(transaction: SqliteTransactionContext, discard: LocalSyncDiscard): void {
    requireMutationOrigin(discard.origin);
    if (discard.origin !== MutationOrigin.user && discard.origin !== MutationOrigin.localMaintenance) {
      throw new SyncMutationError("只有用户本机删除或本机维护可以丢弃本地同步状态");
    }
    transaction.update(
      "DELETE FROM sync_versions WHERE object_key = ?",
      [requireNonEmpty(discard.objectKey, "object key")],
      "丢弃对象本机同步版本",
    );
  }

  private _readClock(transaction: SqliteTransactionContext): ClockValue {
    transaction.update(
      "INSERT INTO sync_clock (id) VALUES (1) ON CONFLICT(id) DO NOTHING",
      undefined,
      "初始化本机同步逻辑时钟",
    );
    const row = transaction.query<ClockRow>(
      "SELECT wall_ms, logical_counter FROM sync_clock WHERE id = 1",
      undefined,
      "读取本机同步逻辑时钟",
    )[0];
    if (!row) throw new SyncMutationError("无法读取本机同步逻辑时钟");
    return {
      wallMs: requireClockInteger(row.wall_ms, "本机 wall time"),
      logicalCounter: requireClockInteger(row.logical_counter, "本机 logical counter"),
    };
  }

  private _advanceClock(transaction: SqliteTransactionContext, observed?: SyncVersion): ClockValue {
    const current = this._readClock(transaction);
    const now = requireClockInteger(this._nowMs(), "当前时间");
    const observedWall = observed?.wallMs ?? -1;
    const maxWall = Math.max(current.wallMs, now, observedWall);
    let logicalCounter: number;
    if (maxWall === current.wallMs && maxWall === observedWall) {
      logicalCounter = incrementLogical(Math.max(current.logicalCounter, observed?.logicalCounter ?? 0));
    } else if (maxWall === current.wallMs) {
      logicalCounter = incrementLogical(current.logicalCounter);
    } else if (maxWall === observedWall) {
      logicalCounter = incrementLogical(observed?.logicalCounter ?? 0);
    } else {
      logicalCounter = 0;
    }
    transaction.update(
      "UPDATE sync_clock SET wall_ms = ?, logical_counter = ? WHERE id = 1",
      [maxWall, logicalCounter],
      "推进本机同步逻辑时钟",
    );
    return { wallMs: maxWall, logicalCounter };
  }

  private _upsertVersion(transaction: SqliteTransactionContext, version: SyncVersion): void {
    transaction.update(
      `INSERT INTO sync_versions
       (object_key, entity_type, wall_ms, logical_counter, device_id, deleted, last_op_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(object_key) DO UPDATE SET
         entity_type = excluded.entity_type,
         wall_ms = excluded.wall_ms,
         logical_counter = excluded.logical_counter,
         device_id = excluded.device_id,
         deleted = excluded.deleted,
         last_op_id = excluded.last_op_id`,
      [
        version.objectKey,
        version.entityType,
        version.wallMs,
        version.logicalCounter,
        version.deviceId,
        version.deleted ? 1 : 0,
        version.opId,
      ],
      "写入对象同步版本",
    );
  }
}
