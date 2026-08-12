const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, unlinkSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { MarkedTagMode } = require("../dist/repositories/marked-tag-repository");
const { createV2RepositoryRuntime } = require("../dist/repositories/repository-runtime");
const { SyncMutationWriter } = require("../dist/repositories/sync-mutation-writer");
const { CloudSyncDiagnosticEntityCodec } = require("../dist/utils/cloud-sync-diagnostic-entity-codec");
const { ensurePreSyncDatabaseBackup } = require("../dist/utils/database-backup");
const { CURRENT_SCHEMA_STATEMENTS } = require("../dist/utils/database-initialization");
const { DATABASE_V2_STARTUP_PHASES, startDatabaseV2Draft } = require("../dist/utils/database-v2-startup-draft");
const { withSqliteTransaction } = require("../dist/utils/sqlite-safe");

const MIGRATION_TIME = "2026-08-12T14:00:00.000Z";

function normalize(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value ?? null;
}

class NodeResultSet {
  constructor(rows) {
    this.rows = rows;
    this.index = -1;
  }
  next() {
    this.index += 1;
    return this.index < this.rows.length;
  }
  get values() {
    return this.rows[this.index];
  }
  close() {}
}

class NodeSqliteAdapter {
  constructor(database) {
    this.database = database;
  }
  update(input) {
    const sql = typeof input === "string" ? input : input.sql;
    const args = typeof input === "string" ? undefined : input.args.map(normalize);
    try {
      if (args === undefined) this.database.exec(sql);
      else this.database.prepare(sql).run(...args);
      return { result: true, error: "" };
    } catch (error) {
      return { result: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  query(input, callback) {
    const sql = typeof input === "string" ? input : input.sql;
    const args = typeof input === "string" ? [] : input.args.map(normalize);
    try {
      callback(new NodeResultSet(this.database.prepare(sql).all(...args)), "");
    } catch (error) {
      callback(null, error instanceof Error ? error.message : String(error));
    }
  }
  beginTransaction() {
    this.database.exec("BEGIN IMMEDIATE");
  }
  commit() {
    this.database.exec("COMMIT");
  }
  rollback() {
    this.database.exec("ROLLBACK");
  }
}

function repositoryDatabase(database) {
  const adapter = new NodeSqliteAdapter(database);
  return {
    query(sql, args = []) {
      return database.prepare(sql).all(...args.map(normalize));
    },
    transaction(callback, operation) {
      return withSqliteTransaction(adapter, callback, operation);
    },
  };
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fileHash(path) {
  return createHash("sha256").update(require("node:fs").readFileSync(path)).digest("hex");
}

const fileOperations = {
  exists: existsSync,
  copy({ src, dst }) {
    copyFileSync(src, dst);
    return true;
  },
  move({ src, dst }) {
    renameSync(src, dst);
    return true;
  },
  delete(path) {
    if (existsSync(path)) unlinkSync(path);
    return true;
  },
};

function createVersion1Template(path, syncMyTags) {
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    for (const statement of CURRENT_SCHEMA_STATEMENTS) database.exec(statement.sql);
    database.exec("PRAGMA user_version = 1");
    database
      .prepare(
        `INSERT INTO archives
         (gid, readlater, downloaded, first_access_time, last_access_time, token, title, taglist, last_read_page)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        901,
        1,
        1,
        "2026-08-01T00:00:00.000Z",
        "2026-08-10T00:00:00.000Z",
        "startup-token",
        "startup-title",
        JSON.stringify([{ namespace: "artist", tags: ["startup-artist"] }]),
        23,
      );
    database
      .prepare("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)")
      .run(901, "artist", "startup-artist");
    const history = database
      .prepare("INSERT INTO search_history (last_access_time, sorted_fsearch) VALUES (?, ?)")
      .run("2026-08-10T00:00:00.000Z", "artist:startup-history");
    database
      .prepare(
        `INSERT INTO search_history_search_terms
         (search_history_id, namespace, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(history.lastInsertRowid, "artist", "startup-history", 1, 0, 0);
    const bookmark = database
      .prepare("INSERT INTO search_bookmarks (sort_order, sorted_fsearch) VALUES (?, ?)")
      .run(0, "language:startup-bookmark");
    database
      .prepare(
        `INSERT INTO search_bookmarks_search_terms
         (search_bookmarks_id, namespace, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(bookmark.lastInsertRowid, "language", "startup-bookmark", 0, 0, 0);
    database.prepare("INSERT INTO marked_uploaders (uploader) VALUES (?)").run("startup-uploader");
    database
      .prepare(
        `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(991, "artist", "startup-tag", 1, 0, "#123456", 3);
    database
      .prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run("syncMyTags", JSON.stringify(syncMyTags));
  } finally {
    database.close();
  }
}

function inspect(path) {
  const database = new DatabaseSync(path);
  try {
    return {
      version: database.prepare("PRAGMA user_version").get().user_version,
      quickCheck: Object.values(database.prepare("PRAGMA quick_check(1)").get())[0],
      versions: database
        .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'sync_versions'")
        .get().count
        ? database.prepare("SELECT COUNT(*) AS count FROM sync_versions").get().count
        : 0,
      outbox: database
        .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox'")
        .get().count
        ? database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count
        : 0,
    };
  } finally {
    database.close();
  }
}

let runtimeSequence = 0;
let operationSequence = 0;

function startupDependencies(databasePath, backupPath, options = {}) {
  return {
    ensureBackup: () => ensurePreSyncDatabaseBackup(fileOperations, databasePath, backupPath),
    verifyBackup() {
      const backup = inspect(backupPath);
      assert.equal(backup.version, 1, "一次性备份必须保持为可读 v1");
      assert.equal(backup.quickCheck, "ok", "一次性备份必须通过 quick_check");
    },
    openSession() {
      const sqlite = new DatabaseSync(databasePath);
      options.onSessionOpened?.();
      sqlite.exec("PRAGMA foreign_keys = ON");
      const database = repositoryDatabase(sqlite);
      return {
        database,
        close: () => {
          sqlite.close();
          options.onSessionClosed?.();
        },
      };
    },
    createRuntime(database) {
      runtimeSequence += 1;
      return createV2RepositoryRuntime({
        database,
        syncWriter: new SyncMutationWriter({
          deviceId: `phase1-startup-device-${runtimeSequence}`,
          nowMs: () => 6000,
          createOpId: () => {
            operationSequence += 1;
            return `phase1-startup-operation-${operationSequence}`;
          },
        }),
        codec: new CloudSyncDiagnosticEntityCodec(),
        deriveSearchId: sha256Hex,
        nowIso: () => MIGRATION_TIME,
      });
    },
    migration: {
      nowIso: () => MIGRATION_TIME,
      sha256Hex: options.invalidDigest ? () => "invalid-digest" : sha256Hex,
    },
    checkpoint: options.checkpoint,
  };
}

function runAndClose(databasePath, backupPath, options) {
  const result = startDatabaseV2Draft(startupDependencies(databasePath, backupPath, options));
  result.session.close();
  return result;
}

function checkCrashBoundary(root, template, phase, boundary) {
  const label = `${phase}-${boundary}`;
  const directory = join(root, label);
  mkdirSync(directory);
  const databasePath = join(directory, "database.db");
  const backupPath = join(directory, "database.pre-sync-v1.backup.db");
  copyFileSync(template, databasePath);
  let injected = false;
  let openedSessions = 0;
  let closedSessions = 0;
  assert.throws(
    () =>
      runAndClose(databasePath, backupPath, {
        checkpoint(checkpoint) {
          if (!injected && checkpoint.phase === phase && checkpoint.boundary === boundary) {
            injected = true;
            throw new Error(`simulated-crash:${label}`);
          }
        },
        onSessionOpened: () => {
          openedSessions += 1;
        },
        onSessionClosed: () => {
          closedSessions += 1;
        },
      }),
    new RegExp(`simulated-crash:${label}`),
  );
  assert.equal(injected, true, `没有到达故障注入边界 ${label}`);
  assert.equal(closedSessions, openedSessions, `${label} 故障后必须关闭已打开的数据库 session`);

  const recovered = runAndClose(databasePath, backupPath);
  assert.equal(recovered.runtime.schemaVersion, 2);
  assert.deepEqual(recovered.completedPhases, DATABASE_V2_STARTUP_PHASES);
  assert.equal(inspect(databasePath).version, 2);
  assert.equal(inspect(databasePath).versions, 7);
  assert.equal(inspect(databasePath).outbox, 7);
  assert.equal(fileHash(backupPath), fileHash(template), "恢复过程不得覆盖升级前备份");

  const repeated = runAndClose(databasePath, backupPath);
  assert.equal(repeated.openedAtVersion, 2);
  assert.equal(repeated.migrationPerformed, false);
  assert.equal(repeated.seed.total, 0, "完全恢复后的再次启动不得重复 seed");
  assert.equal(fileHash(backupPath), fileHash(template), "再次启动不得覆盖升级前备份");
}

const root = join(tmpdir(), `jsehviewer-v2-startup-${process.pid}-${Date.now()}`);
mkdirSync(root);
try {
  const localTemplate = join(root, "template-local-v1.db");
  createVersion1Template(localTemplate, false);
  for (const phase of DATABASE_V2_STARTUP_PHASES) {
    for (const boundary of ["before", "after"]) checkCrashBoundary(root, localTemplate, phase, boundary);
  }

  const rollbackDirectory = join(root, "migration-rollback");
  mkdirSync(rollbackDirectory);
  const rollbackDatabase = join(rollbackDirectory, "database.db");
  const rollbackBackup = join(rollbackDirectory, "database.pre-sync-v1.backup.db");
  copyFileSync(localTemplate, rollbackDatabase);
  assert.throws(
    () => runAndClose(rollbackDatabase, rollbackBackup, { invalidDigest: true }),
    /SHA-256|digest|稳定 ID/u,
  );
  const rolledBack = inspect(rollbackDatabase);
  assert.equal(rolledBack.version, 1, "迁移事务内部失败必须保持 v1");
  assert.equal(rolledBack.versions, 0, "迁移事务内部失败不得残留同步表数据");
  const recoveredMigration = runAndClose(rollbackDatabase, rollbackBackup);
  assert.equal(recoveredMigration.migrationPerformed, true);
  assert.equal(recoveredMigration.seed.total, 7);

  const invalidModeDirectory = join(root, "invalid-marked-tag-mode");
  mkdirSync(invalidModeDirectory);
  const invalidModeDatabase = join(invalidModeDirectory, "database.db");
  const invalidModeBackup = join(invalidModeDirectory, "database.pre-sync-v1.backup.db");
  copyFileSync(localTemplate, invalidModeDatabase);
  const invalidModeSqlite = new DatabaseSync(invalidModeDatabase);
  invalidModeSqlite
    .prepare("UPDATE config SET value = ? WHERE key = 'syncMyTags'")
    .run(JSON.stringify("not-a-boolean"));
  invalidModeSqlite.close();
  assert.throws(
    () => runAndClose(invalidModeDatabase, invalidModeBackup),
    /syncMyTags.*布尔值/u,
    "无效 syncMyTags 必须在任何 seed 前停止",
  );
  assert.equal(inspect(invalidModeDatabase).version, 2, "syncMyTags 检查发生在原子迁移提交之后");
  assert.equal(inspect(invalidModeDatabase).versions, 0, "无效 syncMyTags 不得 seed 任一对象");
  const repairedModeSqlite = new DatabaseSync(invalidModeDatabase);
  repairedModeSqlite.prepare("UPDATE config SET value = 'false' WHERE key = 'syncMyTags'").run();
  repairedModeSqlite.close();
  assert.equal(runAndClose(invalidModeDatabase, invalidModeBackup).seed.total, 7);

  const mirrorDirectory = join(root, "upstream-mirror");
  mkdirSync(mirrorDirectory);
  const mirrorTemplate = join(mirrorDirectory, "template-v1.db");
  const mirrorDatabase = join(mirrorDirectory, "database.db");
  const mirrorBackup = join(mirrorDirectory, "database.pre-sync-v1.backup.db");
  createVersion1Template(mirrorTemplate, true);
  copyFileSync(mirrorTemplate, mirrorDatabase);
  const mirrorResult = runAndClose(mirrorDatabase, mirrorBackup);
  assert.equal(mirrorResult.markedTagMode, MarkedTagMode.upstreamMirror);
  assert.equal(mirrorResult.seed.localTags, 0, "syncMyTags=1 的网站镜像不得 seed 到 D1");
  assert.equal(mirrorResult.seed.total, 6);
  assert.equal(inspect(mirrorDatabase).versions, 6);
  const mirrorSqlite = new DatabaseSync(mirrorDatabase);
  assert.equal(mirrorSqlite.prepare("SELECT COUNT(*) AS count FROM marked_tags").get().count, 1);
  assert.equal(
    mirrorSqlite.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE entity_type = 'marked.tag.local.v1'").get()
      .count,
    0,
  );
  mirrorSqlite.close();
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `database v2 startup draft checks passed: ${DATABASE_V2_STARTUP_PHASES.length * 2} crash boundaries recover, migration rollback is atomic, invalid syncMyTags fails closed, and mirror seed is isolated`,
);
