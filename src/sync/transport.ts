import URL from "url-parse";
import { Credentials } from "../utils/credentials";
export type Connection = NonNullable<Credentials["sync"]>;
export class SyncError extends Error {
  constructor(
    public code: string,
    public details: any = {},
  ) {
    super(
      (
        {
          NETWORK: "网络连接失败，请稍后重试",
          UNAUTHORIZED: "主密钥不正确，请检查连接设置",
          DEVICE_NOT_BOUND: "此设备已解绑，请重新连接",
          RATE_LIMITED: "服务请求过于频繁，稍后自动重试",
          TABLE_RELOAD_REQUIRED: "需要重新下载云端数据",
          FULL_SYNC_EXPIRED: "下载会话已过期，请重试",
          FULL_SYNC_NOT_FOUND: "下载会话已清理，请重试",
          INVALID_FULL_SYNC_PHASE: "上次下载会话尚未结束，请稍后重试；也可解绑本设备后重新连接",
          FULL_SYNC_IN_PROGRESS: "上次同步尚未结束，请继续恢复",
          BATCH_REJECTED: "部分数据需要处理冲突",
          INVALID_REQUEST: "记录不符合云端要求，请在冲突列表中处理",
          PAYLOAD_TOO_LARGE: "单条记录超出云端大小限制",
          INCOMPATIBLE: "Worker 版本不兼容，请先更新到数据库结构版本 3",
          CANCELLED: "同步已暂停",
          INVALID_CURSOR: "同步状态已变化，需要重新下载",
        } as Record<string, string>
      )[code] ?? "同步服务暂时不可用，请稍后重试",
    );
  }
}
export function normalizeConnection(apiUrl: string, masterKey: string): Connection {
  const url = new URL(apiUrl.trim());
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.query ||
    url.hash ||
    !["", "/", "/v1", "/v1/"].includes(url.pathname)
  )
    throw new Error("请输入 HTTPS Worker 网址，例如 https://example.workers.dev");
  if (!/^[a-f0-9]{64}$/.test(masterKey.trim())) throw new Error("主密钥应为 64 位小写十六进制字符");
  return { apiUrl: url.origin, masterKey: masterKey.trim() };
}
export type Transport = (
  connection: Connection,
  deviceId: string,
  path: string,
  body?: any,
  method?: string,
) => Promise<any>;
export const request: Transport = async (connection, deviceId, path, body, method) => {
  let response: HttpTypes.HttpResponse;
  try {
    response = await $http.request({
      url: connection.apiUrl + "/v1" + path,
      method: method ?? (body === undefined ? "GET" : "POST"),
      timeout: 30,
      header: {
        Authorization: "Bearer " + connection.masterKey,
        "X-API-Version": "1",
        "X-Device-ID": deviceId,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body }),
    });
  } catch {
    throw new SyncError("NETWORK");
  }
  if (response.error) throw new SyncError("NETWORK");
  const data = response.data;
  if (!data || typeof data !== "object") throw new SyncError("NETWORK");
  if (!data.ok) throw new SyncError(data.error?.code ?? "NETWORK", data.error?.details ?? {});
  return data.data;
};
