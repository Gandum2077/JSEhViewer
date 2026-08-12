const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join, relative } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const { V2SearchBookmarkRepository } = require("../dist/repositories/search-bookmark-repository-v2");
const { V2SearchHistoryRepository } = require("../dist/repositories/search-history-repository-v2");
const { V2SearchRepositoryFacade } = require("../dist/repositories/search-repository-v2-facade");
const { SyncMutationWriter } = require("../dist/repositories/sync-mutation-writer");
const { CloudSyncDiagnosticEntityCodec } = require("../dist/utils/cloud-sync-diagnostic-entity-codec");
const { DATABASE_V2_DRAFT_SCHEMA_STATEMENTS } = require("../dist/utils/database-schema-v2-draft");
const { withSqliteTransaction } = require("../dist/utils/sqlite-safe");

function sourceFiles(path) {
  if (statSync(path).isFile()) return path.endsWith(".ts") ? [path] : [];
  return readdirSync(path).flatMap((name) => sourceFiles(join(path, name)));
}

const projectRoot = join(__dirname, "..");
const formalBusinessFiles = [
  join(projectRoot, "src/index.ts"),
  join(projectRoot, "src/utils/config.ts"),
  join(projectRoot, "src/utils/status.ts"),
  join(projectRoot, "src/utils/favorite-image.ts"),
  join(projectRoot, "src/utils/api.ts"),
  ...sourceFiles(join(projectRoot, "src/components")),
  ...sourceFiles(join(projectRoot, "src/controllers")),
];
const candidateTables = [
  "archives",
  "archive_entries",
  "archive_taglist",
  "reading_state",
  "local_gallery_state",
  "search_history",
  "search_history_search_terms",
  "search_bookmarks",
  "search_bookmarks_search_terms",
  "marked_uploaders",
  "marked_tags",
  "sync_clock",
  "sync_versions",
  "sync_outbox",
];
const directSql = new RegExp(
  `\\b(?:DELETE\\s+FROM|FROM|JOIN|INTO|UPDATE)\\s+[\u0060\"']?(${candidateTables.join("|")})\\b`,
  "giu",
);
const violations = [];
for (const file of formalBusinessFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(directSql)) {
    const line = source.slice(0, match.index).split("\n").length;
    violations.push(`${relative(projectRoot, file)}:${line}:${match[1]}`);
  }
}
assert.deepEqual(violations, [], `正式业务文件不得绕过 Repository 直接访问同步候选表：\n${violations.join("\n")}`);

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

let opSequence = 0;
const codec = new CloudSyncDiagnosticEntityCodec();
const writer = new SyncMutationWriter({
  deviceId: "business-path-device",
  nowMs: () => 2000,
  createOpId: () => {
    opSequence += 1;
    return `00000000-0000-4000-8000-${String(opSequence).padStart(12, "0")}`;
  },
});
const repository = repositoryDatabase(database);
const facade = new V2SearchRepositoryFacade(
  new V2SearchHistoryRepository(repository, writer, codec, stableId),
  new V2SearchBookmarkRepository(repository, writer, codec, stableId),
);

const firstHistory = facade.upsertHistory(
  "first-history",
  [{ namespace: "artist", term: "first" }],
  MutationOrigin.user,
  "2026-08-11T00:00:00.000Z",
);
const latestHistory = facade.upsertHistory(
  "latest-history",
  [{ qualifier: "uploader", term: "latest" }],
  MutationOrigin.user,
  "2026-08-12T00:00:00.000Z",
);
assert.match(firstHistory.id, /^[0-9a-f]{64}$/u);
assert.equal(facade.queryHistory()[0].id, latestHistory.id);
assert.equal(facade.getSomeLastAccessSearchTerms(1)[0].term, "latest");
assert.throws(() => facade.deleteHistoryLocally(1), /v2 64 位/);
facade.deleteHistoryLocally(firstHistory.id);
assert.equal(
  facade.queryHistory().some((item) => item.id === firstHistory.id),
  false,
);

for (const name of ["bookmark-a", "bookmark-b", "bookmark-c"]) {
  assert.equal(facade.addBookmark(name, [{ term: name }], MutationOrigin.user), true);
}
const initialBookmarks = facade.queryBookmarks();
assert.deepEqual(
  initialBookmarks.map((item) => item.sort_order),
  [0, 1, 2],
);
assert.equal(
  initialBookmarks.every((item) => typeof item.id === "string"),
  true,
);
const reversedIds = initialBookmarks.map((item) => item.id).reverse();
facade.reorderBookmarks(reversedIds, MutationOrigin.user);
assert.deepEqual(
  facade.queryBookmarks().map((item) => item.id),
  reversedIds,
);
assert.throws(() => facade.deleteBookmark(1, MutationOrigin.user), /v2 64 位/);
facade.deleteBookmark(reversedIds[0], MutationOrigin.user);
assert.equal(
  facade.queryBookmarks().some((item) => item.id === reversedIds[0]),
  false,
);
assert.equal(
  database
    .prepare("SELECT deleted FROM sync_versions WHERE object_key = ?")
    .get(`diagnostic:search.bookmark.v1:${reversedIds[0]}`).deleted,
  1,
);

database.close();
console.log(
  "v2 business path checks passed: formal callers use repositories, v1/v2 contracts compile, stable search IDs cross the UI facade",
);
