const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const {
  LOCAL_MARKED_TAG_ENTITY_TYPE,
  V2MarkedTagRepository,
} = require("../dist/repositories/marked-tag-repository-v2");
const { MarkedTagMode } = require("../dist/repositories/marked-tag-repository");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const { SyncMutationWriter } = require("../dist/repositories/sync-mutation-writer");
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

function tag(tagid, namespace, name, overrides = {}) {
  return {
    tagid,
    namespace,
    name,
    watched: false,
    hidden: false,
    color: "",
    weight: 0,
    ...overrides,
  };
}

function entityId(namespace, name) {
  return JSON.stringify([namespace, name]);
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) database.exec(statement.sql);

database
  .prepare(
    `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(701, "artist", "seeded-a", 1, 0, "#111111", 3);
database
  .prepare(
    `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(702, "female", "seeded-b", 0, 1, "", -2);

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
const repository = new V2MarkedTagRepository(createRepositoryDatabase(database), writer, codec);

function objectKey(namespace, name) {
  return codec.deriveObjectKey(LOCAL_MARKED_TAG_ENTITY_TYPE, entityId(namespace, name));
}

function payload(namespace, name, overrides = {}) {
  return {
    format: 1,
    namespace,
    name,
    watched: false,
    hidden: false,
    color: "",
    weight: 0,
    ...overrides,
  };
}

function remoteMutation({
  namespace,
  name,
  wallMs,
  logicalCounter = 0,
  deleted = false,
  deviceId = "device-b",
  opId,
  payloadValue = payload(namespace, name),
  mutationObjectKey = objectKey(namespace, name),
}) {
  const version = {
    objectKey: mutationObjectKey,
    entityType: LOCAL_MARKED_TAG_ENTITY_TYPE,
    wallMs,
    logicalCounter,
    deviceId,
    deleted,
    opId,
  };
  return {
    ...version,
    origin: MutationOrigin.remote,
    envelopeJson: codec.encodeEnvelope(LOCAL_MARKED_TAG_ENTITY_TYPE, payloadValue, version),
  };
}

assert.equal(repository.seedExistingLocalTags(MarkedTagMode.localSync), 2);
assert.equal(repository.seedExistingLocalTags(MarkedTagMode.localSync), 0, "重复 seed 不得产生新版本或 outbox");
assert.throws(
  () => repository.seedExistingLocalTags(MarkedTagMode.upstreamMirror),
  /镜像模式不接受 D1/,
);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 2);

const seededAKey = objectKey("artist", "seeded-a");
const seededA = database
  .prepare(
    `SELECT outbox.envelope_json, versions.wall_ms, versions.logical_counter,
            versions.device_id, versions.deleted, versions.last_op_id
     FROM sync_outbox AS outbox
     JOIN sync_versions AS versions USING (object_key)
     WHERE outbox.object_key = ?`,
  )
  .get(seededAKey);
const seededPayload = codec.decodeEnvelope(LOCAL_MARKED_TAG_ENTITY_TYPE, seededA.envelope_json, {
  objectKey: seededAKey,
  entityType: LOCAL_MARKED_TAG_ENTITY_TYPE,
  wallMs: seededA.wall_ms,
  logicalCounter: seededA.logical_counter,
  deviceId: seededA.device_id,
  deleted: seededA.deleted === 1,
  opId: seededA.last_op_id,
});
assert.equal("tagid" in seededPayload, false, "E-Hentai tagid 不得进入本地标签同步 payload");
assert.deepEqual(seededPayload, payload("artist", "seeded-a", { watched: true, color: "#111111", weight: 3 }));

const versionBeforeTagIdOnlyChange = database
  .prepare("SELECT last_op_id FROM sync_versions WHERE object_key = ?")
  .get(seededAKey).last_op_id;
repository.upsertLocalTag(
  tag(999, "artist", "seeded-a", { watched: true, color: "#111111", weight: 3 }),
  MarkedTagMode.localSync,
  MutationOrigin.user,
);
assert.equal(database.prepare("SELECT tagid FROM marked_tags WHERE namespace = 'artist' AND name = 'seeded-a'").get().tagid, 999);
assert.equal(
  database.prepare("SELECT last_op_id FROM sync_versions WHERE object_key = ?").get(seededAKey).last_op_id,
  versionBeforeTagIdOnlyChange,
  "仅本机 tagid 变化不得推进同步版本",
);

nowMs = 1100;
repository.upsertLocalTag(
  tag(999, "artist", "seeded-a", { watched: true, hidden: true, color: "#222222", weight: 8 }),
  MarkedTagMode.localSync,
  MutationOrigin.user,
);
assert.notEqual(
  database.prepare("SELECT last_op_id FROM sync_versions WHERE object_key = ?").get(seededAKey).last_op_id,
  versionBeforeTagIdOnlyChange,
);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 2, "同对象应合并 outbox");
repository.upsertLocalTag(tag(0, "language", "local-c"), MarkedTagMode.localSync, MutationOrigin.user);
assert.throws(
  () => repository.upsertLocalTag(tag(0, "artist", "wrong-mode"), MarkedTagMode.upstreamMirror, MutationOrigin.user),
  /镜像模式不接受 D1/,
);
assert.throws(
  () => repository.upsertLocalTag(tag(0, "artist", "wrong-origin"), MarkedTagMode.localSync, MutationOrigin.remote),
  /必须携带版本元数据/,
);

const failureKey = objectKey("artist", "failure");
database.exec(`CREATE TRIGGER fail_v2_marked_tag_outbox
  BEFORE INSERT ON sync_outbox
  WHEN NEW.object_key = '${failureKey}'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 marked tag outbox failure');
  END`);
assert.throws(
  () => repository.upsertLocalTag(tag(0, "artist", "failure"), MarkedTagMode.localSync, MutationOrigin.user),
  /injected v2 marked tag outbox failure/,
);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM marked_tags WHERE name = 'failure'").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(failureKey).count, 0);
database.exec("DROP TRIGGER fail_v2_marked_tag_outbox");

nowMs = 1200;
assert.equal(repository.deleteLocalTag("artist", "seeded-a", MarkedTagMode.localSync, MutationOrigin.user), true);
assert.equal(repository.deleteLocalTag("artist", "seeded-a", MarkedTagMode.localSync, MutationOrigin.user), false);
const tombstone = database
  .prepare(
    `SELECT outbox.envelope_json, versions.wall_ms, versions.logical_counter,
            versions.device_id, versions.last_op_id
     FROM sync_versions AS versions JOIN sync_outbox AS outbox USING (object_key)
     WHERE object_key = ? AND versions.deleted = 1`,
  )
  .get(seededAKey);
const tombstonePayload = codec.decodeEnvelope(LOCAL_MARKED_TAG_ENTITY_TYPE, tombstone.envelope_json, {
  objectKey: seededAKey,
  entityType: LOCAL_MARKED_TAG_ENTITY_TYPE,
  wallMs: tombstone.wall_ms,
  logicalCounter: tombstone.logical_counter,
  deviceId: tombstone.device_id,
  deleted: true,
  opId: tombstone.last_op_id,
});
assert.equal(tombstonePayload.namespace, "artist");
assert.equal(tombstonePayload.name, "seeded-a");
assert.equal("tagid" in tombstonePayload, false);

const stale = repository.applyRemoteLocalTag(
  remoteMutation({
    namespace: "artist",
    name: "seeded-a",
    wallMs: 1199,
    logicalCounter: 999,
    opId: "10000000-0000-4000-8000-000000000001",
  }),
  MarkedTagMode.localSync,
);
const newer = repository.applyRemoteLocalTag(
  remoteMutation({
    namespace: "artist",
    name: "seeded-a",
    wallMs: 1300,
    opId: "10000000-0000-4000-8000-000000000002",
    payloadValue: payload("artist", "seeded-a", { watched: true, color: "#abcdef", weight: 9 }),
  }),
  MarkedTagMode.localSync,
);
const duplicate = repository.applyRemoteLocalTag(
  remoteMutation({
    namespace: "artist",
    name: "seeded-a",
    wallMs: 1300,
    opId: "10000000-0000-4000-8000-000000000002",
    payloadValue: payload("artist", "seeded-a", { watched: true, color: "#abcdef", weight: 9 }),
  }),
  MarkedTagMode.localSync,
);
const newerDelete = repository.applyRemoteLocalTag(
  remoteMutation({
    namespace: "artist",
    name: "seeded-a",
    wallMs: 1400,
    deleted: true,
    opId: "10000000-0000-4000-8000-000000000003",
  }),
  MarkedTagMode.localSync,
);
assert.equal(stale.applied, false);
assert.equal(stale.membershipPresent, false);
assert.equal(newer.applied, true);
assert.equal(newer.membershipPresent, true);
assert.equal(database.prepare("SELECT tagid FROM marked_tags WHERE name = 'seeded-a'").get()?.tagid ?? 0, 0);
assert.equal(duplicate.applied, false);
assert.equal(newerDelete.applied, true);
assert.equal(newerDelete.membershipPresent, false);

const wrongKeyMutation = remoteMutation({
  namespace: "artist",
  name: "wrong-key",
  wallMs: 1500,
  opId: "10000000-0000-4000-8000-000000000004",
  mutationObjectKey: objectKey("artist", "someone-else"),
});
assert.throws(
  () => repository.applyRemoteLocalTag(wrongKeyMutation, MarkedTagMode.localSync),
  /payload 与 object key 不匹配/,
);
assert.throws(
  () => repository.applyRemoteLocalTag(wrongKeyMutation, MarkedTagMode.upstreamMirror),
  /镜像模式不接受 D1/,
);

const countBeforeFailedClear = database.prepare("SELECT COUNT(*) AS count FROM marked_tags").get().count;
const versionsBeforeFailedClear = database.prepare("SELECT COUNT(*) AS count FROM sync_versions").get().count;
const outboxBeforeFailedClear = database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count;
database.exec(`CREATE TRIGGER fail_v2_marked_tag_relogin_clear
  BEFORE DELETE ON marked_tags
  WHEN OLD.name = 'local-c'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 marked tag relogin clear failure');
  END`);
assert.throws(
  () => repository.clearForRelogin(MutationOrigin.localMaintenance),
  /injected v2 marked tag relogin clear failure/,
);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM marked_tags").get().count, countBeforeFailedClear);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions").get().count, versionsBeforeFailedClear);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, outboxBeforeFailedClear);
database.exec("DROP TRIGGER fail_v2_marked_tag_relogin_clear");

assert.throws(() => repository.clearForRelogin(MutationOrigin.user), /本机维护操作/);
assert.equal(repository.clearForRelogin(MutationOrigin.localMaintenance), countBeforeFailedClear);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM marked_tags").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 0);

repository.replaceUpstreamMirror(
  [
    tag(801, "artist", "upstream-a", { watched: true }),
    tag(802, "male", "upstream-b", { hidden: true }),
    tag(803, "group", "upstream-c", { weight: -4 }),
  ],
  MarkedTagMode.upstreamMirror,
  MutationOrigin.upstreamMirror,
);
repository.updateUpstreamTag(
  tag(802, "male", "upstream-b", { watched: true, weight: 7 }),
  MarkedTagMode.upstreamMirror,
  MutationOrigin.upstreamMirror,
);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 0);

assert.equal(repository.clearForRelogin(MutationOrigin.localMaintenance), 3);
repository.applyRemoteLocalTag(
  remoteMutation({
    namespace: "artist",
    name: "cloud-a",
    wallMs: 2000,
    opId: "10000000-0000-4000-8000-000000000005",
    payloadValue: payload("artist", "cloud-a", { watched: true, color: "#010203", weight: 4 }),
  }),
  MarkedTagMode.localSync,
);
repository.applyRemoteLocalTag(
  remoteMutation({
    namespace: "female",
    name: "cloud-b",
    wallMs: 2001,
    opId: "10000000-0000-4000-8000-000000000006",
    payloadValue: payload("female", "cloud-b", { hidden: true, weight: -3 }),
  }),
  MarkedTagMode.localSync,
);
assert.deepEqual(
  repository.queryMarkedTags().map((item) => item.name),
  ["cloud-a", "cloud-b"],
);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions").get().count, 2);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 0);

database.close();
console.log("v2 marked tag repository checks passed");
