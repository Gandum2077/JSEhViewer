function showDatabaseRecovery(error: unknown): void {
  console.error(error);
  try {
    const { DatabaseRecoveryController } = require("./controllers/database-recovery-controller") as typeof import("./controllers/database-recovery-controller");
    new DatabaseRecoveryController(error).uirender({ navBarHidden: true });
  } catch (recoveryError) {
    console.error(recoveryError);
    $ui.alert({
      title: "数据库启动失败",
      message:
        "JSEhViewer 已停止继续写入数据库，但恢复页面也未能加载。请不要卸载脚本或清除数据；更新到修复版本后重试。",
      actions: [{ title: "知道了" }],
    });
  }
}

try {
  require("./index");
} catch (error) {
  showDatabaseRecovery(error);
}
