const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { createV2RepositoryRuntime } = require("../dist/repositories/repository-runtime");
const { exerciseV2RepositoryRuntime } = require("../dist/repositories/repository-runtime-v2-check");
const { SyncMutationWriter } = require("../dist/repositories/sync-mutation-writer");
const { CloudSyncDiagnosticEntityCodec } = require("../dist/utils/cloud-sync-diagnostic-entity-codec");
const {
  DATABASE_V2_DRAFT_SCHEMA_STATEMENTS,
  DATABASE_V2_DRAFT_USER_VERSION,
} = require("../dist/utils/database-schema-v2-draft");
const { withSqliteTransaction } = require("../dist/utils/sqlite-safe");

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

function stableId(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) database.exec(statement.sql);
database.exec(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`);

let opSequence = 0;
const repositoryDatabaseAdapter = repositoryDatabase(database);
const runtime = createV2RepositoryRuntime({
  database: repositoryDatabaseAdapter,
  syncWriter: new SyncMutationWriter({
    deviceId: "phase1-runtime-node",
    nowMs: () => 4000,
    createOpId: () => {
      opSequence += 1;
      return `00000000-0000-4000-8001-${String(opSequence).padStart(12, "0")}`;
    },
  }),
  codec: new CloudSyncDiagnosticEntityCodec(),
  deriveSearchId: stableId,
  nowIso: () => "2026-08-12T12:00:00.000Z",
});
const result = exerciseV2RepositoryRuntime(runtime, repositoryDatabaseAdapter, stableId);
assert.equal(result.seededObjects, 7);
assert.equal(result.entityTypes, 7);
assert.equal(runtime.schemaVersion, 2);
assert.equal(database.prepare("PRAGMA user_version").get().user_version, 2);
database.close();

console.log(
  "v2 repository runtime checks passed: five adapters share one database/HLC/codec and ConfigManager key paths persist",
);
