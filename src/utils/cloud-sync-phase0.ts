import Url from "url-parse";

const KEYCHAIN_DOMAIN = "com.gandum2077.jsehviewer.cloud-sync.phase0";
const PROFILE_KEY = "profile";
const BOOTSTRAP_SECRET_KEY = "bootstrap-secret";
const PENDING_BOOTSTRAP_KEY = "pending-bootstrap";
const REGISTRATION_KEY = "registration";
const KEYCHAIN_TEST_KEY = "keychain-self-test";

const BASE64URL_32_BYTES_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const CLOUD_SYNC_PROTOCOL = 1;
export const CLOUD_SYNC_SCHEMA_VERSION = 1;

export interface CloudSyncConnectionPackage {
  format: 1;
  kind: "jsehviewer-sync-bootstrap";
  endpoint: string;
  bootstrap_secret: string;
  master_key: string;
  recovery_secret: string;
  profile_epoch: string;
  created_at: string;
}

export interface CloudSyncStoredProfile {
  format: 1;
  kind: "jsehviewer-sync-profile";
  endpoint: string;
  master_key: string;
  recovery_secret: string;
  profile_epoch: string;
  created_at: string;
}

export interface CloudSyncPendingBootstrap {
  format: 1;
  endpoint: string;
  device_id: string;
  device_token: string;
  profile_epoch: string;
  recovery_token_hash: string;
  created_at: string;
}

export interface CloudSyncRegistration {
  format: 1;
  endpoint: string;
  device_id: string;
  device_token: string;
  profile_epoch: string;
  cursor: number;
  registered_at: string;
}

export interface CloudSyncWorkerInfo {
  service: string;
  phase: string;
  worker_version: string;
  protocol_min: number;
  protocol_max: number;
  schema_version: number;
  initialized: boolean;
  ready: boolean;
  checks: {
    database: string;
    migrations: string;
    bootstrap_secret: string;
  };
  server_time_ms: number;
}

export interface CloudSyncBootstrapResponse {
  protocol: number;
  profile_epoch: string;
  device_id: string;
  initialized: true;
  replayed: boolean;
  cursor: number;
  server_time_ms: number;
}

export class CloudSyncPhase0Error extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CloudSyncPhase0Error";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new CloudSyncPhase0Error(`连接包字段 ${key} 必须是非空字符串。`, "invalid-package");
  }
  return value;
}

function requireBase64Url32Bytes(value: string, key: string): string {
  if (!BASE64URL_32_BYTES_PATTERN.test(value)) {
    throw new CloudSyncPhase0Error(`连接包字段 ${key} 不是 32 字节 base64url。`, "invalid-package");
  }
  return value;
}

function requireUuidV4(value: string, key: string): string {
  if (!UUID_V4_PATTERN.test(value)) {
    throw new CloudSyncPhase0Error(`连接包字段 ${key} 不是 UUID v4。`, "invalid-package");
  }
  return value.toLowerCase();
}

function normalizeEndpoint(value: string): string {
  const endpoint = value.trim();
  const parsed = new Url(endpoint);
  if (parsed.protocol !== "https:" || !parsed.hostname) {
    throw new CloudSyncPhase0Error("同步服务地址必须是有效的 HTTPS 地址。", "invalid-endpoint");
  }
  if (parsed.username || parsed.password || parsed.query || parsed.hash) {
    throw new CloudSyncPhase0Error("同步服务地址不能包含账号、密码、查询参数或锚点。", "invalid-endpoint");
  }
  return endpoint.replace(/\/+$/u, "");
}

function parseJsonObject(text: string, description: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CloudSyncPhase0Error(`${description}不是有效的 JSON。`, "invalid-json");
  }
  if (!isRecord(value)) {
    throw new CloudSyncPhase0Error(`${description}必须是 JSON 对象。`, "invalid-json");
  }
  return value;
}

export function parseCloudSyncConnectionPackage(text: string): CloudSyncConnectionPackage {
  if (text.length > 32 * 1024) {
    throw new CloudSyncPhase0Error("连接包超过 32 KiB 上限。", "package-too-large");
  }
  const object = parseJsonObject(text, "连接包");
  if (object.format !== 1) {
    throw new CloudSyncPhase0Error("只支持 format=1 的连接包。", "unsupported-format");
  }
  if (object.kind !== "jsehviewer-sync-bootstrap") {
    throw new CloudSyncPhase0Error("这不是 JSEhViewer 首台设备连接包。", "invalid-kind");
  }

  const createdAt = requireString(object, "created_at");
  if (createdAt.length > 64 || Number.isNaN(Date.parse(createdAt))) {
    throw new CloudSyncPhase0Error("连接包的 created_at 不是有效日期。", "invalid-package");
  }

  const rawEndpoint = requireString(object, "endpoint");
  if (rawEndpoint.length > 2048) {
    throw new CloudSyncPhase0Error("连接包的 endpoint 过长。", "invalid-endpoint");
  }

  return {
    format: 1,
    kind: "jsehviewer-sync-bootstrap",
    endpoint: normalizeEndpoint(rawEndpoint),
    bootstrap_secret: requireBase64Url32Bytes(requireString(object, "bootstrap_secret"), "bootstrap_secret"),
    master_key: requireBase64Url32Bytes(requireString(object, "master_key"), "master_key"),
    recovery_secret: requireBase64Url32Bytes(requireString(object, "recovery_secret"), "recovery_secret"),
    profile_epoch: requireUuidV4(requireString(object, "profile_epoch"), "profile_epoch"),
    created_at: createdAt,
  };
}

function readKey(key: string): string | undefined {
  const value = $keychain.get(key, KEYCHAIN_DOMAIN);
  return value || undefined;
}

function writeKey(key: string, value: string): void {
  if (!$keychain.set(key, value, KEYCHAIN_DOMAIN)) {
    throw new CloudSyncPhase0Error("无法写入 JSBox Keychain。", "keychain-write-failed");
  }
  if (readKey(key) !== value) {
    throw new CloudSyncPhase0Error("JSBox Keychain 写入后读回不一致。", "keychain-verify-failed");
  }
}

function removeKey(key: string): void {
  if (readKey(key) !== undefined && !$keychain.remove(key, KEYCHAIN_DOMAIN)) {
    throw new CloudSyncPhase0Error("无法从 JSBox Keychain 删除测试凭据。", "keychain-remove-failed");
  }
}

function readJsonKey<T>(key: string, description: string): T | undefined {
  const text = readKey(key);
  if (text === undefined) return undefined;
  return parseJsonObject(text, description) as T;
}

function validateStoredProfile(value: CloudSyncStoredProfile): CloudSyncStoredProfile {
  if (
    value.format !== 1 ||
    value.kind !== "jsehviewer-sync-profile" ||
    typeof value.endpoint !== "string" ||
    typeof value.master_key !== "string" ||
    typeof value.recovery_secret !== "string" ||
    typeof value.profile_epoch !== "string" ||
    typeof value.created_at !== "string"
  ) {
    throw new CloudSyncPhase0Error("Keychain 中的同步资料格式无效。", "invalid-local-profile");
  }
  return {
    ...value,
    endpoint: normalizeEndpoint(value.endpoint),
    master_key: requireBase64Url32Bytes(value.master_key, "master_key"),
    recovery_secret: requireBase64Url32Bytes(value.recovery_secret, "recovery_secret"),
    profile_epoch: requireUuidV4(value.profile_epoch, "profile_epoch"),
  };
}

export function getCloudSyncStoredProfile(): CloudSyncStoredProfile | undefined {
  const value = readJsonKey<CloudSyncStoredProfile>(PROFILE_KEY, "本机同步资料");
  return value === undefined ? undefined : validateStoredProfile(value);
}

export function getCloudSyncBootstrapSecret(): string | undefined {
  const value = readKey(BOOTSTRAP_SECRET_KEY);
  if (value === undefined) return undefined;
  if (!BASE64URL_32_BYTES_PATTERN.test(value)) {
    throw new CloudSyncPhase0Error("Keychain 中的一次性部署密钥格式无效。", "invalid-bootstrap-secret");
  }
  return value;
}

function validatePending(value: CloudSyncPendingBootstrap): CloudSyncPendingBootstrap {
  if (
    value.format !== 1 ||
    typeof value.endpoint !== "string" ||
    typeof value.device_id !== "string" ||
    typeof value.device_token !== "string" ||
    typeof value.profile_epoch !== "string" ||
    typeof value.recovery_token_hash !== "string" ||
    typeof value.created_at !== "string"
  ) {
    throw new CloudSyncPhase0Error("Keychain 中的待注册身份格式无效。", "invalid-pending-bootstrap");
  }
  return {
    ...value,
    endpoint: normalizeEndpoint(value.endpoint),
    device_id: requireUuidV4(value.device_id, "device_id"),
    device_token: requireBase64Url32Bytes(value.device_token, "device_token"),
    profile_epoch: requireUuidV4(value.profile_epoch, "profile_epoch"),
    recovery_token_hash: requireBase64Url32Bytes(value.recovery_token_hash, "recovery_token_hash"),
  };
}

export function getCloudSyncPendingBootstrap(): CloudSyncPendingBootstrap | undefined {
  const value = readJsonKey<CloudSyncPendingBootstrap>(PENDING_BOOTSTRAP_KEY, "待注册身份");
  return value === undefined ? undefined : validatePending(value);
}

function validateRegistration(value: CloudSyncRegistration): CloudSyncRegistration {
  if (
    value.format !== 1 ||
    typeof value.endpoint !== "string" ||
    typeof value.device_id !== "string" ||
    typeof value.device_token !== "string" ||
    typeof value.profile_epoch !== "string" ||
    typeof value.cursor !== "number" ||
    typeof value.registered_at !== "string"
  ) {
    throw new CloudSyncPhase0Error("Keychain 中的设备注册信息格式无效。", "invalid-registration");
  }
  return {
    ...value,
    endpoint: normalizeEndpoint(value.endpoint),
    device_id: requireUuidV4(value.device_id, "device_id"),
    device_token: requireBase64Url32Bytes(value.device_token, "device_token"),
    profile_epoch: requireUuidV4(value.profile_epoch, "profile_epoch"),
  };
}

export function getCloudSyncRegistration(): CloudSyncRegistration | undefined {
  const value = readJsonKey<CloudSyncRegistration>(REGISTRATION_KEY, "设备注册信息");
  return value === undefined ? undefined : validateRegistration(value);
}

export function saveCloudSyncConnectionPackage(value: CloudSyncConnectionPackage): void {
  let preserveDeviceState = false;
  try {
    const current = getCloudSyncStoredProfile();
    preserveDeviceState =
      current?.endpoint === value.endpoint &&
      current.profile_epoch === value.profile_epoch &&
      current.master_key === value.master_key &&
      current.recovery_secret === value.recovery_secret;
  } catch {
    preserveDeviceState = false;
  }
  if (!preserveDeviceState) clearCloudSyncPhase0Credentials();
  const profile: CloudSyncStoredProfile = {
    format: 1,
    kind: "jsehviewer-sync-profile",
    endpoint: value.endpoint,
    master_key: value.master_key,
    recovery_secret: value.recovery_secret,
    profile_epoch: value.profile_epoch,
    created_at: value.created_at,
  };

  try {
    writeKey(PROFILE_KEY, JSON.stringify(profile));
    writeKey(BOOTSTRAP_SECRET_KEY, value.bootstrap_secret);
  } catch (error) {
    if (!preserveDeviceState) clearCloudSyncPhase0Credentials();
    throw error;
  }
}

export function saveCloudSyncPendingBootstrap(value: CloudSyncPendingBootstrap): void {
  writeKey(PENDING_BOOTSTRAP_KEY, JSON.stringify(validatePending(value)));
}

export function completeCloudSyncBootstrap(
  pending: CloudSyncPendingBootstrap,
  response: CloudSyncBootstrapResponse,
): CloudSyncRegistration {
  const registration: CloudSyncRegistration = {
    format: 1,
    endpoint: pending.endpoint,
    device_id: response.device_id,
    device_token: pending.device_token,
    profile_epoch: response.profile_epoch,
    cursor: response.cursor,
    registered_at: new Date().toISOString(),
  };
  writeKey(REGISTRATION_KEY, JSON.stringify(validateRegistration(registration)));
  removeKey(PENDING_BOOTSTRAP_KEY);
  return registration;
}

export function removeCloudSyncBootstrapSecret(): void {
  removeKey(BOOTSTRAP_SECRET_KEY);
}

export function clearCloudSyncPhase0Credentials(): void {
  const keys = [PROFILE_KEY, BOOTSTRAP_SECRET_KEY, PENDING_BOOTSTRAP_KEY, REGISTRATION_KEY, KEYCHAIN_TEST_KEY];
  for (const key of keys) removeKey(key);
}

export function testCloudSyncKeychainRoundTrip(value: string): void {
  writeKey(KEYCHAIN_TEST_KEY, value);
  removeKey(KEYCHAIN_TEST_KEY);
}

function base64UrlToData(value: string): NSData {
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return $data({ base64 });
}

function hexToBase64Url(hex: string): string {
  if (!/^[0-9a-f]{64}$/iu.test(hex)) {
    throw new CloudSyncPhase0Error("JSBox SHA-256 返回了无法识别的结果。", "sha256-failed");
  }
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return $text
    .base64Encode($data({ byteArray: bytes }))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

export function sha256Base64UrlSecret(secret: string): string {
  return hexToBase64Url($text.SHA256(base64UrlToData(requireBase64Url32Bytes(secret, "recovery_secret"))));
}

function responseData(response: HttpTypes.HttpResponse): unknown {
  if (typeof response.data === "string") {
    try {
      return JSON.parse(response.data);
    } catch {
      return undefined;
    }
  }
  return response.data;
}

function errorMessageFromResponse(response: HttpTypes.HttpResponse): string | undefined {
  const data = responseData(response);
  if (isRecord(data) && typeof data.message === "string") return data.message;
  if (isRecord(data) && isRecord(data.error) && typeof data.error.message === "string") return data.error.message;
  return undefined;
}

function throwHttpError(response: HttpTypes.HttpResponse, operation: string): never {
  if (response.error) {
    const code = response.error.code;
    if (code === -1001) {
      throw new CloudSyncPhase0Error(`${operation}超时，请稍后重试。`, "timeout");
    }
    if (code === -1009) {
      throw new CloudSyncPhase0Error(`${operation}失败：设备当前没有网络。`, "offline");
    }
    throw new CloudSyncPhase0Error(
      `${operation}失败：${response.error.localizedDescription || "网络错误"}。`,
      "network-error",
    );
  }

  const status = response.response?.statusCode ?? 0;
  const serverMessage = errorMessageFromResponse(response);
  const suffix = serverMessage ? `：${serverMessage}` : "。";
  if (status === 401) {
    throw new CloudSyncPhase0Error(`一次性部署密钥不匹配${suffix}`, "unauthorized", status);
  }
  if (status === 409) {
    throw new CloudSyncPhase0Error(`此 Worker 已由另一笔初始化请求注册${suffix}`, "already-initialized", status);
  }
  if (status === 503) {
    throw new CloudSyncPhase0Error(`Worker 或 D1 尚未就绪${suffix}`, "worker-not-ready", status);
  }
  throw new CloudSyncPhase0Error(`${operation}失败（HTTP ${status}）${suffix}`, "http-error", status);
}

function requireWorkerInfo(value: unknown): CloudSyncWorkerInfo {
  if (!isRecord(value) || !isRecord(value.checks)) {
    throw new CloudSyncPhase0Error("Worker 返回的 /v1/info 格式无效。", "invalid-worker-info");
  }
  const info = value as unknown as CloudSyncWorkerInfo;
  if (
    info.service !== "jsehviewer-cloudflare-sync" ||
    typeof info.protocol_min !== "number" ||
    typeof info.protocol_max !== "number" ||
    typeof info.schema_version !== "number" ||
    typeof info.initialized !== "boolean" ||
    typeof info.ready !== "boolean"
  ) {
    throw new CloudSyncPhase0Error("目标地址不是兼容的 JSEhViewer 同步 Worker。", "incompatible-worker");
  }
  if (info.protocol_min > CLOUD_SYNC_PROTOCOL || info.protocol_max < CLOUD_SYNC_PROTOCOL) {
    throw new CloudSyncPhase0Error("Worker 与当前 App 没有共同的同步协议版本。", "protocol-mismatch");
  }
  if (info.schema_version !== CLOUD_SYNC_SCHEMA_VERSION) {
    throw new CloudSyncPhase0Error(
      `D1 schema 版本为 ${info.schema_version}，当前要求 ${CLOUD_SYNC_SCHEMA_VERSION}。`,
      "schema-mismatch",
    );
  }
  if (
    !info.ready ||
    info.checks.database !== "ok" ||
    info.checks.migrations !== "ok" ||
    info.checks.bootstrap_secret !== "configured"
  ) {
    throw new CloudSyncPhase0Error("Worker 自检未通过，请查看 /v1/info 的 checks。", "worker-not-ready");
  }
  return info;
}

export async function fetchCloudSyncWorkerInfo(endpoint: string): Promise<CloudSyncWorkerInfo> {
  const response = await $http.get({
    url: `${normalizeEndpoint(endpoint)}/v1/info`,
    timeout: 15,
    header: { Accept: "application/json" },
  });
  if (response.error || response.response?.statusCode !== 200) {
    throwHttpError(response, "Worker 自检");
  }
  return requireWorkerInfo(responseData(response));
}

function requireBootstrapResponse(value: unknown, status: number): CloudSyncBootstrapResponse {
  if (!isRecord(value)) {
    throw new CloudSyncPhase0Error("Worker 返回的设备注册结果格式无效。", "invalid-bootstrap-response");
  }
  const result = value as unknown as CloudSyncBootstrapResponse;
  const replayed = typeof result.replayed === "boolean" ? result.replayed : status === 201 ? false : undefined;
  if (
    result.protocol !== CLOUD_SYNC_PROTOCOL ||
    result.initialized !== true ||
    typeof replayed !== "boolean" ||
    typeof result.cursor !== "number" ||
    typeof result.server_time_ms !== "number" ||
    typeof result.device_id !== "string" ||
    typeof result.profile_epoch !== "string"
  ) {
    throw new CloudSyncPhase0Error("Worker 返回的设备注册结果不完整。", "invalid-bootstrap-response");
  }
  return {
    ...result,
    replayed,
    device_id: requireUuidV4(result.device_id, "device_id"),
    profile_epoch: requireUuidV4(result.profile_epoch, "profile_epoch"),
  };
}

export async function postCloudSyncBootstrap(
  pending: CloudSyncPendingBootstrap,
  bootstrapSecret: string,
): Promise<CloudSyncBootstrapResponse> {
  const body = {
    format: 1,
    device_id: pending.device_id,
    device_token: pending.device_token,
    profile_epoch: pending.profile_epoch,
    recovery_token_hash: pending.recovery_token_hash,
  };
  const response = await $http.post({
    url: `${normalizeEndpoint(pending.endpoint)}/v1/bootstrap`,
    timeout: 15,
    header: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bootstrap ${requireBase64Url32Bytes(bootstrapSecret, "bootstrap_secret")}`,
    },
    body: $data({ string: JSON.stringify(body) }),
  });
  const status = response.response?.statusCode ?? 0;
  if (response.error || (status !== 200 && status !== 201)) {
    throwHttpError(response, "设备注册");
  }
  // 0.1.0-phase0 did not include `replayed` in its initial HTTP 201 response.
  // Treat that one legacy success shape as a fresh registration; HTTP 200
  // replays must still explicitly identify themselves.
  const result = requireBootstrapResponse(responseData(response), status);
  if (result.device_id !== pending.device_id || result.profile_epoch !== pending.profile_epoch) {
    throw new CloudSyncPhase0Error("Worker 返回的设备身份与本机待提交身份不一致。", "bootstrap-identity-mismatch");
  }
  return result;
}

export function getCloudSyncPhase0Summary(): string {
  try {
    if (getCloudSyncPendingBootstrap()) return "设备身份已安全保存，等待注册或重试";
    if (getCloudSyncRegistration()) return "首台设备已注册，正式数据同步尚未开放";
    if (getCloudSyncStoredProfile()) return "连接包已导入，等待实机检查";
    return "尚未导入连接包";
  } catch {
    return "本机同步资料异常，请进入诊断页处理";
  }
}
