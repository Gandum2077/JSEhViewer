const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { ArchiveRepository } = require("../dist/repositories/archive-repository");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const { CURRENT_SCHEMA_STATEMENTS } = require("../dist/utils/database-initialization");
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

function createRepository(database) {
  const adapter = new NodeSqliteAdapter(database);
  return new ArchiveRepository({
    query(sql, args = []) {
      return database.prepare(sql).all(...args.map(normalize));
    },
    transaction(callback, operation) {
      return withSqliteTransaction(adapter, callback, operation);
    },
  });
}

function archive(gid, overrides = {}) {
  return {
    gid,
    readlater: false,
    downloaded: false,
    first_access_time: `2026-01-${String(gid).padStart(2, "0")}T00:00:00.000Z`,
    last_access_time: `2026-01-${String(gid).padStart(2, "0")}T00:00:00.000Z`,
    token: `token-${gid}`,
    title: `archive-${gid}`,
    english_title: `english-${gid}`,
    japanese_title: `japanese-${gid}`,
    thumbnail_url: `https://example.test/${gid}.jpg`,
    category: "Manga",
    posted_time: "2025-12-01T00:00:00.000Z",
    visible: true,
    rating: 4,
    is_my_rating: false,
    length: 40 + gid,
    torrent_available: false,
    favorited: false,
    uploader: `uploader-${gid}`,
    disowned: false,
    taglist: [{ namespace: "artist", tags: [`artist-${gid}`] }],
    comment: "",
    last_read_page: gid,
    ...overrides,
  };
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of CURRENT_SCHEMA_STATEMENTS) database.exec(statement.sql);
const repository = createRepository(database);

assert.equal(repository.save(archive(1), MutationOrigin.user), true);
assert.equal(repository.get(1).title, "archive-1");
assert.equal(repository.getLastReadPage(1), 1);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM archive_taglist WHERE gid = 1").get().count, 1);

assert.equal(repository.save(archive(1, { title: "must-not-overwrite" }), MutationOrigin.user), false);
assert.equal(repository.get(1).title, "archive-1");

assert.equal(
  repository.save(
    archive(1, {
      title: "replacement",
      taglist: [{ namespace: "language", tags: ["chinese", "translated"] }],
    }),
    MutationOrigin.upstreamMirror,
    true,
  ),
  true,
);
assert.equal(repository.get(1).title, "replacement");
assert.deepEqual(
  database
    .prepare("SELECT namespace, tag FROM archive_taglist WHERE gid = 1 ORDER BY tag")
    .all()
    .map((row) => ({ ...row })),
  [
    { namespace: "language", tag: "chinese" },
    { namespace: "language", tag: "translated" },
  ],
);

assert.throws(
  () =>
    repository.save(
      archive(1, { title: "partial-write", taglist: [{ namespace: "artist", tags: [null] }] }),
      MutationOrigin.user,
      true,
    ),
  /写入图库标签索引失败/,
);
assert.equal(repository.get(1).title, "replacement", "标签写入失败必须回滚图库行");
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM archive_taglist WHERE gid = 1").get().count, 2);

repository.update(
  1,
  {
    readlater: true,
    last_read_page: 19,
    my_rating: 4.75,
    favorite_info: { favorited: true, favcat: 3 },
  },
  MutationOrigin.user,
);
assert.deepEqual(
  (({ readlater, last_read_page, rating, is_my_rating, favorited, favcat }) => ({
    readlater,
    last_read_page,
    rating,
    is_my_rating,
    favorited,
    favcat,
  }))(repository.get(1)),
  { readlater: true, last_read_page: 19, rating: 4.75, is_my_rating: true, favorited: true, favcat: 3 },
);

for (let gid = 2; gid <= 6; gid += 1) repository.save(archive(gid), MutationOrigin.migrationSeed);
assert.equal(
  repository.query({ fromPage: 0, toPage: 0, pageSize: 2, sort: "first_access_time" }).length,
  2,
  "自定义 pageSize 必须控制 LIMIT",
);
assert.deepEqual(
  repository.queryGids({
    fromPage: 0,
    toPage: 0,
    searchTerms: [{ qualifier: "title", term: "replacement", subtract: false }],
  }),
  [1],
);
assert.deepEqual(
  repository.queryGids({
    fromPage: 0,
    toPage: 0,
    searchTerms: [{ qualifier: "tag", namespace: "language", term: "chinese", dollar: true }],
  }),
  [1],
);

database.prepare("INSERT INTO gallery_reader_config (gid) VALUES (?)").run(2);
repository.delete(2, MutationOrigin.user, true);
assert.equal(repository.get(2), undefined);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM gallery_reader_config WHERE gid = 2").get().count, 0);

repository.update(3, { downloaded: true }, MutationOrigin.localMaintenance);
database
  .prepare("INSERT INTO favorite_images (gid, page_index, favorited_at) VALUES (?, ?, ?)")
  .run(4, 0, "2026-01-01");
assert.deepEqual(repository.findOldRemovableGids("2026-12-01T00:00:00.000Z"), [1, 5, 6]);
assert.deepEqual(repository.listDownloadedGids(), [3]);
assert.deepEqual(repository.getMetadataByGids([1]).get(1), {
  token: "token-1",
  length: 41,
  title: "japanese-1",
});

assert.throws(() => repository.delete(1, "unknown-origin"), /变更来源/);
repository.clearAllLocalData(MutationOrigin.localMaintenance);
assert.equal(repository.count({ fromPage: 0, toPage: 0 }), 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM favorite_images").get().count, 0);

database.close();
console.log("archive repository checks passed");
