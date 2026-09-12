import { startAfterDatabaseReady } from "./utils/database-bootstrap";
import { databasePath } from "./utils/glv";

if ($app.env === $env.app) {
  // Business modules open their own database during import. Load them only after
  // the background migration connection has committed and closed.
  startAfterDatabaseReady(databasePath, () => require("./application"));
} else {
  $ui.error("请在JSBox主程序中运行");
}
