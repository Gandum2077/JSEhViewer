import { dbManager, DatabaseStatement } from "../utils/database";
import { configManager } from "../utils/config";
import { databasePath } from "../utils/glv";
import { Table, Entity, tables, canonical } from "./domain";
import {
  localEntity,
  safeEntity,
  entityStatements,
  mergeEntity,
  equalEntity,
  dataOf,
  parentOf,
  utf8Length,
} from "./entities";
import {
  meta,
  setMeta,
  saveMeta,
  stored,
  storeEntity,
  suppress,
  unsuppress,
  clearDirty,
  markDirty,
  conflict,
  clearConflict,
} from "./state";
import { request, Transport, SyncError, normalizeConnection } from "./transport";

type Operation = {
  op_id: string;
  table: Table;
  entity_id: string;
  operation: string;
  base_sync_version: number | null;
  data?: any;
};
type Pending = { batch_id: string; operations: Operation[]; snapshots: { entity: Entity; revision: number }[] };
type Session = {
  request_id: string;
  id?: string;
  phase: "data" | "seal" | "changes" | "complete";
  terminal?: string;
  cursor: any;
  baseline: number;
  target: number;
};
const yieldUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const flagFor = (t: Table) =>
  t === "ai_translation_services_v2" ? "selected" : t === "webdav_services_v2" ? "enabled" : null;

export class SyncEngine {
  busy = false;
  progress = "";
  private cancelled = false;
  private listeners = new Set<() => void>();
  private failures = 0;
  private nextAttempt = 0;
  constructor(
    private transport: Transport = request,
    private refreshed = () => configManager.reloadSyncedData(),
  ) {}
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit(text?: string) {
    if (text !== undefined) this.progress = text;
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* A view refresh must not interrupt durable synchronization. */
      }
    });
  }
  get status() {
    return {
      configured: !!configManager.syncCredentials,
      automatic: meta("automatic", false),
      initialized: meta("initialized", false),
      lastSuccess: meta("lastSuccess", 0),
      lastApplied: meta("lastApplied", 0),
      error: meta("error", ""),
      pending: dbManager.query("SELECT COUNT(*) AS n FROM sync_dirty")[0].n,
      conflicts: dbManager.query("SELECT * FROM sync_conflicts"),
      busy: this.busy,
      progress: this.progress,
    };
  }
  private check() {
    if (this.busy && this.cancelled) throw new SyncError("CANCELLED");
  }
  private async call(path: string, body?: any, method?: string) {
    this.check();
    const connection = configManager.syncCredentials;
    if (!connection) throw new SyncError("CANCELLED");
    const result = await this.transport(connection, dbManager.deviceId, path, body, method);
    this.check();
    return result;
  }
  async configure(apiUrl: string, masterKey: string, name: string) {
    if (this.busy) throw new Error("请先等待当前同步结束");
    const connection = normalizeConnection(apiUrl, masterKey);
    if (!name.trim() || name.length > 100) throw new Error("请输入设备名称（最多 100 字）");
    this.busy = true;
    this.cancelled = false;
    this.emit("正在验证连接…");
    try {
      await this.transport(connection, dbManager.deviceId, "/auth/verify");
      await this.transport(connection, dbManager.deviceId, "/devices/bind", {
        device_id: dbManager.deviceId,
        name: name.trim(),
        platform: "JSBox",
      });
      const info = await this.transport(connection, dbManager.deviceId, "/info");
      this.validateInfo(info);
      const changed = configManager.syncCredentials?.apiUrl !== connection.apiUrl;
      // A changed endpoint gets a fresh synchronization history, never an old retry batch.
      const statements: DatabaseStatement[] = changed
        ? [
            ...["sync_dirty", "sync_shadow", "sync_stage", "sync_conflicts", "sync_meta"].map((t) => ({
              sql: `DELETE FROM ${t}`,
            })),
            ...suppress,
            { sql: "DELETE FROM tag_access_count_v2 WHERE device_id<>?", args: [dbManager.deviceId] },
            unsuppress,
          ]
        : [];
      statements.push(setMeta("deviceName", name.trim()), setMeta("automatic", false), setMeta("error", ""));
      configManager.saveSyncConnection(connection, statements);
      if (changed) this.seed();
      this.emit("连接成功，可以开始首次同步");
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  private validateInfo(info: any) {
    if (
      info?.api_version !== 1 ||
      info.schema_version !== 3 ||
      canonical(info.sync_tables) !== canonical(tables) ||
      !info.capabilities?.includes("device_counters")
    )
      throw new SyncError("INCOMPATIBLE");
  }
  private seed() {
    dbManager.transactionUpdate(
      tables.map((t) => ({
        sql: `INSERT INTO sync_dirty(table_name,entity_id,priority) SELECT ?,id,${tables.indexOf(t)} FROM ${t} WHERE deleted=0 ${t === "tag_access_count_v2" ? "AND device_id=?" : ""} ON CONFLICT(table_name,entity_id) DO NOTHING`,
        args: t === "tag_access_count_v2" ? [t, dbManager.deviceId] : [t],
      })),
    );
  }
  setAutomatic(value: boolean) {
    saveMeta("automatic", value);
    if (!value) this.cancelled = true;
    this.emit();
  }
  pause() {
    this.cancelled = true;
    saveMeta("automatic", false);
    this.emit("正在暂停…");
  }
  tick() {
    if (configManager.syncCredentials && meta("automatic", false) && !this.busy && Date.now() >= this.nextAttempt)
      void this.sync().catch(() => {});
  }
  async devices() {
    return (await this.call("/devices")).devices as any[];
  }
  async renameDevice(id: string, name: string) {
    await this.call("/devices/" + encodeURIComponent(id), { name }, "PATCH");
    if (id === dbManager.deviceId) saveMeta("deviceName", name);
  }
  async unbindDevice(id: string) {
    if (this.busy) throw new Error("请等待同步结束");
    await this.call("/devices/" + encodeURIComponent(id), undefined, "DELETE");
    if (id === dbManager.deviceId) this.disconnect();
  }
  disconnect() {
    if (this.busy) throw new Error("请先暂停并等待当前请求结束");
    configManager.saveSyncConnection(undefined, [
      setMeta("automatic", false),
      setMeta("initialized", false),
      setMeta("session", null),
      setMeta("pending", null),
      setMeta("error", ""),
      ...["sync_shadow", "sync_stage", "sync_conflicts"].map((t) => ({ sql: `DELETE FROM ${t}` })),
    ]);
    this.emit("已断开连接，本机数据保留");
  }
  async sync() {
    if (this.busy) return;
    this.busy = true;
    this.cancelled = false;
    this.emit("正在检查同步状态…");
    try {
      const info = await this.call("/info");
      this.validateInfo(info);
      if (!meta("initialized", false) && !meta<Session | null>("session", null)) {
        this.seed();
        // SQLite's online backup includes committed WAL data. Credentials already have their own recovery protocol.
        const backup = `${databasePath}.before-sync-${$text.uuid}.db`;
        dbManager.backup(backup);
      }
      if (
        !meta("initialized", false) ||
        meta<Session | null>("session", null) ||
        meta<number>("cursor", 0) < info.min_valid_change_seq ||
        meta<number>("cursor", 0) > info.current_change_seq
      )
        await this.fullSync();
      // Finish exactly the persisted batch before creating a new one.
      if (meta<Pending | null>("pending", null)) await this.upload(meta<Pending>("pending", null as any));
      await this.pull();
      while (true) {
        this.check();
        const batch = await this.nextBatch();
        if (!batch) break;
        saveMeta("pending", batch);
        await this.upload(batch);
        await this.pull();
      }
      saveMeta("lastSuccess", Date.now());
      saveMeta("error", "");
      this.failures = 0;
      this.nextAttempt = Date.now() + 60000;
      this.refreshed();
      this.emit(this.status.conflicts.length ? "同步完成，有冲突待处理" : "同步完成");
    } catch (e) {
      const error = e instanceof SyncError ? e : new Error("同步未完成，本机数据已保留；请检查连接或数据格式");
      if (
        e instanceof SyncError &&
        [
          "TABLE_RELOAD_REQUIRED",
          "INVALID_CURSOR",
          "FULL_SYNC_EXPIRED",
          "FULL_SYNC_NOT_FOUND",
          "INVALID_FULL_SYNC_PHASE",
        ].includes(e.code)
      ) {
        // Obsolete operations are rebased after a full snapshot; dirty rows remain durable.
        dbManager.transactionUpdate([
          setMeta("initialized", false),
          setMeta("session", null),
          setMeta("pending", null),
          { sql: "DELETE FROM sync_stage" },
        ]);
      }
      saveMeta("error", error.message);
      this.nextAttempt = Date.now() + Math.min(15 * 60000, 30000 * 2 ** Math.min(++this.failures, 5));
      this.emit(error.message);
      throw error;
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  private async fullSync() {
    let s = meta<Session | null>("session", null);
    if (!s) {
      s = { request_id: $text.uuid, phase: "data", cursor: null, baseline: 0, target: 0 };
      dbManager.transactionUpdate([{ sql: "DELETE FROM sync_stage" }, setMeta("session", s), setMeta("pending", null)]);
    }
    if (!s.id) {
      const start = await this.call("/full-sync/start", { request_id: s.request_id });
      s.id = start.session_id;
      s.baseline = start.baseline_seq;
      saveMeta("session", s);
    }
    while (s.phase === "data") {
      this.emit("正在下载云端数据…");
      const page = await this.call("/full-sync/data", { session_id: s.id, cursor: s.cursor, limit: 100 });
      this.stage(page.rows.map((r: any) => ({ table: r.table, entity: r.entity })));
      if (page.has_more) {
        s.cursor = page.next_cursor;
        saveMeta("session", s);
      } else {
        s.terminal = page.terminal_cursor;
        s.phase = "seal";
        saveMeta("session", s);
      }
      await yieldUI();
    }
    if (s.phase === "seal") {
      const seal = await this.call("/full-sync/seal", { session_id: s.id, terminal_cursor: s.terminal });
      s.target = seal.target_seq;
      s.phase = "changes";
      s.cursor = s.baseline;
      saveMeta("session", s);
    }
    while (s.phase === "changes") {
      const page = await this.call("/full-sync/changes", { session_id: s.id, cursor: s.cursor, limit: 100 });
      this.stage(page.changes.map((r: any) => ({ table: r.table, entity: r.payload })));
      s.cursor = page.next_cursor;
      if (!page.has_more) {
        await this.applyStage(true, [setMeta("cursor", s.target), setMeta("session", { ...s, phase: "complete" })]);
        s.phase = "complete";
      } else saveMeta("session", s);
      await yieldUI();
    }
    await this.call("/full-sync/complete", { session_id: s.id, target_seq: s.target });
    dbManager.transactionUpdate([setMeta("session", null), setMeta("initialized", true)]);
  }
  private stage(rows: { table: Table; entity: Entity }[]) {
    const latest = new Map<string, { table: Table; entity: Entity }>();
    for (const r of rows) {
      const e = safeEntity(r.table, r.entity),
        key = r.table + "\0" + e.id,
        existing = latest.get(key)?.entity ?? stored("sync_stage", r.table, e.id);
      if (!existing || e.sync_version >= existing.sync_version) latest.set(key, { table: r.table, entity: e });
    }
    dbManager.transactionUpdate([...latest.values()].map((r) => storeEntity("sync_stage", r.table, r.entity)));
  }
  private async pull() {
    // Cursor moves only with application of the complete downloaded change range.
    let cursor = meta<number>("cursor", 0);
    dbManager.update("DELETE FROM sync_stage");
    while (true) {
      this.emit("正在接收其他设备的修改…");
      const page = await this.call("/sync", { cursor, ack_cursor: meta("cursor", 0), limit: 100, operations: [] });
      this.stage(page.changes.map((r: any) => ({ table: r.table, entity: r.payload })));
      if (
        !Number.isSafeInteger(page.next_cursor) ||
        page.next_cursor < cursor ||
        (page.has_more && page.next_cursor === cursor)
      )
        throw new SyncError("INVALID_CURSOR");
      cursor = page.next_cursor;
      if (!page.has_more) break;
      await yieldUI();
    }
    await this.applyStage(false, [setMeta("cursor", cursor)]);
  }
  private async applyStage(full: boolean, tail: DatabaseStatement[]) {
    this.emit("正在合并数据库…");
    const rows = dbManager.query("SELECT table_name,entity_id,payload FROM sync_stage");
    if (full) {
      for (const row of dbManager.query(
        "SELECT s.* FROM sync_shadow s WHERE NOT EXISTS(SELECT 1 FROM sync_stage t WHERE t.table_name=s.table_name AND t.entity_id=s.entity_id)",
      )) {
        const e = JSON.parse(row.payload);
        rows.push({ ...row, payload: canonical({ ...e, deleted: 1 }) });
      }
    }
    const desired = new Map<string, { table: Table; entity: Entity; remote: Entity; conflicted: boolean }>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i],
        t = row.table_name as Table,
        remote = JSON.parse(row.payload) as Entity,
        base = stored("sync_shadow", t, remote.id);
      if (
        base &&
        ((!full && remote.sync_version < base.sync_version) ||
          (remote.sync_version === base.sync_version && equalEntity(remote, base)))
      )
        continue;
      const local = localEntity(t, remote.id),
        dirty =
          dbManager.query("SELECT revision FROM sync_dirty WHERE table_name=? AND entity_id=?", [t, remote.id]).length >
          0;
      const merged = dirty ? mergeEntity(t, base, local, remote) : { entity: remote, conflict: false };
      desired.set(t + "\0" + remote.id, { table: t, entity: merged.entity, remote, conflicted: merged.conflict });
      if (i % 100 === 99) await yieldUI();
    }
    // Local input may change while the paged preparation yields. Re-read every dirty entity before commit.
    for (const [key, d] of desired) {
      if (
        dbManager.query("SELECT 1 FROM sync_dirty WHERE table_name=? AND entity_id=?", [d.table, d.remote.id]).length
      ) {
        const m = mergeEntity(
          d.table,
          stored("sync_shadow", d.table, d.remote.id),
          localEntity(d.table, d.remote.id),
          d.remote,
        );
        desired.set(key, { ...d, entity: m.entity, conflicted: m.conflict });
      }
    }
    if (!desired.size) {
      dbManager.transactionUpdate([...tail, { sql: "DELETE FROM sync_stage" }]);
      return;
    }
    const statements: DatabaseStatement[] = [...suppress];
    for (const t of ["ai_translation_services_v2", "webdav_services_v2"] as Table[]) {
      const flag = flagFor(t)!;
      const all = new Map(dbManager.query(`SELECT * FROM ${t}`).map((e) => [e.id, e]));
      for (const d of desired.values()) if (d.table === t) all.set(d.entity.id, d.entity);
      const active = [...all.values()].filter((e) => !e.deleted && e[flag] === 1);
      if (active.length > 1) {
        const current = dbManager.query(`SELECT id FROM ${t} WHERE ${flag}=1 AND deleted=0`)[0]?.id;
        for (const e of active)
          if (e.id !== current) {
            const d = desired.get(t + "\0" + e.id);
            if (d) {
              d.entity = { ...d.entity, [flag]: 0 };
              d.conflicted = true;
            }
          }
      }
      // Clear then restore selections together so SQL uniqueness cannot depend on incoming order.
      statements.push({ sql: `UPDATE ${t} SET ${flag}=0 WHERE ${flag}=1` });
      for (const e of all.values())
        if (!desired.has(t + "\0" + e.id) && e[flag] === 1)
          statements.push({ sql: `UPDATE ${t} SET ${flag}=1 WHERE id=?`, args: [e.id] });
    }
    const ordered = [...desired.values()].sort((a, b) => tables.indexOf(a.table) - tables.indexOf(b.table));
    for (const d of ordered) {
      const { table: t, entity: e, remote } = d;
      if (t === "tag_access_count_v2" && remote.deleted) {
        if (e.device_id !== dbManager.deviceId)
          statements.push({ sql: "DELETE FROM tag_access_count_v2 WHERE id=?", args: [e.id] });
        else statements.push(markDirty(t, e.id));
        statements.push({ sql: "DELETE FROM sync_shadow WHERE table_name=? AND entity_id=?", args: [t, e.id] });
        continue;
      }
      statements.push(...entityStatements(t, e), storeEntity("sync_shadow", t, remote));
      if (
        d.conflicted ||
        (!equalEntity(e, remote) &&
          dbManager.query(
            "SELECT 1 FROM sync_conflicts WHERE table_name=? AND entity_id=? AND reason='本机与云端修改了相同内容'",
            [t, e.id],
          ).length)
      )
        statements.push(conflict(t, e.id, "本机与云端修改了相同内容"));
      else {
        statements.push(clearConflict(t, e.id));
        if (equalEntity(e, remote)) statements.push(clearDirty(t, e.id));
        else statements.push(markDirty(t, e.id));
      }
    }
    statements.push(unsuppress, setMeta("lastApplied", meta<number>("lastApplied", 0) + 1), ...tail, {
      sql: "DELETE FROM sync_stage",
    });
    dbManager.transactionUpdate(statements);
    this.refreshed();
  }
  private async nextBatch(): Promise<Pending | null> {
    const dirty = dbManager.query(
      "SELECT d.* FROM sync_dirty d WHERE NOT EXISTS(SELECT 1 FROM sync_conflicts c WHERE c.table_name=d.table_name AND c.entity_id=d.entity_id) ORDER BY d.priority,d.entity_id LIMIT 32",
    );
    const candidates: { op: Operation; entity: Entity; revision: number }[] = [];
    for (let i = 0; i < dirty.length; i++) {
      const row = dirty[i],
        t = row.table_name as Table,
        base = stored("sync_shadow", t, row.entity_id);
      let local: Entity | null;
      try {
        local = localEntity(t, row.entity_id);
      } catch {
        dbManager.transactionUpdate([conflict(t, row.entity_id, "记录格式超出同步限制，请修改本机记录后重试")]);
        continue;
      }
      if (!local && base) local = { ...base, deleted: 1 };
      if (
        !local ||
        equalEntity(local, base) ||
        (!base && local.deleted) ||
        (t === "tag_access_count_v2" && local.device_id !== dbManager.deviceId)
      ) {
        dbManager.transactionUpdate([clearDirty(t, row.entity_id, row.revision)]);
        continue;
      }
      const kind = local.deleted
        ? "delete"
        : t === "tag_access_count_v2" || (t === "global_reader_config_v2" && !base) || base?.deleted
          ? "upsert"
          : base
            ? "update"
            : "create";
      const op: Operation = {
        op_id: $text.uuid,
        table: t,
        entity_id: local.id,
        operation: kind,
        base_sync_version: kind === "create" || kind === "upsert" ? null : base!.sync_version,
        ...(kind === "delete" ? {} : { data: dataOf(t, local) }),
      };
      candidates.push({ op, entity: local, revision: row.revision });
      if (i % 100 === 99) await yieldUI();
    }
    candidates.sort((a, b) => {
      const rank = (c: typeof a) =>
        c.op.operation === "delete"
          ? 30 - tables.indexOf(c.op.table)
          : tables.indexOf(c.op.table) + (flagFor(c.op.table) && c.entity[flagFor(c.op.table)!] === 1 ? 1 : 0);
      return rank(a) - rank(b);
    });
    const batch: Pending = { batch_id: $text.uuid, operations: [], snapshots: [] };
    for (const c of candidates) {
      if (batch.operations.length === 8) break;
      const t = c.op.table,
        parent = parentOf(t, c.op.entity_id),
        flag = flagFor(t);
      if (flag && c.entity[flag] === 1 && !c.entity.deleted) {
        const selected = dbManager
          .query("SELECT payload FROM sync_shadow WHERE table_name=?", [t])
          .map((r) => JSON.parse(r.payload))
          .filter((e) => !e.deleted && e[flag] === 1 && e.id !== c.entity.id);
        if (
          selected.some(
            (e) =>
              !batch.operations.some(
                (o) => o.table === t && o.entity_id === e.id && (o.operation === "delete" || o.data?.[flag] === 0),
              ),
          )
        ) {
          if (!batch.operations.length)
            dbManager.transactionUpdate([conflict(t, c.op.entity_id, "请先取消云端其他服务的选中状态")]);
          continue;
        }
      }
      if (parent && c.op.operation !== "delete") {
        const p = stored("sync_shadow", "archive_entries_v2", parent);
        if (
          (!p || p.deleted) &&
          !batch.operations.some(
            (o) => o.table === "archive_entries_v2" && o.entity_id === parent && o.operation !== "delete",
          )
        ) {
          dbManager.transactionUpdate([conflict(t, c.op.entity_id, "请先处理所属图库的同步冲突")]);
          continue;
        }
      }
      if (t === "archive_entries_v2" && c.op.operation === "delete") {
        const children = dbManager.query(
          "SELECT table_name,payload FROM sync_shadow WHERE table_name IN ('archive_read_state_v2','archive_favorite_state_v2','archive_rate_state_v2','gallery_reader_config_v2','favorite_images_v2')",
        );
        if (
          children.some((r) => {
            const e = JSON.parse(r.payload);
            return (
              !e.deleted &&
              parentOf(r.table_name, e.id) === c.op.entity_id &&
              !batch.operations.some(
                (o) => o.table === r.table_name && o.entity_id === e.id && o.operation === "delete",
              )
            );
          })
        ) {
          if (!batch.operations.length)
            dbManager.transactionUpdate([
              conflict(t, c.op.entity_id, "请先处理此图库的阅读、收藏或图片记录，再确认删除"),
            ]);
          continue;
        }
      }
      const trial = { ...batch, operations: [...batch.operations, c.op] };
      if (
        utf8Length(
          JSON.stringify({
            batch_id: trial.batch_id,
            operations: trial.operations,
            cursor: 0,
            ack_cursor: 0,
            limit: 100,
          }),
        ) +
          128 >
        128 * 1024
      ) {
        if (!batch.operations.length)
          dbManager.transactionUpdate([conflict(t, c.op.entity_id, "单条记录超出云端请求大小限制")]);
        continue;
      }
      batch.operations.push(c.op);
      batch.snapshots.push({ entity: c.entity, revision: c.revision });
    }
    if (!batch.operations.length && dirty.length) {
      await yieldUI();
      this.check();
      return this.nextBatch();
    }
    return batch.operations.length ? batch : null;
  }
  private async upload(p: Pending) {
    this.emit(`正在上传 ${p.operations.length} 项修改…`);
    let response: any;
    try {
      response = await this.call("/sync", {
        batch_id: p.batch_id,
        operations: p.operations,
        cursor: meta("cursor", 0),
        ack_cursor: meta("cursor", 0),
        limit: 100,
      });
    } catch (e) {
      if (e instanceof SyncError && ["BATCH_REJECTED", "INVALID_REQUEST", "PAYLOAD_TOO_LARGE"].includes(e.code)) {
        const errors = Array.isArray(e.details?.operation_errors) ? e.details.operation_errors : [];
        const rejected = errors.length
          ? p.operations.filter((o) => errors.some((r: any) => r.op_id === o.op_id))
          : p.operations;
        dbManager.transactionUpdate([
          ...rejected.map((o) => conflict(o.table, o.entity_id, e.message)),
          setMeta("pending", null),
        ]);
        return;
      }
      throw e;
    }
    if (!Array.isArray(response.results) || response.results.length !== p.operations.length)
      throw new SyncError("NETWORK");
    const statements: DatabaseStatement[] = [...suppress];
    response.results.forEach((r: any, i: number) => {
      const op = p.operations[i],
        snapshot = p.snapshots[i];
      if (r.op_id !== op.op_id || !Number.isSafeInteger(r.sync_version)) throw new SyncError("NETWORK");
      const e = { ...snapshot.entity, sync_version: r.sync_version };
      statements.push(storeEntity("sync_shadow", op.table, e), clearDirty(op.table, op.entity_id, snapshot.revision), {
        sql: `UPDATE ${op.table} SET sync_version=? WHERE id=?`,
        args: [r.sync_version, op.entity_id],
      });
    });
    statements.push(unsuppress, setMeta("pending", null));
    dbManager.transactionUpdate(statements);
    // Pull separately from the committed cursor, including any response page that was not applied.
  }
  resolve(table: Table, id: string, useCloud: boolean) {
    if (this.busy) throw new Error("请等待同步结束");
    const remote = stored("sync_shadow", table, id),
      flag = flagFor(table);
    const statements: DatabaseStatement[] = [];
    if (useCloud) {
      if (flag && remote?.[flag] === 1) statements.push({ sql: `UPDATE ${table} SET ${flag}=0 WHERE ${flag}=1` });
      statements.push(...suppress);
      if (remote) statements.push(...entityStatements(table, remote));
      else statements.push({ sql: `UPDATE ${table} SET deleted=1 ${flag ? `,${flag}=0` : ""} WHERE id=?`, args: [id] });
      statements.push(unsuppress, clearDirty(table, id));
    } else {
      const parent = parentOf(table, id);
      // Keeping a child record also needs its gallery to remain visible and uploadable.
      if (parent && localEntity(table, id)?.deleted === 0)
        statements.push({ sql: "UPDATE archive_entries_v2 SET deleted=0 WHERE id=? AND deleted=1", args: [parent] });
      statements.push(markDirty(table, id));
    }
    statements.push(clearConflict(table, id), setMeta("lastApplied", meta<number>("lastApplied", 0) + 1));
    dbManager.transactionUpdate(statements);
    this.refreshed();
    this.emit();
  }
}
export const syncEngine = new SyncEngine();
