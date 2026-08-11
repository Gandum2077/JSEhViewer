import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";
import { SyncEntityEnvelopeCodec } from "./sync-entity-envelope-codec";
import { RemoteApplyResult, RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "./sync-mutation-writer";
import {
  ReplaceBannedUploadersResult,
  requireUploader,
  uniqueUploaders,
  UploaderRepository,
} from "./uploader-repository";

export const MARKED_UPLOADER_ENTITY_TYPE = "marked.uploader.v1";

export interface MarkedUploaderPayloadV1 {
  format: 1;
  uploader: string;
}

export interface ApplyRemoteMarkedUploaderResult extends RemoteApplyResult {
  uploader: string;
  membershipPresent: boolean;
  blockedByBannedUploader: boolean;
}

function payloadFor(uploader: string): MarkedUploaderPayloadV1 {
  return { format: 1, uploader };
}

function parsePayload(value: unknown): MarkedUploaderPayloadV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    !("format" in value) ||
    value.format !== 1 ||
    !("uploader" in value) ||
    typeof value.uploader !== "string"
  ) {
    throw new Error("marked uploader 同步 payload 格式无效");
  }
  requireUploader(value.uploader);
  return { format: 1, uploader: value.uploader };
}

function requireLocalUserOrigin(origin: MutationOrigin): void {
  requireMutationOrigin(origin);
  if (origin !== MutationOrigin.user) {
    throw new Error("v2 标记上传者的本机操作只接受 user 来源；远端 change 必须携带版本元数据");
  }
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

export class V2UploaderRepository extends UploaderRepository {
  constructor(
    database: RepositoryDatabase,
    private readonly syncWriter: SyncMutationWriter,
    private readonly codec: SyncEntityEnvelopeCodec,
  ) {
    super(database);
  }

  addMarkedUploader(uploader: string, origin: MutationOrigin): boolean {
    requireLocalUserOrigin(origin);
    requireUploader(uploader);
    return this.database.transaction((transaction) => {
      const banned = transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM banned_uploaders WHERE uploader = ? LIMIT 1",
        [uploader],
      )[0];
      if (banned) return false;
      const existing = transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM marked_uploaders WHERE uploader = ? LIMIT 1",
        [uploader],
      )[0];
      if (existing) return false;

      transaction.update("INSERT INTO marked_uploaders (uploader) VALUES (?)", [uploader]);
      const objectKey = this.codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, uploader);
      this.syncWriter.recordLocalMutation(transaction, {
        origin: MutationOrigin.user,
        objectKey,
        entityType: MARKED_UPLOADER_ENTITY_TYPE,
        deleted: false,
        createEnvelopeJson: (version) =>
          this.codec.encodeEnvelope(MARKED_UPLOADER_ENTITY_TYPE, payloadFor(uploader), version),
      });
      return true;
    }, "v2 标记上传者并写入 outbox");
  }

  deleteMarkedUploader(uploader: string, origin: MutationOrigin): boolean {
    requireLocalUserOrigin(origin);
    requireUploader(uploader);
    return this.database.transaction((transaction) => {
      const existing = transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM marked_uploaders WHERE uploader = ? LIMIT 1",
        [uploader],
      )[0];
      if (!existing) return false;

      transaction.update("DELETE FROM marked_uploaders WHERE uploader = ?", [uploader]);
      const objectKey = this.codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, uploader);
      this.syncWriter.recordLocalMutation(transaction, {
        origin: MutationOrigin.user,
        objectKey,
        entityType: MARKED_UPLOADER_ENTITY_TYPE,
        deleted: true,
        createEnvelopeJson: (version) =>
          this.codec.encodeEnvelope(MARKED_UPLOADER_ENTITY_TYPE, payloadFor(uploader), version),
      });
      return true;
    }, "v2 取消标记上传者并写入 tombstone");
  }

  seedExistingMarkedUploaders(): number {
    return this.database.transaction((transaction) => {
      const uploaders = transaction
        .query<{ uploader: string }>(
          `SELECT marked.uploader
           FROM marked_uploaders AS marked
           LEFT JOIN banned_uploaders AS banned ON banned.uploader = marked.uploader
           WHERE banned.uploader IS NULL
           ORDER BY marked.rowid`,
        )
        .map((row) => row.uploader);
      let seeded = 0;
      for (const uploader of uploaders) {
        requireUploader(uploader);
        const objectKey = this.codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, uploader);
        const existingVersion = transaction.query<{ found: number }>(
          "SELECT 1 AS found FROM sync_versions WHERE object_key = ? LIMIT 1",
          [objectKey],
        )[0];
        if (existingVersion) continue;
        this.syncWriter.recordLocalMutation(transaction, {
          origin: MutationOrigin.migrationSeed,
          objectKey,
          entityType: MARKED_UPLOADER_ENTITY_TYPE,
          deleted: false,
          createEnvelopeJson: (version) =>
            this.codec.encodeEnvelope(MARKED_UPLOADER_ENTITY_TYPE, payloadFor(uploader), version),
        });
        seeded += 1;
      }
      return seeded;
    }, "seed v2 标记上传者同步状态");
  }

  applyRemoteMarkedUploader(mutation: RemoteSyncMutation): ApplyRemoteMarkedUploaderResult {
    if (mutation.entityType !== MARKED_UPLOADER_ENTITY_TYPE) {
      throw new Error("远端 change 的 entity type 不是 marked uploader v1");
    }
    if (typeof mutation.envelopeJson !== "string" || mutation.envelopeJson.length === 0) {
      throw new Error("marked uploader 的远端 change 必须携带可解密的实体身份");
    }
    const version = asVersion(mutation);
    const payload = parsePayload(
      this.codec.decodeEnvelope(MARKED_UPLOADER_ENTITY_TYPE, mutation.envelopeJson, version),
    );
    const expectedObjectKey = this.codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, payload.uploader);
    if (expectedObjectKey !== mutation.objectKey) {
      throw new Error("marked uploader payload 与 object key 不匹配");
    }

    return this.database.transaction((transaction) => {
      let blockedByBannedUploader = false;
      const result = this.syncWriter.applyRemoteMutation(transaction, mutation, (businessTransaction) => {
        if (mutation.deleted) {
          businessTransaction.update("DELETE FROM marked_uploaders WHERE uploader = ?", [payload.uploader]);
          return;
        }
        blockedByBannedUploader = Boolean(
          businessTransaction.query<{ found: number }>(
            "SELECT 1 AS found FROM banned_uploaders WHERE uploader = ? LIMIT 1",
            [payload.uploader],
          )[0],
        );
        if (!blockedByBannedUploader) {
          businessTransaction.update(
            "INSERT INTO marked_uploaders (uploader) VALUES (?) ON CONFLICT(uploader) DO NOTHING",
            [payload.uploader],
          );
        }
      });
      const membershipPresent = Boolean(
        transaction.query<{ found: number }>("SELECT 1 AS found FROM marked_uploaders WHERE uploader = ? LIMIT 1", [
          payload.uploader,
        ])[0],
      );
      return {
        ...result,
        uploader: payload.uploader,
        membershipPresent,
        blockedByBannedUploader,
      };
    }, "原子应用远端 marked uploader change");
  }

  replaceBannedUploaders(uploaders: string[], origin: MutationOrigin): ReplaceBannedUploadersResult {
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.upstreamMirror) {
      throw new Error("屏蔽上传者表只能由上游镜像刷新");
    }
    const unique = uniqueUploaders(uploaders);
    return this.database.transaction((transaction) => {
      transaction.update("DELETE FROM banned_uploaders");
      for (const uploader of unique) {
        transaction.update("INSERT INTO banned_uploaders (uploader) VALUES (?)", [uploader]);
      }
      const removedMarkedUploaders = transaction
        .query<{ uploader: string }>(
          `SELECT marked.uploader
           FROM marked_uploaders AS marked
           JOIN banned_uploaders AS banned ON banned.uploader = marked.uploader
           ORDER BY marked.rowid`,
        )
        .map((row) => row.uploader);
      transaction.update(
        `DELETE FROM marked_uploaders
         WHERE uploader IN (SELECT uploader FROM banned_uploaders)`,
      );
      for (const uploader of removedMarkedUploaders) {
        const objectKey = this.codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, uploader);
        const pendingLocalMutation = transaction.query<{ found: number }>(
          "SELECT 1 AS found FROM sync_outbox WHERE object_key = ? LIMIT 1",
          [objectKey],
        )[0];
        if (pendingLocalMutation) {
          this.syncWriter.discardLocalObject(transaction, {
            origin: MutationOrigin.localMaintenance,
            objectKey,
          });
        }
      }
      const markedUploaders = transaction
        .query<{ uploader: string }>("SELECT uploader FROM marked_uploaders ORDER BY rowid")
        .map((row) => row.uploader);
      const bannedUploaders = transaction
        .query<{ uploader: string }>("SELECT uploader FROM banned_uploaders ORDER BY rowid")
        .map((row) => row.uploader);
      return { bannedUploaders, markedUploaders, removedMarkedUploaders };
    }, "刷新 v2 上游屏蔽上传者镜像");
  }
}
