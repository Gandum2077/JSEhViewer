const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const {
  SEARCH_HISTORY_ENTITY_TYPE,
  V2SearchHistoryRepository,
} = require("../dist/repositories/search-history-repository-v2");
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

function historyId(sortedFsearch) {
  return crypto.createHash("sha256").update(sortedFsearch).digest("hex");
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) database.exec(statement.sql);

const seededId = historyId("seeded-query");
database
  .prepare("INSERT INTO search_history (history_id, last_access_time, sorted_fsearch) VALUES (?, ?, ?)")
  .run(seededId, "2026-01-01T00:00:00.000Z", "seeded-query");
database
  .prepare(
    `INSERT INTO search_history_search_terms
     (history_id, term_index, namespace, qualifier, term, dollar, subtract, tilde)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(seededId, 0, "artist", null, "seeded", 1, 0, 0);

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
const repository = new V2SearchHistoryRepository(createRepositoryDatabase(database), writer, codec, historyId);

function objectKey(sortedFsearch) {
  return codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, historyId(sortedFsearch));
}

function remoteMutation({
  sortedFsearch,
  lastAccessTime,
  searchTerms,
  wallMs,
  logicalCounter = 0,
  deleted = false,
  deviceId = "device-b",
  opId,
  payloadHistoryId = historyId(sortedFsearch),
  mutationObjectKey = objectKey(sortedFsearch),
}) {
  const version = {
    objectKey: mutationObjectKey,
    entityType: SEARCH_HISTORY_ENTITY_TYPE,
    wallMs,
    logicalCounter,
    deviceId,
    deleted,
    opId,
  };
  return {
    ...version,
    origin: MutationOrigin.remote,
    envelopeJson: codec.encodeEnvelope(
      SEARCH_HISTORY_ENTITY_TYPE,
      {
        format: 1,
        historyId: payloadHistoryId,
        sortedFsearch,
        lastAccessTime,
        searchTerms,
      },
      version,
    ),
  };
}

const delimiterTerms = [
  { namespace: "artist", term: "alpha|beta;gamma", dollar: true, subtract: false, tilde: false },
  { qualifier: "uploader", term: "someone", dollar: false, subtract: true, tilde: false },
];

assert.equal(repository.seedExistingHistory(), 1, "首次 seed 必须为迁移已有历史创建同步状态");
assert.equal(repository.seedExistingHistory(), 0, "重复 seed 不得产生新版本或 outbox");
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 1);
assert.equal(repository.queryHistory()[0].searchTerms[0].term, "seeded");

const alice = repository.upsertHistory("artist:alice", delimiterTerms, MutationOrigin.user, "2026-02-01T00:00:00.000Z");
assert.equal(alice.changed, true);
assert.equal(alice.item.historyId, historyId("artist:alice"));
assert.deepEqual(alice.item.searchTerms, [
  { ...delimiterTerms[0], qualifier: undefined },
  { ...delimiterTerms[1], namespace: undefined },
]);
const aliceKey = objectKey("artist:alice");
const aliceOutbox = database
  .prepare("SELECT wall_ms, logical_counter, envelope_json FROM sync_outbox WHERE object_key = ?")
  .get(aliceKey);
const aliceEnvelope = JSON.parse(aliceOutbox.envelope_json);
assert.equal(aliceEnvelope.objectKey, aliceKey);
assert.equal(aliceEnvelope.wallMs, aliceOutbox.wall_ms);
assert.equal(aliceEnvelope.logicalCounter, aliceOutbox.logical_counter);
assert.equal(aliceEnvelope.payload.searchTerms[0].term, "alpha|beta;gamma");

const clockBeforeNoop = { ...database.prepare("SELECT * FROM sync_clock WHERE id = 1").get() };
assert.equal(
  repository.upsertHistory("artist:alice", delimiterTerms, MutationOrigin.user, "2026-02-01T00:00:00.000Z").changed,
  false,
  "完全相同的历史不得制造新版本",
);
assert.deepEqual({ ...database.prepare("SELECT * FROM sync_clock WHERE id = 1").get() }, clockBeforeNoop);

nowMs = 1100;
assert.equal(
  repository.upsertHistory(
    "artist:alice",
    [{ namespace: "artist", term: "replacement" }],
    MutationOrigin.user,
    "2026-02-02T00:00:00.000Z",
  ).changed,
  true,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(aliceKey).count,
  1,
  "同一查询的连续访问必须合并为一个 outbox",
);
assert.deepEqual(repository.queryHistory()[0].searchTerms, [
  {
    namespace: "artist",
    qualifier: undefined,
    term: "replacement",
    dollar: false,
    subtract: false,
    tilde: false,
  },
]);
assert.throws(() => repository.upsertHistory("invalid-origin", [], MutationOrigin.remote), /必须携带版本元数据/);

const failureKey = objectKey("failure-query");
database.exec(`CREATE TRIGGER fail_v2_history_term
  BEFORE INSERT ON search_history_search_terms
  WHEN NEW.term = 'force-rollback'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 history term failure');
  END`);
assert.throws(
  () =>
    repository.upsertHistory(
      "failure-query",
      [{ term: "force-rollback" }],
      MutationOrigin.user,
      "2026-02-03T00:00:00.000Z",
    ),
  /injected v2 history term failure/,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM search_history WHERE history_id = ?").get(historyId("failure-query"))
    .count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(failureKey).count,
  0,
);
database.exec("DROP TRIGGER fail_v2_history_term");

const outboxFailureId = historyId("outbox-failure-query");
const outboxFailureKey = objectKey("outbox-failure-query");
database.exec(`CREATE TRIGGER fail_v2_history_outbox
  BEFORE INSERT ON sync_outbox
  WHEN NEW.object_key = '${outboxFailureKey}'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 history outbox failure');
  END`);
assert.throws(
  () =>
    repository.upsertHistory(
      "outbox-failure-query",
      [{ term: "written-before-outbox", dollar: false, subtract: false, tilde: false }],
      MutationOrigin.user,
      "2026-02-03T00:00:00.000Z",
    ),
  /injected v2 history outbox failure/,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM search_history WHERE history_id = ?").get(outboxFailureId).count,
  0,
);
assert.equal(
  database
    .prepare("SELECT COUNT(*) AS count FROM search_history_search_terms WHERE history_id = ?")
    .get(outboxFailureId).count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(outboxFailureKey).count,
  0,
);
database.exec("DROP TRIGGER fail_v2_history_outbox");

assert.equal(repository.deleteHistoryLocally(alice.item.historyId), true);
assert.equal(repository.deleteHistoryLocally(alice.item.historyId), false, "重复本机删除必须幂等");
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM search_history WHERE history_id = ?").get(alice.item.historyId).count,
  0,
);
assert.equal(
  database
    .prepare("SELECT COUNT(*) AS count FROM search_history_search_terms WHERE history_id = ?")
    .get(alice.item.historyId).count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(aliceKey).count,
  0,
);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(aliceKey).count, 0);

const remoteAlice = remoteMutation({
  sortedFsearch: "artist:alice",
  lastAccessTime: "2026-03-01T00:00:00.000Z",
  searchTerms: [{ namespace: "artist", qualifier: null, term: "remote", dollar: false, subtract: false, tilde: false }],
  wallMs: 2000,
  opId: "10000000-0000-4000-8000-000000000001",
});
const restored = repository.applyRemoteHistory(remoteAlice);
assert.equal(restored.applied, true, "显式全量恢复或新的远端 change 可以重建本机已清除历史");
assert.equal(restored.item.searchTerms[0].term, "remote");
assert.equal(repository.applyRemoteHistory(remoteAlice).applied, false, "重复远端 change 必须幂等");
const staleAlice = repository.applyRemoteHistory(
  remoteMutation({
    sortedFsearch: "artist:alice",
    lastAccessTime: "2026-02-20T00:00:00.000Z",
    searchTerms: [
      { namespace: "artist", qualifier: null, term: "stale", dollar: false, subtract: false, tilde: false },
    ],
    wallMs: 1900,
    logicalCounter: 99,
    opId: "10000000-0000-4000-8000-000000000002",
  }),
);
assert.equal(staleAlice.applied, false);
assert.equal(repository.queryHistory()[0].searchTerms[0].term, "remote");
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(aliceKey).count, 0);

assert.throws(
  () =>
    repository.applyRemoteHistory(
      remoteMutation({
        sortedFsearch: "artist:alice",
        lastAccessTime: "2026-03-02T00:00:00.000Z",
        searchTerms: [],
        wallMs: 2100,
        deleted: true,
        opId: "10000000-0000-4000-8000-000000000003",
      }),
    ),
  /不接受云端 tombstone/,
);
assert.throws(
  () =>
    repository.applyRemoteHistory(
      remoteMutation({
        sortedFsearch: "artist:mallory",
        lastAccessTime: "2026-03-02T00:00:00.000Z",
        searchTerms: [],
        wallMs: 2100,
        mutationObjectKey: aliceKey,
        opId: "10000000-0000-4000-8000-000000000004",
      }),
    ),
  /payload 与 object key 不匹配/,
);
assert.throws(
  () =>
    repository.applyRemoteHistory(
      remoteMutation({
        sortedFsearch: "artist:mallory",
        lastAccessTime: "2026-03-02T00:00:00.000Z",
        searchTerms: [],
        wallMs: 2100,
        payloadHistoryId: historyId("artist:alice"),
        opId: "10000000-0000-4000-8000-000000000005",
      }),
    ),
  /稳定 ID 与规范化查询不匹配/,
);

const boundMutation = remoteMutation({
  sortedFsearch: "bound",
  lastAccessTime: "2026-03-03T00:00:00.000Z",
  searchTerms: [],
  wallMs: 2200,
  opId: "10000000-0000-4000-8000-000000000006",
});
assert.throws(
  () => repository.applyRemoteHistory({ ...boundMutation, wallMs: 2201 }),
  /envelope 与 entity type、object key 或 HLC 不匹配/,
);

nowMs = 3000;
const oldOne = repository.upsertHistory(
  "old-one",
  [{ term: "old-1" }],
  MutationOrigin.user,
  "2025-01-01T00:00:00.000Z",
);
const oldTwo = repository.upsertHistory(
  "old-two",
  [{ term: "old-2" }],
  MutationOrigin.user,
  "2025-02-01T00:00:00.000Z",
);
repository.upsertHistory("new-one", [{ term: "new" }], MutationOrigin.user, "2026-04-01T00:00:00.000Z");
assert.equal(repository.deleteHistoryBeforeLocally("2026-01-01T00:00:00.000Z"), 2);
for (const item of [oldOne.item, oldTwo.item]) {
  const key = codec.deriveObjectKey(SEARCH_HISTORY_ENTITY_TYPE, item.historyId);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM search_history WHERE history_id = ?").get(item.historyId).count,
    0,
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(key).count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(key).count, 0);
}
assert.equal(
  database
    .prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE deleted = 1 AND entity_type = ?")
    .get(SEARCH_HISTORY_ENTITY_TYPE).count,
  0,
  "本机清理搜索历史不得制造 tombstone",
);
assert.equal(
  repository.queryHistory().some((item) => item.sortedFsearch === "new-one"),
  true,
);

assert.equal(repository.deleteHistoryLocally(alice.item.historyId), true);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(aliceKey).count,
  0,
);
assert.equal(repository.seedExistingHistory(), 0, "本机已删除的行不得被 seed 重新加入");

database.close();
console.log("v2 search history repository checks passed");
