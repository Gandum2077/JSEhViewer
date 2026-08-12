import { TagNamespace, tagNamespaces } from "ehentai-parser";
import { MarkedTag } from "../types";
import { SqliteTransactionContext } from "../utils/sqlite-safe";
import { MarkedTagMode, MarkedTagRepository } from "./marked-tag-repository";
import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";
import { SyncEntityEnvelopeCodec } from "./sync-entity-envelope-codec";
import { RemoteApplyResult, RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "./sync-mutation-writer";

export const LOCAL_MARKED_TAG_ENTITY_TYPE = "marked.tag.local.v1";

export interface LocalMarkedTagPayloadV1 {
  format: 1;
  namespace: TagNamespace;
  name: string;
  watched: boolean;
  hidden: boolean;
  color: string;
  weight: number;
}

export interface ApplyRemoteLocalMarkedTagResult extends RemoteApplyResult {
  namespace: TagNamespace;
  name: string;
  membershipPresent: boolean;
}

interface MarkedTagRow {
  tagid: number | null;
  namespace: string;
  name: string;
  watched: number | null;
  hidden: number | null;
  color: string | null;
  weight: number | null;
}

function requireLocalMode(mode: MarkedTagMode): void {
  if (mode !== MarkedTagMode.localSync) {
    throw new Error("E-Hentai My Tags 镜像模式不接受 D1 本地标签操作");
  }
}

function requireLocalUserOrigin(mode: MarkedTagMode, origin: MutationOrigin): void {
  requireLocalMode(mode);
  requireMutationOrigin(origin);
  if (origin !== MutationOrigin.user) {
    throw new Error("v2 本地标签操作只接受 user 来源；远端 change 必须携带版本元数据");
  }
}

function requireIdentity(namespace: TagNamespace, name: string): void {
  if (!tagNamespaces.includes(namespace)) throw new Error("标签命名空间无效");
  if (typeof name !== "string" || name.length === 0) throw new Error("标签名称不能为空");
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name}必须是布尔值`);
  return value;
}

function requireString(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`${name}必须是${allowEmpty ? "" : "非空"}字符串`);
  }
  return value;
}

function requireWeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("标签权重必须是有限数字");
  return value;
}

function normalizeTag(tag: MarkedTag): MarkedTag {
  requireIdentity(tag.namespace, tag.name);
  if (!Number.isSafeInteger(tag.tagid) || tag.tagid < 0) throw new Error("标签 ID 必须是非负安全整数");
  return {
    tagid: tag.tagid,
    namespace: tag.namespace,
    name: tag.name,
    watched: Boolean(tag.watched),
    hidden: Boolean(tag.hidden),
    color: tag.color || "",
    weight: requireWeight(tag.weight),
  };
}

function payloadFor(tag: MarkedTag): LocalMarkedTagPayloadV1 {
  return {
    format: 1,
    namespace: tag.namespace,
    name: tag.name,
    watched: Boolean(tag.watched),
    hidden: Boolean(tag.hidden),
    color: tag.color || "",
    weight: requireWeight(tag.weight),
  };
}

function parsePayload(value: unknown): LocalMarkedTagPayloadV1 {
  if (typeof value !== "object" || value === null) throw new Error("本地标签同步 payload 格式无效");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== 1) throw new Error("本地标签同步 payload 版本无效");
  const namespace = requireString(candidate.namespace, "标签命名空间") as TagNamespace;
  const name = requireString(candidate.name, "标签名称");
  requireIdentity(namespace, name);
  return {
    format: 1,
    namespace,
    name,
    watched: requireBoolean(candidate.watched, "标签 watched"),
    hidden: requireBoolean(candidate.hidden, "标签 hidden"),
    color: requireString(candidate.color, "标签颜色", true),
    weight: requireWeight(candidate.weight),
  };
}

function payloadFromRow(row: MarkedTagRow): LocalMarkedTagPayloadV1 {
  return parsePayload({
    format: 1,
    namespace: row.namespace,
    name: row.name,
    watched: row.watched === 1,
    hidden: row.hidden === 1,
    color: row.color || "",
    weight: Number(row.weight ?? 0),
  });
}

function samePayload(left: LocalMarkedTagPayloadV1, right: LocalMarkedTagPayloadV1): boolean {
  return (
    left.namespace === right.namespace &&
    left.name === right.name &&
    left.watched === right.watched &&
    left.hidden === right.hidden &&
    left.color === right.color &&
    left.weight === right.weight
  );
}

function asVersion(mutation: RemoteSyncMutation): SyncVersion {
  return {
    objectKey: mutation.objectKey,
    entityType: mutation.entityType,
    wallMs: mutation.wallMs,
    logicalCounter: mutation.logicalCounter,
    deviceId: mutation.deviceId,
    deleted: mutation.deleted,
    opId: mutation.opId,
  };
}

function writeLocalTag(
  transaction: SqliteTransactionContext,
  payload: LocalMarkedTagPayloadV1,
  tagid: number,
): void {
  transaction.update(
    `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(namespace, name) DO UPDATE SET
       tagid = excluded.tagid,
       watched = excluded.watched,
       hidden = excluded.hidden,
       color = excluded.color,
       weight = excluded.weight`,
    [tagid, payload.namespace, payload.name, payload.watched, payload.hidden, payload.color, payload.weight],
    "写入 v2 本地标签",
  );
}

/**
 * 仅处理 syncMyTags=0 的本地标签同步。
 * syncMyTags=1 时继承的上游整表镜像方法仍只写业务表，绝不产生 outbox。
 */
export class V2MarkedTagRepository extends MarkedTagRepository {
  constructor(
    database: RepositoryDatabase,
    private readonly syncWriter: SyncMutationWriter,
    private readonly codec: SyncEntityEnvelopeCodec,
  ) {
    super(database);
  }

  upsertLocalTag(tag: MarkedTag, mode: MarkedTagMode, origin: MutationOrigin): MarkedTag {
    requireLocalUserOrigin(mode, origin);
    const normalized = normalizeTag(tag);
    const nextPayload = payloadFor(normalized);
    return this.database.transaction((transaction) => {
      const existing = this.readRow(transaction, normalized.namespace, normalized.name);
      if (existing && samePayload(payloadFromRow(existing), nextPayload)) {
        if (Number(existing.tagid ?? 0) !== normalized.tagid) {
          transaction.update(
            "UPDATE marked_tags SET tagid = ? WHERE namespace = ? AND name = ?",
            [normalized.tagid, normalized.namespace, normalized.name],
            "更新本机专属标签 ID",
          );
        }
        return normalized;
      }
      writeLocalTag(transaction, nextPayload, normalized.tagid);
      this.recordLocalPayload(transaction, nextPayload, MutationOrigin.user);
      return normalized;
    }, "原子保存 v2 本地标签与 outbox");
  }

  deleteLocalTag(namespace: TagNamespace, name: string, mode: MarkedTagMode, origin: MutationOrigin): boolean {
    requireLocalUserOrigin(mode, origin);
    requireIdentity(namespace, name);
    return this.database.transaction((transaction) => {
      const existing = this.readRow(transaction, namespace, name);
      if (!existing) return false;
      const payload = payloadFromRow(existing);
      transaction.update("DELETE FROM marked_tags WHERE namespace = ? AND name = ?", [namespace, name]);
      this.recordLocalPayload(transaction, payload, MutationOrigin.user, true);
      return true;
    }, "原子删除 v2 本地标签并写入 tombstone");
  }

  seedExistingLocalTags(mode: MarkedTagMode): number {
    requireLocalMode(mode);
    return this.database.transaction((transaction) => {
      const rows = transaction.query<MarkedTagRow>(
        `SELECT tagid, namespace, name, watched, hidden, color, weight
         FROM marked_tags ORDER BY rowid`,
      );
      let seeded = 0;
      for (const row of rows) {
        const payload = payloadFromRow(row);
        const objectKey = this.objectKey(payload.namespace, payload.name);
        const existingVersion = transaction.query<{ found: number }>(
          "SELECT 1 AS found FROM sync_versions WHERE object_key = ? LIMIT 1",
          [objectKey],
        )[0];
        if (existingVersion) continue;
        this.recordLocalPayload(transaction, payload, MutationOrigin.migrationSeed);
        seeded += 1;
      }
      return seeded;
    }, "seed v2 本地标签同步状态");
  }

  applyRemoteLocalTag(
    mutation: RemoteSyncMutation,
    mode: MarkedTagMode,
  ): ApplyRemoteLocalMarkedTagResult {
    requireLocalMode(mode);
    if (mutation.entityType !== LOCAL_MARKED_TAG_ENTITY_TYPE) {
      throw new Error("远端 change 的 entity type 不是 local marked tag v1");
    }
    const version = asVersion(mutation);
    const payload = parsePayload(
      this.codec.decodeEnvelope(LOCAL_MARKED_TAG_ENTITY_TYPE, mutation.envelopeJson, version),
    );
    if (this.objectKey(payload.namespace, payload.name) !== mutation.objectKey) {
      throw new Error("本地标签 payload 与 object key 不匹配");
    }
    return this.database.transaction((transaction) => {
      const result = this.syncWriter.applyRemoteMutation(transaction, mutation, (businessTransaction) => {
        if (mutation.deleted) {
          businessTransaction.update("DELETE FROM marked_tags WHERE namespace = ? AND name = ?", [
            payload.namespace,
            payload.name,
          ]);
        } else {
          // tagid 是 E-Hentai 镜像字段，不属于本地标签同步 payload。
          writeLocalTag(businessTransaction, payload, 0);
        }
      });
      const membershipPresent = Boolean(
        transaction.query<{ found: number }>(
          "SELECT 1 AS found FROM marked_tags WHERE namespace = ? AND name = ? LIMIT 1",
          [payload.namespace, payload.name],
        )[0],
      );
      return { ...result, namespace: payload.namespace, name: payload.name, membershipPresent };
    }, "原子应用远端 local marked tag change");
  }

  clearForRelogin(origin: MutationOrigin): number {
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.localMaintenance) {
      throw new Error("重新登录清理必须标记为本机维护操作");
    }
    return this.database.transaction((transaction) => {
      const count = Number(transaction.query<{ count: number }>("SELECT COUNT(*) AS count FROM marked_tags")[0]?.count);
      transaction.update("DELETE FROM marked_tags", undefined, "重新登录清空标签业务表");
      transaction.update(
        "DELETE FROM sync_versions WHERE entity_type = ?",
        [LOCAL_MARKED_TAG_ENTITY_TYPE],
        "重新登录丢弃本地标签版本与 outbox",
      );
      return count;
    }, "重新登录前原子清空标签模式数据与本地同步状态");
  }

  private entityId(namespace: TagNamespace, name: string): string {
    requireIdentity(namespace, name);
    return JSON.stringify([namespace, name]);
  }

  private objectKey(namespace: TagNamespace, name: string): string {
    return this.codec.deriveObjectKey(LOCAL_MARKED_TAG_ENTITY_TYPE, this.entityId(namespace, name));
  }

  private readRow(
    transaction: SqliteTransactionContext,
    namespace: TagNamespace,
    name: string,
  ): MarkedTagRow | undefined {
    return transaction.query<MarkedTagRow>(
      `SELECT tagid, namespace, name, watched, hidden, color, weight
       FROM marked_tags WHERE namespace = ? AND name = ?`,
      [namespace, name],
    )[0];
  }

  private recordLocalPayload(
    transaction: SqliteTransactionContext,
    payload: LocalMarkedTagPayloadV1,
    origin: typeof MutationOrigin.user | typeof MutationOrigin.migrationSeed,
    deleted = false,
  ): SyncVersion {
    return this.syncWriter.recordLocalMutation(transaction, {
      origin,
      objectKey: this.objectKey(payload.namespace, payload.name),
      entityType: LOCAL_MARKED_TAG_ENTITY_TYPE,
      deleted,
      createEnvelopeJson: (createdVersion) =>
        this.codec.encodeEnvelope(LOCAL_MARKED_TAG_ENTITY_TYPE, payload, createdVersion),
    });
  }
}
