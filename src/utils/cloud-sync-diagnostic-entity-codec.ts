import { SyncEntityEnvelopeCodec } from "../repositories/sync-entity-envelope-codec";
import { SyncVersion } from "../repositories/sync-mutation-writer";

interface DiagnosticEnvelope {
  format: 1;
  entityType: string;
  objectKey: string;
  wallMs: number;
  logicalCounter: number;
  deviceId: string;
  deleted: boolean;
  payload: unknown;
}

export class CloudSyncDiagnosticEntityCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncDiagnosticEntityCodecError";
  }
}

/**
 * 仅供隔离临时库与 Node fixture 使用的明文 codec。
 * 正式同步不得实例化它；生产实现必须替换为 HMAC object key 与 AEAD envelope。
 */
export class CloudSyncDiagnosticEntityCodec implements SyncEntityEnvelopeCodec {
  deriveObjectKey(entityType: string, entityId: string): string {
    return `diagnostic:${encodeURIComponent(entityType)}:${encodeURIComponent(entityId)}`;
  }

  encodeEnvelope(entityType: string, payload: unknown, version: SyncVersion): string {
    return JSON.stringify({
      format: 1,
      entityType,
      objectKey: version.objectKey,
      wallMs: version.wallMs,
      logicalCounter: version.logicalCounter,
      deviceId: version.deviceId,
      deleted: version.deleted,
      payload,
    } satisfies DiagnosticEnvelope);
  }

  decodeEnvelope(entityType: string, envelopeJson: string, version: SyncVersion): unknown {
    let value: unknown;
    try {
      value = JSON.parse(envelopeJson);
    } catch {
      throw new CloudSyncDiagnosticEntityCodecError("诊断 envelope 不是有效 JSON");
    }
    if (
      typeof value !== "object" ||
      value === null ||
      !("format" in value) ||
      value.format !== 1 ||
      !("entityType" in value) ||
      value.entityType !== entityType ||
      !("objectKey" in value) ||
      value.objectKey !== version.objectKey ||
      !("wallMs" in value) ||
      value.wallMs !== version.wallMs ||
      !("logicalCounter" in value) ||
      value.logicalCounter !== version.logicalCounter ||
      !("deviceId" in value) ||
      value.deviceId !== version.deviceId ||
      !("deleted" in value) ||
      value.deleted !== version.deleted ||
      !("payload" in value)
    ) {
      throw new CloudSyncDiagnosticEntityCodecError("诊断 envelope 与 entity type、object key 或 HLC 不匹配");
    }
    return value.payload;
  }
}
