const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
const { UploaderRepository } = require("../dist/repositories/uploader-repository");
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
  return new UploaderRepository({
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

for (const uploader of ["alice", "bob", "carol", "dave", "erin"]) {
  assert.equal(repository.addMarkedUploader(uploader, MutationOrigin.user), true);
}
assert.equal(repository.addMarkedUploader("alice", MutationOrigin.user), false, "重复标记必须幂等");
assert.deepEqual(repository.queryMarkedUploaders(), ["alice", "bob", "carol", "dave", "erin"]);
assert.throws(() => repository.addMarkedUploader("", MutationOrigin.user), /不能为空/);
assert.throws(() => repository.addMarkedUploader("invalid-origin", "invalid"), /变更来源/);

assert.equal(repository.deleteMarkedUploader("erin", MutationOrigin.user), true);
assert.equal(repository.deleteMarkedUploader("erin", MutationOrigin.user), false, "重复删除必须幂等");
assert.equal(repository.addMarkedUploader("erin", MutationOrigin.remote), true, "远端应用必须使用同一业务入口");

repository.replaceBannedUploaders(["legacy-ban"], MutationOrigin.upstreamMirror);
database.exec(`CREATE TRIGGER fail_uploader_repository_diagnostic
  BEFORE INSERT ON banned_uploaders
  WHEN NEW.uploader = 'force-rollback'
  BEGIN
    SELECT RAISE(ABORT, 'injected uploader repository failure');
  END`);
assert.throws(
  () => repository.replaceBannedUploaders(["new-ban", "force-rollback"], MutationOrigin.upstreamMirror),
  /刷新上游屏蔽上传者镜像中的更新失败/,
);
assert.deepEqual(repository.queryBannedUploaders(), ["legacy-ban"], "上游镜像替换失败必须保留旧屏蔽名单");
assert.deepEqual(
  repository.queryMarkedUploaders(),
  ["alice", "bob", "carol", "dave", "erin"],
  "上游镜像替换失败不得删除标记上传者",
);
database.exec("DROP TRIGGER fail_uploader_repository_diagnostic");
const cleared = repository.replaceBannedUploaders([], MutationOrigin.upstreamMirror);
assert.deepEqual(cleared.bannedUploaders, [], "空的上游名单必须清除旧本机镜像");
assert.deepEqual(cleared.markedUploaders, ["alice", "bob", "carol", "dave", "erin"]);

assert.throws(() => repository.replaceBannedUploaders(["wrong-origin"], MutationOrigin.user), /只能由上游镜像刷新/);
const replaced = repository.replaceBannedUploaders(
  ["alice", "remote-ban", "remote-ban"],
  MutationOrigin.upstreamMirror,
);
assert.deepEqual(replaced.bannedUploaders, ["alice", "remote-ban"], "上游镜像应保持顺序并去重");
assert.deepEqual(replaced.removedMarkedUploaders, ["alice"]);
assert.deepEqual(replaced.markedUploaders, ["bob", "carol", "dave", "erin"]);
assert.equal(
  repository.addMarkedUploader("alice", MutationOrigin.remote),
  false,
  "本机上游屏蔽名单必须阻止重建冲突的标记行",
);

assert.equal(repository.deleteMarkedUploader("bob", MutationOrigin.user), true);
assert.equal(repository.addMarkedUploader("bob", MutationOrigin.remote), true);
assert.deepEqual(repository.queryMarkedUploaders(), ["carol", "dave", "erin", "bob"]);
assert.deepEqual(repository.queryBannedUploaders(), ["alice", "remote-ban"]);

database.close();
console.log("uploader repository checks passed");
