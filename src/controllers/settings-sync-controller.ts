import { Base, BaseController, controllerStatus, CustomNavigationBar, DynamicRowHeightList, formDialog } from "jsbox-cview";
import { configManager } from "../utils/config";
import { dbManager } from "../utils/database";
import { normalizeEndpoint, syncEngine } from "../sync/engine";
import { SYNC_TABLES } from "../sync/schema";
import { getMeta, selectedTables, selectTables } from "../sync/store";

class SyncCard extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor(
    private title: string,
    private summary: string,
    action?: () => void,
  ) {
    super();
    this._defineView = () => ({
      type: "view",
      props: { bgcolor: $color("clear") },
      layout: $layout.fill,
      views: [
        {
          type: "view",
          props: { bgcolor: $color("secondarySurface"), smoothCorners: true, cornerRadius: 12 },
          layout: (make) => {
            make.left.right.inset(16);
            make.top.bottom.inset(4);
          },
          views: [
            {
              type: "label",
              props: { text: title, font: $font("bold", 17), textColor: $color(action ? "systemLink" : "primaryText") },
              layout: (make) => {
                make.left.right.inset(18);
                make.top.inset(14);
                make.height.equalTo(24);
              },
            },
            {
              type: "label",
              props: { text: summary, font: $font(13), textColor: $color("secondaryText"), lines: 0 },
              layout: (make, view) => {
                make.left.right.inset(18);
                make.top.equalTo(view.prev.bottom).offset(6);
                make.bottom.inset(14);
              },
            },
          ],
          events: action ? { tapped: action } : {},
        },
      ],
    });
  }
  heightToWidth(width: number) {
    return (
      66 + Math.ceil($text.sizeThatFits({ text: this.summary, width: Math.max(1, width - 68), font: $font(13) }).height)
    );
  }
}

const errors: Record<string, string> = {
  UNAUTHORIZED: "主密钥无效，请检查连接设置。",
  DEVICE_DISABLED: "本设备已被禁用，可在设备管理中重新启用。",
  RATE_LIMITED: "请求过于频繁，请稍后再同步。",
  PAYLOAD_TOO_LARGE: "某条记录超过服务端存储限制，请检查待上传内容。",
  REQUEST_SEQ_REUSED: "请求编号与云端记录不一致，请恢复正确的本地同步状态。",
  REQUEST_EXPIRED: "原请求结果已过期，请恢复正确的本地同步状态。",
  REQUEST_OUT_OF_ORDER: "上传请求编号不连续，请检查本地同步状态。",
};

export class SettingsSyncController extends BaseController {
  cviews: { navbar: CustomNavigationBar; list: DynamicRowHeightList };
  private syncStatus = "按下方步骤配置，然后手动执行同步。";
  private acting = false;
  private sections: { title: string; rows: SyncCard[] }[] = [];
  constructor() {
    super({
      events: {
        didAppear: () => this.refresh(),
      },
    });
    const navbar = new CustomNavigationBar({ props: { title: "数据库同步", popButtonEnabled: true } });
    this.refresh();
    const list = new DynamicRowHeightList({
      sections: this.sections,
      events: {},
      props: { style: 0, separatorHidden: true },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.inset(0);
      },
    });
    this.cviews = { navbar, list };
    this.rootView.views = [navbar, list];
  }

  private refresh() {
    if (this.status === controllerStatus.removed) return;
    const configured = !!configManager.syncCredentials;
    const enabled = selectedTables();
    const pending = dbManager.query("SELECT COUNT(*) AS n FROM sync_pending JOIN sync_enabled USING(tablename)")[0].n;
    const conflicts = dbManager.query(
      "SELECT COUNT(*) AS n FROM sync_pending JOIN sync_enabled USING(tablename) WHERE conflict IS NOT NULL",
    )[0].n;
    const logs = dbManager.query("SELECT COUNT(*) AS n FROM sync_log")[0].n;
    const last = getMeta("lastSuccess", "");
    const action = (fn: () => Promise<void> | void) => () => {
      void this.run(fn);
    };
    this.sections.splice(0, this.sections.length, {
      title: "",
      rows: [
        new SyncCard(
          "在自己的设备间同步",
          "使用你部署的 Cloudflare Worker 保存所选数据。先填写连接，再选择同步内容。下载状态、Cookie、服务密码及 AI 敏感参数留在本机；云端服务默认关闭。关闭某项同步不会删除数据。",
        ),
        new SyncCard(
          "1. 配置连接",
          configured
            ? "Worker 地址和主密钥已保存到 assets/credentials.json。点击修改；地址变化会重新建立同步状态。"
            : "填写 Worker HTTPS 根地址和主密钥，两者均保存在 assets/credentials.json。",
          action(() => this.configure()),
        ),
        new SyncCard(
          "2. 选择同步内容",
          `已选择 ${enabled.length} 项。阅读进度、评分、图库收藏及图片收藏等依赖图库记录。新增选择后会重新下载存量数据；本地数据会保留，差异可在冲突管理中处理。`,
          action(() => this.chooseTables()),
        ),
        new SyncCard(
          syncEngine.busy ? "同步进行中" : "3. 立即同步",
          `${this.syncStatus}\n待上传 ${pending} 条 · 冲突 ${conflicts} 条${last ? `\n上次完成：${new Date(last).toLocaleString()}` : ""}`,
          action(async () => {
            await syncEngine.synchronize((message) => {
              this.syncStatus = message;
              this.refresh();
            });
            this.syncStatus = "同步完成。冲突和无法应用的记录请在下方管理。";
          }),
        ),
        new SyncCard(
          "处理冲突",
          `${conflicts} 条冲突。选择保留云端，或明确选择用本机内容覆盖云端。`,
          action(() => this.conflicts()),
        ),
        new SyncCard(
          "同步日志",
          `${logs} 条记录。外键或内容错误不会阻止其他记录应用；失败记录保留，下次同步会重试。`,
          action(() => this.logs()),
        ),
        new SyncCard(
          "设备管理",
          "查看已注册设备，禁用或重新启用设备。",
          action(() => this.devices()),
        ),
        new SyncCard(
          "重新完整下载",
          "重新下载所选内容并补拉变化，保留本机待上传修改。",
          action(async () => {
            await syncEngine.synchronize((message) => {
              this.syncStatus = message;
              this.refresh();
            }, true);
          }),
        ),
        new SyncCard(
          "重建同步身份",
          "仅在恢复旧备份导致请求编号不一致时使用。保留业务数据和待上传修改，重新注册设备并完整下载。",
          action(async () => {
            const result = await $ui.alert({
              title: "重建同步身份",
              message: "将注册为新设备。旧设备可以在设备管理中禁用。",
              actions: [{ title: "重建" }, { title: "取消" }],
            });
            if (result.index === 0) {
              syncEngine.resetIdentity();
              this.syncStatus = "同步身份已重建，请重新同步。";
            }
          }),
        ),
      ],
    });
    if (this.status === controllerStatus.loaded)
      this.cviews.list.view.data = this.sections.map((s) => ({
        title: s.title,
        rows: s.rows.map((r) => r.definition),
      }));
  }

  private async run(fn: () => Promise<void> | void) {
    if (syncEngine.busy || this.acting) {
      $ui.toast("操作正在进行，请稍后");
      return;
    }
    this.acting = true;
    try {
      await fn();
    } catch (error) {
      if (error === "cancel") return;
      const message = error instanceof Error ? error.message : "操作失败";
      this.syncStatus = errors[message] ?? message;
      await $ui.alert({ title: "数据库同步", message: this.syncStatus });
    } finally {
      this.acting = false;
      this.refresh();
    }
  }

  private async configure() {
    const current = configManager.syncCredentials;
    const values = await formDialog<{ url: string; masterKey: string }>({
      title: "连接 Cloudflare Worker",
      sections: [
        {
          title: "连接凭据",
          rows: [
            { type: "string", key: "url", title: "API 根地址", value: current?.url ?? "" },
            { type: "secure", key: "masterKey", title: "Worker 主密钥", value: current?.masterKey ?? "" },
          ],
        },
      ],
      checkHandler: (v) => {
        try {
          normalizeEndpoint(v.url);
          if (!/^[0-9a-f]{64}$/.test(v.masterKey.trim())) throw new Error("请输入 64 位小写十六进制主密钥");
          return true;
        } catch (e) {
          $ui.error((e as Error).message);
          return false;
        }
      },
    });
    syncEngine.configure(values.url, values.masterKey);
    this.syncStatus = "连接已保存，正在验证…";
    this.refresh();
    await syncEngine.connectionTest();
    this.syncStatus = "连接成功，请选择同步内容。";
  }

  private async chooseTables() {
    const enabled = selectedTables();
    const values = await formDialog<Record<string, boolean>>({
      title: "选择同步内容",
      sections: [
        {
          title: "依赖项需要先选择图库记录",
          rows: SYNC_TABLES.map((t) => ({
            type: "boolean" as const,
            key: t.name,
            title: t.title,
            value: enabled.includes(t.name),
          })),
        },
      ],
      checkHandler: (v) => {
        if (SYNC_TABLES.some((t) => "parent" in t && v[t.name]) && !v.archive_entries_v2) {
          $ui.error("请先选择图库记录");
          return false;
        }
        return true;
      },
    });
    selectTables(SYNC_TABLES.filter((t) => values[t.name]).map((t) => t.name));
    this.syncStatus = "同步内容已保存，下次同步会补齐存量数据。";
  }

  private async conflicts() {
    const rows = dbManager.query(
      "SELECT p.* FROM sync_pending p JOIN sync_enabled USING(tablename) WHERE conflict IS NOT NULL ORDER BY tablename,id LIMIT 100",
    );
    if (!rows.length) {
      $ui.toast("没有待处理冲突");
      return;
    }
    const selection = await $ui.menu({
      items: rows.map((r) => `${SYNC_TABLES.find((t) => t.name === r.tablename)?.title} · ${r.id}`),
    });
    if (selection.index < 0) return;
    const row = rows[selection.index];
    const answer = await $ui.alert({
      title: "选择保留哪一份",
      message: `${row.id}\n${row.conflict}\n使用本机内容会在下次同步时强制覆盖云端。`,
      actions: [{ title: "保留云端" }, { title: "使用本机内容" }, { title: "取消" }],
    });
    if (answer.index < 2) syncEngine.resolve(row.tablename, row.id, answer.index === 0 ? "cloud" : "local");
  }

  private async logs() {
    const rows = dbManager.query("SELECT * FROM sync_log ORDER BY updated_at DESC LIMIT 50");
    await $ui.alert({
      title: "最近同步日志",
      message: rows.length
        ? rows.map((r) => `${r.updated_at}\n${r.tablename} ${r.id}\n${errors[r.code] ?? r.code}`).join("\n\n")
        : "暂无错误记录",
    });
  }

  private async devices() {
    const rows = await syncEngine.devices();
    if (!rows.length) {
      $ui.toast("没有已注册设备");
      return;
    }
    const selection = await $ui.menu({
      items: rows.map(
        (r) =>
          `${r.name || "设备"} · ${r.id.slice(0, 8)}${r.id === getMeta("deviceId", "") ? "（本机）" : ""} · ${r.disabled ? "已禁用" : "已启用"}`,
      ),
    });
    if (selection.index < 0) return;
    const row = rows[selection.index];
    const answer = await $ui.alert({
      title: row.disabled ? "启用设备" : "禁用设备",
      message: row.id,
      actions: [{ title: row.disabled ? "启用" : "禁用" }, { title: "取消" }],
    });
    if (answer.index === 0) await syncEngine.setDeviceDisabled(row.id, !row.disabled);
  }
}
