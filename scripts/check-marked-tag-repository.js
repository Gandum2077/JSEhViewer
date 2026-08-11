const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { MarkedTagMode, MarkedTagRepository } = require("../dist/repositories/marked-tag-repository");
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
  return new MarkedTagRepository({
    query(sql, args = []) {
      return database.prepare(sql).all(...args.map(normalize));
    },
    transaction(callback, operation) {
      return withSqliteTransaction(adapter, callback, operation);
    },
  });
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

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of CURRENT_SCHEMA_STATEMENTS) database.exec(statement.sql);
const repository = createRepository(database);

repository.upsertLocalTag(tag(0, "artist", "alice"), MarkedTagMode.localSync, MutationOrigin.user);
repository.upsertLocalTag(
  tag(0, "language", "chinese", { watched: true, weight: 5 }),
  MarkedTagMode.localSync,
  MutationOrigin.remote,
);
repository.upsertLocalTag(
  tag(0, "female", "glasses", { hidden: true }),
  MarkedTagMode.localSync,
  MutationOrigin.migrationSeed,
);
repository.upsertLocalTag(
  tag(0, "artist", "alice", { watched: true, color: "#123456", weight: 7 }),
  MarkedTagMode.localSync,
  MutationOrigin.user,
);
assert.equal(repository.queryMarkedTags().length, 3);
assert.equal(repository.queryMarkedTags()[0].weight, 7, "本地 UPSERT 必须原子更新同一标签");
assert.throws(
  () =>
    repository.replaceUpstreamMirror(
      [tag(1, "artist", "wrong-mode")],
      MarkedTagMode.localSync,
      MutationOrigin.upstreamMirror,
    ),
  /只能由上游镜像来源写入/,
);
assert.throws(
  () => repository.upsertLocalTag(tag(0, "artist", "wrong-mode"), MarkedTagMode.upstreamMirror, MutationOrigin.user),
  /镜像模式不接受/,
);
assert.throws(
  () => repository.upsertLocalTag(tag(-1, "artist", "invalid"), MarkedTagMode.localSync, MutationOrigin.user),
  /标签 ID/,
);
assert.equal(repository.deleteLocalTag("language", "chinese", MarkedTagMode.localSync, MutationOrigin.remote), true);
assert.equal(
  repository.deleteLocalTag("language", "chinese", MarkedTagMode.localSync, MutationOrigin.remote),
  false,
  "重复远端删除必须幂等",
);
repository.upsertLocalTag(tag(0, "language", "chinese"), MarkedTagMode.localSync, MutationOrigin.remote);
assert.throws(() => repository.clearForRelogin(MutationOrigin.user), /本机维护操作/);
assert.equal(repository.clearForRelogin(MutationOrigin.localMaintenance), 3);
assert.deepEqual(repository.queryMarkedTags(), [], "重新登录必须清空旧模式整表");

const upstreamTags = [
  tag(101, "artist", "upstream-a", { watched: true }),
  tag(102, "male", "upstream-b", { hidden: true }),
  tag(103, "group", "upstream-c", { weight: -4 }),
];
repository.replaceUpstreamMirror(upstreamTags, MarkedTagMode.upstreamMirror, MutationOrigin.upstreamMirror);
repository.updateUpstreamTag(
  tag(102, "male", "upstream-b", { hidden: false, watched: true, weight: 9 }),
  MarkedTagMode.upstreamMirror,
  MutationOrigin.upstreamMirror,
);
assert.equal(repository.queryMarkedTags().find((item) => item.name === "upstream-b").weight, 9);
assert.throws(
  () =>
    repository.updateUpstreamTag(
      tag(104, "artist", "wrong-origin"),
      MarkedTagMode.upstreamMirror,
      MutationOrigin.remote,
    ),
  /只能由上游镜像来源写入/,
);

database.exec(`CREATE TRIGGER fail_marked_tag_repository_diagnostic
  BEFORE INSERT ON marked_tags
  WHEN NEW.name = 'force-rollback'
  BEGIN
    SELECT RAISE(ABORT, 'injected marked tag repository failure');
  END`);
assert.throws(
  () =>
    repository.replaceUpstreamMirror(
      [tag(201, "artist", "replacement"), tag(202, "artist", "force-rollback")],
      MarkedTagMode.upstreamMirror,
      MutationOrigin.upstreamMirror,
    ),
  /刷新 E-Hentai 标签镜像中的更新失败/,
);
assert.deepEqual(
  repository.queryMarkedTags().map((item) => item.name),
  ["upstream-a", "upstream-b", "upstream-c"],
  "上游镜像替换失败必须完整恢复旧表",
);
database.exec("DROP TRIGGER fail_marked_tag_repository_diagnostic");

assert.equal(repository.clearForRelogin(MutationOrigin.localMaintenance), 3);
for (const item of [
  tag(0, "artist", "cloud-a"),
  tag(0, "female", "cloud-b"),
  tag(0, "language", "cloud-c"),
  tag(0, "parody", "cloud-d"),
]) {
  repository.upsertLocalTag(item, MarkedTagMode.localSync, MutationOrigin.remote);
}
assert.deepEqual(
  repository.queryMarkedTags().map((item) => item.name),
  ["cloud-a", "cloud-b", "cloud-c", "cloud-d"],
  "切回本地模式后必须能由 D1 远端数据重建",
);

database.close();
console.log("marked tag repository checks passed");
