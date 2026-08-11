import { BaseController, CustomNavigationBar, DynamicPreferenceListView, PreferenceSection, Web } from "jsbox-cview";
import {
  clearCloudSyncPhase0Credentials,
  CloudSyncBootstrapResponse,
  CloudSyncConnectionPackage,
  CloudSyncPendingBootstrap,
  CloudSyncPhase0Error,
  CloudSyncWorkerInfo,
  completeCloudSyncBootstrap,
  fetchCloudSyncWorkerInfo,
  getCloudSyncBootstrapSecret,
  getCloudSyncPendingBootstrap,
  getCloudSyncRegistration,
  getCloudSyncStoredProfile,
  parseCloudSyncConnectionPackage,
  postCloudSyncBootstrap,
  removeCloudSyncBootstrapSecret,
  saveCloudSyncConnectionPackage,
  saveCloudSyncPendingBootstrap,
  sha256Base64UrlSecret,
  testCloudSyncKeychainRoundTrip,
} from "../utils/cloud-sync-phase0";
import { runCloudSyncDatabaseInitializationDiagnostic } from "../utils/cloud-sync-database-initialization-diagnostic";
import { runCloudSyncDatabaseV2MigrationDiagnostic } from "../utils/cloud-sync-database-v2-migration-diagnostic";
import { runCloudSyncSqliteDiagnostic } from "../utils/cloud-sync-sqlite-diagnostic";
import { runCloudSyncArchiveRepositoryDiagnostic } from "../utils/cloud-sync-archive-repository-diagnostic";
import { runCloudSyncSearchRepositoryDiagnostic } from "../utils/cloud-sync-search-repository-diagnostic";
import { runCloudSyncUploaderRepositoryDiagnostic } from "../utils/cloud-sync-uploader-repository-diagnostic";

const BASE64URL_32_BYTES_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface SecureIdentity {
  deviceToken: string;
  deviceId: string;
}

interface CryptoSelfTestResult {
  ok: boolean;
  random: boolean;
  hmacSha256: boolean;
  hkdfSha256: boolean;
  aes256Gcm: boolean;
  tamperRejected: boolean;
  durationMs: number;
  error?: string;
}

type CryptoWaiter = {
  resolve: (result: CryptoSelfTestResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

function displayError(error: unknown): string {
  if (error instanceof CloudSyncPhase0Error) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "发生未知错误。";
}

function parseSecureIdentity(value: unknown): SecureIdentity {
  let object: unknown = value;
  if (typeof value === "string") {
    try {
      object = JSON.parse(value);
    } catch {
      throw new CloudSyncPhase0Error("安全随机模块返回了无效 JSON。", "invalid-random-result");
    }
  }
  if (
    typeof object !== "object" ||
    object === null ||
    !("deviceToken" in object) ||
    !("deviceId" in object) ||
    typeof object.deviceToken !== "string" ||
    typeof object.deviceId !== "string" ||
    !BASE64URL_32_BYTES_PATTERN.test(object.deviceToken) ||
    !UUID_V4_PATTERN.test(object.deviceId)
  ) {
    throw new CloudSyncPhase0Error("安全随机模块生成的设备身份格式无效。", "invalid-random-result");
  }
  return {
    deviceToken: object.deviceToken,
    deviceId: object.deviceId.toLowerCase(),
  };
}

export class CloudSyncController extends BaseController {
  cviews: {
    navbar: CustomNavigationBar;
    list: DynamicPreferenceListView;
    cryptoWeb: Web;
  };

  private _busyOperation?: string;
  private _webCryptoReady = false;
  private _ignoreNextBootstrapResponse = false;
  private _keychainCheck = "未检查";
  private _randomCheck = "未检查";
  private _cryptoCheck = "未检查";
  private _sqliteCheck = "未检查";
  private _databaseInitializationCheck = "未检查";
  private _databaseV2MigrationCheck = "未检查";
  private _archiveRepositoryCheck = "未检查";
  private _searchRepositoryCheck = "未检查";
  private _uploaderRepositoryCheck = "未检查";
  private _lastResult = "尚未运行本次实机检查";
  private _workerInfo?: CloudSyncWorkerInfo;
  private _cryptoWaiter?: CryptoWaiter;

  constructor() {
    super({
      events: {
        didAppear: () => this._refreshSections(),
        didRemove: () => {
          if (this._cryptoWaiter) {
            clearTimeout(this._cryptoWaiter.timeout);
            this._cryptoWaiter.reject(new Error("页面已关闭。"));
            this._cryptoWaiter = undefined;
          }
        },
      },
    });

    const navbar = new CustomNavigationBar({
      props: {
        title: "云端同步",
        popButtonEnabled: true,
      },
    });

    const list = new DynamicPreferenceListView({
      sections: this._getSections(),
      props: {
        style: 2,
        infoAndLinkLeftInset: 145,
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.equalTo(view.super);
      },
      events: {
        changed: (values) => {
          const state = values as { ignoreNextBootstrapResponse?: boolean };
          this._ignoreNextBootstrapResponse = state.ignoreNextBootstrapResponse ?? false;
          this._refreshSections();
        },
      },
    });

    const cryptoWeb = new Web({
      props: {
        html: $file.read("assets/cloud-sync-crypto.html").string,
        allowsNavigation: false,
        allowsLinkPreview: false,
        scrollEnabled: false,
        showsProgress: false,
        userInteractionEnabled: false,
        alpha: 0,
      },
      layout: (make, view) => {
        make.left.top.equalTo(view.super);
        make.size.equalTo($size(1, 1));
      },
      events: {
        didFinish: () => {
          this._webCryptoReady = true;
          this._refreshSections();
        },
        didFail: () => {
          this._webCryptoReady = false;
          this._randomCheck = "失败：密码学模块未加载";
          this._cryptoCheck = "失败：密码学模块未加载";
          this._refreshSections();
        },
        cloudSyncCryptoSelfTest: (result: CryptoSelfTestResult) => {
          if (!this._cryptoWaiter) return;
          clearTimeout(this._cryptoWaiter.timeout);
          const waiter = this._cryptoWaiter;
          this._cryptoWaiter = undefined;
          waiter.resolve(result);
        },
      },
    });

    this.cviews = { navbar, list, cryptoWeb };
    this.rootView.views = [navbar, list, cryptoWeb];
  }

  private _getLocalState() {
    try {
      return {
        profile: getCloudSyncStoredProfile(),
        bootstrapSecret: getCloudSyncBootstrapSecret(),
        pending: getCloudSyncPendingBootstrap(),
        registration: getCloudSyncRegistration(),
        error: undefined,
      };
    } catch (error) {
      return {
        profile: undefined,
        bootstrapSecret: undefined,
        pending: undefined,
        registration: undefined,
        error: displayError(error),
      };
    }
  }

  private _getSections(): PreferenceSection[] {
    const state = this._getLocalState();
    const endpoint = state.profile?.endpoint;
    const packageStatus = state.error ? `异常：${state.error}` : state.profile ? "已导入并保存到 Keychain" : "未导入";
    const registrationStatus = state.pending
      ? `等待提交或重试（${state.pending.device_id}）`
      : state.registration
        ? `已注册（${state.registration.device_id}）`
        : "尚未注册本设备";
    const workerStatus = this._workerInfo
      ? `${this._workerInfo.ready ? "就绪" : "未就绪"}；D1 schema ${this._workerInfo.schema_version}；${
          this._workerInfo.initialized ? "已初始化" : "未初始化"
        }`
      : "未检查";

    const sections: PreferenceSection[] = [
      {
        title: "说明",
        rows: [
          {
            type: "interactive-info",
            title: "当前阶段",
            value:
              "Phase 0 已完成；当前进行 Phase 1 本地数据库诊断。此页面不会上传阅读记录、搜索历史或图库资料，v2 迁移检查只使用关闭重开验证后立即删除的临时库。",
          },
          {
            type: "info",
            title: "进行中的操作",
            value: this._busyOperation ?? "无",
          },
          {
            type: "interactive-info",
            title: "最近结果",
            value: this._lastResult,
          },
        ],
      },
      {
        title: "连接包",
        rows: [
          { type: "info", title: "保存状态", value: packageStatus },
          ...(endpoint
            ? [
                {
                  type: "interactive-info" as const,
                  title: "Worker 地址",
                  value: endpoint,
                  copyable: true,
                },
              ]
            : []),
          {
            type: "symbol-action",
            title: "从文件导入",
            symbol: "doc.badge.plus",
            value: () => void this._importFromFile(),
          },
          {
            type: "symbol-action",
            title: "从剪贴板导入",
            symbol: "doc.on.clipboard",
            value: () => void this._importFromClipboard(),
          },
          {
            type: "symbol-action",
            title: "扫描二维码导入",
            symbol: "qrcode.viewfinder",
            value: () => void this._importFromQrCode(),
          },
        ],
      },
      {
        title: "本机能力",
        rows: [
          { type: "info", title: "Keychain", value: this._keychainCheck },
          {
            type: "info",
            title: "安全随机数",
            value: this._webCryptoReady ? this._randomCheck : "正在加载 WebKit 模块",
          },
          { type: "info", title: "密码学向量", value: this._cryptoCheck },
          { type: "info", title: "SQLite 事务", value: this._sqliteCheck },
          { type: "info", title: "数据库初始化", value: this._databaseInitializationCheck },
          { type: "info", title: "DB v2 临时迁移", value: this._databaseV2MigrationCheck },
          { type: "info", title: "图库 Repository", value: this._archiveRepositoryCheck },
          { type: "info", title: "搜索 Repository", value: this._searchRepositoryCheck },
          { type: "info", title: "上传者 Repository", value: this._uploaderRepositoryCheck },
          {
            type: "action",
            title: "检查 Keychain 与安全随机数",
            value: () => void this._runLocalChecks(),
          },
          {
            type: "action",
            title: "运行 HMAC / HKDF / AES-GCM 测试向量",
            value: () => void this._runCryptoSelfTest(),
          },
          {
            type: "action",
            title: "检查 SQLite 队列与事务",
            value: () => void this._runSqliteDiagnostic(),
          },
          {
            type: "action",
            title: "检查数据库初始化（fresh/v0/v1）",
            value: () => void this._runDatabaseInitializationDiagnostic(),
          },
          {
            type: "action",
            title: "检查 DB v2 临时迁移与回滚",
            value: () => void this._runDatabaseV2MigrationDiagnostic(),
          },
          {
            type: "action",
            title: "检查图库 Repository 业务读写",
            value: () => void this._runArchiveRepositoryDiagnostic(),
          },
          {
            type: "action",
            title: "检查搜索历史与书签 Repository",
            value: () => void this._runSearchRepositoryDiagnostic(),
          },
          {
            type: "action",
            title: "检查标记与屏蔽上传者 Repository",
            value: () => void this._runUploaderRepositoryDiagnostic(),
          },
        ],
      },
      {
        title: "Worker 与首台设备",
        rows: [
          { type: "info", title: "Worker / D1", value: workerStatus },
          { type: "interactive-info", title: "设备注册", value: registrationStatus },
          {
            type: "action",
            title: "检查 Worker 与 D1",
            value: () => void this._checkWorker(),
          },
          {
            type: "boolean",
            key: "ignoreNextBootstrapResponse",
            title: "模拟丢失注册响应",
            value: this._ignoreNextBootstrapResponse,
          },
          ...(state.profile && state.bootstrapSecret
            ? [
                {
                  type: "action" as const,
                  title: state.pending ? "重试同一笔设备注册" : state.registration ? "重放相同注册请求" : "注册此设备",
                  value: () => void this._bootstrapDevice(),
                },
              ]
            : []),
          ...(state.registration && state.bootstrapSecret
            ? [
                {
                  type: "action" as const,
                  title: "完成重放验证并删除一次性部署密钥",
                  value: () => void this._discardBootstrapSecret(),
                },
              ]
            : []),
        ],
      },
      {
        title: "诊断与清理",
        rows: [
          {
            type: "action",
            title: "复制脱敏诊断摘要",
            value: () => this._copyDiagnosticSummary(),
          },
          {
            type: "action",
            title: "清除本机 Phase 0 凭据",
            destructive: true,
            value: () => void this._clearLocalCredentials(),
          },
        ],
      },
    ];
    return sections;
  }

  private _refreshSections(): void {
    if (!this.cviews?.list?.view) return;
    this.cviews.list.sections = this._getSections();
  }

  private async _perform(operation: string, handler: () => Promise<void>): Promise<void> {
    if (this._busyOperation) {
      $ui.toast(`正在${this._busyOperation}，请稍候`);
      return;
    }
    this._busyOperation = operation;
    this._refreshSections();
    $ui.loading(operation);
    try {
      await handler();
    } catch (error) {
      const message = displayError(error);
      this._lastResult = `${operation}失败：${message}`;
      $ui.error(message);
    } finally {
      $ui.loading(false);
      this._busyOperation = undefined;
      this._refreshSections();
    }
  }

  private async _confirmReplacingPackage(value: CloudSyncConnectionPackage): Promise<boolean> {
    let current;
    try {
      current = getCloudSyncStoredProfile();
    } catch {
      const result = await $ui.alert({
        title: "替换异常的本机资料",
        message:
          "Keychain 中已有的 Phase 0 同步资料无法解析。继续会只清除这些本机测试凭据，不会删除远端 Worker 或 D1 数据。",
        actions: [{ title: "取消" }, { title: "替换", style: $alertActionType.destructive }],
      });
      return result.index === 1;
    }
    if (
      !current ||
      (current.endpoint === value.endpoint &&
        current.profile_epoch === value.profile_epoch &&
        current.master_key === value.master_key &&
        current.recovery_secret === value.recovery_secret)
    )
      return true;
    const result = await $ui.alert({
      title: "替换连接包",
      message:
        "当前连接包属于另一套同步服务。继续会清除本机 Phase 0 的待注册身份和设备令牌，但不会删除任何远端 Worker 或 D1 数据。",
      actions: [{ title: "取消" }, { title: "替换", style: $alertActionType.destructive }],
    });
    return result.index === 1;
  }

  private async _saveImportedText(text: string, source: string): Promise<void> {
    const value = parseCloudSyncConnectionPackage(text.trim());
    if (!(await this._confirmReplacingPackage(value))) return;
    saveCloudSyncConnectionPackage(value);
    this._workerInfo = undefined;
    this._lastResult = `已从${source}导入连接包；三个秘密值已写入 Keychain，页面和日志不会显示它们。`;
    $ui.success("连接包已安全导入");
  }

  private async _importFromFile(): Promise<void> {
    await this._perform("导入连接包", async () => {
      const data = await $drive.open({ types: ["public.json", "public.plain-text"] });
      if (!data?.string) {
        throw new CloudSyncPhase0Error("所选文件没有可读取的文本内容。", "empty-file");
      }
      await this._saveImportedText(data.string, "文件");
    });
  }

  private async _importFromClipboard(): Promise<void> {
    await this._perform("导入连接包", async () => {
      const text = $clipboard.text;
      if (!text) throw new CloudSyncPhase0Error("剪贴板中没有文本。", "empty-clipboard");
      await this._saveImportedText(text, "剪贴板");
    });
  }

  private async _importFromQrCode(): Promise<void> {
    await this._perform("扫描连接包", async () => {
      const text = await new Promise<string>((resolve, reject) => {
        $qrcode.scan({
          handler: resolve,
          cancelled: () => reject(new CloudSyncPhase0Error("已取消扫描。", "cancelled")),
        });
      });
      await this._saveImportedText(text, "二维码");
    });
  }

  private async _generateSecureIdentity(): Promise<SecureIdentity> {
    if (!this._webCryptoReady) {
      throw new CloudSyncPhase0Error("WebKit 安全随机模块尚未加载，请稍后重试。", "web-crypto-not-ready");
    }
    const result = await this.cviews.cryptoWeb.view.exec("createCloudSyncIdentity();");
    if (result.error) {
      throw new CloudSyncPhase0Error(
        `WebKit 安全随机数调用失败：${result.error.localizedDescription || "未知错误"}`,
        "secure-random-failed",
      );
    }
    return parseSecureIdentity(result.result);
  }

  private async _runLocalChecks(): Promise<void> {
    await this._perform("检查本机安全存储", async () => {
      const first = await this._generateSecureIdentity();
      const second = await this._generateSecureIdentity();
      if (first.deviceToken === second.deviceToken || first.deviceId === second.deviceId) {
        throw new CloudSyncPhase0Error("安全随机模块连续生成了重复结果。", "duplicate-random-result");
      }
      this._randomCheck = "通过：WebKit crypto.getRandomValues";
      testCloudSyncKeychainRoundTrip(first.deviceToken);
      this._keychainCheck = "通过：写入、读回和删除一致";
      this._lastResult = "Keychain 与安全随机数检查通过；密钥没有写入 SQLite。";
      $ui.success("本机能力检查通过");
    });
  }

  private async _runSqliteDiagnostic(): Promise<void> {
    await this._perform("检查 SQLite 队列与事务", async () => {
      try {
        const result = runCloudSyncSqliteDiagnostic();
        this._sqliteCheck = `通过：${result.durationMs} ms`;
        this._lastResult =
          `SQLite 临时库检查通过（${result.durationMs} ms）：dbQueue 顺序正确，正常事务完整提交，` +
          "约束失败通过 { result, error } 返回，失败事务完整回滚，临时文件已删除。";
        $ui.success("SQLite 队列与事务检查通过");
      } catch (error) {
        this._sqliteCheck = `失败：${displayError(error)}`;
        throw error;
      }
    });
  }

  private async _runDatabaseInitializationDiagnostic(): Promise<void> {
    await this._perform("检查数据库初始化与迁移", async () => {
      try {
        const result = runCloudSyncDatabaseInitializationDiagnostic();
        this._databaseInitializationCheck = `通过：${result.durationMs} ms`;
        this._lastResult =
          `数据库初始化临时库检查通过（${result.durationMs} ms）：fresh、v0、v1 最终 schema 一致，` +
          "旧数据完整迁移，v1 重启不覆盖用户设置，未知版本在零 schema 写入下停止，临时文件已删除。";
        $ui.success("数据库初始化与迁移检查通过");
      } catch (error) {
        this._databaseInitializationCheck = `失败：${displayError(error)}`;
        throw error;
      }
    });
  }

  private async _runDatabaseV2MigrationDiagnostic(): Promise<void> {
    await this._perform("检查 DB v2 临时迁移与回滚", async () => {
      try {
        const result = runCloudSyncDatabaseV2MigrationDiagnostic();
        this._databaseV2MigrationCheck = `通过：${result.durationMs} ms`;
        this._lastResult =
          `DB v2 临时迁移检查通过（${result.durationMs} ms）：${result.archiveCount} 条图库、` +
          `${result.historyCount} 条历史完成拆分和稳定 ID 迁移，关闭重开后数据完整；` +
          "AI、WebDAV、marked tags 与阅读器设置保持原样，注入故障完整回滚，临时文件已删除。";
        $ui.success("DB v2 临时迁移与回滚检查通过");
      } catch (error) {
        this._databaseV2MigrationCheck = `失败：${displayError(error)}`;
        throw error;
      }
    });
  }

  private async _runArchiveRepositoryDiagnostic(): Promise<void> {
    await this._perform("检查图库 Repository 业务读写", async () => {
      try {
        const result = runCloudSyncArchiveRepositoryDiagnostic();
        this._archiveRepositoryCheck = `通过：${result.durationMs} ms`;
        this._lastResult =
          `图库 Repository 临时库检查通过（${result.durationMs} ms）：${result.archiveCount} 条图库完成原子保存、` +
          "标签故障回滚、筛选分页和维护性删除检查；关闭重开后数据完整，临时文件已删除。";
        $ui.success("图库 Repository 业务读写检查通过");
      } catch (error) {
        this._archiveRepositoryCheck = `失败：${displayError(error)}`;
        throw error;
      }
    });
  }

  private async _runSearchRepositoryDiagnostic(): Promise<void> {
    await this._perform("检查搜索历史与书签 Repository", async () => {
      try {
        const result = runCloudSyncSearchRepositoryDiagnostic();
        this._searchRepositoryCheck = `通过：${result.durationMs} ms`;
        this._lastResult =
          `搜索 Repository 临时库检查通过（${result.durationMs} ms）：${result.historyCount} 条历史、` +
          `${result.bookmarkCount} 条书签完成 parent/terms 原子回滚、特殊字符与顺序、本机历史删除和书签重排检查；` +
          "关闭重开后数据完整，临时文件已删除。";
        $ui.success("搜索历史与书签 Repository 检查通过");
      } catch (error) {
        this._searchRepositoryCheck = `失败：${displayError(error)}`;
        throw error;
      }
    });
  }

  private async _runUploaderRepositoryDiagnostic(): Promise<void> {
    await this._perform("检查标记与屏蔽上传者 Repository", async () => {
      try {
        const result = runCloudSyncUploaderRepositoryDiagnostic();
        this._uploaderRepositoryCheck = `通过：${result.durationMs} ms`;
        this._lastResult =
          `上传者 Repository 临时库检查通过（${result.durationMs} ms）：${result.markedCount} 条标记、` +
          `${result.bannedCount} 条屏蔽完成用户/远端/上游来源检查、镜像故障回滚和冲突清理；` +
          "关闭重开后数据完整，临时文件已删除。";
        $ui.success("标记与屏蔽上传者 Repository 检查通过");
      } catch (error) {
        this._uploaderRepositoryCheck = `失败：${displayError(error)}`;
        throw error;
      }
    });
  }

  private _requestCryptoSelfTest(): Promise<CryptoSelfTestResult> {
    if (!this._webCryptoReady) {
      return Promise.reject(
        new CloudSyncPhase0Error("WebKit 密码学模块尚未加载，请稍后重试。", "web-crypto-not-ready"),
      );
    }
    if (this._cryptoWaiter) {
      return Promise.reject(new CloudSyncPhase0Error("密码学自检已经在运行。", "crypto-test-running"));
    }
    return new Promise<CryptoSelfTestResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._cryptoWaiter = undefined;
        reject(new CloudSyncPhase0Error("密码学自检超时。", "crypto-test-timeout"));
      }, 30000);
      this._cryptoWaiter = { resolve, reject, timeout };
      this.cviews.cryptoWeb.view.eval({
        script: "runCloudSyncCryptoSelfTest();",
        handler: (_result, error) => {
          if (!error || !this._cryptoWaiter) return;
          clearTimeout(this._cryptoWaiter.timeout);
          this._cryptoWaiter = undefined;
          reject(
            new CloudSyncPhase0Error(
              `无法启动密码学自检：${error.localizedDescription || "未知错误"}`,
              "crypto-test-failed",
            ),
          );
        },
      });
    });
  }

  private async _runCryptoSelfTest(): Promise<void> {
    await this._perform("运行密码学测试向量", async () => {
      const memoryBefore = $device.space.memory.free.bytes;
      const result = await this._requestCryptoSelfTest();
      const memoryAfter = $device.space.memory.free.bytes;
      const memoryDelta = Math.max(0, memoryBefore - memoryAfter);
      if (!result.ok) {
        const failed = [
          ["安全随机数", result.random],
          ["HMAC-SHA-256", result.hmacSha256],
          ["HKDF-SHA-256", result.hkdfSha256],
          ["AES-256-GCM", result.aes256Gcm],
          ["篡改拒绝", result.tamperRejected],
        ]
          .filter(([, passed]) => !passed)
          .map(([name]) => name)
          .join("、");
        throw new CloudSyncPhase0Error(
          `测试向量未通过：${failed || result.error || "未知项目"}。`,
          "crypto-vector-failed",
        );
      }
      this._cryptoCheck = `通过：${result.durationMs} ms`;
      this._randomCheck = "通过：WebKit crypto.getRandomValues";
      this._lastResult = `公开测试向量全部通过（${result.durationMs} ms）；检查前后可用内存差约 ${(
        memoryDelta /
        1024 /
        1024
      ).toFixed(1)} MiB。该差值不是精确峰值。`;
      $ui.success("密码学测试向量通过");
    });
  }

  private async _checkWorker(): Promise<void> {
    await this._perform("检查 Worker 与 D1", async () => {
      const profile = getCloudSyncStoredProfile();
      if (!profile) throw new CloudSyncPhase0Error("请先导入连接包。", "profile-missing");
      this._workerInfo = await fetchCloudSyncWorkerInfo(profile.endpoint);
      this._lastResult = `Worker ${this._workerInfo.worker_version} 已就绪；D1 database/migrations 检查通过；当前${
        this._workerInfo.initialized ? "已初始化" : "尚未初始化"
      }。`;
      $ui.success("Worker 与 D1 检查通过");
    });
  }

  private async _pendingForBootstrap(): Promise<CloudSyncPendingBootstrap> {
    const profile = getCloudSyncStoredProfile();
    if (!profile) throw new CloudSyncPhase0Error("请先导入连接包。", "profile-missing");

    const existingPending = getCloudSyncPendingBootstrap();
    if (existingPending) return existingPending;

    const registration = getCloudSyncRegistration();
    const identity = registration
      ? { deviceId: registration.device_id, deviceToken: registration.device_token }
      : await this._generateSecureIdentity();
    const pending: CloudSyncPendingBootstrap = {
      format: 1,
      endpoint: profile.endpoint,
      device_id: identity.deviceId,
      device_token: identity.deviceToken,
      profile_epoch: profile.profile_epoch,
      recovery_token_hash: sha256Base64UrlSecret(profile.recovery_secret),
      created_at: new Date().toISOString(),
    };
    saveCloudSyncPendingBootstrap(pending);
    return pending;
  }

  private async _bootstrapDevice(): Promise<void> {
    await this._perform("注册本设备", async () => {
      const profile = getCloudSyncStoredProfile();
      const bootstrapSecret = getCloudSyncBootstrapSecret();
      if (!profile || !bootstrapSecret) {
        throw new CloudSyncPhase0Error("连接包或一次性部署密钥不存在，请重新导入。", "bootstrap-secret-missing");
      }

      const pending = await this._pendingForBootstrap();
      let response: CloudSyncBootstrapResponse;
      try {
        this._workerInfo = await fetchCloudSyncWorkerInfo(profile.endpoint);
        response = await postCloudSyncBootstrap(pending, bootstrapSecret);
      } catch (error) {
        if (error instanceof CloudSyncPhase0Error && ["offline", "timeout", "network-error"].includes(error.code)) {
          throw new CloudSyncPhase0Error(
            `${error.message} 设备 ID 和令牌已预先保存在 Keychain；恢复网络后会重试同一笔注册。`,
            error.code,
            error.status,
          );
        }
        if (
          error instanceof CloudSyncPhase0Error &&
          ["invalid-bootstrap-response", "bootstrap-identity-mismatch", "already-initialized"].includes(error.code)
        ) {
          try {
            this._workerInfo = await fetchCloudSyncWorkerInfo(profile.endpoint);
          } catch {
            // Keep the original registration error. The pending identity is
            // already persisted and remains the only safe retry identity.
          }
          if (this._workerInfo?.initialized) {
            throw new CloudSyncPhase0Error(
              `${error.message} Worker 已经完成初始化，但本机尚未保存注册结果；请勿清除本机凭据或生成新设备。先将 Worker 升级到 0.1.1-phase0 或更高版本，再重试同一笔设备注册。`,
              "bootstrap-result-uncertain",
              error.status,
            );
          }
        }
        throw error;
      }

      if (this._ignoreNextBootstrapResponse) {
        this._ignoreNextBootstrapResponse = false;
        this._lastResult =
          "已模拟丢弃服务端成功响应：本机仍保留同一笔待注册身份。现在可强制关闭 JSBox，重开后点击“重试同一笔设备注册”。";
        await $ui.alert({
          title: "已模拟响应丢失",
          message: this._lastResult,
          actions: [{ title: "知道了" }],
        });
        return;
      }

      completeCloudSyncBootstrap(pending, response);
      this._workerInfo = await fetchCloudSyncWorkerInfo(profile.endpoint);
      this._lastResult = response.replayed
        ? "相同设备身份的注册请求已被 Worker 幂等接受，没有创建第二台设备。"
        : "首台设备注册成功。一次性部署密钥暂时保留，仅用于 Phase 0 的相同请求重放验证。";
      $ui.success(response.replayed ? "幂等重放通过" : "设备注册成功");
    });
  }

  private async _discardBootstrapSecret(): Promise<void> {
    const result = await $ui.alert({
      title: "删除一次性部署密钥",
      message:
        "仅删除本机 Keychain 中已经用过的 bootstrap secret；不会删除设备令牌、主密钥、恢复凭据或远端数据。删除后不能再做 bootstrap 重放测试。",
      actions: [{ title: "取消" }, { title: "删除", style: $alertActionType.destructive }],
    });
    if (result.index !== 1) return;
    await this._perform("删除一次性部署密钥", async () => {
      removeCloudSyncBootstrapSecret();
      this._lastResult = "本机的一次性部署密钥已删除，设备令牌与同步密钥仍保存在 Keychain。";
      $ui.success("一次性部署密钥已删除");
    });
  }

  private _copyDiagnosticSummary(): void {
    const state = this._getLocalState();
    const summary = {
      format: 1,
      phase: "phase1",
      endpoint: state.profile?.endpoint ?? null,
      profile_epoch: state.profile?.profile_epoch ?? null,
      package_saved: Boolean(state.profile),
      bootstrap_secret_saved: Boolean(state.bootstrapSecret),
      pending_device_id: state.pending?.device_id ?? null,
      registered_device_id: state.registration?.device_id ?? null,
      keychain_check: this._keychainCheck,
      random_check: this._randomCheck,
      crypto_check: this._cryptoCheck,
      sqlite_check: this._sqliteCheck,
      database_initialization_check: this._databaseInitializationCheck,
      database_v2_migration_check: this._databaseV2MigrationCheck,
      worker: this._workerInfo
        ? {
            version: this._workerInfo.worker_version,
            protocol_min: this._workerInfo.protocol_min,
            protocol_max: this._workerInfo.protocol_max,
            schema_version: this._workerInfo.schema_version,
            initialized: this._workerInfo.initialized,
            ready: this._workerInfo.ready,
            checks: this._workerInfo.checks,
          }
        : null,
      local_error: state.error ?? null,
      last_result: this._lastResult,
    };
    $clipboard.text = JSON.stringify(summary, null, 2);
    $ui.success("已复制脱敏摘要");
  }

  private async _clearLocalCredentials(): Promise<void> {
    const result = await $ui.alert({
      title: "清除本机 Phase 0 凭据",
      message:
        "此操作只清除 JSEhViewer Keychain 中的连接包、主密钥、恢复凭据、待注册身份和设备令牌。它不会删除 Cloudflare Worker 或 D1 数据。恢复流程尚未实现，继续前请确认恢复包仍在安全位置。",
      actions: [{ title: "取消" }, { title: "清除", style: $alertActionType.destructive }],
    });
    if (result.index !== 1) return;
    await this._perform("清除本机凭据", async () => {
      clearCloudSyncPhase0Credentials();
      this._workerInfo = undefined;
      this._keychainCheck = "未检查";
      this._randomCheck = "未检查";
      this._cryptoCheck = "未检查";
      this._sqliteCheck = "未检查";
      this._lastResult = "本机 Phase 0 凭据已清除；远端 Worker 和 D1 未发生变化。";
      $ui.success("本机凭据已清除");
    });
  }
}
