import { initializeDatabase, isDatabaseReady } from "./database-migration";

/** Keep the migration connection on its worker until it has committed and closed. */
export function startAfterDatabaseReady(databasePath: string, onReady: () => void): void {
  const startedAt = Date.now();
  const logPath = `${databasePath}.migration.log`;
  let phase = "等待数据库检查";
  const record = (status: "running" | "complete" | "failed", error?: string) => {
    try {
      $file.write({
        path: logPath,
        data: $data({
          string: JSON.stringify({
            status,
            phase,
            startedAt,
            updatedAt: Date.now(),
            elapsedMs: Date.now() - startedAt,
            error,
          }),
        }),
      });
    } catch (error) {
      // Diagnostic failures must not interrupt a database transaction.
      console.error("无法写入数据库迁移日志", error);
    }
  };

  const fail = (error: unknown) => {
    const message = (error instanceof Error ? error.message : String(error)).split("\nSQL:")[0];
    record("failed", message);
    $thread.main({
      handler: () => {
        $ui.loading(false);
        $ui.alert({
          title: "数据库迁移失败",
          message: `${phase}\n${message}\n\n阶段日志：${logPath}\n请保留 database.db、备份和 journal 文件。`,
        });
      },
    });
  };

  const migrate = () => {
    try {
      initializeDatabase(databasePath, (nextPhase) => {
        phase = nextPhase;
        record("running");
        // Keep intermediate progress in the log. Do not queue main-thread JS
        // callbacks while the worker still holds the shared JavaScript VM.
      });
    } catch (error) {
      fail(error);
      return;
    }
    record("complete");
    $thread.main({
      handler: () => {
        $ui.loading(false);
        onReady();
      },
    });
  };

  // Inspect the actual database on every launch; a cached flag could outlive a
  // restored backup. Keep recovery and inspection off the main thread as well.
  $thread.background({
    handler: () => {
      let ready: boolean;
      try {
        ready = isDatabaseReady(databasePath);
      } catch (error) {
        fail(error);
        return;
      }
      $thread.main({
        handler: () => {
          if (ready) {
            onReady();
            return;
          }
          $ui.loading("正在准备数据库，首次升级可能需要一些时间…");
          // Let the loading indicator appear before starting the migration.
          $thread.background({ delay: 0.1, handler: migrate });
        },
      });
    },
  });
}
