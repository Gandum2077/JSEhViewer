const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, existsSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  collectDatabaseStartupDiagnostic,
  databaseRecoveryInstructions,
  sanitizeDatabaseDiagnosticText,
} = require("../dist/utils/database-recovery");

const directory = mkdtempSync(join(tmpdir(), "jsehviewer-recovery-"));
const databasePath = join(directory, "database.db");
const backupPath = join(directory, "database.pre-sync-v1.backup.db");
const cookie = "ipb_member_id=1; ipb_pass_hash=private-cookie-value";
const bootstrapSecret = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const webdavPassword = "private-webdav-password";
const apiKey = "private-ai-api-key";

const database = new DatabaseSync(databasePath);
database.exec("CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT)");
database.exec("CREATE TABLE plugin_custom_state (value TEXT)");
database.prepare("INSERT INTO config (key, value) VALUES (?, ?)").run("cookie", cookie);
database.exec("PRAGMA user_version = 1");
database.close();
writeFileSync(backupPath, "backup-sentinel");

const error = new Error(
  `SQLite failed: bootstrap_secret=${bootstrapSecret} password=${webdavPassword} https://example.test/path?apikey=${apiKey}`,
);
error.name = "DatabaseInitializationError";

const diagnostic = collectDatabaseStartupDiagnostic(
  error,
  {
    files: { exists: existsSync },
    openDatabase(path) {
      const inspected = new DatabaseSync(path);
      return {
        query(sql) {
          return inspected.prepare(sql).all();
        },
        close() {
          inspected.close();
        },
      };
    },
    nowIso: () => "2026-08-12T00:00:00.000Z",
    appVersion: "test",
  },
  { database: databasePath, backup: backupPath },
);

assert.equal(diagnostic.error.code, "database-initialization-failed");
assert.equal(diagnostic.writes_blocked, true);
assert.equal(diagnostic.files.database_exists, true);
assert.equal(diagnostic.files.pre_sync_backup_exists, true);
assert.equal(diagnostic.sqlite.inspected, true);
assert.equal(diagnostic.sqlite.user_version, 1);
assert.equal(diagnostic.sqlite.table_count, 2);
assert.deepEqual(diagnostic.sqlite.known_tables_present, ["config"]);
assert.equal(diagnostic.sqlite.unknown_table_count, 1);
assert.equal(diagnostic.sqlite.quick_check, "ok");
assert.equal(diagnostic.sqlite.foreign_key_violation_count, 0);
assert.equal(diagnostic.recovery.automatic_restore_performed, false);
assert.equal(diagnostic.recovery.preferred_copy, "pre-sync-backup");
assert.equal(diagnostic.recovery.secrets_included, false);

const exported = JSON.stringify(diagnostic);
const instructions = databaseRecoveryInstructions(diagnostic);
for (const secret of [cookie, bootstrapSecret, webdavPassword, apiKey]) {
  assert.equal(exported.includes(secret), false, `diagnostic leaked ${secret}`);
  assert.equal(instructions.includes(secret), false, `instructions leaked ${secret}`);
}
assert.equal(exported.includes("private-cookie-value"), false);
assert.equal(sanitizeDatabaseDiagnosticText(`Bearer ${bootstrapSecret}`).includes(bootstrapSecret), false);
assert.equal(existsSync(databasePath), true, "diagnostic must preserve current database");
assert.equal(existsSync(backupPath), true, "diagnostic must preserve backup");

rmSync(directory, { recursive: true, force: true });
console.log("database recovery checks passed");
