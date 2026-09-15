// Runs the real client and sibling Worker's handlers/SQL against independent SQLite databases.
// D1's binding is adapted to node:sqlite; this does not emulate workerd or JSBox UI.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { setup } = require("./check-database.cjs");
const workerRoot = process.env.SYNC_WORKER_PATH || path.resolve(__dirname, "../../cloudflare-d1-sync");
const available = fs.existsSync(path.join(workerRoot, "src/index.ts"));
function worker() {
  const ts = require(path.join(workerRoot, "node_modules/typescript"));
  const db = new DatabaseSync(":memory:");
  for (const f of fs
    .readdirSync(path.join(workerRoot, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(fs.readFileSync(path.join(workerRoot, "migrations", f), "utf8"));
  const modules = new Map();
  const context = vm.createContext({
    console,
    Request,
    Response,
    URL,
    Headers,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    crypto: {
      randomUUID: () => crypto.randomUUID(),
      subtle: {
        digest: (...args) => crypto.webcrypto.subtle.digest(...args),
        timingSafeEqual: (a, b) => crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)),
      },
    },
  });
  function load(id) {
    if (modules.has(id)) return modules.get(id).exports;
    const m = { exports: {} };
    modules.set(id, m);
    const code = ts.transpileModule(fs.readFileSync(path.join(workerRoot, "src", id + ".ts"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: "worker/" + id })(
      (name) => load(path.posix.join(path.posix.dirname(id), name)),
      m,
      m.exports,
    );
    return m.exports;
  }
  function statement(sql, args = []) {
    const execute = () => {
      const p = db.prepare(sql),
        results = p.all(...args);
      return { success: true, results, meta: { changes: db.prepare("SELECT changes() AS n").get().n } };
    };
    return {
      bind: (...v) => statement(sql, v),
      execute,
      all: async () => execute(),
      run: async () => execute(),
      first: async (column) => {
        const row = execute().results[0] ?? null;
        return column && row ? row[column] : row;
      },
    };
  }
  const binding = {
    prepare: statement,
    batch: async (stmts) => {
      db.exec("BEGIN");
      try {
        const r = stmts.map((s) => s.execute());
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const handler = load("index").default;
  const requests = [];
  async function transport(connection, id, p, body, method) {
    requests.push({ id, path: p, body: body && JSON.parse(JSON.stringify(body)) });
    const req = new Request("https://sync.example/v1" + p, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: "Bearer " + connection.masterKey,
        "X-API-Version": "1",
        "X-Device-ID": id,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const response = await handler.fetch(req, { DB: binding, MASTER_KEY: "a".repeat(64) });
    const json = await response.json();
    if (!json.ok) {
      const error = new Error(json.error.message);
      error.code = json.error.code;
      error.details = json.error.details;
      throw error;
    }
    return json.data;
  }
  return { db, requests, transport, load };
}
function client(t, w, hook) {
  const env = setup();
  t.after(() => env.close());
  const { SyncEngine } = env.load("sync/engine");
  const { SyncError } = env.load("sync/transport");
  const transport = async (...args) => {
    try {
      return await (hook ? hook(w.transport, ...args) : w.transport(...args));
    } catch (e) {
      throw new SyncError(e.code ?? "NETWORK", e.details);
    }
  };
  const engine = new SyncEngine(transport);
  return {
    ...env,
    engine,
    db: env.load("utils/database").dbManager,
    config: env.load("utils/config").configManager,
    entities: env.load("sync/entities"),
    state: env.load("sync/state"),
  };
}
async function connect(c, name) {
  await c.engine.configure("https://sync.example/v1", "a".repeat(64), name);
}
function bookmark(c, id, title) {
  c.db.update("INSERT INTO search_bookmarks_v2(id,position_key) VALUES(?,?)", [id, title]);
}

test(
  "sync: two clients exchange bookmarks and device counter components without duplication",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w),
      b = client(t, w);
    bookmark(a, "bookmark-a", "A");
    await connect(a, "A");
    await a.engine.sync();
    assert.equal(a.engine.status.pending, 0);
    assert.equal(a.engine.status.conflicts.length, 0);
    await connect(b, "B");
    await b.engine.sync();
    assert.equal(
      b.db.query("SELECT position_key FROM search_bookmarks_v2 WHERE id=?", ["bookmark-a"])[0].position_key,
      "A",
    );
    for (const [c, n] of [
      [a, 4],
      [b, 7],
    ])
      c.db.update("INSERT INTO tag_access_count_v2(id,device_id,qualifier,namespace,term,count) VALUES(?,?,?,?,?,?)", [
        `${c.db.deviceId}::female:test`,
        c.db.deviceId,
        "",
        "female",
        "test",
        n,
      ]);
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();
    await a.engine.sync();
    assert.equal(a.db.query("SELECT SUM(count) AS n FROM tag_access_count_v2")[0].n, 11);
    assert.equal(b.db.query("SELECT SUM(count) AS n FROM tag_access_count_v2")[0].n, 11);
    assert.equal(w.db.prepare("SELECT SUM(count) AS n FROM tag_access_count_v2").get().n, 11);
    assert.equal(a.engine.status.pending, 0);
    const credentials = JSON.parse(fs.readFileSync(a.credentialsPath, "utf8"));
    assert.equal(credentials.sync.masterKey, "a".repeat(64));
    assert.equal(credentials.sync.apiUrl, "https://sync.example");
    assert.equal(fs.readFileSync(a.dbPath).includes(Buffer.from("a".repeat(64))), false);
  },
);

test(
  "sync: lost upload response retries the same durable batch and preserves edits made during upload",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    let drop = false,
      edit = false;
    const a = client(t, w, async (send, ...args) => {
      const result = await send(...args);
      if (args[2] === "/sync" && args[3]?.operations.length) {
        if (edit) {
          edit = false;
          a.db.update("UPDATE search_bookmarks_v2 SET position_key=? WHERE id=?", ["newer", "one"]);
        }
        if (drop) {
          drop = false;
          throw new Error("lost response");
        }
      }
      return result;
    });
    await connect(a, "A");
    await a.engine.sync();
    bookmark(a, "one", "old");
    drop = true;
    edit = true;
    await assert.rejects(a.engine.sync());
    assert.ok(a.state.meta("pending", null));
    const pending = JSON.parse(JSON.stringify(a.state.meta("pending", null)));
    // A new engine simulates process restart with its queue and batch restored from SQLite.
    const { SyncEngine } = a.load("sync/engine");
    const { SyncError } = a.load("sync/transport");
    const resumed = new SyncEngine(async (...args) => {
      try {
        return await w.transport(...args);
      } catch (e) {
        throw new SyncError(e.code ?? "NETWORK", e.details);
      }
    });
    await resumed.sync();
    assert.equal(
      w.db.prepare("SELECT position_key FROM search_bookmarks_v2 WHERE id=?").get("one").position_key,
      "newer",
    );
    const retries = w.requests.filter((r) => r.body?.batch_id === pending.batch_id);
    assert.equal(retries.length, 2);
    assert.deepEqual(retries[0].body.operations, retries[1].body.operations);
    assert.equal(resumed.status.pending, 0);
  },
);

for (const phase of ["/full-sync/start", "/full-sync/seal", "/full-sync/complete"])
  test("sync: restores full download after losing " + phase + " response", { skip: !available }, async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w);
    bookmark(a, "remote", "R");
    await connect(a, "A");
    await a.engine.sync();
    let drop = true;
    const b = client(t, w, async (send, ...args) => {
      const result = await send(...args);
      if (drop && args[2] === phase) {
        drop = false;
        throw new Error("lost response");
      }
      return result;
    });
    await connect(b, "B");
    await assert.rejects(b.engine.sync());
    await b.engine.sync();
    assert.equal(
      b.db.query("SELECT position_key FROM search_bookmarks_v2 WHERE id=?", ["remote"])[0].position_key,
      "R",
    );
    assert.equal(b.engine.status.initialized, true);
    assert.equal(b.engine.status.conflicts.length, 0);
  });

test(
  "sync: three-way merging preserves independent fields and exposes same-field and delete conflicts",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w),
      b = client(t, w);
    a.db.update("INSERT INTO archive_entries_v2(id,title,comment) VALUES('42','original','original')");
    await connect(a, "A");
    await a.engine.sync();
    await connect(b, "B");
    await b.engine.sync();
    a.db.update("UPDATE archive_entries_v2 SET title='A title' WHERE id='42'");
    b.db.update("UPDATE archive_entries_v2 SET comment='B comment' WHERE id='42'");
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();
    assert.equal(a.engine.status.conflicts.length, 0);
    assert.deepEqual(
      JSON.parse(JSON.stringify(a.db.query("SELECT title,comment FROM archive_entries_v2 WHERE id='42'")[0])),
      { title: "A title", comment: "B comment" },
    );
    a.db.update("UPDATE archive_entries_v2 SET title='A second' WHERE id='42'");
    b.db.update("UPDATE archive_entries_v2 SET title='B second' WHERE id='42'");
    await a.engine.sync();
    await b.engine.sync();
    assert.equal(b.engine.status.conflicts.length, 1);
    b.engine.resolve("archive_entries_v2", "42", false);
    await b.engine.sync();
    await a.engine.sync();
    assert.equal(a.db.query("SELECT title FROM archive_entries_v2 WHERE id='42'")[0].title, "B second");
    a.db.update("UPDATE archive_entries_v2 SET deleted=1 WHERE id='42'");
    b.db.update("UPDATE archive_entries_v2 SET title='keep alive' WHERE id='42'");
    await a.engine.sync();
    await b.engine.sync();
    assert.equal(b.engine.status.conflicts.length, 1);
    b.engine.resolve("archive_entries_v2", "42", true);
    assert.equal(b.db.query("SELECT deleted FROM archive_entries_v2 WHERE id='42'")[0].deleted, 1);
  },
);

test(
  "sync: parent/child records, tags, search terms, empty search IDs and deletions round-trip",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w),
      b = client(t, w);
    a.db.transactionUpdate([
      { sql: "INSERT INTO archive_entries_v2(id,title) VALUES('123','book')" },
      { sql: "INSERT INTO archive_taglist_v2(id,namespace,tag) VALUES('123','female','sample')" },
      {
        sql: "INSERT INTO archive_read_state_v2(id,last_access_time,first_access_time,last_read_page) VALUES('123','2026-09-10','2026-09-01',5)",
      },
      { sql: "INSERT INTO favorite_images_v2(id,gid,page_index,favorited_at) VALUES('123:3',123,3,'2026-09-01')" },
      { sql: "INSERT INTO search_history_v2(id,last_access_time) VALUES('','2026-09-01')" },
      { sql: "INSERT INTO search_bookmarks_v2(id,position_key) VALUES('female:test','0001')" },
      {
        sql: "INSERT INTO search_bookmarks_search_terms_v2(bookmark_id,term_index,namespace,term,dollar) VALUES('female:test',0,'female','test',1)",
      },
    ]);
    await connect(a, "A");
    await a.engine.sync();
    assert.equal(a.engine.status.conflicts.length, 0);
    await connect(b, "B");
    await b.engine.sync();
    assert.equal(b.engine.status.conflicts.length, 0);
    assert.equal(b.engine.status.pending, 0);
    assert.equal(b.db.query("SELECT COUNT(*) n FROM archive_taglist_v2")[0].n, 1);
    assert.equal(b.db.query("SELECT COUNT(*) n FROM search_history_v2 WHERE id='' ")[0].n, 1);
    a.db.transactionUpdate(a.load("utils/database-records").archiveDeletionStatements(123));
    await a.engine.sync();
    await b.engine.sync();
    assert.equal(a.engine.status.pending, 0);
    assert.equal(b.db.query("SELECT deleted FROM favorite_images_v2 WHERE id='123:3'")[0].deleted, 1);
    assert.equal(b.db.query("SELECT deleted FROM archive_entries_v2 WHERE id='123'")[0].deleted, 1);
  },
);

test(
  "sync: credentials stay local while WebDAV definitions synchronize disabled until configured",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w),
      b = client(t, w);
    a.config.cookie = "private-cookie-value";
    a.config.updateAllWebDAVServices([
      {
        id: "dav-one",
        name: "My DAV",
        host: "dav.example",
        https: true,
        path: "/data",
        username: "secret-user",
        password: "secret-password",
        enabled: true,
      },
    ]);
    await connect(a, "A");
    await a.engine.sync();
    await connect(b, "B");
    await b.engine.sync();
    const row = b.config.webDAVServices.find((d) => d.id === "dav-one");
    assert.ok(row);
    assert.equal(row.enabled, true);
    assert.equal(row.credentialsConfigured, false);
    b.config.webdavEnabled = true;
    assert.equal(b.config.currentWebDAVService, undefined);
    b.config.updateAllWebDAVServices(b.config.getCopiedWebDAVServices());
    assert.equal(b.config.currentWebDAVService, undefined);
    assert.equal(b.db.query("SELECT enabled FROM webdav_services_v2 WHERE id='dav-one'")[0].enabled, 1);
    const confirmed = b.config.getCopiedWebDAVServices();
    confirmed[0].credentialsConfigured = true;
    b.config.updateAllWebDAVServices(confirmed);
    assert.ok(b.config.currentWebDAVService);
    assert.equal(row.password, undefined);
    const requests = JSON.stringify(w.requests);
    for (const secret of ["private-cookie-value", "secret-user", "secret-password"])
      assert.equal(requests.includes(secret), false);
    assert.equal(a.config.cookie, "private-cookie-value");
    assert.equal(a.config.webDAVServices[0].password, "secret-password");
    a.engine.disconnect();
    assert.equal(a.config.syncCredentials, undefined);
    assert.equal(a.config.cookie, "private-cookie-value");
  },
);

test(
  "sync: race after pull rebases only rejected operations, retaining other batch entries",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w);
    let race = false;
    const b = client(t, w, async (send, ...args) => {
      if (race && args[2] === "/sync" && args[3]?.operations.length) {
        race = false;
        a.db.update("UPDATE archive_entries_v2 SET comment='A race' WHERE id='56'");
        await a.engine.sync();
      }
      return send(...args);
    });
    a.db.update("INSERT INTO archive_entries_v2(id,title,comment) VALUES('56','title','comment')");
    await connect(a, "A");
    await a.engine.sync();
    await connect(b, "B");
    await b.engine.sync();
    b.db.update("UPDATE archive_entries_v2 SET title='B title' WHERE id='56'");
    bookmark(b, "unrelated", "other");
    race = true;
    await b.engine.sync();
    assert.equal(b.engine.status.conflicts.length, 0);
    assert.equal(b.engine.status.pending, 0);
    assert.equal(w.db.prepare("SELECT title FROM archive_entries_v2 WHERE id='56'").get().title, "B title");
    assert.equal(
      w.db.prepare("SELECT position_key FROM search_bookmarks_v2 WHERE id='unrelated'").get().position_key,
      "other",
    );
  },
);

test("sync: no-op queue pages cannot starve later real changes", { skip: !available }, async (t) => {
  const w = worker();
  t.after(() => w.db.close());
  const a = client(t, w);
  await connect(a, "A");
  await a.engine.sync();
  for (let i = 0; i < 80; i++)
    a.db.update("INSERT INTO sync_dirty(table_name,entity_id) VALUES('archive_entries_v2',?)", [String(i)]);
  bookmark(a, "later", "uploaded");
  await a.engine.sync();
  assert.equal(a.engine.status.pending, 0);
  assert.ok(w.db.prepare("SELECT id FROM search_bookmarks_v2 WHERE id='later'").get());
});

test(
  "sync: attachments normalize ordering/defaults and trigger edits are transactional",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w);
    const e = {
      id: "12",
      sync_version: 1,
      deleted: 0,
      taglist_json: JSON.stringify([
        { namespace: "z", tags: ["b", "a"] },
        { namespace: "a", tags: [] },
      ]),
    };
    const normalized = a.entities.safeEntity("archive_entries_v2", e);
    assert.equal(normalized.taglist_json, '[{"namespace":"z","tags":["a","b"]}]');
    assert.throws(() =>
      a.entities.safeEntity("archive_entries_v2", { ...e, taglist_json: '[{"namespace":"a","tags":["x","x"]}]' }),
    );
    assert.throws(() =>
      a.db.transactionUpdate([
        { sql: "INSERT INTO search_bookmarks_v2(id,position_key) VALUES('rollback','R')" },
        { sql: "INSERT INTO missing_table VALUES(1)" },
      ]),
    );
    assert.equal(a.db.query("SELECT COUNT(*) n FROM sync_dirty WHERE entity_id='rollback'")[0].n, 0);
  },
);

test(
  "sync: cursor expiration rebases retained local edits against a fresh snapshot",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w),
      b = client(t, w);
    bookmark(a, "old", "old");
    await connect(a, "A");
    await a.engine.sync();
    await connect(b, "B");
    await b.engine.sync();
    bookmark(a, "new", "new");
    await a.engine.sync();
    const current = w.db.prepare("SELECT MAX(change_seq) n FROM changes").get().n;
    w.db.prepare("UPDATE profile SET min_valid_change_seq=?").run(current);
    b.db.update("UPDATE search_bookmarks_v2 SET position_key='local' WHERE id='old'");
    await b.engine.sync();
    assert.equal(b.engine.status.conflicts.length, 0);
    assert.equal(b.engine.status.pending, 0);
    assert.equal(b.db.query("SELECT position_key FROM search_bookmarks_v2 WHERE id='new'")[0].position_key, "new");
    assert.equal(
      w.db.prepare("SELECT position_key FROM search_bookmarks_v2 WHERE id='old'").get().position_key,
      "local",
    );
  },
);

test(
  "sync: automatic scheduling is opt-in; incompatible endpoints and keys never replace saved credentials",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w);
    a.engine.tick();
    assert.equal(w.requests.length, 0);
    await connect(a, "A");
    const original = JSON.stringify(a.config.syncCredentials);
    await assert.rejects(a.engine.configure("https://wrong.example", "b".repeat(64), "A"));
    assert.equal(JSON.stringify(a.config.syncCredentials), original);
    const { normalizeConnection } = a.load("sync/transport");
    for (const url of ["http://example", "https://u:p@example", "https://example/?key=x", "https://example/#key"])
      assert.throws(() => normalizeConnection(url, "a".repeat(64)));
    a.engine.setAutomatic(true);
    assert.equal(a.engine.status.automatic, true);
    a.engine.pause();
    assert.equal(a.engine.status.automatic, false);
  },
);

test("sync: global reader updates use version checks during a race", { skip: !available }, async (t) => {
  const w = worker();
  t.after(() => w.db.close());
  const a = client(t, w);
  let race = false;
  const b = client(t, w, async (send, ...args) => {
    if (race && args[2] === "/sync" && args[3]?.operations.some((o) => o.table === "global_reader_config_v2")) {
      race = false;
      a.db.update("UPDATE global_reader_config_v2 SET pageDirection='vertical' WHERE id='1'");
      await a.engine.sync();
    }
    return send(...args);
  });
  await connect(a, "A");
  await a.engine.sync();
  await connect(b, "B");
  await b.engine.sync();
  b.db.update("UPDATE global_reader_config_v2 SET pageDirection='right_to_left' WHERE id='1'");
  race = true;
  await b.engine.sync();
  assert.equal(b.engine.status.conflicts.length, 1);
  assert.equal(
    w.db.prepare("SELECT pageDirection FROM global_reader_config_v2 WHERE id='1'").get().pageDirection,
    "vertical",
  );
});

test(
  "sync: selecting a different AI service preserves uniqueness and uploads deselection first",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w),
      b = client(t, w);
    await connect(a, "A");
    await a.engine.sync();
    await connect(b, "B");
    await b.engine.sync();
    const ids = a.db.query("SELECT id FROM ai_translation_services_v2 ORDER BY id").map((r) => r.id);
    for (const id of ids) {
      a.db.transactionUpdate([
        { sql: "UPDATE ai_translation_services_v2 SET selected=0" },
        { sql: "UPDATE ai_translation_services_v2 SET selected=1 WHERE id=?", args: [id] },
      ]);
      await a.engine.sync();
      await b.engine.sync();
      assert.equal(b.engine.status.conflicts.length, 0);
      assert.equal(b.db.query("SELECT id FROM ai_translation_services_v2 WHERE selected=1")[0].id, id);
    }
  },
);

test(
  "sync: secure AI values and defaults cannot enter pending requests or shadows",
  { skip: !available },
  async (t) => {
    const w = worker();
    t.after(() => w.db.close());
    const a = client(t, w);
    a.config.addAITranslationService({
      name: "Private AI",
      selected: false,
      scriptText: 'async function translate(){return "";}',
      configForm: [{ key: "token", type: "string", title: "Token", secure: true, default: "default-secret" }],
      config: { token: "ai-secret-value" },
    });
    await connect(a, "A");
    await a.engine.sync();
    const requests = JSON.stringify(w.requests);
    assert.equal(requests.includes("default-secret"), false);
    assert.equal(requests.includes("ai-secret-value"), false);
    for (const table of ["sync_shadow", "sync_stage", "sync_meta"]) {
      const rows = JSON.stringify(a.db.query("SELECT * FROM " + table));
      assert.equal(rows.includes("ai-secret-value"), false);
      assert.equal(rows.includes("default-secret"), false);
    }
  },
);

test("sync: retaining an edited child revives its remotely deleted gallery", { skip: !available }, async (t) => {
  const w = worker();
  t.after(() => w.db.close());
  const a = client(t, w),
    b = client(t, w);
  a.db.transactionUpdate([
    { sql: "INSERT INTO archive_entries_v2(id,title) VALUES('777','gallery')" },
    {
      sql: "INSERT INTO archive_read_state_v2(id,last_access_time,first_access_time,last_read_page) VALUES('777','2026-09-01','2026-09-01',1)",
    },
  ]);
  await connect(a, "A");
  await a.engine.sync();
  await connect(b, "B");
  await b.engine.sync();
  a.db.transactionUpdate(a.load("utils/database-records").archiveDeletionStatements(777));
  b.db.update("UPDATE archive_read_state_v2 SET last_read_page=9,last_access_time='2026-09-10' WHERE id='777'");
  await a.engine.sync();
  await b.engine.sync();
  assert.ok(b.engine.status.conflicts.length);
  b.engine.resolve("archive_read_state_v2", "777", false);
  await b.engine.sync();
  assert.equal(b.engine.status.conflicts.length, 0);
  assert.equal(b.engine.status.pending, 0);
  assert.equal(w.db.prepare("SELECT deleted FROM archive_entries_v2 WHERE id='777'").get().deleted, 0);
  assert.equal(w.db.prepare("SELECT last_read_page FROM archive_read_state_v2 WHERE id='777'").get().last_read_page, 9);
});

test("sync: all fourteen entity tables match the Worker contract and round-trip", { skip: !available }, async (t) => {
  const w = worker();
  t.after(() => w.db.close());
  const a = client(t, w),
    b = client(t, w),
    domain = a.load("sync/domain");
  assert.deepEqual(
    JSON.parse(JSON.stringify(domain.fields)),
    JSON.parse(JSON.stringify(w.load("domain").DOMAIN_FIELDS)),
  );
  const ids = {
    archive_entries_v2: "81",
    archive_read_state_v2: "81",
    archive_favorite_state_v2: "81",
    archive_rate_state_v2: "81",
    gallery_reader_config_v2: "81",
    global_reader_config_v2: "1",
    search_history_v2: "query",
    search_bookmarks_v2: "bookmark",
    ai_translation_services_v2: "ai-fixture",
    webdav_services_v2: "dav-fixture",
    local_marked_tags_v2: "female:sample",
    marked_uploaders_v2: "Uploader",
    tag_access_count_v2: `${a.db.deviceId}::female:sample`,
    favorite_images_v2: "81:0",
  };
  for (const table of domain.tables) {
    const record = { id: ids[table], sync_version: 0, deleted: 0 };
    for (const [key, rule] of Object.entries(domain.fields[table]))
      record[key] =
        rule.default ??
        (rule.nullable
          ? null
          : rule.kind === "text"
            ? (rule.values?.[0] ?? "sample")
            : rule.kind === "integer"
              ? Math.max(0, rule.min)
              : 0);
    if (table === "tag_access_count_v2")
      Object.assign(record, { device_id: a.db.deviceId, qualifier: "", namespace: "female", term: "sample", count: 3 });
    if (table === "local_marked_tags_v2") Object.assign(record, { namespace: "female", name: "sample" });
    if (table === "favorite_images_v2") Object.assign(record, { gid: 81, page_index: 0, favorited_at: "2026-09-14" });
    a.db.transactionUpdate(a.entities.entityStatements(table, a.entities.safeEntity(table, record)));
  }
  await connect(a, "A");
  await a.engine.sync();
  assert.equal(a.engine.status.conflicts.length, 0, JSON.stringify(a.engine.status.conflicts));
  await connect(b, "B");
  await b.engine.sync();
  // The second device has its own default reader preferences, which may need explicit reconciliation.
  for (const c of b.engine.status.conflicts) b.engine.resolve(c.table_name, c.entity_id, true);
  await b.engine.sync();
  for (const table of domain.tables) {
    assert.ok(w.db.prepare("SELECT id FROM " + table + " WHERE id=?").get(ids[table]), table);
    assert.ok(b.entities.localEntity(table, ids[table]), table);
  }
  assert.equal(b.engine.status.pending, 0);
});
