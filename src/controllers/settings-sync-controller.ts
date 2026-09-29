import { BaseController, controllerStatus, CustomNavigationBar, inputAlert, NavigationBarProps } from "jsbox-cview";
import { CloudflareSyncGuideView, SyncContentList } from "../components/sync-guide-view";
import {
  SyncActionRowView,
  SyncManagementListView,
  SyncManagementSection,
  SyncStatusView,
  syncColors,
} from "../components/sync-management-view";
import { configManager } from "../utils/config";
import { dbManager } from "../utils/database";
import { ConflictDetail, normalizeEndpoint, syncEngine } from "../sync/engine";
import { syncErrorMessages as errors, syncErrorMessage } from "../sync/errors";
import { syncLog } from "../sync/logging";
import { syncScheduler } from "../sync/scheduler";
import { recordPreview } from "../sync/presentation";
import { SYNC_TABLES, tableSpec } from "../sync/schema";
import { getMeta, localRecord, Pending, selectedTables, selectTables, setMeta } from "../sync/store";

type Activity = { title: string; detail: string; kind: "成功" | "提示" | "错误"; time: string };
const date = (value: string | number) => (value ? new Date(value).toLocaleString() : "尚未同步");
const describe = (record: { deleted: boolean; content?: Record<string, any> }) =>
  record.deleted ? "已删除" : JSON.stringify(record.content, null, 2);
const row = (title: string, detail: string, tapped?: () => void, danger = false) =>
  new SyncActionRowView({ props: { title, detail, danger }, events: { tapped } });

// JSBox's promise overload does not settle on cancellation. Explicitly finish
// both paths so run() can always release its operation lock.
function chooseMenu(items: string[]): Promise<number> {
  return new Promise((resolve) => {
    $ui.menu({
      items,
      handler: (_title, index) => resolve(index),
      finished: (cancelled) => {
        if (cancelled) resolve(-1);
      },
    });
  });
}

/** All management screens use the same native grouped rows as the design. */
class ManagementPage extends BaseController {
  private list: SyncManagementListView;
  constructor(
    title: string,
    private sections: () => SyncManagementSection[],
    removed: () => void,
    rightBarButtonItems: NavigationBarProps["rightBarButtonItems"] = [],
    didReachBottom?: () => void | Promise<void>,
  ) {
    super({
      props: { bgcolor: syncColors.background },
      events: {
        didAppear: () => this.refresh(),
        didRemove: () => {
          this.list.dispose();
          removed();
        },
      },
    });
    const navbar = new CustomNavigationBar({ props: { title, popButtonEnabled: true, rightBarButtonItems } });
    this.list = new SyncManagementListView({
      props: { sections: sections() },
      events: {
        actionFailed: (error) => $ui.error(error instanceof Error ? error.message : "操作失败"),
        didReachBottom,
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.inset(0);
      },
    });
    this.rootView.views = [navbar, this.list];
  }
  refresh() {
    if (this.status !== controllerStatus.removed) this.list.sections = this.sections();
  }
}

export class SettingsSyncController extends BaseController {
  private list: SyncManagementListView;
  private screens = new Set<ManagementPage>();
  private acting = false;
  private message = syncEngine.syncing ? syncEngine.message : "";
  private unsubscribe?: () => void;
  private unsubscribeScheduler?: () => void;
  private observedSyncing = syncEngine.syncing;
  private full = false;
  private lastProgress = 0;
  constructor() {
    super({
      props: { bgcolor: syncColors.background },
      events: {
        didLoad: () => {
          this.unsubscribe = syncEngine.subscribe((message, finished) => {
            if (finished || this.observedSyncing !== syncEngine.syncing) {
              this.observedSyncing = syncEngine.syncing;
              this.message = message === "同步完成" ? "" : (errors[message] ?? message);
              this.refresh();
            } else this.progress(message);
          });
          this.unsubscribeScheduler = syncScheduler.subscribe(() => this.refresh());
        },
        didAppear: () => this.refresh(),
        didRemove: () => {
          this.unsubscribe?.();
          this.unsubscribeScheduler?.();
          this.list.dispose();
          this.screens.clear();
        },
      },
    });
    const navbar = new CustomNavigationBar({ props: { title: "云同步", popButtonEnabled: true } });
    this.list = new SyncManagementListView({
      props: { sections: this.sections() },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.inset(0);
      },
    });
    this.rootView.views = [navbar, this.list];
  }
  private refresh() {
    if (this.status === controllerStatus.removed) return;
    this.list.sections = this.sections();
    this.screens.forEach((screen) => screen.refresh());
  }
  private push(
    title: string,
    sections: () => SyncManagementSection[],
    rightBarButtonItems?: NavigationBarProps["rightBarButtonItems"],
    didReachBottom?: () => void | Promise<void>,
  ) {
    const screen = new ManagementPage(
      title,
      sections,
      () => this.screens.delete(screen),
      rightBarButtonItems,
      didReachBottom,
    );
    this.screens.add(screen);
    screen.uipush({ navBarHidden: true, statusBarStyle: 0 });
    return screen;
  }
  private action(fn: () => void | Promise<void>) {
    return () => {
      void this.run(fn);
    };
  }
  private async run(fn: () => void | Promise<void>) {
    if (this.acting || syncEngine.busy) {
      $ui.toast("操作正在进行，请稍后");
      return;
    }
    this.acting = true;
    const release = syncScheduler.hold();
    try {
      await fn();
    } catch (error) {
      if (error === "cancel") return;
      syncLog("management_error", { error }, "error");
      const message = error instanceof Error ? error.message : "操作失败，请重试";
      this.message = syncErrorMessage(error);
      // Only engine codes and our own summaries are persisted, never response bodies.
      this.record("操作未完成", errors[message] ? this.message : "请检查连接或数据后重试，待处理修改已保留。", "错误");
      if (this.status !== controllerStatus.removed) await $ui.alert({ title: "云同步", message: this.message });
    } finally {
      release();
      this.acting = false;
      this.refresh();
    }
  }
  private record(title: string, detail: string, kind: Activity["kind"] = "提示") {
    const activities = getMeta<Activity[]>("activities", []);
    dbManager.atomic((tx) =>
      setMeta(tx, "activities", [{ title, detail, kind, time: new Date().toISOString() }, ...activities].slice(0, 50)),
    );
  }
  private progress = (message: string) => {
    this.message = message;
    if (
      (this.status !== controllerStatus.loaded && this.status !== controllerStatus.appeared) ||
      Date.now() - this.lastProgress < 500
    )
      return;
    this.lastProgress = Date.now();
    this.list.updateProgress(message, syncEngine.downloaded);
  };
  private async start(full = false, table?: string) {
    this.full = full || !!table;
    this.message = "正在连接云端…";
    const task = table ? syncEngine.redownloadTable(table, this.progress) : syncEngine.synchronize(this.progress, full);
    this.refresh();
    try {
      const completed = await task;
      if (completed) this.message = "";
      this.record(
        completed ? "同步完成" : "同步已暂停",
        completed ? "已检查云端变化；如有冲突，请选择保留的内容。" : "待处理数据已保留，可以继续同步。",
        completed ? "成功" : "提示",
      );
    } finally {
      this.full = false;
    }
  }
  private sections(): SyncManagementSection[] {
    const joined = !!configManager.syncCredentials;
    const counts = dbManager.query(`SELECT COUNT(*) AS pending, COALESCE(SUM(conflict IS NOT NULL),0) AS conflicts
      FROM sync_pending JOIN sync_enabled USING(tablename)`)[0];
    const enabled = selectedTables();
    return [
      {
        title: "",
        rows: [
          new SyncStatusView({
            props: {
              joined,
              running: syncEngine.syncing,
              autoPaused: syncScheduler.paused,
              fullDownload: this.full,
              upload: counts.pending,
              download: syncEngine.downloaded,
              conflictCount: counts.conflicts,
              lastSync: date(getMeta("lastSuccess", "")),
              message: this.message,
            },
            events: {
              primaryTapped: this.action(() => (joined ? this.start() : this.guide())),
              pauseTapped: () => {
                syncScheduler.setPaused(!syncScheduler.paused);
              },
              conflictsTapped: () => this.conflicts(),
            },
          }),
        ],
      },
      ...(joined
        ? [
            {
              title: "同步管理",
              rows: [
                row("处理冲突", counts.conflicts ? `${counts.conflicts} 项需要选择保留的版本` : "没有待处理冲突", () =>
                  this.conflicts(),
                ),
                row(
                  "同步日志",
                  "查看最近的同步结果、暂停记录与错误提示",
                  this.action(() => this.logs()),
                ),
                row(
                  "设备管理",
                  `本机：${getMeta("deviceName", "JSEhViewer")} · 查看设备与访问权限`,
                  this.action(() => this.devices()),
                ),
              ],
            },
            {
              title: "数据与连接",
              rows: [
                row(
                  "同步内容",
                  `已选择 ${enabled.length} 项 · 新增内容会单独下载`,
                  this.action(() => this.chooseTables()),
                ),
                row(
                  "连接设置",
                  "修改 Worker 地址与主密钥",
                  this.action(() => this.configure()),
                ),
                row(
                  "重新下载",
                  "选择某项内容或完整下载，保留未上传修改",
                  this.action(() => this.redownload()),
                ),
                row(
                  "重建同步身份",
                  "用于恢复旧备份后的请求状态不一致",
                  this.action(() => this.resetIdentity()),
                ),
                row(
                  "从云同步脱离",
                  "移除连接信息，保留本机与云端数据",
                  this.action(() => this.leave()),
                  true,
                ),
              ],
            },
          ]
        : []),
    ];
  }
  private guide() {
    const controller = new BaseController({ props: { bgcolor: syncColors.background } });
    controller.rootView.views = [
      new CloudflareSyncGuideView(async (_sender, info) => {
        if (syncEngine.busy) throw new Error("同步正在进行，请稍后操作");
        syncEngine.configure(info.endpoint, info.masterKey);
        syncEngine.setDeviceName(info.deviceName);
        await syncEngine.connectionTest();
        selectTables(info.selectedTables);
        this.message = "连接成功，将自动同步，也可点击立即同步。";
        this.record("已加入云同步", "连接已验证，同步内容已保存。", "成功");
        this.refresh();
        $delay(0, () => {
          if (controller.status !== controllerStatus.removed) $ui.pop();
        });
        return true;
      }),
    ];
    controller.uipush({ navBarHidden: true, statusBarStyle: 0 });
  }
  private configure() {
    const current = configManager.syncCredentials;
    let url = current?.url ?? "";
    let masterKey = current?.masterKey ?? "";
    const page = this.push(
      "连接设置",
      () => [
        {
          title: "Cloudflare Worker",
          rows: [
            row(
              "API 根地址",
              url || "点击填写 Worker 的 HTTPS 根地址",
              this.action(async () => {
                const value = await inputAlert({
                  title: "API 根地址",
                  message: "填写 HTTPS 根地址，不包含 /v1 路径。",
                  text: url,
                  placeholder: "https://your-worker.workers.dev",
                  type: $kbType.url,
                });
                url = normalizeEndpoint(value);
              }),
            ),
            row(
              "主密钥",
              masterKey ? "•••••••• · 点击修改" : "点击填写部署时的 MASTER_KEY",
              this.action(async () => {
                const value = (
                  await inputAlert({
                    title: "主密钥",
                    message: "填写部署时设置的 64 位小写十六进制主密钥。",
                    text: masterKey,
                    secure: true,
                  })
                ).trim();
                if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("请输入 64 位小写十六进制主密钥");
                masterKey = value;
              }),
            ),
          ],
        },
      ],
      [
        {
          title: "应用",
          handler: this.action(async () => {
            const endpoint = normalizeEndpoint(url);
            if (!/^[0-9a-f]{64}$/.test(masterKey)) throw new Error("请输入 64 位小写十六进制主密钥");
            if (endpoint !== configManager.syncCredentials?.url) {
              const answer = await $ui.alert({
                title: "切换云端服务？",
                message: "将为新服务器重建同步状态。本机数据保留，下次同步重新比较。",
                actions: [{ title: "取消" }, { title: "切换" }],
              });
              if (answer.index !== 1) return;
            }
            const name = getMeta("deviceName", "JSEhViewer");
            syncEngine.configure(endpoint, masterKey);
            syncEngine.setDeviceName(name);
            await syncEngine.connectionTest();
            this.message = "连接验证成功。";
            this.record("连接已更新", "Worker 连接验证成功。", "成功");
            if (page.status !== controllerStatus.removed) $ui.pop();
          }),
        },
      ],
    );
  }
  private chooseTables() {
    const content = new SyncContentList(selectedTables());
    const page = new BaseController({ props: { bgcolor: syncColors.background } });
    const navbar = new CustomNavigationBar({
      props: {
        title: "同步内容",
        popButtonEnabled: true,
        rightBarButtonItems: [
          {
            title: "保存",
            handler: this.action(() => {
              selectTables(content.selectedTables);
              this.message = "同步内容已保存，新增内容将在下次同步时下载。";
              this.record("同步内容已更新", `已选择 ${content.selectedTables.length} 项。`);
              $ui.pop();
            }),
          },
        ],
      },
    });
    // Give the reusable native list a viewport below the navigation bar.
    const definition = content.definition;
    page.rootView.views = [
      navbar.definition,
      {
        ...definition,
        layout: (make: MASConstraintMaker, view: UIListView) => {
          make.top.equalTo(view.prev.bottom);
          make.left.right.bottom.inset(0);
        },
      },
    ];
    page.uipush({ navBarHidden: true, statusBarStyle: 0 });
  }
  private conflictCounts() {
    return dbManager.query(`SELECT tablename,COUNT(*) AS count FROM sync_pending
      JOIN sync_enabled USING(tablename) WHERE conflict IS NOT NULL GROUP BY tablename`) as {
      tablename: string;
      count: number;
    }[];
  }
  private conflicts() {
    this.push(
      "处理冲突",
      () => {
        const counts = new Map(this.conflictCounts().map((entry) => [entry.tablename, entry.count]));
        return [
          {
            title: "批量处理",
            rows: [
              row(
                "保留全部本机内容",
                "",
                this.action(() => this.resolveAllConflicts("local")),
              ),
              row(
                "保留全部云端内容",
                "",
                this.action(() => this.resolveAllConflicts("cloud")),
              ),
            ],
          },
          {
            title: "有冲突的同步内容",
            rows: counts.size
              ? SYNC_TABLES.filter((table) => counts.has(table.name)).map((table) =>
                  row(table.title, `${counts.get(table.name)} 个冲突`, () => this.tableConflicts(table.name)),
                )
              : [row("没有待处理冲突", "下一次同步会继续应用已选择的内容。")],
          },
        ];
      },
      [{ title: "刷新", handler: () => this.refresh() }],
    );
  }
  private async resolveAllConflicts(choice: "cloud" | "local", table?: string) {
    const count = this.conflictCounts()
      .filter((entry) => !table || entry.tablename === table)
      .reduce((sum, entry) => sum + entry.count, 0);
    if (!count) {
      $ui.toast("没有待处理冲突");
      return;
    }
    const scope = table ? tableSpec(table).title : "全部同步内容";
    const answer = await $ui.alert({
      title: `保留${table ? "该表" : "全部"}${choice === "local" ? "本机" : "云端"}内容？`,
      message:
        `${scope}当前有 ${count} 个冲突。` +
        (choice === "local"
          ? "将保留本机内容，等待后续同步上传；云端再次变化时仍会提示冲突。"
          : "将读取云端当前内容并替换本机冲突记录；云端已删除或不存在的记录也会从本机移除。"),
      actions: [{ title: "取消" }, { title: "确认选择" }],
    });
    if (answer.index !== 1) return;
    const result = await syncEngine.resolveConflicts(choice, table);
    const remaining = this.conflictCounts()
      .filter((entry) => !table || entry.tablename === table)
      .reduce((sum, entry) => sum + entry.count, 0);
    const detail = `${scope}：已处理 ${result.resolved} 项，失败 ${result.failed} 项，剩余 ${remaining} 个冲突。`;
    this.record("批量处理冲突", detail, result.failed ? "错误" : "成功");
    await $ui.alert({ title: "批量处理完成", message: detail });
  }
  private tableConflicts(table: string) {
    let after: string | undefined;
    let items: Pending[] = [];
    let more = true;
    let page: ManagementPage | undefined;
    const load = (reset = false) => {
      const cursor = reset ? undefined : after;
      const rows = dbManager.query(
        `SELECT p.* FROM sync_pending p JOIN sync_enabled USING(tablename)
         WHERE tablename=? AND conflict IS NOT NULL ${cursor === undefined ? "" : "AND id>?"}
         ORDER BY id LIMIT 51`,
        cursor === undefined ? [table] : [table, cursor],
      ) as Pending[];
      const next = rows.slice(0, 50);
      if (page?.status === controllerStatus.removed) return;
      items = reset ? next : [...items, ...next];
      more = rows.length > 50;
      after = rows.length ? rows[Math.min(50, rows.length) - 1].id : cursor;
    };
    load();
    page = this.push(
      tableSpec(table).title,
      () => {
        // Remove resolved rows when returning from details or after an automatic sync.
        const pending = new Map(
          (after === undefined
            ? []
            : dbManager.query(
                `SELECT id,revision FROM sync_pending WHERE tablename=? AND conflict IS NOT NULL AND id<=?`,
                [table, after],
              )
          ).map((entry) => [entry.id, entry.revision]),
        );
        items = items.filter((item) => pending.has(item.id));
        const count = this.conflictCounts().find((entry) => entry.tablename === table)?.count ?? 0;
        return [
          {
            title: "批量处理",
            rows: [
              row(
                "保留该表本机内容",
                "",
                this.action(() => this.resolveAllConflicts("local", table)),
              ),
              row(
                "保留该表云端内容",
                "",
                this.action(() => this.resolveAllConflicts("cloud", table)),
              ),
            ],
          },
          {
            title: `冲突记录 · 点击查看具体内容`,
            rows: [
              ...items.map((item) =>
                row(item.id, "", () =>
                  this.conflictDetail(item, () => {
                    items = items.filter((entry) => entry.id !== item.id);
                  }),
                ),
              ),
              ...(!items.length
                ? [
                    row(
                      count ? "暂无已加载的冲突" : "没有待处理冲突",
                      count ? "可触底继续加载，或点击右上角刷新。" : "下一次同步会继续应用已选择的内容。",
                    ),
                  ]
                : []),
            ],
          },
        ];
      },
      [
        {
          title: "刷新",
          handler: () => {
            load(true);
            page?.refresh();
          },
        },
      ],
      () => {
        if (!more || page?.status === controllerStatus.removed) return;
        load();
        page?.refresh();
      },
    );
  }
  private conflictDetail(initial: Pending, onResolved: () => void) {
    const current = () =>
      dbManager.query("SELECT * FROM sync_pending WHERE tablename=? AND id=? AND conflict IS NOT NULL", [
        initial.tablename,
        initial.id,
      ]) as Pending[];
    const pending = current();
    if (!pending.length) {
      onResolved();
      this.refresh();
      $ui.toast("这条冲突已处理，请刷新列表");
      return;
    }
    let local = localRecord(initial.tablename, initial.id);
    let item: ConflictDetail | undefined;
    let loading = false;
    let error = "";
    let resolved = false;
    let page: ManagementPage;
    const loadCloud = async () => {
      if (loading || resolved || page.status === controllerStatus.removed) return;
      loading = true;
      error = "";
      item = undefined;
      page.refresh();
      try {
        // Let navigation render first. Waiting for the engine never holds the UI action lock.
        await $wait(0.001);
        while (syncEngine.busy || this.acting) {
          if (page.status === controllerStatus.removed) return;
          await $wait(0.1);
        }
        if (page.status === controllerStatus.removed) return;
        const rows = current();
        if (!rows.length) {
          resolved = true;
          onResolved();
          return;
        }
        const details = await syncEngine.readConflicts(rows);
        if (page.status === controllerStatus.removed) return;
        item = details[0];
        local = item.local;
      } catch (failure) {
        syncLog("conflict_detail_read_error", { table: initial.tablename, id: initial.id, error: failure }, "error");
        if (page.status !== controllerStatus.removed) error = syncErrorMessage(failure);
      } finally {
        loading = false;
        if (page.status !== controllerStatus.removed) page.refresh();
      }
    };
    const choose = async (useLocal: boolean) => {
      const reviewed = item;
      if (!reviewed || loading || resolved) return;
      const answer = await $ui.alert({
        title: useLocal ? "使用本机内容？" : "保留云端内容？",
        message: useLocal
          ? "下次同步将上传本机版本；如果云端再次修改，会重新提示冲突。"
          : "将用刚读取的云端版本替换本机这条内容。",
        actions: [{ title: "取消" }, { title: "确认选择" }],
      });
      if (answer.index !== 1 || page.status === controllerStatus.removed) return;
      syncEngine.resolve(initial.tablename, initial.id, useLocal ? "local" : "cloud", reviewed);
      resolved = true;
      onResolved();
      this.record(
        "冲突已处理",
        `${tableSpec(initial.tablename).title}：${useLocal ? "等待上传本机内容" : "已应用云端内容"}。`,
        "成功",
      );
      $ui.pop();
    };
    page = this.push("选择保留的内容", () => [
      {
        title: `${tableSpec(initial.tablename).title} · ${initial.id}`,
        rows: resolved
          ? [row("冲突已处理", "返回列表后可查看其他冲突。")]
          : [
              row("本机内容", recordPreview(local).slice(0, 700) + "\n点击查看完整内容", () =>
                this.showContent("本机内容", describe(local)),
              ),
              row(
                "云端内容",
                item
                  ? `${item.cloud.found ? `云端更新：${date(item.cloud.server_updated_at)}\n修改设备：${item.cloud.updated_by_device_id}\n` : ""}${item.cloud.found ? recordPreview(item.cloud).slice(0, 700) : "云端不存在这条记录。选择云端会移除本机这条内容。"}\n点击查看完整内容`
                  : error
                    ? `读取失败：${error}\n请点击下方重试。`
                    : "正在读取云端内容",
                item
                  ? () =>
                      this.showContent("云端内容", item!.cloud.found ? describe(item!.cloud) : "云端不存在这条记录。")
                  : undefined,
              ),
              row(
                "使用本机内容",
                item ? "下次同步上传这一份" : "读取云端内容后可选择",
                item ? this.action(() => choose(true)) : undefined,
              ),
              row(
                "保留云端内容",
                item ? "立即应用这一份" : "读取云端内容后可选择",
                item ? this.action(() => choose(false)) : undefined,
              ),
              row(
                error ? "重试读取云端内容" : "刷新云端内容",
                loading ? "正在读取云端内容" : "重新取得当前内容后再选择",
                loading
                  ? undefined
                  : () => {
                      void loadCloud();
                    },
              ),
            ],
      },
    ]);
    void loadCloud();
  }
  private showContent(title: string, text: string) {
    $ui.push({
      props: { title, navBarHidden: false },
      views: [
        {
          type: "text",
          props: { text, editable: false, font: $font(14), bgcolor: syncColors.background, textColor: syncColors.ink },
          layout: $layout.fillSafeArea,
        },
      ],
    });
  }
  private logs() {
    let filter = "全部";
    this.push(
      "同步日志",
      () => {
        const activity = getMeta<Activity[]>("activities", []);
        const failures = dbManager.query("SELECT * FROM sync_log ORDER BY updated_at DESC LIMIT 50").map(
          (entry): Activity => ({
            title: entry.tablename ? `${tableSpec(entry.tablename).title} · ${entry.id}` : "同步中断",
            detail:
              errors[entry.code] ??
              {
                FOREIGN_KEY: "关联的图库记录尚未就绪，下次同步会重试。",
                INVALID_CONTENT: "云端内容无法应用，下次同步会重试。",
                SYNC_INTERRUPTED: "同步未完成，待处理修改已保留。",
              }[entry.code as string] ??
              entry.code,
            time: entry.updated_at,
            kind: "错误",
          }),
        );
        const entries = [...activity, ...failures]
          .sort((a, b) => b.time.localeCompare(a.time))
          .filter((entry) => filter === "全部" || entry.kind === filter)
          .slice(0, 100);
        return [
          {
            title: `最近记录 · ${filter} · 仅保存操作摘要`,
            rows: entries.length
              ? entries.map((entry) => row(`${date(entry.time)} · ${entry.title}`, `${entry.kind} · ${entry.detail}`))
              : [row("暂无记录", "此筛选下没有同步记录。")],
          },
        ];
      },
      [
        {
          title: "筛选",
          handler: this.action(async () => {
            const choices = ["全部", "成功", "提示", "错误"];
            const index = await chooseMenu(choices);
            if (index >= 0) filter = choices[index];
          }),
        },
      ],
    );
  }
  private async devices() {
    let devices = await syncEngine.devices();
    const refresh = async () => {
      devices = await syncEngine.devices();
    };
    const setDisabled = async (device: { id: string; disabled: boolean }) => {
      const answer = await $ui.alert({
        title: device.disabled ? "启用设备？" : "禁用设备？",
        message: device.disabled ? "该设备将可以再次同步。" : "该设备将无法同步，已有数据仍保留。",
        actions: [{ title: "取消" }, { title: device.disabled ? "启用" : "禁用" }],
      });
      if (answer.index !== 1) return;
      await syncEngine.setDeviceDisabled(device.id, !device.disabled);
      await refresh();
    };
    this.push(
      "设备管理",
      () => {
        const deviceId = getMeta("deviceId", "");
        const current = devices.find((device) => device.id === deviceId);
        const others = devices.filter((device) => device.id !== deviceId);
        return [
          {
            title: "本机设备",
            rows: [
              row(
                current?.name || getMeta("deviceName", "JSEhViewer"),
                current?.disabled ? "本设备已禁用，启用后可修改名称。" : "点击修改本设备名称",
                current?.disabled
                  ? undefined
                  : this.action(async () => {
                      const name = await inputAlert({
                        title: "本设备名称",
                        message: "请输入 1～32 个字符",
                        text: current?.name || getMeta("deviceName", "JSEhViewer"),
                      });
                      await syncEngine.renameDevice(name);
                      this.record("设备已改名", "已更新本设备名称。", "成功");
                      await refresh();
                    }),
              ),
              ...(current?.disabled
                ? [
                    row(
                      "启用本设备",
                      "恢复本设备的同步权限",
                      this.action(() => setDisabled(current)),
                    ),
                  ]
                : []),
            ],
          },
          {
            title: "其他设备",
            rows: others.length
              ? others.map((device) =>
                  row(
                    `${device.name || "设备"}${device.disabled ? " · 已禁用" : ""}`,
                    `最近活动：${date(device.last_seen_at)}\n点击${device.disabled ? "启用" : "禁用"}设备，已有数据和主密钥保留。`,
                    this.action(() => setDisabled(device)),
                  ),
                )
              : [row("暂无其他设备", "其他设备加入同步后会显示在这里。")],
          },
        ];
      },
      [{ title: "刷新", handler: this.action(refresh) }],
    );
  }
  private redownload() {
    const download = async (table?: string) => {
      const confirmation = await $ui.alert({
        title: table ? `重新下载${tableSpec(table).title}？` : "重新下载全部已选内容？",
        message: "重新获取云端记录，可能消耗较多读取额度。本机未上传修改将保留。",
        actions: [{ title: "取消" }, { title: "开始下载" }],
      });
      if (confirmation.index !== 1 || page.status === controllerStatus.removed) return;
      $ui.pop();
      await this.start(!table, table);
    };
    const page = this.push("重新下载", () => {
      const enabled = new Set(selectedTables());
      const tables = SYNC_TABLES.filter((table) => enabled.has(table.name));
      if (!tables.length)
        return [{ title: "同步内容", rows: [row("尚未选择同步内容", "请返回同步内容页面，启用需要下载的内容。")] }];
      return [
        {
          title: "完整下载",
          rows: [
            row(
              "全部已选内容",
              `重新获取已启用的 ${tables.length} 项内容，保留本机未上传修改。`,
              this.action(() => download()),
            ),
          ],
        },
        {
          title: "按项下载",
          rows: tables.map((table) =>
            row(
              table.title,
              "",
              this.action(() => download(table.name)),
            ),
          ),
        },
      ];
    });
  }
  private async resetIdentity() {
    const answer = await $ui.alert({
      title: "重建同步身份？",
      message: "保留本机数据和待上传修改，重新注册设备并下载。旧设备可在设备管理中禁用。",
      actions: [{ title: "取消" }, { title: "重建" }],
    });
    if (answer.index === 1) {
      syncEngine.resetIdentity();
      this.message = "同步身份已重建，请重新同步。";
    }
  }
  private async leave() {
    const answer = await $ui.alert({
      title: "从云同步脱离？",
      message: "本设备将移除连接与同步状态。本机内容和云端数据保留；下次加入会重新比较所有已选内容。",
      actions: [{ title: "继续使用" }, { title: "脱离云同步" }],
    });
    if (answer.index === 1) {
      syncEngine.leave();
      this.message = "连接已移除，本机数据已保留。";
      this.record("已脱离云同步", "本机与云端数据均保留。");
    }
  }
}
