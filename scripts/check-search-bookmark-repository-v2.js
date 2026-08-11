const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { bookmarkPositionKeyForIndex } = require("../dist/repositories/bookmark-position-key");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const {
  SEARCH_BOOKMARK_ENTITY_TYPE,
  V2SearchBookmarkRepository,
} = require("../dist/repositories/search-bookmark-repository-v2");
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

function bookmarkId(sortedFsearch) {
  return crypto.createHash("sha256").update(sortedFsearch).digest("hex");
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) database.exec(statement.sql);

function insertFixture(sortedFsearch, index, term) {
  const id = bookmarkId(sortedFsearch);
  database
    .prepare("INSERT INTO search_bookmarks (bookmark_id, position_key, sorted_fsearch) VALUES (?, ?, ?)")
    .run(id, bookmarkPositionKeyForIndex(index), sortedFsearch);
  database
    .prepare(
      `INSERT INTO search_bookmarks_search_terms
       (bookmark_id, term_index, term, dollar, subtract, tilde)
       VALUES (?, 0, ?, 0, 0, 0)`,
    )
    .run(id, term);
}

insertFixture("bookmark-a", 0, "a");
insertFixture("bookmark-b", 1, "b");
insertFixture("bookmark-c", 2, "c");

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
const repository = new V2SearchBookmarkRepository(createRepositoryDatabase(database), writer, codec, bookmarkId);

function objectKey(sortedFsearch) {
  return codec.deriveObjectKey(SEARCH_BOOKMARK_ENTITY_TYPE, bookmarkId(sortedFsearch));
}

function payload(sortedFsearch, positionKey, term) {
  return {
    format: 1,
    bookmarkId: bookmarkId(sortedFsearch),
    positionKey,
    sortedFsearch,
    searchTerms: [
      {
        namespace: null,
        qualifier: null,
        term,
        dollar: false,
        subtract: false,
        tilde: false,
      },
    ],
  };
}

function remoteMutation({
  sortedFsearch,
  positionKey,
  term,
  wallMs,
  logicalCounter = 0,
  deleted = false,
  deviceId = "device-b",
  opId,
  payloadValue,
  mutationObjectKey = objectKey(sortedFsearch),
}) {
  const version = {
    objectKey: mutationObjectKey,
    entityType: SEARCH_BOOKMARK_ENTITY_TYPE,
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
      SEARCH_BOOKMARK_ENTITY_TYPE,
      payloadValue ?? payload(sortedFsearch, positionKey, term),
      version,
    ),
  };
}

assert.equal(repository.seedExistingBookmarks(), 3, "首次 seed 必须为全部迁移书签创建同步状态");
assert.equal(repository.seedExistingBookmarks(), 0, "重复 seed 不得产生新版本或 outbox");
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 3);
assert.deepEqual(
  repository.queryBookmarks().map((item) => item.sortedFsearch),
  ["bookmark-a", "bookmark-b", "bookmark-c"],
);

const delimiterTerms = [
  { namespace: "artist", term: "alpha|beta;gamma", dollar: true, subtract: false, tilde: false },
  { qualifier: "uploader", term: "someone", dollar: false, subtract: true, tilde: false },
];
const added = repository.addBookmark("bookmark-d", delimiterTerms, MutationOrigin.user);
assert.equal(added.inserted, true);
assert.equal(added.item.positionKey, bookmarkPositionKeyForIndex(3));
assert.equal(repository.addBookmark("bookmark-d", [], MutationOrigin.user).inserted, false);
assert.throws(() => repository.addBookmark("invalid-origin", [], MutationOrigin.remote), /必须携带版本元数据/);
assert.deepEqual(added.item.searchTerms, [
  { ...delimiterTerms[0], qualifier: undefined },
  { ...delimiterTerms[1], namespace: undefined },
]);

const collisionRepository = new V2SearchBookmarkRepository(createRepositoryDatabase(database), writer, codec, () =>
  bookmarkId("bookmark-a"),
);
assert.throws(
  () => collisionRepository.addBookmark("different-query-with-colliding-id", [], MutationOrigin.user),
  /SHA-256 碰撞/,
  "错误摘要实现不得把不同查询静默当成同一书签",
);

const addFailureId = bookmarkId("add-failure");
const addFailureKey = objectKey("add-failure");
database.exec(`CREATE TRIGGER fail_v2_bookmark_outbox
  BEFORE INSERT ON sync_outbox
  WHEN NEW.object_key = '${addFailureKey}'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 bookmark outbox failure');
  END`);
assert.throws(
  () =>
    repository.addBookmark(
      "add-failure",
      [{ term: "written-before-outbox", dollar: false, subtract: false, tilde: false }],
      MutationOrigin.user,
    ),
  /injected v2 bookmark outbox failure/,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM search_bookmarks WHERE bookmark_id = ?").get(addFailureId).count,
  0,
);
assert.equal(
  database
    .prepare("SELECT COUNT(*) AS count FROM search_bookmarks_search_terms WHERE bookmark_id = ?")
    .get(addFailureId).count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(addFailureKey).count,
  0,
);
database.exec("DROP TRIGGER fail_v2_bookmark_outbox");

const [a, b, c, d] = repository.queryBookmarks();
nowMs = 1100;
assert.equal(
  repository.reorderBookmarks([d.bookmarkId, c.bookmarkId, a.bookmarkId, b.bookmarkId], MutationOrigin.user),
  4,
);
assert.deepEqual(
  repository.queryBookmarks().map((item) => item.sortedFsearch),
  ["bookmark-d", "bookmark-c", "bookmark-a", "bookmark-b"],
);
assert.deepEqual(
  repository.queryBookmarks().map((item) => item.positionKey),
  [0, 1, 2, 3].map(bookmarkPositionKeyForIndex),
);
const orderBeforeInvalid = repository.queryBookmarks().map((item) => item.bookmarkId);
assert.throws(
  () => repository.reorderBookmarks(orderBeforeInvalid.slice(1), MutationOrigin.user),
  /必须且只能包含全部现有书签/,
);
assert.deepEqual(
  repository.queryBookmarks().map((item) => item.bookmarkId),
  orderBeforeInvalid,
  "非法重排不得改变顺序",
);

const rollbackTargetKey = objectKey("bookmark-c");
database.exec(`CREATE TRIGGER fail_v2_bookmark_reorder
  BEFORE INSERT ON sync_outbox
  WHEN NEW.object_key = '${rollbackTargetKey}'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 bookmark reorder failure');
  END`);
const orderBeforeRollback = repository.queryBookmarks().map((item) => ({
  bookmarkId: item.bookmarkId,
  positionKey: item.positionKey,
}));
const versionsBeforeRollback = database
  .prepare("SELECT object_key, wall_ms, logical_counter, last_op_id FROM sync_versions ORDER BY object_key")
  .all();
assert.throws(
  () => repository.reorderBookmarks([...orderBeforeInvalid].reverse(), MutationOrigin.user),
  /injected v2 bookmark reorder failure/,
);
assert.deepEqual(
  repository.queryBookmarks().map((item) => ({ bookmarkId: item.bookmarkId, positionKey: item.positionKey })),
  orderBeforeRollback,
  "重排中途 outbox 失败必须恢复全部 position key",
);
assert.deepEqual(
  database
    .prepare("SELECT object_key, wall_ms, logical_counter, last_op_id FROM sync_versions ORDER BY object_key")
    .all(),
  versionsBeforeRollback,
  "重排中途失败必须恢复所有书签版本",
);
database.exec("DROP TRIGGER fail_v2_bookmark_reorder");

nowMs = 1200;
assert.equal(repository.deleteBookmark(b.bookmarkId, MutationOrigin.user), true);
assert.equal(repository.deleteBookmark(b.bookmarkId, MutationOrigin.user), false, "重复删除不得刷新 tombstone");
const bKey = objectKey("bookmark-b");
const tombstone = database
  .prepare(
    `SELECT versions.deleted, versions.wall_ms, versions.logical_counter, versions.device_id,
            versions.last_op_id, outbox.envelope_json
     FROM sync_versions AS versions
     JOIN sync_outbox AS outbox USING (object_key)
     WHERE versions.object_key = ?`,
  )
  .get(bKey);
assert.equal(tombstone.deleted, 1);
assert.equal(
  codec.decodeEnvelope(SEARCH_BOOKMARK_ENTITY_TYPE, tombstone.envelope_json, {
    objectKey: bKey,
    entityType: SEARCH_BOOKMARK_ENTITY_TYPE,
    wallMs: tombstone.wall_ms,
    logicalCounter: tombstone.logical_counter,
    deviceId: tombstone.device_id,
    deleted: true,
    opId: tombstone.last_op_id,
  }).bookmarkId,
  b.bookmarkId,
  "书签 tombstone 必须保留加密实体身份",
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM search_bookmarks WHERE bookmark_id = ?").get(b.bookmarkId).count,
  0,
);
assert.equal(
  database
    .prepare("SELECT COUNT(*) AS count FROM search_bookmarks_search_terms WHERE bookmark_id = ?")
    .get(b.bookmarkId).count,
  0,
);

const staleB = repository.applyRemoteBookmark(
  remoteMutation({
    sortedFsearch: "bookmark-b",
    positionKey: bookmarkPositionKeyForIndex(3),
    term: "stale",
    wallMs: 1199,
    logicalCounter: 99,
    opId: "10000000-0000-4000-8000-000000000001",
  }),
);
assert.equal(staleB.applied, false);
assert.equal(staleB.membershipPresent, false);
const newerB = remoteMutation({
  sortedFsearch: "bookmark-b",
  positionKey: bookmarkPositionKeyForIndex(1),
  term: "remote-b",
  wallMs: 1300,
  opId: "10000000-0000-4000-8000-000000000002",
});
assert.equal(repository.applyRemoteBookmark(newerB).applied, true);
assert.equal(repository.applyRemoteBookmark(newerB).applied, false, "重复远端书签 change 必须幂等");
assert.equal(
  repository.queryBookmarks().find((item) => item.bookmarkId === b.bookmarkId).searchTerms[0].term,
  "remote-b",
);

const remoteDeleteB = remoteMutation({
  sortedFsearch: "bookmark-b",
  positionKey: bookmarkPositionKeyForIndex(1),
  term: "remote-b",
  wallMs: 1400,
  deleted: true,
  opId: "10000000-0000-4000-8000-000000000003",
});
assert.equal(repository.applyRemoteBookmark(remoteDeleteB).membershipPresent, false);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(bKey).count, 0);

const ghostDelete = remoteMutation({
  sortedFsearch: "ghost",
  positionKey: bookmarkPositionKeyForIndex(9),
  term: "ghost",
  wallMs: 1500,
  deleted: true,
  opId: "10000000-0000-4000-8000-000000000004",
});
assert.equal(repository.applyRemoteBookmark(ghostDelete).applied, true);
assert.equal(repository.applyRemoteBookmark(ghostDelete).applied, false);
assert.equal(
  database.prepare("SELECT deleted FROM sync_versions WHERE object_key = ?").get(objectKey("ghost")).deleted,
  1,
);

const sharedPosition = bookmarkPositionKeyForIndex(8);
for (const [index, name] of ["concurrent-a", "concurrent-b"].entries()) {
  repository.applyRemoteBookmark(
    remoteMutation({
      sortedFsearch: name,
      positionKey: sharedPosition,
      term: name,
      wallMs: 1600 + index,
      opId: `10000000-0000-4000-8000-${String(5 + index).padStart(12, "0")}`,
    }),
  );
}
const tied = repository.queryBookmarks().filter((item) => item.positionKey === sharedPosition);
assert.deepEqual(
  tied.map((item) => item.bookmarkId),
  tied.map((item) => item.bookmarkId).sort(),
  "相同 position key 必须用稳定书签 ID 确定顺序",
);
assert.deepEqual(
  tied.map((item) => item.sortedFsearch).sort(),
  ["concurrent-a", "concurrent-b"],
  "并发相同位置不能丢书签",
);

const forgedPayload = payload("forged", bookmarkPositionKeyForIndex(5), "forged");
assert.throws(
  () =>
    repository.applyRemoteBookmark(
      remoteMutation({
        sortedFsearch: "forged",
        positionKey: bookmarkPositionKeyForIndex(5),
        term: "forged",
        wallMs: 1700,
        payloadValue: forgedPayload,
        mutationObjectKey: objectKey("bookmark-a"),
        opId: "10000000-0000-4000-8000-000000000007",
      }),
    ),
  /payload 与 object key 不匹配/,
);
const invalidPositionPayload = payload("invalid-position", "invalid", "invalid");
assert.throws(
  () =>
    repository.applyRemoteBookmark(
      remoteMutation({
        sortedFsearch: "invalid-position",
        positionKey: "invalid",
        term: "invalid",
        wallMs: 1700,
        payloadValue: invalidPositionPayload,
        opId: "10000000-0000-4000-8000-000000000008",
      }),
    ),
  /position key/,
);
const bound = remoteMutation({
  sortedFsearch: "bound",
  positionKey: bookmarkPositionKeyForIndex(6),
  term: "bound",
  wallMs: 1800,
  opId: "10000000-0000-4000-8000-000000000009",
});
assert.throws(
  () => repository.applyRemoteBookmark({ ...bound, wallMs: 1801 }),
  /envelope 与 entity type、object key 或 HLC 不匹配/,
);

assert.equal(repository.seedExistingBookmarks(), 0);
database.close();
console.log("v2 search bookmark repository checks passed");
