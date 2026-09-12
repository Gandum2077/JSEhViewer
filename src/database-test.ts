/** Standalone entry using the same initializer as the application. */
import { startAfterDatabaseReady } from "./utils/database-bootstrap";
import { databasePath } from "./utils/glv";

if ($app.env === $env.app) {
  startAfterDatabaseReady(databasePath, () => $ui.success("数据库迁移完成"));
} else {
  $ui.error("请在JSBox主程序中运行");
}
