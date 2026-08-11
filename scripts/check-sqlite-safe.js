const assert = require("node:assert/strict");
const {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteOperationError,
  withSqliteQueueOperation,
  withSqliteTransaction,
} = require("../dist/utils/sqlite-safe");

class MockResultSet {
  constructor(rows) {
    this.rows = rows;
    this.index = -1;
    this.closed = false;
  }

  next() {
    this.index += 1;
    return this.index < this.rows.length;
  }

  get values() {
    return this.rows[this.index];
  }

  close() {
    this.closed = true;
  }
}

class MockDatabase {
  constructor() {
    this.persisted = [];
    this.pending = null;
    this.beginCount = 0;
    this.commitCount = 0;
    this.rollbackCount = 0;
  }

  beginTransaction() {
    assert.equal(this.pending, null, "不允许嵌套 mock 事务");
    this.beginCount += 1;
    this.pending = [...this.persisted];
  }

  update(input) {
    const sql = typeof input === "string" ? input : input.sql;
    const args = typeof input === "string" ? [] : input.args;
    if (sql === "FAIL") return { result: false, error: "UNIQUE constraint failed: mock.value" };
    if (sql === "INSERT") {
      assert.notEqual(this.pending, null, "写入必须位于显式事务中");
      this.pending.push(args[0]);
    }
    return { result: true, error: "" };
  }

  query(input, callback) {
    const sql = typeof input === "string" ? input : input.sql;
    if (sql === "FAIL_QUERY") {
      callback(null, "mock query error");
      return;
    }
    callback(new MockResultSet(this.persisted.map((value) => ({ value }))), "");
  }

  commit() {
    assert.notEqual(this.pending, null, "没有可提交的 mock 事务");
    this.commitCount += 1;
    this.persisted = this.pending;
    this.pending = null;
  }

  rollback() {
    this.rollbackCount += 1;
    this.pending = null;
  }
}

function run() {
  const db = new MockDatabase();
  const queue = {
    operations(callback) {
      callback(db);
    },
  };

  const returned = withSqliteQueueOperation(queue, (queuedDb) =>
    withSqliteTransaction(queuedDb, (transaction) => {
      transaction.update("INSERT", ["alpha"]);
      transaction.update("INSERT", ["beta"]);
      return "committed";
    }),
  );
  assert.equal(returned, "committed");
  assert.deepEqual(db.persisted, ["alpha", "beta"]);
  assert.equal(db.commitCount, 1);

  const secretValue = "must-not-appear-in-errors";
  assert.throws(
    () =>
      withSqliteTransaction(db, (transaction) => {
        transaction.update("INSERT", ["not-persisted"]);
        transaction.update("FAIL", [secretValue], "测试约束失败");
      }),
    (error) => {
      assert.ok(error instanceof SqliteOperationError);
      assert.match(error.message, /UNIQUE constraint failed/);
      assert.equal(error.message.includes(secretValue), false, "数据库错误不得泄漏 SQL 参数");
      return true;
    },
  );
  assert.deepEqual(db.persisted, ["alpha", "beta"]);
  assert.equal(db.rollbackCount, 1);

  const rows = querySqliteRows(db, "SELECT");
  assert.deepEqual(rows, [{ value: "alpha" }, { value: "beta" }]);
  assert.throws(() => querySqliteRows(db, "FAIL_QUERY"), /mock query error/);

  assert.throws(
    () => checkedSqliteUpdate(db, "FAIL", [secretValue], "事务外更新检查"),
    (error) => error instanceof SqliteOperationError && !error.message.includes(secretValue),
  );

  const deferredQueue = {
    operations() {
      // 故意不执行 callback，模拟运行时语义发生变化。
    },
  };
  assert.throws(() => withSqliteQueueOperation(deferredQueue, () => undefined), /队列回调未同步完成/);

  assert.throws(
    () => withSqliteTransaction(db, () => Promise.resolve()),
    /事务 callback 必须同步完成/,
  );
  assert.equal(db.rollbackCount, 2);

  console.log("SQLite 安全包装层测试通过：队列、提交、错误返回、回滚、查询错误和参数脱敏均符合预期。");
}

run();
