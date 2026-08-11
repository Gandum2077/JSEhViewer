const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const { SyncMutationWriter } = require("../dist/repositories/sync-mutation-writer");
const { MARKED_UPLOADER_ENTITY_TYPE, V2UploaderRepository } = require("../dist/repositories/uploader-repository-v2");
const { CloudSyncDiagnosticEntityCodec } = require("../dist/utils/cloud-sync-diagnostic-entity-codec");
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

function createRepositoryDatabase(database) {
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

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) database.exec(statement.sql);
database.prepare("INSERT INTO marked_uploaders (uploader) VALUES (?)").run("seeded");

let nowMs = 1000;
let opSequence = 0;
const codec = new CloudSyncDiagnosticEntityCodec();
const writer = new SyncMutationWriter({
  deviceId: "device-a",
  nowMs: () => nowMs,
  createOpId: () => {
    opSequence += 1;
    return `00000000-0000-4000-8000-${String(opSequence).padStart(12, "0")}`;
  },
});
const repository = new V2UploaderRepository(createRepositoryDatabase(database), writer, codec);

function objectKey(uploader) {
  return codec.deriveObjectKey(MARKED_UPLOADER_ENTITY_TYPE, uploader);
}

function remoteMutation({ uploader, wallMs, logicalCounter = 0, deleted = false, deviceId = "device-b", opId }) {
  const version = {
    objectKey: objectKey(uploader),
    entityType: MARKED_UPLOADER_ENTITY_TYPE,
    wallMs,
    logicalCounter,
    deviceId,
    deleted,
    opId,
  };
  return {
    ...version,
    origin: MutationOrigin.remote,
    envelopeJson: codec.encodeEnvelope(MARKED_UPLOADER_ENTITY_TYPE, { format: 1, uploader }, version),
  };
}

assert.equal(repository.seedExistingMarkedUploaders(), 1, "首次 seed 必须为迁移已有行创建同步状态");
assert.equal(repository.seedExistingMarkedUploaders(), 0, "重复 seed 不得产生新版本或 outbox");
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 1);

assert.equal(repository.addMarkedUploader("alice", MutationOrigin.user), true);
const aliceKey = objectKey("alice");
const aliceOutbox = database
  .prepare(
    `SELECT outbox.*, versions.entity_type
     FROM sync_outbox AS outbox
     JOIN sync_versions AS versions ON versions.object_key = outbox.object_key
     WHERE outbox.object_key = ?`,
  )
  .get(aliceKey);
assert.equal(aliceOutbox.deleted, 0);
const aliceEnvelope = JSON.parse(aliceOutbox.envelope_json);
assert.equal(aliceEnvelope.wallMs, aliceOutbox.wall_ms, "envelope 必须在 HLC 生成后绑定 wall time");
assert.equal(aliceEnvelope.logicalCounter, aliceOutbox.logical_counter);
assert.equal(aliceEnvelope.objectKey, aliceKey);
const clockBeforeDuplicate = { ...database.prepare("SELECT * FROM sync_clock WHERE id = 1").get() };
assert.equal(repository.addMarkedUploader("alice", MutationOrigin.user), false, "重复标记必须保持幂等");
assert.deepEqual(
  { ...database.prepare("SELECT * FROM sync_clock WHERE id = 1").get() },
  clockBeforeDuplicate,
  "无业务变化时不得推进 HLC 或制造 outbox",
);
assert.throws(
  () => repository.addMarkedUploader("remote-without-version", MutationOrigin.remote),
  /必须携带版本元数据/,
);

const failureKey = objectKey("failure");
database.exec(`CREATE TRIGGER fail_v2_uploader_outbox
  BEFORE INSERT ON sync_outbox
  WHEN NEW.object_key = '${failureKey}'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 uploader outbox failure');
  END`);
assert.throws(
  () => repository.addMarkedUploader("failure", MutationOrigin.user),
  /injected v2 uploader outbox failure/,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM marked_uploaders WHERE uploader = 'failure'").get().count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(failureKey).count,
  0,
);
database.exec("DROP TRIGGER fail_v2_uploader_outbox");

nowMs = 1100;
assert.equal(repository.deleteMarkedUploader("alice", MutationOrigin.user), true);
assert.equal(repository.deleteMarkedUploader("alice", MutationOrigin.user), false, "重复删除不得刷新 tombstone");
const aliceTombstone = database
  .prepare(
    `SELECT versions.deleted, outbox.envelope_json, versions.wall_ms, versions.logical_counter,
            versions.device_id, versions.last_op_id
     FROM sync_versions AS versions
     JOIN sync_outbox AS outbox USING (object_key)
     WHERE object_key = ?`,
  )
  .get(aliceKey);
assert.equal(aliceTombstone.deleted, 1);
assert.ok(aliceTombstone.envelope_json, "不透明 object key 的 tombstone 必须携带加密实体身份");
assert.deepEqual(
  codec.decodeEnvelope(MARKED_UPLOADER_ENTITY_TYPE, aliceTombstone.envelope_json, {
    objectKey: aliceKey,
    entityType: MARKED_UPLOADER_ENTITY_TYPE,
    wallMs: aliceTombstone.wall_ms,
    logicalCounter: aliceTombstone.logical_counter,
    deviceId: aliceTombstone.device_id,
    deleted: true,
    opId: aliceTombstone.last_op_id,
  }),
  { format: 1, uploader: "alice" },
);

const staleAlice = repository.applyRemoteMarkedUploader(
  remoteMutation({
    uploader: "alice",
    wallMs: 1099,
    logicalCounter: 99,
    opId: "10000000-0000-4000-8000-000000000001",
  }),
);
assert.equal(staleAlice.applied, false);
assert.equal(staleAlice.membershipPresent, false, "陈旧远端添加不得复活 tombstone");

const newerAliceAdd = remoteMutation({
  uploader: "alice",
  wallMs: 1200,
  opId: "10000000-0000-4000-8000-000000000002",
});
assert.deepEqual(repository.applyRemoteMarkedUploader(newerAliceAdd), {
  applied: true,
  version: {
    objectKey: aliceKey,
    entityType: MARKED_UPLOADER_ENTITY_TYPE,
    wallMs: 1200,
    logicalCounter: 0,
    deviceId: "device-b",
    deleted: false,
    opId: "10000000-0000-4000-8000-000000000002",
  },
  uploader: "alice",
  membershipPresent: true,
  blockedByBannedUploader: false,
});
assert.equal(repository.applyRemoteMarkedUploader(newerAliceAdd).applied, false, "重复远端 change 必须幂等");
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(aliceKey).count, 0);

const newerAliceDelete = remoteMutation({
  uploader: "alice",
  wallMs: 1300,
  deleted: true,
  opId: "10000000-0000-4000-8000-000000000003",
});
const deletedAlice = repository.applyRemoteMarkedUploader(newerAliceDelete);
assert.equal(deletedAlice.applied, true);
assert.equal(deletedAlice.membershipPresent, false);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM marked_uploaders WHERE uploader = 'alice'").get().count,
  0,
);

const forgedVersion = {
  objectKey: objectKey("alice"),
  entityType: MARKED_UPLOADER_ENTITY_TYPE,
  wallMs: 1400,
  logicalCounter: 0,
  deviceId: "device-b",
  deleted: false,
  opId: "10000000-0000-4000-8000-000000000004",
};
assert.throws(
  () =>
    repository.applyRemoteMarkedUploader({
      ...forgedVersion,
      origin: MutationOrigin.remote,
      envelopeJson: codec.encodeEnvelope(
        MARKED_UPLOADER_ENTITY_TYPE,
        { format: 1, uploader: "mallory" },
        forgedVersion,
      ),
    }),
  /payload 与 object key 不匹配/,
);
const boundEnvelope = codec.encodeEnvelope(
  MARKED_UPLOADER_ENTITY_TYPE,
  { format: 1, uploader: "alice" },
  forgedVersion,
);
assert.throws(
  () =>
    repository.applyRemoteMarkedUploader({
      ...forgedVersion,
      wallMs: 1401,
      origin: MutationOrigin.remote,
      envelopeJson: boundEnvelope,
    }),
  /envelope 与 entity type、object key 或 HLC 不匹配/,
);

nowMs = 2000;
assert.equal(repository.addMarkedUploader("carol", MutationOrigin.user), true);
const carolKey = objectKey("carol");
const bannedResult = repository.replaceBannedUploaders(["carol"], MutationOrigin.upstreamMirror);
assert.deepEqual(bannedResult.removedMarkedUploaders, ["carol"]);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(carolKey).count, 0);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(carolKey).count,
  0,
  "尚未上传的本机标记被上游屏蔽时，必须同时丢弃未发布版本且不生成 tombstone",
);
const blockedRemote = repository.applyRemoteMarkedUploader(
  remoteMutation({
    uploader: "carol",
    wallMs: 2100,
    opId: "10000000-0000-4000-8000-000000000005",
  }),
);
assert.equal(blockedRemote.applied, true);
assert.equal(blockedRemote.blockedByBannedUploader, true);
assert.equal(blockedRemote.membershipPresent, false);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(carolKey).count, 0);
assert.equal(database.prepare("SELECT deleted FROM sync_versions WHERE object_key = ?").get(carolKey).deleted, 0);

database.exec(`CREATE TRIGGER fail_v2_banned_uploader_refresh
  BEFORE INSERT ON banned_uploaders
  WHEN NEW.uploader = 'force-rollback'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 banned uploader failure');
  END`);
assert.throws(
  () => repository.replaceBannedUploaders(["force-rollback"], MutationOrigin.upstreamMirror),
  /injected v2 banned uploader failure/,
);
assert.deepEqual(repository.queryBannedUploaders(), ["carol"], "上游镜像故障必须恢复旧屏蔽名单");
database.exec("DROP TRIGGER fail_v2_banned_uploader_refresh");

assert.deepEqual(repository.queryMarkedUploaders(), ["seeded"]);
assert.equal(repository.seedExistingMarkedUploaders(), 0);
database.close();
console.log("v2 uploader repository checks passed");
