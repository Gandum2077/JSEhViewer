const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const { SearchRepository } = require("../dist/repositories/search-repository");
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
  return new SearchRepository({
    query(sql, args = []) {
      return database.prepare(sql).all(...args.map(normalize));
    },
    transaction(callback, operation) {
      return withSqliteTransaction(adapter, callback, operation);
    },
  });
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of CURRENT_SCHEMA_STATEMENTS) database.exec(statement.sql);
const repository = createRepository(database);

const delimiterTerms = [
  { namespace: "artist", term: "alpha|beta;gamma", dollar: true, subtract: false, tilde: false },
  { qualifier: "uploader", term: "someone", dollar: false, subtract: true, tilde: false },
];
const first = repository.upsertHistory("artist:alpha", delimiterTerms, MutationOrigin.user, "2026-01-01T00:00:00.000Z");
repository.upsertHistory(
  "language:chinese",
  [{ namespace: "language", term: "chinese" }],
  MutationOrigin.user,
  "2026-01-02T00:00:00.000Z",
);
assert.equal(repository.queryHistory()[1].searchTerms[0].term, "alpha|beta;gamma");
assert.deepEqual(repository.queryHistory()[1].searchTerms, [
  { ...delimiterTerms[0], qualifier: undefined },
  { ...delimiterTerms[1], namespace: undefined },
]);

const replaced = repository.upsertHistory(
  "artist:alpha",
  [{ namespace: "artist", term: "replacement" }],
  MutationOrigin.remote,
  "2026-01-03T00:00:00.000Z",
);
assert.equal(replaced.id, first.id, "同一规范化查询必须复用本机行");
assert.deepEqual(repository.queryHistory()[0].searchTerms, [
  { namespace: "artist", qualifier: undefined, term: "replacement", dollar: false, subtract: false, tilde: false },
]);

assert.throws(
  () =>
    repository.upsertHistory(
      "artist:alpha",
      [{ namespace: "artist", term: null }],
      MutationOrigin.user,
      "2026-01-04T00:00:00.000Z",
    ),
  /写入 search_history_search_terms失败/,
);
const afterRollback = repository.queryHistory()[0];
assert.equal(afterRollback.last_access_time, "2026-01-03T00:00:00.000Z");
assert.equal(afterRollback.searchTerms[0].term, "replacement");

const language = repository.queryHistory().find((item) => item.sorted_fsearch === "language:chinese");
repository.deleteHistoryLocally(language.id);
assert.equal(
  repository.queryHistory().some((item) => item.id === language.id),
  false,
);
assert.equal(
  database
    .prepare("SELECT COUNT(*) AS count FROM search_history_search_terms WHERE search_history_id = ?")
    .get(language.id).count,
  0,
);

repository.upsertHistory("old", [{ term: "old" }], MutationOrigin.user, "2025-01-01T00:00:00.000Z");
repository.upsertHistory("new", [{ term: "new" }], MutationOrigin.user, "2026-02-01T00:00:00.000Z");
assert.equal(repository.deleteHistoryBeforeLocally("2026-01-01T00:00:00.000Z"), 1);
assert.deepEqual(
  repository.getSomeLastAccessSearchTerms(2).map((term) => term.term),
  ["new", "replacement"],
);

assert.equal(repository.addBookmark("bookmark-a", delimiterTerms, MutationOrigin.user), true);
assert.equal(repository.addBookmark("bookmark-b", [{ term: "b" }], MutationOrigin.user), true);
assert.equal(repository.addBookmark("bookmark-c", [{ term: "c" }], MutationOrigin.remote), true);
assert.equal(repository.addBookmark("bookmark-a", [], MutationOrigin.user), false);
const initialBookmarks = repository.queryBookmarks();
assert.equal(initialBookmarks[0].searchTerms[0].term, "alpha|beta;gamma");
const [bookmarkA, bookmarkB, bookmarkC] = initialBookmarks;

repository.reorderBookmarks([bookmarkC.id, bookmarkA.id, bookmarkB.id], MutationOrigin.user);
assert.deepEqual(
  repository.queryBookmarks().map((item) => item.id),
  [bookmarkC.id, bookmarkA.id, bookmarkB.id],
);
assert.throws(
  () => repository.reorderBookmarks([bookmarkA.id, bookmarkB.id], MutationOrigin.user),
  /必须且只能包含全部现有书签/,
);
assert.deepEqual(
  repository.queryBookmarks().map((item) => item.id),
  [bookmarkC.id, bookmarkA.id, bookmarkB.id],
  "非法重排不得改变已有顺序",
);

repository.deleteBookmark(bookmarkA.id, MutationOrigin.user);
assert.deepEqual(
  repository.queryBookmarks().map((item) => item.sort_order),
  [0, 1],
);
assert.equal(
  database
    .prepare("SELECT COUNT(*) AS count FROM search_bookmarks_search_terms WHERE search_bookmarks_id = ?")
    .get(bookmarkA.id).count,
  0,
);

assert.throws(
  () => repository.addBookmark("broken", [{ term: null }], MutationOrigin.user),
  /写入 search_bookmarks_search_terms失败/,
);
assert.equal(
  repository.queryBookmarks().some((item) => item.sorted_fsearch === "broken"),
  false,
);
assert.throws(() => repository.addBookmark("invalid-origin", [], "invalid"), /变更来源/);

const bulkHistory = database.prepare("INSERT INTO search_history (last_access_time, sorted_fsearch) VALUES (?, ?)");
const bulkTerm = database.prepare(
  `INSERT INTO search_history_search_terms
   (search_history_id, term, dollar, subtract, tilde) VALUES (?, ?, ?, ?, ?)`,
);
for (let index = 0; index < 405; index += 1) {
  const result = bulkHistory.run("2026-03-01T00:00:00.000Z", `bulk-${index}`);
  bulkTerm.run(Number(result.lastInsertRowid), `bulk-term-${index}`, 0, 0, 0);
}
const bulkRows = repository.queryHistory().filter((item) => item.sorted_fsearch.startsWith("bulk-"));
assert.equal(bulkRows.length, 405, "terms 查询必须跨越 parent ID 批次");
assert.ok(bulkRows.every((item) => item.searchTerms.length === 1));

database.close();
console.log("search repository checks passed");
