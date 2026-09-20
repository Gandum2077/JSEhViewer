import URLParse from "url-parse";
import { SYNC_TABLES, tableSpec } from "./schema";
import { quotaErrorCodes } from "./errors";
import { configManager } from "../utils/config";
import { dbManager } from "../utils/database";
import {
  CloudRecord,
  Pending,
  applyMirror,
  equalRecord,
  getMeta,
  localRecord,
  logRecord,
  metaStatement,
  mirror,
  saveRecord,
  selectedTables,
  setMeta,
} from "./store";

type Operation = {
  operation: "create" | "update" | "delete";
  tablename: string;
  id: string;
  content?: Record<string, any>;
  base_sync_version?: number;
  forced?: boolean;
};
type Inflight = { body: string; pending: Pending[] };
export type Transport = (method: string, path: string, body?: string) => Promise<any>;
class SyncError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const knownErrors = new Set([
  ...quotaErrorCodes,
  "INVALID_REQUEST",
  "INVALID_CURSOR",
  "UNAUTHORIZED",
  "DEVICE_DISABLED",
  "DEVICE_NOT_FOUND",
  "NOT_FOUND",
  "REQUEST_SEQ_REUSED",
  "REQUEST_EXPIRED",
  "REQUEST_OUT_OF_ORDER",
  "FULL_SYNC_REQUIRED",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "DATABASE_UNAVAILABLE",
]);

export function normalizeEndpoint(url: string) {
  const parsed = new URLParse(url.trim());
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.query ||
    parsed.hash ||
    !["", "/"].includes(parsed.pathname)
  )
    throw new Error("请填写 HTTPS Worker 根地址，不含路径、查询参数或登录信息");
  return parsed.origin;
}

async function httpTransport(method: string, path: string, body?: string): Promise<any> {
  const credentials = configManager.syncCredentials;
  if (!credentials) throw new Error("请先配置 Worker 地址和主密钥");
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: HttpTypes.HttpResponse;
    try {
      response = await $http.request({
        method,
        url: credentials.url + path,
        timeout: 30,
        header: {
          Authorization: `Bearer ${credentials.masterKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: $data({ string: body }) }),
      });
    } catch {
      throw new Error("网络请求失败，未确认的上传已保留；请重试同步");
    }
    const status = response.response?.statusCode ?? 0;
    let data: any;
    let parsed = false;
    try {
      data = JSON.parse(response.rawData?.string ?? "");
      parsed = true;
    } catch {
      // Transient HTTP failures may have non-JSON responses and can still retry.
    }
    // Quotas cannot recover in a short retry loop. Streamed pages can carry an
    // error after HTTP 200; reject them before staging data or advancing cursors.
    if (status && quotaErrorCodes.has(data?.error?.code)) throw new SyncError(data.error.code);
    if ((response.error || status === 429 || status >= 500) && attempt < 2) {
      const retry = Number(response.response?.headers?.["Retry-After"]);
      // Do not retry earlier than the server asks. Long waits are left to the user.
      if (retry > 30) throw new SyncError("RATE_LIMITED");
      await $wait(Math.max(2 ** attempt, Number.isFinite(retry) ? retry : 0));
      continue;
    }
    if (status && data?.error)
      throw new SyncError(
        knownErrors.has(data.error.code) ? data.error.code : status === 200 ? "INTERNAL_ERROR" : `HTTP_${status}`,
      );
    if (response.error || !status) throw new Error("网络请求失败，未确认的上传已保留；请重试同步");
    if (!parsed) throw new Error("同步响应不完整，已保留原游标和未确认请求");
    if (status < 200 || status >= 300)
      throw new SyncError(knownErrors.has(data?.error?.code) ? data.error.code : `HTTP_${status}`);
    return data;
  }
  throw new Error("同步请求失败");
}

export class SyncEngine {
  busy = false;
  constructor(private transport: Transport = httpTransport) {}
  private idle() {
    if (this.busy) throw new Error("同步正在进行，请稍后操作");
  }
  configure(url: string, masterKey: string) {
    this.idle();
    url = normalizeEndpoint(url);
    masterKey = masterKey.trim();
    if (!/^[0-9a-f]{64}$/.test(masterKey)) throw new Error("主密钥必须是 64 位小写十六进制字符串");
    const changed = configManager.syncCredentials?.url !== url;
    if (changed && getMeta("inflight", null))
      throw new Error("切换服务器前请先确认上次上传；可先更新原服务器密钥后重试");
    const statements = changed
      ? [
          ...["sync_meta", "sync_mirror", "sync_stage", "sync_pending", "sync_log"].map((table) => ({
            sql: `DELETE FROM ${table}`,
          })),
          metaStatement("deviceId", $text.uuid.toLowerCase()),
          metaStatement("needsFull", true),
          ...selectedTables().map((name) => ({
            sql: `INSERT INTO sync_pending(tablename,id,revision,base_version) SELECT ?,id,(SELECT tick FROM sync_control WHERE id=1),0 FROM ${name} WHERE 1=1${name === "tag_access_count_v2" ? " AND device_id=?" : ""}`,
            args: name === "tag_access_count_v2" ? [name, dbManager.deviceId] : [name],
          })),
        ]
      : [];
    configManager.saveSyncCredentials({ url, masterKey }, statements);
  }
  async connectionTest() {
    this.idle();
    this.busy = true;
    try {
      await this.register();
    } finally {
      this.busy = false;
    }
  }
  private async register() {
    let id = getMeta("deviceId", "");
    if (!id) {
      id = $text.uuid.toLowerCase();
      dbManager.atomic((tx) => setMeta(tx, "deviceId", id));
    }
    const data = await this.transport(
      "PUT",
      `/v1/devices/${encodeURIComponent(id)}`,
      JSON.stringify({ name: "JSEhViewer", platform: "JSBox" }),
    );
    if (!data?.device || data.device.id !== id || !Number.isSafeInteger(data.device.last_request_seq))
      throw new Error("设备注册响应无效");
    if (data.device.disabled) throw new SyncError("DEVICE_DISABLED");
    const expected = getMeta("requestSeq", 0),
      inflight = getMeta<Inflight | null>("inflight", null);
    const sent = inflight ? JSON.parse(inflight.body).request_seq : expected;
    if (![expected, sent].includes(data.device.last_request_seq))
      throw new Error("本机请求状态与云端不一致，请重建同步身份");
  }
  async synchronize(progress: (message: string) => void = () => {}, full = false) {
    this.idle();
    this.busy = true;
    try {
      if (!selectedTables().length) throw new Error("请至少选择一项同步内容");
      progress("注册设备…");
      await this.register();
      // A previously sent request must be settled before downloading or changing intent.
      if (getMeta("inflight", null)) {
        progress("确认上次上传…");
        await this.sendInflight();
      }
      progress("下载云端变化…");
      await this.download(full || getMeta("needsFull", true), progress);
      // Only send the changes present at this boundary; edits during network I/O
      // remain queued for the next run rather than extending this run indefinitely.
      const boundary = dbManager.query("SELECT tick FROM sync_control WHERE id=1")[0].tick;
      let batches = 0;
      while (await this.prepareBatch(boundary)) {
        progress(`上传第 ${++batches} 批…`);
        await this.sendInflight();
        await $wait(0.001);
      }
      progress("核对云端变化…");
      await this.download(false, progress);
      dbManager.atomic((tx) => setMeta(tx, "lastSuccess", new Date().toISOString()));
      progress("同步完成");
    } catch (error) {
      dbManager.atomic((tx) => logRecord(tx, "", "", error instanceof SyncError ? error.code : "SYNC_INTERRUPTED"));
      throw error;
    } finally {
      this.busy = false;
    }
  }
  private async download(full: boolean, progress: (message: string) => void) {
    // A failed run can safely restart staging from the last committed cursor.
    // This bounds recovery complexity and never exposes a partial download.
    for (let restart = 0; restart < 3; restart++) {
      dbManager.update("DELETE FROM sync_stage");
      let seq = getMeta("seq", 0),
        page = 0;
      try {
        if (full) {
          let cursor: any = null;
          do {
            const response = await this.transport(
              "POST",
              "/v1/full-download",
              JSON.stringify({ device_id: getMeta("deviceId", ""), limit: 100, ...(cursor ? { cursor } : {}) }),
            );
            this.validatePage(response, "data");
            if (
              !Number.isSafeInteger(response.start_seq) ||
              response.start_seq < 0 ||
              (cursor && response.start_seq !== seq)
            )
              throw new Error("完整下载游标无效");
            seq = response.start_seq;
            if (
              response.has_more &&
              (!response.next_cursor ||
                response.next_cursor.start_seq !== seq ||
                typeof response.next_cursor.after?.tablename !== "string" ||
                typeof response.next_cursor.after?.id !== "string" ||
                JSON.stringify(response.next_cursor) === JSON.stringify(cursor))
            )
              throw new Error("完整下载分页游标无效");
            this.stage(response.data);
            cursor = response.has_more ? response.next_cursor : null;
            progress(`完整下载第 ${++page} 页…`);
          } while (cursor);
        }
        let more: boolean;
        do {
          // All pages are staged; do not acknowledge staged cursors before commit.
          const response = await this.transport(
            "POST",
            "/v1/sync",
            JSON.stringify({ device_id: getMeta("deviceId", ""), seq, limit: 100, include_self: true }),
          );
          this.validatePage(response, "changes");
          if (
            !Number.isSafeInteger(response.next_seq) ||
            response.next_seq < seq ||
            (response.has_more && response.next_seq === seq)
          )
            throw new Error("增量同步游标无效");
          this.stage(response.changes);
          seq = response.next_seq;
          more = response.has_more;
          progress(`补拉变化第 ${++page} 页…`);
        } while (more);
        progress("正在应用下载的数据…");
        await $wait(0.001);
        const changed = dbManager.atomic((tx) => {
          if (full) tx.execute("DELETE FROM sync_mirror WHERE tablename IN (SELECT tablename FROM sync_enabled)");
          tx.execute(`INSERT INTO sync_mirror SELECT * FROM sync_stage WHERE true
            ON CONFLICT(tablename,id) DO UPDATE SET content=excluded.content,sync_version=excluded.sync_version,deleted=excluded.deleted
            WHERE excluded.sync_version>sync_mirror.sync_version`);
          const changed = applyMirror(tx);
          setMeta(tx, "seq", seq);
          setMeta(tx, "needsFull", false);
          tx.execute("DELETE FROM sync_stage");
          return changed;
        }, true);
        configManager.reloadAfterSync(changed);
        // Explicitly acknowledge only the committed cursor. Ignore this response;
        // a later run will fetch anything newer than the committed cursor.
        await this.transport("POST", "/v1/sync", JSON.stringify({ device_id: getMeta("deviceId", ""), seq, limit: 1 }));
        return;
      } catch (error) {
        if (error instanceof SyncError && ["FULL_SYNC_REQUIRED", "INVALID_CURSOR"].includes(error.code)) {
          full = true;
          continue;
        }
        throw error;
      }
    }
    throw new Error("下载期间日志已过期，请稍后重新同步");
  }
  private validatePage(response: any, field: string) {
    if (!response || !Array.isArray(response[field]) || typeof response.has_more !== "boolean")
      throw new Error("同步响应格式无效");
  }
  private stage(rows: CloudRecord[]) {
    const selected = new Set(selectedTables());
    dbManager.atomic((tx) => {
      for (const row of rows) if (selected.has(row.tablename)) saveRecord(tx, "sync_stage", row);
    });
  }
  private async prepareBatch(boundary: number) {
    const selected = new Set(selectedTables());
    for (const spec of SYNC_TABLES) {
      if (!selected.has(spec.name)) continue;
      while (true) {
        const candidates = dbManager.query(
          `SELECT * FROM sync_pending INDEXED BY sync_pending_ready
           WHERE tablename=? AND conflict IS NULL AND revision<=?
           ORDER BY revision,id LIMIT 10`,
          [spec.name, boundary],
        ) as Pending[];
        if (!candidates.length) break;
        if (this.prepareCandidates(candidates)) return true;
        // Even thousands of identical/locally deleted records yield to UIKit.
        await $wait(0.001);
      }
    }
    return false;
  }
  private prepareCandidates(candidates: Pending[]) {
    const operations: Operation[] = [],
      pending: Pending[] = [];
    dbManager.atomic((tx) => {
      for (const p of candidates) {
        const local = localRecord(p.tablename, p.id),
          remote = mirror(p.tablename, p.id);
        if (local.deleted && !remote && p.tablename === "local_marked_tags_v2") {
          const original = localRecord(p.tablename, p.id, true);
          if (!original.deleted) {
            operations.push({ operation: "create", tablename: p.tablename, id: p.id, content: original.content });
            pending.push({ ...p, bootstrapDelete: true });
            if (operations.length === 10) break;
            continue;
          }
        }
        if ((remote && equalRecord(local, remote)) || (local.deleted && (!remote || remote.deleted))) {
          tx.execute("DELETE FROM sync_pending WHERE tablename=? AND id=? AND revision=?", [
            p.tablename,
            p.id,
            p.revision,
          ]);
          if (remote)
            tx.execute(`UPDATE ${tableSpec(p.tablename).name} SET sync_version=? WHERE id=?`, [
              remote.sync_version,
              p.id,
            ]);
          continue;
        }
        if (local.deleted && p.base_version === 0) {
          // The local object was removed before it ever observed this cloud key.
          // Never issue an invalid version-zero delete or erase an unseen object.
          tx.execute("UPDATE sync_pending SET conflict='VERSION_CONFLICT' WHERE tablename=? AND id=?", [
            p.tablename,
            p.id,
          ]);
          continue;
        }
        // A deleted remote object must not be silently resurrected by an old update.
        if (remote?.deleted && p.base_version > 0 && !p.forced && p.base_version !== remote.sync_version) {
          tx.execute("UPDATE sync_pending SET conflict='ENTITY_NOT_FOUND' WHERE tablename=? AND id=?", [
            p.tablename,
            p.id,
          ]);
          continue;
        }
        const operation: Operation = {
          operation: local.deleted ? "delete" : p.base_version === 0 || remote?.deleted ? "create" : "update",
          tablename: p.tablename,
          id: p.id,
        };
        if (!local.deleted) operation.content = local.content;
        if (operation.operation !== "create") operation.base_sync_version = p.base_version;
        if (p.forced) operation.forced = true;
        operations.push(operation);
        pending.push(p);
        if (operations.length === 10) break;
      }
      if (operations.length)
        setMeta(tx, "inflight", {
          body: JSON.stringify({
            device_id: getMeta("deviceId", ""),
            request_seq: getMeta("requestSeq", 0) + 1,
            operations,
          }),
          pending,
        });
    });
    return operations.length > 0;
  }
  private async sendInflight() {
    const saved = getMeta<Inflight | null>("inflight", null);
    if (!saved) return;
    const request = JSON.parse(saved.body),
      response = await this.transport("POST", "/v1/write", saved.body);
    if (
      response?.request_seq !== request.request_seq ||
      !Array.isArray(response.results) ||
      response.results.length !== request.operations.length
    )
      throw new Error("写入响应无效，原请求已保留");
    response.results.forEach((r: any, index: number) => {
      const op = request.operations[index];
      if (
        r.index !== index ||
        r.tablename !== op.tablename ||
        r.id !== op.id ||
        typeof r.success !== "boolean" ||
        (r.success &&
          (!Number.isSafeInteger(r.sync_version) || r.sync_version < 1 || r.deleted !== (op.operation === "delete"))) ||
        (!r.success && !["ALREADY_EXISTS", "ENTITY_NOT_FOUND", "VERSION_CONFLICT"].includes(r.code))
      )
        throw new Error("写入结果无效，原请求已保留");
    });
    dbManager.atomic((tx) => {
      response.results.forEach((r: any, index: number) => {
        const op: Operation = request.operations[index],
          p = saved.pending[index];
        if (r.success) {
          saveRecord(tx, "sync_mirror", {
            tablename: op.tablename,
            id: op.id,
            content: op.content,
            sync_version: r.sync_version,
            deleted: r.deleted,
          });
          if (!p.bootstrapDelete)
            tx.execute("DELETE FROM sync_pending WHERE tablename=? AND id=? AND revision=?", [
              p.tablename,
              p.id,
              p.revision,
            ]);
          tx.execute("UPDATE sync_pending SET base_version=?,conflict=NULL,forced=0 WHERE tablename=? AND id=?", [
            r.sync_version,
            p.tablename,
            p.id,
          ]);
          // The successful payload was read from this business row. Do not replay
          // the cloud mirror or overwrite edits made while the request was in flight.
          tx.execute(`UPDATE ${tableSpec(p.tablename).name} SET sync_version=? WHERE id=? AND sync_version<?`, [
            r.sync_version,
            p.id,
            r.sync_version,
          ]);
          tx.execute("DELETE FROM sync_log WHERE tablename=? AND id=?", [p.tablename, p.id]);
        } else
          tx.execute("UPDATE sync_pending SET conflict=?,forced=0 WHERE tablename=? AND id=?", [
            r.code,
            p.tablename,
            p.id,
          ]);
      });
      setMeta(tx, "requestSeq", response.request_seq);
      setMeta(tx, "inflight", null);
    }, true);
  }
  resolve(table: string, id: string, choice: "cloud" | "local") {
    this.idle();
    if (getMeta("inflight", null)) throw new Error("请先确认未完成的上传");
    if (
      !dbManager.query("SELECT 1 FROM sync_pending WHERE tablename=? AND id=? AND conflict IS NOT NULL", [table, id])
        .length
    )
      return;
    const remote = mirror(table, id);
    if (!remote) throw new Error("请先完成同步，取得冲突记录的云端状态");
    const changed = dbManager.atomic((tx) => {
      if (choice === "cloud") {
        tx.execute("DELETE FROM sync_pending WHERE tablename=? AND id=?", [table, id]);
        return applyMirror(tx, [{ tablename: table, id }]);
      } else
        tx.execute("UPDATE sync_pending SET base_version=?,conflict=NULL,forced=1 WHERE tablename=? AND id=?", [
          remote.sync_version,
          table,
          id,
        ]);
      return new Set<string>();
    }, true);
    configManager.reloadAfterSync(changed);
  }
  /** Explicit recovery when request state was restored from an obsolete backup. */
  resetIdentity() {
    this.idle();
    if (getMeta("inflight", null)) throw new Error("仍有未确认请求，不能重建身份；请先恢复并确认原请求");
    dbManager.atomic((tx) => {
      setMeta(tx, "deviceId", $text.uuid.toLowerCase());
      setMeta(tx, "requestSeq", 0);
      setMeta(tx, "needsFull", true);
    });
  }
  async devices(): Promise<any[]> {
    this.idle();
    this.busy = true;
    try {
      const devices: any[] = [];
      let after: string | null = null;
      do {
        const r = await this.transport(
          "GET",
          `/v1/devices?limit=100${after === null ? "" : `&after_id=${encodeURIComponent(after)}`}`,
        );
        if (
          !Array.isArray(r.devices) ||
          typeof r.has_more !== "boolean" ||
          (r.has_more && (typeof r.next_after_id !== "string" || r.next_after_id === after))
        )
          throw new Error("设备列表响应无效");
        devices.push(...r.devices);
        after = r.has_more ? r.next_after_id : null;
      } while (after !== null);
      return devices;
    } finally {
      this.busy = false;
    }
  }
  async setDeviceDisabled(id: string, disabled: boolean) {
    this.idle();
    this.busy = true;
    try {
      await this.transport("PATCH", `/v1/devices/${encodeURIComponent(id)}`, JSON.stringify({ disabled }));
    } finally {
      this.busy = false;
    }
  }
}
export const syncEngine = new SyncEngine();
