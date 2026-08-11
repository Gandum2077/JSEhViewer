const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  CURRENT_SCHEMA_STATEMENTS,
  CURRENT_USER_VERSION,
  DatabaseInitializationError,
  initializeDatabase,
} = require("../dist/utils/database-initialization");
const { ensurePreSyncDatabaseBackup } = require("../dist/utils/database-backup");

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
    const args = typeof input === "string" ? undefined : input.args.map((value) => value ?? null);
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
    const args = typeof input === "string" ? [] : input.args.map((value) => value ?? null);
    try {
      const rows = this.database.prepare(sql).all(...args);
      callback(new NodeResultSet(rows), "");
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

function createQueue(database) {
  const adapter = new NodeSqliteAdapter(database);
  return {
    operations(callback) {
      callback(adapter);
    },
    close() {
      database.close();
    },
  };
}

function schemaFingerprint(database) {
  return database
    .prepare(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all()
    .map((row) => `${row.type}|${row.name}|${row.tbl_name}|${String(row.sql).replace(/\s+/g, " ").trim()}`);
}

function userVersion(database) {
  return Number(database.prepare("PRAGMA user_version").get().user_version);
}

function foreignKeyViolations(database) {
  return database.prepare("PRAGMA foreign_key_check").all();
}

function plainRow(row) {
  return Object.fromEntries(Object.entries(row));
}

function schemaStatement(name) {
  const statement = CURRENT_SCHEMA_STATEMENTS.find((candidate) => candidate.name === name);
  assert.ok(statement, `找不到 schema statement: ${name}`);
  return statement.sql;
}

function openFixture(directory, name) {
  return new DatabaseSync(join(directory, `${name}.db`));
}

function testOneTimeBackup(directory) {
  const { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
  const source = join(directory, "backup-source.db");
  const backup = join(directory, "database.pre-sync-v1.backup.db");
  const files = {
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
      rmSync(path, { force: true });
      return true;
    },
  };

  assert.equal(ensurePreSyncDatabaseBackup(files, join(directory, "missing.db"), backup), "source-missing");
  writeFileSync(source, "original database bytes");
  writeFileSync(`${backup}.tmp`, "interrupted copy");
  assert.equal(ensurePreSyncDatabaseBackup(files, source, backup), "created");
  assert.equal(readFileSync(backup, "utf8"), "original database bytes");
  writeFileSync(source, "newer database bytes");
  assert.equal(ensurePreSyncDatabaseBackup(files, source, backup), "already-exists");
  assert.equal(readFileSync(backup, "utf8"), "original database bytes");
}

function testFreshDatabase(directory) {
  const database = openFixture(directory, "fresh");
  const result = initializeDatabase(createQueue(database));
  assert.deepEqual(result, { kind: "fresh", previousVersion: 0, currentVersion: CURRENT_USER_VERSION });
  assert.equal(userVersion(database), CURRENT_USER_VERSION);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM favcat_titles").get().count, 10);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM ai_translation_services").get().count, 2);
  assert.deepEqual(foreignKeyViolations(database), []);
  const fingerprint = schemaFingerprint(database);
  database.close();
  return fingerprint;
}

function testVersion0Upgrade(directory, expectedFingerprint) {
  const database = openFixture(directory, "v0");
  database.exec(schemaStatement("archives"));
  database.exec(schemaStatement("config"));
  database.prepare("INSERT INTO archives (gid, title, last_read_page) VALUES (?, ?, ?)").run(123, "legacy archive", 17);
  database
    .prepare("INSERT INTO config (key, value) VALUES (?, ?)")
    .run("selectedAiTranslationService", "manga-image-translator");
  const legacyConfig = { "manga-image-translator": { host: "10.0.0.2", port: 5003, https: false } };
  database
    .prepare("INSERT INTO config (key, value) VALUES (?, ?)")
    .run("aiTranslationSavedConfigText", JSON.stringify(legacyConfig));

  const result = initializeDatabase(createQueue(database));
  assert.deepEqual(result, { kind: "upgraded", previousVersion: 0, currentVersion: CURRENT_USER_VERSION });
  assert.equal(userVersion(database), 1);
  assert.deepEqual(plainRow(database.prepare("SELECT gid, title, last_read_page FROM archives").get()), {
    gid: 123,
    title: "legacy archive",
    last_read_page: 17,
  });
  const migratedService = database
    .prepare("SELECT selected, config FROM ai_translation_services WHERE name = 'manga-image-translator'")
    .get();
  assert.equal(migratedService.selected, 1);
  assert.deepEqual(JSON.parse(migratedService.config), legacyConfig["manga-image-translator"]);
  assert.deepEqual(foreignKeyViolations(database), []);
  assert.deepEqual(schemaFingerprint(database), expectedFingerprint);
  database.close();
}

function testVersion1IsIdempotent(directory, expectedFingerprint) {
  const database = openFixture(directory, "v1");
  database.exec(schemaStatement("archives"));
  database.exec(schemaStatement("config"));
  database.exec("PRAGMA user_version = 1");
  database.prepare("INSERT INTO archives (gid, title) VALUES (?, ?)").run(456, "v1 sentinel");

  const firstResult = initializeDatabase(createQueue(database));
  assert.deepEqual(firstResult, { kind: "current", previousVersion: 1, currentVersion: 1 });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM ai_translation_services").get().count, 0);
  assert.equal(database.prepare("SELECT title FROM archives WHERE gid = 456").get().title, "v1 sentinel");
  assert.deepEqual(schemaFingerprint(database), expectedFingerprint);

  database.prepare("UPDATE favcat_titles SET title = ? WHERE favcat = 0").run("My Favorites");
  const secondResult = initializeDatabase(createQueue(database));
  assert.deepEqual(secondResult, { kind: "current", previousVersion: 1, currentVersion: 1 });
  assert.equal(database.prepare("SELECT title FROM favcat_titles WHERE favcat = 0").get().title, "My Favorites");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM ai_translation_services").get().count, 0);
  database.close();
}

function testUnknownVersionDoesNotMutate(directory) {
  const database = openFixture(directory, "unknown-version");
  database.exec("CREATE TABLE sentinel (value TEXT NOT NULL)");
  database.prepare("INSERT INTO sentinel (value) VALUES (?)").run("unchanged");
  database.exec("PRAGMA user_version = 99");
  const before = schemaFingerprint(database);

  assert.throws(
    () => initializeDatabase(createQueue(database)),
    (error) => error instanceof DatabaseInitializationError && /高于当前支持/.test(error.message),
  );
  assert.equal(userVersion(database), 99);
  assert.deepEqual(schemaFingerprint(database), before);
  assert.equal(database.prepare("SELECT value FROM sentinel").get().value, "unchanged");
  database.close();
}

function testFailedUpgradeRollsBack(directory) {
  const database = openFixture(directory, "failed-v0");
  database.exec(schemaStatement("config"));
  database.exec("CREATE TABLE ai_translation_services (broken TEXT)");
  const before = schemaFingerprint(database);

  assert.throws(
    () => initializeDatabase(createQueue(database)),
    /创建 index idx_ai_translation_services_single_selected/,
  );
  assert.equal(userVersion(database), 0);
  assert.deepEqual(schemaFingerprint(database), before);
  database.close();
}

function testNonzeroEmptyDatabaseIsRejected(directory) {
  const database = openFixture(directory, "empty-versioned");
  database.exec("PRAGMA user_version = 1");
  assert.throws(
    () => initializeDatabase(createQueue(database)),
    (error) => error instanceof DatabaseInitializationError && /没有业务表/.test(error.message),
  );
  assert.deepEqual(schemaFingerprint(database), []);
  assert.equal(userVersion(database), 1);
  database.close();
}

function run() {
  const directory = mkdtempSync(join(tmpdir(), "jsehviewer-database-init-"));
  try {
    testOneTimeBackup(directory);
    const freshFingerprint = testFreshDatabase(directory);
    testVersion0Upgrade(directory, freshFingerprint);
    testVersion1IsIdempotent(directory, freshFingerprint);
    testUnknownVersionDoesNotMutate(directory);
    testFailedUpgradeRollsBack(directory);
    testNonzeroEmptyDatabaseIsRejected(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  console.log(
    "数据库初始化 fixture 通过：一次性备份、fresh/v0/v1 schema、旧数据迁移、未知版本拒绝、故障回滚和外键检查均符合预期。",
  );
}

run();
