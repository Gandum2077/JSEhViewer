import { BaseController, CustomNavigationBar, List, formDialog } from "jsbox-cview";
import { dbManager } from "../utils/database";
import { configManager } from "../utils/config";
import { syncEngine } from "../sync/engine";
import { Table } from "../sync/domain";
import { normalizeConnection } from "../sync/transport";
import { setWebDAVConfig } from "./settings-webdav-controller";
import { localEntity } from "../sync/entities";
import { stored } from "../sync/state";
import { meta } from "../sync/state";

type Row = { title: string; detail: string; action?: () => void | Promise<void> };
export class SettingsSyncController extends BaseController {
  cviews: { navbar: CustomNavigationBar; list: List };
  private rows: Row[][] = [];
  private unsubscribe?: () => void;
  private visible = false;
  constructor() {
    super({
      events: {
        didAppear: () => {
          this.visible = true;
          this.refresh();
          this.unsubscribe?.();
          this.unsubscribe = syncEngine.subscribe(() => this.refresh());
        },
        didDisappear: () => {
          this.visible = false;
          this.unsubscribe?.();
          this.unsubscribe = undefined;
        },
        didRemove: () => {
          this.visible = false;
          this.unsubscribe?.();
        },
      },
    });
    const navbar = new CustomNavigationBar({ props: { title: "数据库同步", popButtonEnabled: true } });
    const list = new List({
      props: {
        style: 2,
        rowHeight: 84,
        bgcolor: $color("primarySurface"),
        template: {
          views: [
            {
              type: "label",
              props: { id: "title", font: $font(16), textColor: $color("primaryText") },
              layout: (make) => {
                make.left.right.inset(16);
                make.top.inset(10);
                make.height.equalTo(22);
              },
            },
            {
              type: "label",
              props: { id: "detail", font: $font(12), textColor: $color("secondaryText"), lines: 2 },
              layout: (make) => {
                make.left.right.inset(16);
                make.top.inset(36);
                make.bottom.inset(8);
              },
            },
          ],
        },
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.equalTo(view.super.safeArea);
      },
      events: {
        didSelect: async (_, index) => {
          try {
            await this.rows[index.section]?.[index.row]?.action?.();
          } catch (e) {
            if (e === "cancel") return;
            await $ui.alert({ title: "数据库同步", message: e instanceof Error ? e.message : "操作未完成，请重试" });
          }
          this.refresh();
        },
      },
    });
    this.cviews = { navbar, list };
    this.rootView.views = [navbar, list];
  }
  private refresh() {
    if (!this.visible) return;
    const s = syncEngine.status;
    const groups: { title: string; rows: Row[] }[] = [
      {
        title: "连接设置",
        rows: [
          {
            title: "同步范围与使用说明",
            detail: "同步阅读、收藏、搜索、标签和服务配置；图片与登录凭据保留在本机。",
            action: () => this.introduction(),
          },
          {
            title: s.configured ? "修改连接设置" : "连接同步服务",
            detail: s.configured ? configManager.syncCredentials!.apiUrl : "填写 Worker 网址、主密钥和设备名称",
            action: () => this.configure(),
          },
          {
            title: "部署新的同步服务",
            detail: "按项目指南创建 Worker 与 D1，并设置主密钥",
            action: async () => {
              const { index } = await $ui.alert({
                title: "准备同步服务",
                message:
                  "在 Cloudflare 部署 cloudflare-d1-sync，并完成数据库升级。保存部署时设置的 MASTER_KEY 和 Worker 的 HTTPS 网址。\n\n回到此页填写连接信息，验证成功后点击“开始首次同步”。其他设备填写同一网址和密钥，各自使用不同设备名称。",
                actions: [{ title: "关闭" }, { title: "打开项目指南" }],
              });
              if (index === 1) $app.openURL("https://github.com/Gandum2077/cloudflare-d1-sync#一键部署");
            },
          },
        ],
      },
    ];
    if (s.configured) {
      groups.push({
        title: "同步管理",
        rows: [
          {
            title: s.busy ? "同步进行中" : s.initialized ? "立即同步" : "开始首次同步",
            detail: s.busy
              ? s.progress
              : s.error ||
                `${s.lastSuccess ? "上次成功：" + new Date(s.lastSuccess).toLocaleString() : "尚未完成同步"} · 待处理 ${s.pending} 项`,
            action: async () => {
              if (s.busy) return;
              await syncEngine.sync();
            },
          },
          {
            title: s.automatic ? "自动同步：已开启" : "自动同步：已关闭",
            detail: "前台运行期间定期同步；断网后保留本机修改，恢复后重试。",
            action: () => {
              syncEngine.setAutomatic(!s.automatic);
              if (!s.automatic) syncEngine.tick();
            },
          },
          { title: "暂停当前同步", detail: "保留已提交的数据，下次继续恢复", action: () => syncEngine.pause() },
          { title: "管理设备", detail: "查看、重命名或解绑设备", action: () => this.devices() },
          {
            title: "断开此服务",
            detail: "保留本机数据；不会删除云端数据库",
            action: async () => {
              const { index } = await $ui.alert({
                title: "断开同步服务？",
                message: "将移除本机保存的 Worker 网址和主密钥。",
                actions: [{ title: "取消" }, { title: "断开", style: $alertActionType.destructive }],
              });
              if (index === 1) syncEngine.disconnect();
            },
          },
        ],
      });
    }
    if (s.conflicts.length)
      groups.push({
        title: `待处理冲突（${s.conflicts.length}）`,
        rows: s.conflicts.slice(0, 100).map((c: any) => ({
          title: this.conflictName(c.table_name, c.entity_id),
          detail: c.reason,
          action: () => this.resolve(c.table_name, c.entity_id),
        })),
      });
    const incomplete = configManager.webDAVServices.filter((v) => v.credentialsConfigured === false);
    if (incomplete.length)
      groups.push({
        title: "本机凭据",
        rows: [
          {
            title: "检查 WebDAV 认证信息",
            detail: "从其他设备同步的服务不包含用户名和密码。请在 WebDAV 设置中补充后启用。",
            action: async () => {
              const values = await setWebDAVConfig();
              configManager.webdavEnabled = values.enabled;
              configManager.webdavAutoUpload = values.autoUpload;
              configManager.updateAllWebDAVServices(values.services);
            },
          },
        ],
      });
    this.rows = groups.map((g) => g.rows);
    this.cviews.list.view.data = groups.map((g) => ({
      title: g.title,
      rows: g.rows.map((r) => ({ title: { text: r.title }, detail: { text: r.detail } })),
    }));
  }
  private async introduction() {
    await $ui.alert({
      title: "数据库同步",
      message:
        "每台设备保留本机数据库。首次同步会备份并合并云端数据，同一内容的不同修改会显示为冲突。\n\n图库、阅读进度、图片收藏记录、搜索与书签、标签、阅读器设置及服务定义参与同步。标签访问次数按设备累计后求和。\n\n图片、下载任务、Cookie、WebDAV 用户名和密码及 AI 敏感配置不会上传；云端删除的记录也会同步到其他设备。\n\nWorker 网址与主密钥保存在本机 assets/credentials.json。解绑设备不能撤销其已持有的主密钥；设备遗失时需在 Cloudflare 更换密钥并更新全部设备。",
    });
  }
  private async configure() {
    if (syncEngine.busy) throw new Error("请等待同步结束");
    const old = configManager.syncCredentials;
    const values = await formDialog<{ apiUrl: string; masterKey: string; name: string }>({
      title: "连接同步服务",
      sections: [
        {
          title: "Worker 连接",
          rows: [
            { type: "string", title: "API 网址", key: "apiUrl", value: old?.apiUrl ?? "" },
            { type: "secure", title: "主密钥", key: "masterKey", value: old?.masterKey ?? "" },
            { type: "string", title: "设备名称", key: "name", value: meta("deviceName", "我的 JSBox") },
          ],
        },
      ],
      checkHandler: (v) => {
        try {
          normalizeConnection(v.apiUrl, v.masterKey);
          return !!v.name.trim();
        } catch (e) {
          $ui.error((e as Error).message);
          return false;
        }
      },
    });
    if (old && old.apiUrl !== normalizeConnection(values.apiUrl, values.masterKey).apiUrl) {
      const { index } = await $ui.alert({
        title: "切换同步服务？",
        message: "将保留本机数据并重新与新服务合并，原服务的待重试批次会取消。",
        actions: [{ title: "取消" }, { title: "切换" }],
      });
      if (index !== 1) return;
    }
    await syncEngine.configure(values.apiUrl, values.masterKey, values.name);
  }
  private conflictName(table: Table, id: string) {
    try {
      const e = localEntity(table, id) ?? stored("sync_shadow", table, id);
      return e?.title || e?.name || e?.term || id || "空搜索记录";
    } catch {
      return id || "记录格式无效";
    }
  }
  private async resolve(table: Table, id: string) {
    let comparison = "";
    try {
      const local = localEntity(table, id),
        remote = stored("sync_shadow", table, id);
      const labels: Record<string, string> = {
        title: "标题",
        comment: "备注",
        name: "名称",
        position_key: "书签顺序",
        last_read_page: "阅读页码",
        last_access_time: "最近访问",
        selected: "选中",
        enabled: "启用",
        deleted: "已删除",
        script_text: "翻译脚本",
        config: "服务配置",
        config_form: "配置表单",
        taglist_json: "标签",
        search_terms_json: "搜索词",
        host: "服务器",
        path: "路径",
        rate: "评分",
      };
      const keys = [...new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])].filter(
        (k) => k !== "sync_version" && k !== "id" && JSON.stringify(local?.[k]) !== JSON.stringify(remote?.[k]),
      );
      const value = (v: any) => (v === undefined ? "无记录" : v === null ? "未设置" : String(v).slice(0, 100));
      comparison = keys
        .slice(0, 5)
        .map((k) => `${labels[k] ?? k}\n本机：${value(local?.[k])}\n云端：${value(remote?.[k])}`)
        .join("\n\n");
    } catch {
      comparison = "本机记录格式不符合云端要求。请修改对应记录后选择保留本机，或采用云端内容。";
    }

    const { index } = await $ui.alert({
      title: "处理同步冲突",
      message:
        comparison +
        "\n\n选择本机内容会在下次同步时提交；保留阅读或收藏记录会同时恢复所属图库。选择云端内容可能移除本机对应记录。",
      actions: [{ title: "取消" }, { title: "保留本机" }, { title: "采用云端" }],
    });
    if (index > 0) syncEngine.resolve(table, id, index === 2);
  }
  private async devices() {
    const devices = await syncEngine.devices();
    const active = devices.filter((d) => !d.deleted);
    const { index } = await $ui.menu({
      items: active.map((d) => d.name + (d.id === dbManager.deviceId ? "（本机）" : "")),
    });
    if (index < 0) return;
    const device = active[index];
    const { index: action } = await $ui.alert({
      title: device.name,
      message: "解绑仅停止此设备访问，不撤销其持有的主密钥。",
      actions: [{ title: "取消" }, { title: "重命名" }, { title: "解绑", style: $alertActionType.destructive }],
    });
    if (action === 1) {
      const v = await formDialog<{ name: string }>({
        title: "设备名称",
        sections: [{ title: "", rows: [{ type: "string", title: "名称", key: "name", value: device.name }] }],
        checkHandler: (v) => !!v.name.trim() && v.name.length <= 100,
      });
      await syncEngine.renameDevice(device.id, v.name);
    }
    if (action === 2) await syncEngine.unbindDevice(device.id);
  }
}
