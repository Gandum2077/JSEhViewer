import { configManager } from "../utils/config";
import { globalTimer } from "../utils/timer";
import { syncEngine } from "./engine";
import { syncLog } from "./logging";
import { selectedTables } from "./store";

/** Session-only scheduling; manual sync always uses the engine's own lock. */
export class SyncScheduler {
  private started = false;
  private _paused = false;
  private holds = 0;
  private listeners = new Set<() => void>();

  get paused() {
    return this._paused;
  }

  start() {
    if (this.started) return;
    globalTimer.addTask({
      id: "cloudflare-sync",
      interval: 30,
      // GlobalTimer starts this countdown at 30 ticks, without calling now.
      immediate: true,
      handler: () => {
        void this.tick();
      },
    });
    this.started = true;
    syncLog("scheduler_started", { intervalSeconds: 30 }, "info");
  }

  setPaused(paused: boolean) {
    if (this._paused === paused) return;
    this._paused = paused;
    syncLog(paused ? "scheduler_paused" : "scheduler_resumed", { scope: "session" }, "info");
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Do not start an automatic run while a management action awaits user input. */
  hold() {
    this.holds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds--;
    };
  }

  private async tick() {
    try {
      const reason = this._paused
        ? "paused"
        : $device.networkType === 0
          ? "offline"
          : syncEngine.busy
            ? "busy"
            : this.holds
              ? "management_action"
              : !configManager.syncCredentials
                ? "not_configured"
                : !selectedTables().length
                  ? "no_selected_tables"
                  : undefined;
      if (reason) {
        syncLog("auto_sync_skipped", { reason }, "info");
        return;
      }
      syncLog("auto_sync_started", {}, "info");
      // No await between the busy check and synchronize acquiring its lock.
      const completed = await syncEngine.synchronize();
      syncLog("auto_sync_finished", { completed }, "info");
    } catch (error) {
      // GlobalTimer has a synchronous handler: never leak a rejected promise.
      syncLog("auto_sync_error", { error }, "error");
    }
  }
}

export const syncScheduler = new SyncScheduler();
