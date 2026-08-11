import { SyncVersion } from "./sync-mutation-writer";

/**
 * 实体 adapter 与具体密码学实现之间的唯一边界。
 *
 * 生产实现将持有 profile epoch、data/index key，并用 version 中的 object key、HLC 与删除标志构造 AAD。
 * Repository 不应自行拼 HMAC、nonce、密文或明文调试 envelope。
 */
export interface SyncEntityEnvelopeCodec {
  deriveObjectKey(entityType: string, entityId: string): string;
  encodeEnvelope(entityType: string, payload: unknown, version: SyncVersion): string;
  decodeEnvelope(entityType: string, envelopeJson: string, version: SyncVersion): unknown;
}
