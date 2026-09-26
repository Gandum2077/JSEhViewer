export const quotaErrorCodes = new Set([
  "D1_READ_QUOTA_EXCEEDED",
  "D1_WRITE_QUOTA_EXCEEDED",
  "D1_STORAGE_QUOTA_EXCEEDED",
  "D1_DATABASE_SIZE_EXCEEDED",
]);

export const syncErrorMessages: Record<string, string> = {
  NOT_FOUND: "云端没有此接口（NOT_FOUND）。请检查 Worker 地址，并确认已部署包含批量读取和单表下载接口的后端版本。",
  HTTP_404: "云端返回 HTTP 404，请检查 Worker 地址及已部署的接口版本。",
  DEVICE_NOT_FOUND: "云端没有找到此设备，请重新验证连接。",
  UNAUTHORIZED: "主密钥无效，请检查连接设置。",
  DEVICE_DISABLED: "本设备已被禁用，可在设备管理中重新启用。",
  RATE_LIMITED: "请求过于频繁，请稍后再同步。",
  PAYLOAD_TOO_LARGE: "某条记录超过服务端存储限制，请检查待上传内容。",
  REQUEST_SEQ_REUSED: "请求编号与云端记录不一致，请恢复正确的本地同步状态。",
  REQUEST_EXPIRED: "原请求结果已过期，请恢复正确的本地同步状态。",
  REQUEST_OUT_OF_ORDER: "上传请求编号不连续，请检查本地同步状态。",
  D1_READ_QUOTA_EXCEEDED:
    "Cloudflare D1 今日读取额度已用完。每日北京时间 08:00（UTC 00:00）重置，请届时重试或升级套餐。",
  D1_WRITE_QUOTA_EXCEEDED:
    "Cloudflare D1 今日写入额度已用完。每日北京时间 08:00（UTC 00:00）重置，请届时重试或升级套餐。",
  D1_STORAGE_QUOTA_EXCEEDED:
    "Cloudflare D1 账户存储额度已用完。请在 Cloudflare 管理空间或调整账户额度；存储额度不会按日重置。",
  D1_DATABASE_SIZE_EXCEEDED: "Cloudflare D1 当前数据库容量已满。请在服务端释放空间或拆分数据；数据库容量不会按日重置。",
  DATABASE_UNAVAILABLE: "云端数据库暂时不可用，请稍后重试。服务端未提供明确的额度超限信息。",
};

/** Keep stable error codes for recovery, while giving the UI the failing route. */
export function syncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "操作失败，请重试";
  const detail = syncErrorMessages[message] ?? message;
  const context = error as { method?: string; path?: string } | null;
  return (message === "NOT_FOUND" || message === "HTTP_404") && context?.path
    ? `${detail}\n接口：${context.method ?? ""} ${context.path}`
    : detail;
}
