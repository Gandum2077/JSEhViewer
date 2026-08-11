const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const { SyncMutationWriter } = require("../dist/repositories/sync-mutation-writer");
const { DATABASE_V2_DRAFT_SCHEMA_STATEMENTS } = require("../dist/utils/database-schema-v2-draft");
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

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) database.exec(statement.sql);
database.exec("CREATE TABLE sync_fixture (object_key TEXT PRIMARY KEY, value TEXT NOT NULL)");
const adapter = new NodeSqliteAdapter(database);
const transaction = (callback, operation = "同步写入内核测试事务") =>
  withSqliteTransaction(adapter, callback, operation);

let nowMs = 1000;
let opSequence = 0;
const nextOpId = () => {
  opSequence += 1;
  return `00000000-0000-4000-8000-${String(opSequence).padStart(12, "0")}`;
};
const writer = new SyncMutationWriter({
  deviceId: "device-a",
  nowMs: () => nowMs,
  createOpId: nextOpId,
});

const first = transaction((tx) => {
  tx.update("INSERT INTO sync_fixture (object_key, value) VALUES (?, ?)", ["alpha", "local-1"]);
  return writer.recordLocalMutation(tx, {
    origin: MutationOrigin.user,
    objectKey: "alpha",
    entityType: "fixture.v1",
    deleted: false,
    envelopeJson: '{"value":"local-1"}',
  });
});
assert.deepEqual(
  { wallMs: first.wallMs, logicalCounter: first.logicalCounter, opId: first.opId },
  { wallMs: 1000, logicalCounter: 0, opId: "00000000-0000-4000-8000-000000000001" },
);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 1);

database
  .prepare("UPDATE sync_outbox SET attempt_count = 4, next_attempt_at = ? WHERE object_key = ?")
  .run("later", "alpha");
const second = transaction((tx) => {
  tx.update("UPDATE sync_fixture SET value = ? WHERE object_key = ?", ["local-2", "alpha"]);
  return writer.recordLocalMutation(tx, {
    origin: MutationOrigin.user,
    objectKey: "alpha",
    entityType: "fixture.v1",
    deleted: false,
    envelopeJson: '{"value":"local-2"}',
  });
});
assert.equal(second.wallMs, 1000);
assert.equal(second.logicalCounter, 1, "同毫秒本地操作必须推进 logical counter");
assert.deepEqual(
  {
    ...database
      .prepare("SELECT op_id, attempt_count, next_attempt_at FROM sync_outbox WHERE object_key = ?")
      .get("alpha"),
  },
  { op_id: second.opId, attempt_count: 0, next_attempt_at: null },
  "合并 outbox 必须更换 op_id 并重置重试状态",
);
transaction((tx) => writer.acknowledgeOperations(tx, [first.opId, first.opId]));
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get("alpha").count,
  1,
  "迟到的旧 ACK 不得删除已经合并的新操作",
);
transaction((tx) => writer.acknowledgeOperations(tx, [second.opId]));
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get("alpha").count, 0);

nowMs = 900;
const backwards = transaction((tx) => {
  tx.update("INSERT INTO sync_fixture (object_key, value) VALUES (?, ?)", ["beta", "local"]);
  return writer.recordLocalMutation(tx, {
    origin: MutationOrigin.migrationSeed,
    objectKey: "beta",
    entityType: "fixture.v1",
    deleted: false,
    envelopeJson: '{"value":"local"}',
  });
});
assert.deepEqual(
  { wallMs: backwards.wallMs, logicalCounter: backwards.logicalCounter },
  { wallMs: 1000, logicalCounter: 2 },
  "系统时间倒退时 HLC 不得倒退",
);

nowMs = 2000;
const later = transaction((tx) => {
  tx.update("INSERT INTO sync_fixture (object_key, value) VALUES (?, ?)", ["gamma", "local"]);
  return writer.recordLocalMutation(tx, {
    origin: MutationOrigin.user,
    objectKey: "gamma",
    entityType: "fixture.v1",
    deleted: false,
    envelopeJson: '{"value":"local"}',
  });
});
assert.deepEqual({ wallMs: later.wallMs, logicalCounter: later.logicalCounter }, { wallMs: 2000, logicalCounter: 0 });

database.exec(`CREATE TRIGGER fail_sync_outbox_diagnostic
  BEFORE INSERT ON sync_outbox
  WHEN NEW.object_key = 'failure'
  BEGIN
    SELECT RAISE(ABORT, 'injected sync outbox failure');
  END`);
assert.throws(
  () =>
    transaction((tx) => {
      tx.update("INSERT INTO sync_fixture (object_key, value) VALUES (?, ?)", ["failure", "must-rollback"]);
      writer.recordLocalMutation(tx, {
        origin: MutationOrigin.user,
        objectKey: "failure",
        entityType: "fixture.v1",
        deleted: false,
        envelopeJson: "{}",
      });
    }),
  /injected sync outbox failure/,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_fixture WHERE object_key = 'failure'").get().count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = 'failure'").get().count,
  0,
);
assert.deepEqual(
  { ...database.prepare("SELECT wall_ms, logical_counter FROM sync_clock WHERE id = 1").get() },
  { wall_ms: 2000, logical_counter: 0 },
  "outbox 写入失败必须连同业务行、版本和 HLC 一起回滚",
);
database.exec("DROP TRIGGER fail_sync_outbox_diagnostic");

const tombstone = transaction((tx) => {
  tx.update("DELETE FROM sync_fixture WHERE object_key = ?", ["alpha"]);
  return writer.recordLocalMutation(tx, {
    origin: MutationOrigin.user,
    objectKey: "alpha",
    entityType: "fixture.v1",
    deleted: true,
  });
});
assert.equal(tombstone.deleted, true);
assert.deepEqual(
  { ...database.prepare("SELECT deleted, envelope_json FROM sync_outbox WHERE object_key = ?").get("alpha") },
  { deleted: 1, envelope_json: null },
  "跨设备删除必须留下通用 tombstone",
);

transaction((tx) => {
  tx.update("DELETE FROM sync_fixture WHERE object_key = ?", ["beta"]);
  writer.discardLocalObject(tx, { origin: MutationOrigin.user, objectKey: "beta" });
});
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get("beta").count, 0);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get("beta").count,
  0,
  "搜索历史式本机删除必须取消版本和待发送操作，而不是生成 tombstone",
);

let callbackCount = 0;
const stale = transaction((tx) =>
  writer.applyRemoteMutation(
    tx,
    {
      origin: MutationOrigin.remote,
      objectKey: "gamma",
      entityType: "fixture.v1",
      wallMs: 1999,
      logicalCounter: 99,
      deviceId: "device-b",
      deleted: false,
      opId: "10000000-0000-4000-8000-000000000001",
      envelopeJson: '{"value":"stale"}',
    },
    (businessTx) => {
      callbackCount += 1;
      businessTx.update("UPDATE sync_fixture SET value = 'stale' WHERE object_key = 'gamma'");
    },
  ),
);
assert.equal(stale.applied, false);
assert.equal(callbackCount, 0);
assert.equal(database.prepare("SELECT value FROM sync_fixture WHERE object_key = 'gamma'").get().value, "local");
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = 'gamma'").get().count, 1);

const newerRemote = {
  origin: MutationOrigin.remote,
  objectKey: "gamma",
  entityType: "fixture.v1",
  wallMs: 3000,
  logicalCounter: 5,
  deviceId: "device-b",
  deleted: false,
  opId: "10000000-0000-4000-8000-000000000002",
  envelopeJson: '{"value":"remote"}',
};
const applied = transaction((tx) =>
  writer.applyRemoteMutation(tx, newerRemote, (businessTx) => {
    callbackCount += 1;
    businessTx.update("UPDATE sync_fixture SET value = 'remote' WHERE object_key = 'gamma'");
  }),
);
assert.equal(applied.applied, true);
assert.equal(callbackCount, 1);
assert.equal(database.prepare("SELECT value FROM sync_fixture WHERE object_key = 'gamma'").get().value, "remote");
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = 'gamma'").get().count, 0);
const duplicate = transaction((tx) =>
  writer.applyRemoteMutation(tx, newerRemote, () => {
    callbackCount += 1;
  }),
);
assert.equal(duplicate.applied, false);
assert.equal(callbackCount, 1, "重复远端 change 不得重复执行业务写入");

const clockBeforeRemoteFailure = { ...database.prepare("SELECT * FROM sync_clock WHERE id = 1").get() };
assert.throws(
  () =>
    transaction((tx) =>
      writer.applyRemoteMutation(
        tx,
        {
          ...newerRemote,
          wallMs: 5000,
          opId: "10000000-0000-4000-8000-000000000003",
        },
        () => {
          throw new Error("injected remote business failure");
        },
      ),
    ),
  /injected remote business failure/,
);
assert.deepEqual(
  { ...database.prepare("SELECT * FROM sync_clock WHERE id = 1").get() },
  clockBeforeRemoteFailure,
  "远端业务 apply 失败必须回滚已观察的 HLC",
);
assert.equal(database.prepare("SELECT wall_ms FROM sync_versions WHERE object_key = 'gamma'").get().wall_ms, 3000);

nowMs = 2500;
const afterRemote = transaction((tx) => {
  tx.update("UPDATE sync_fixture SET value = 'local-after-remote' WHERE object_key = 'gamma'");
  return writer.recordLocalMutation(tx, {
    origin: MutationOrigin.user,
    objectKey: "gamma",
    entityType: "fixture.v1",
    deleted: false,
    envelopeJson: '{"value":"local-after-remote"}',
  });
});
assert.equal(afterRemote.wallMs, 3000);
assert.ok(afterRemote.logicalCounter > newerRemote.logicalCounter, "接收未来版本后的本地操作必须严格更新");

assert.throws(
  () =>
    transaction((tx) =>
      writer.recordLocalMutation(tx, {
        origin: MutationOrigin.user,
        objectKey: "gamma",
        entityType: "different.v1",
        deleted: false,
        envelopeJson: "{}",
      }),
    ),
  /不能改变 entity type/,
);
assert.throws(
  () =>
    transaction((tx) =>
      writer.recordLocalMutation(tx, {
        origin: MutationOrigin.user,
        objectKey: "invalid-envelope",
        entityType: "fixture.v1",
        deleted: false,
      }),
    ),
  /必须携带同步 payload/,
);

database.close();
console.log("sync mutation writer checks passed");
