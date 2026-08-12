import { BaseController, CustomNavigationBar, DynamicPreferenceListView, PreferenceSection } from "jsbox-cview";
import { PRE_SYNC_DATABASE_BACKUP_PATH } from "../utils/database-backup";
import {
  collectDatabaseStartupDiagnostic,
  createJsboxDatabaseRecoveryDependencies,
  DATABASE_DIAGNOSTIC_EXPORT_NAME,
  databaseRecoveryInstructions,
  DatabaseStartupDiagnostic,
  MAIN_DATABASE_PATH,
} from "../utils/database-recovery";

export class DatabaseRecoveryController extends BaseController {
  cviews: {
    navbar: CustomNavigationBar;
    list: DynamicPreferenceListView;
  };

  private readonly _diagnostic: DatabaseStartupDiagnostic;

  constructor(error: unknown) {
    super();
    this._diagnostic = collectDatabaseStartupDiagnostic(error, createJsboxDatabaseRecoveryDependencies());
    const navbar = new CustomNavigationBar({
      props: {
        title: "数据库恢复",
        popButtonEnabled: false,
      },
    });
    const list = new DynamicPreferenceListView({
      sections: this._sections(),
      props: {
        style: 2,
        infoAndLinkLeftInset: 145,
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.equalTo(view.super);
      },
    });
    this.cviews = { navbar, list };
    this.rootView.views = [navbar, list];
  }

  private _sections(): PreferenceSection[] {
    const diagnostic = this._diagnostic;
    return [
      {
        title: "已安全停止",
        rows: [
          {
            type: "interactive-info",
            title: "说明",
            value: "数据库启动失败，JSEhViewer 已停止进入正常页面，也不会继续写入业务数据。原数据库与已有备份均未被自动覆盖。",
          },
          { type: "info", title: "错误类型", value: diagnostic.error.code },
          { type: "interactive-info", title: "错误说明", value: diagnostic.error.message },
        ],
      },
      {
        title: "文件状态",
        rows: [
          { type: "info", title: "当前数据库", value: diagnostic.files.database_exists ? "已保留" : "未找到" },
          {
            type: "info",
            title: "升级前备份",
            value: diagnostic.files.pre_sync_backup_exists ? "已保留，可导出" : "未找到",
          },
          { type: "info", title: "SQLite quick_check", value: diagnostic.sqlite.quick_check },
          {
            type: "info",
            title: "数据库版本",
            value: diagnostic.sqlite.user_version === null ? "未知" : String(diagnostic.sqlite.user_version),
          },
        ],
      },
      {
        title: "恢复与诊断",
        rows: [
          { type: "action", title: "查看恢复步骤", value: () => void this._showInstructions() },
          { type: "action", title: "复制脱敏诊断 JSON", value: () => this._copyDiagnostic() },
          { type: "action", title: "导出脱敏诊断 JSON", value: () => this._shareDiagnostic() },
          ...(diagnostic.files.pre_sync_backup_exists
            ? [
                {
                  type: "action" as const,
                  title: "导出升级前数据库备份（敏感）",
                  value: () => void this._shareSensitiveDatabase(PRE_SYNC_DATABASE_BACKUP_PATH, "database.pre-sync-v1.backup.db"),
                },
              ]
            : []),
          ...(diagnostic.files.database_exists
            ? [
                {
                  type: "action" as const,
                  title: "导出当前数据库原件（敏感）",
                  value: () => void this._shareSensitiveDatabase(MAIN_DATABASE_PATH, "database.db"),
                },
              ]
            : []),
          { type: "action", title: "重新启动 JSEhViewer", value: () => $addin.restart() },
        ],
      },
    ];
  }

  private async _showInstructions(): Promise<void> {
    await $ui.alert({
      title: "数据库恢复步骤",
      message: databaseRecoveryInstructions(this._diagnostic),
      actions: [{ title: "知道了" }],
    });
  }

  private _diagnosticJson(): string {
    return JSON.stringify(this._diagnostic, null, 2);
  }

  private _copyDiagnostic(): void {
    $clipboard.text = this._diagnosticJson();
    $ui.success("已复制脱敏诊断");
  }

  private _shareDiagnostic(): void {
    $share.sheet({
      item: { name: DATABASE_DIAGNOSTIC_EXPORT_NAME, data: $data({ string: this._diagnosticJson() }) },
      handler: (success) => {
        if (success) $ui.success("脱敏诊断已导出");
      },
    });
  }

  private async _shareSensitiveDatabase(path: string, name: string): Promise<void> {
    const confirmation = await $ui.alert({
      title: "数据库文件包含秘密",
      message:
        "数据库原件可能包含 E-Hentai Cookie、AI/API Key 和 WebDAV 密码。只能导出到你自己的私密存储，不要上传到公开 Issue、网盘分享或聊天群。",
      actions: [{ title: "取消" }, { title: "仍要导出" }],
    });
    if (confirmation.index !== 1) return;
    if (!$file.exists(path)) {
      $ui.error("数据库文件已不存在");
      return;
    }
    $share.sheet({
      item: { name, data: $file.read(path) },
      handler: (success) => {
        if (success) $ui.success("数据库原件已导出");
      },
    });
  }
}
