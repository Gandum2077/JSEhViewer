export const quotaErrorCodes = new Set([
  "D1_READ_QUOTA_EXCEEDED",
  "D1_WRITE_QUOTA_EXCEEDED",
  "D1_STORAGE_QUOTA_EXCEEDED",
  "D1_DATABASE_SIZE_EXCEEDED",
]);

export const syncErrorMessages: Record<string, string> = {
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
