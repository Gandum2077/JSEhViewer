const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { CURRENT_SCHEMA_STATEMENTS, initializeDatabase } = require("../dist/utils/database-initialization");
const {
  DatabaseV2MigrationError,
  initialBookmarkPositionKey,
  migrateVersion1ToVersion2Draft,
  stableSearchEntityId,
} = require("../dist/utils/database-migration-v2-draft");
const { withSqliteTransaction } = require("../dist/utils/sqlite-safe");

const MIGRATION_TIME = "2026-08-11T12:34:56.000Z";

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
    const args = typeof input === "string" ? undefined : input.args.map((value) => value ?? null);
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
    const args = typeof input === "string" ? [] : input.args.map((value) => value ?? null);
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

function createQueue(database) {
  const adapter = new NodeSqliteAdapter(database);
  return {
    operations(callback) {
      callback(adapter);
    },
    close() {},
  };
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function migrationDependencies(overrides = {}) {
  return {
    nowIso: () => MIGRATION_TIME,
    sha256Hex,
    ...overrides,
  };
}

function applyV1Schema(database) {
  database.exec("PRAGMA foreign_keys = ON");
  for (const statement of CURRENT_SCHEMA_STATEMENTS) database.exec(statement.sql);
  database.exec("PRAGMA user_version = 1");
}

function tableNames(database) {
  return database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
}

function schemaFingerprint(database) {
  return database
    .prepare(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all()
    .map((row) => `${row.type}|${row.name}|${row.tbl_name}|${String(row.sql).replace(/\s+/g, " ").trim()}`);
}

function snapshotRows(database, tableName) {
  return database
    .prepare(`SELECT * FROM ${tableName} ORDER BY rowid`)
    .all()
    .map((row) => ({ ...row }));
}

function insertArchive(database, gid, overrides = {}) {
  const row = {
    gid,
    readlater: 0,
    downloaded: 0,
    first_access_time: "2026-01-01T00:00:00.000Z",
    last_access_time: "2026-01-02T00:00:00.000Z",
    token: `token-${gid}`,
    title: `archive-${gid}`,
    english_title: `english-${gid}`,
    japanese_title: `japanese-${gid}`,
    thumbnail_url: `https://example.test/${gid}.jpg`,
    category: "manga",
    posted_time: "2025-12-01T00:00:00.000Z",
    visible: 1,
    rating: 4.5,
    is_my_rating: 0,
    length: 42,
    torrent_available: 0,
    favorited: 0,
    favcat: null,
    uploader: `uploader-${gid}`,
    disowned: 0,
    taglist: "[]",
    comment: "",
    last_read_page: 0,
    ...overrides,
  };
  const columns = Object.keys(row);
  database
    .prepare(`INSERT INTO archives (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .run(...columns.map((column) => row[column]));
}

function populateRichV1Fixture(database) {
  insertArchive(database, 1, {
    readlater: 3,
    downloaded: -1,
    first_access_time: null,
    last_access_time: "2026-07-01T00:00:00.000Z",
    visible: null,
    is_my_rating: 1,
    torrent_available: null,
    favorited: 1,
    favcat: 4,
    disowned: 2,
    taglist: JSON.stringify([{ namespace: "artist", tags: ["alice", "bob"] }]),
    comment: "uploader comment",
    last_read_page: 17,
  });
  insertArchive(database, 2, {
    first_access_time: null,
    last_access_time: null,
    taglist: "",
    last_read_page: null,
  });
  for (let gid = 3; gid <= 252; gid += 1) insertArchive(database, gid, { last_read_page: gid % 20 });

  database.prepare("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)").run(1, "artist", "alice");
  database.prepare("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)").run(9999, "artist", "orphan");

  const historyInsert = database.prepare("INSERT INTO search_history (last_access_time, sorted_fsearch) VALUES (?, ?)");
  const historyTermInsert = database.prepare(
    `INSERT INTO search_history_search_terms
     (search_history_id, namespace, qualifier, term, dollar, subtract, tilde)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const firstHistoryId = Number(historyInsert.run(null, "artist:alice").lastInsertRowid);
  historyTermInsert.run(firstHistoryId, "artist", null, "alice", 1, 0, 0);
  historyTermInsert.run(firstHistoryId, "language", null, "chinese", 0, 1, 0);
  for (let index = 0; index < 200; index += 1) {
    const id = Number(
      historyInsert.run(`2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`, `tag-${index}`)
        .lastInsertRowid,
    );
    historyTermInsert.run(id, null, null, `tag-${index}`, 0, 0, index % 2);
  }
  historyTermInsert.run(99999, null, null, "orphan-history", 0, 0, 0);

  const bookmarkInsert = database.prepare("INSERT INTO search_bookmarks (sort_order, sorted_fsearch) VALUES (?, ?)");
  const bookmarkTermInsert = database.prepare(
    `INSERT INTO search_bookmarks_search_terms
     (search_bookmarks_id, namespace, qualifier, term, dollar, subtract, tilde)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const bookmarkA = Number(bookmarkInsert.run(20, "language:chinese").lastInsertRowid);
  const bookmarkB = Number(bookmarkInsert.run(-5, "artist:bob").lastInsertRowid);
  const bookmarkC = Number(bookmarkInsert.run(null, "female:glasses").lastInsertRowid);
  bookmarkTermInsert.run(bookmarkA, "language", null, "chinese", 0, 0, 0);
  bookmarkTermInsert.run(bookmarkB, "artist", null, "bob", 0, 0, 0);
  bookmarkTermInsert.run(bookmarkC, "female", null, "glasses", 0, 0, 0);
  bookmarkTermInsert.run(99999, null, null, "orphan-bookmark", 0, 0, 0);

  database.prepare("INSERT INTO marked_uploaders (uploader) VALUES (?)").run("alice");
  database.prepare("INSERT INTO marked_uploaders (uploader) VALUES (NULL)").run();
  database.prepare("INSERT INTO marked_uploaders (uploader) VALUES ('')").run();
  database.prepare("INSERT INTO banned_uploaders (uploader) VALUES (?)").run("mallory");
  database.prepare("INSERT INTO banned_uploaders (uploader) VALUES (NULL)").run();

  database.prepare("INSERT INTO config (key, value) VALUES (?, ?)").run("syncMyTags", "false");
  database
    .prepare(
      `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(7, "artist", "local-tag", 1, 0, "#123456", 10);
  database
    .prepare(
      `INSERT INTO ai_translation_services (name, selected, script_text, config_form, config)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run("private-ai", 1, "secret script", "{}", JSON.stringify({ apiKey: "must-stay-local" }));
  database
    .prepare(
      `INSERT INTO webdav_services (name, host, port, https, path, username, password, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("private-webdav", "dav.example.test", 443, 1, "/backup", "user", "password", 1);
  database
    .prepare(
      `INSERT INTO gallery_reader_config
       (gid, pageDirection, spreadModeEnabled, skipFirstPageInSpread, skipLandscapePagesInSpread, pagingGesture)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(1, "right_to_left", 1, 0, 1, "tap_and_swipe");
  database
    .prepare("INSERT INTO favorite_images (gid, page_index, favorited_at) VALUES (?, ?, ?)")
    .run(1, 3, "2026-07-01T00:00:00.000Z");
}

function migrate(database, dependencies = migrationDependencies()) {
  return withSqliteTransaction(
    new NodeSqliteAdapter(database),
    (transaction) => migrateVersion1ToVersion2Draft(transaction, dependencies),
    "测试 DB v2 草案迁移",
  );
}

function checkRichVersion1Migration() {
  const database = new DatabaseSync(":memory:");
  try {
    applyV1Schema(database);
    populateRichV1Fixture(database);
    const preserved = {
      config: snapshotRows(database, "config"),
      markedTags: snapshotRows(database, "marked_tags"),
      ai: snapshotRows(database, "ai_translation_services"),
      webdav: snapshotRows(database, "webdav_services"),
      reader: snapshotRows(database, "gallery_reader_config"),
      favoriteImages: snapshotRows(database, "favorite_images"),
    };

    const result = migrate(database);
    assert.deepEqual(result, {
      previousVersion: 1,
      currentVersion: 2,
      archiveCount: 252,
      archiveTagCount: 1,
      historyCount: 201,
      historyTermCount: 202,
      bookmarkCount: 3,
      bookmarkTermCount: 3,
      markedUploaderCount: 1,
      bannedUploaderCount: 1,
      droppedArchiveTagOrphans: 1,
      droppedHistoryTermOrphans: 1,
      droppedBookmarkTermOrphans: 1,
      droppedInvalidMarkedUploaders: 2,
      droppedInvalidBannedUploaders: 1,
    });
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 2);
    assert.equal(
      tableNames(database).some((name) => name.endsWith("_v2_migration")),
      false,
    );
    assert.equal(tableNames(database).includes("archives"), false);

    assert.deepEqual(
      { ...database.prepare("SELECT * FROM archive_entries WHERE gid = 1").get() },
      {
        gid: 1,
        token: "token-1",
        title: "archive-1",
        english_title: "english-1",
        japanese_title: "japanese-1",
        thumbnail_url: "https://example.test/1.jpg",
        category: "manga",
        posted_time: "2025-12-01T00:00:00.000Z",
        visible: 0,
        rating: 4.5,
        is_my_rating: 1,
        length: 42,
        torrent_available: 0,
        favorited: 1,
        favcat: 4,
        uploader: "uploader-1",
        disowned: 1,
        taglist_json: JSON.stringify([{ namespace: "artist", tags: ["alice", "bob"] }]),
        comment: "uploader comment",
        refreshed_at: MIGRATION_TIME,
      },
    );
    assert.deepEqual(
      { ...database.prepare("SELECT * FROM reading_state WHERE gid = 1").get() },
      {
        gid: 1,
        token: "token-1",
        first_access_time: "2026-07-01T00:00:00.000Z",
        last_access_time: "2026-07-01T00:00:00.000Z",
        readlater: 1,
        last_read_page: 17,
      },
    );
    assert.deepEqual(
      { ...database.prepare("SELECT downloaded, downloaded_at FROM local_gallery_state WHERE gid = 1").get() },
      { downloaded: 1, downloaded_at: MIGRATION_TIME },
    );
    assert.deepEqual(
      {
        ...database
          .prepare("SELECT first_access_time, last_access_time, last_read_page FROM reading_state WHERE gid = 2")
          .get(),
      },
      { first_access_time: MIGRATION_TIME, last_access_time: MIGRATION_TIME, last_read_page: 0 },
    );

    const historyId = stableSearchEntityId("artist:alice", sha256Hex);
    assert.equal(
      database.prepare("SELECT last_access_time FROM search_history WHERE history_id = ?").get(historyId)
        .last_access_time,
      MIGRATION_TIME,
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT term_index, namespace, term, dollar, subtract, tilde
           FROM search_history_search_terms WHERE history_id = ? ORDER BY term_index`,
        )
        .all(historyId)
        .map((row) => ({ ...row })),
      [
        { term_index: 0, namespace: "artist", term: "alice", dollar: 1, subtract: 0, tilde: 0 },
        { term_index: 1, namespace: "language", term: "chinese", dollar: 0, subtract: 1, tilde: 0 },
      ],
    );

    const bookmarks = database
      .prepare("SELECT sorted_fsearch, position_key FROM search_bookmarks ORDER BY position_key")
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(bookmarks, [
      { sorted_fsearch: "artist:bob", position_key: initialBookmarkPositionKey(0) },
      { sorted_fsearch: "language:chinese", position_key: initialBookmarkPositionKey(1) },
      { sorted_fsearch: "female:glasses", position_key: initialBookmarkPositionKey(2) },
    ]);

    assert.deepEqual(snapshotRows(database, "config"), preserved.config);
    assert.deepEqual(snapshotRows(database, "marked_tags"), preserved.markedTags);
    assert.deepEqual(snapshotRows(database, "ai_translation_services"), preserved.ai);
    assert.deepEqual(snapshotRows(database, "webdav_services"), preserved.webdav);
    assert.deepEqual(snapshotRows(database, "gallery_reader_config"), preserved.reader);
    assert.deepEqual(snapshotRows(database, "favorite_images"), preserved.favoriteImages);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 0);
    assert.deepEqual(
      { ...database.prepare("SELECT * FROM sync_clock").get() },
      { id: 1, wall_ms: 0, logical_counter: 0 },
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(
      () => migrate(database),
      (error) => error instanceof DatabaseV2MigrationError && /user_version=1/.test(error.message),
    );
  } finally {
    database.close();
  }
}

function checkMigrationRollback() {
  const database = new DatabaseSync(":memory:");
  try {
    applyV1Schema(database);
    insertArchive(database, 1);
    database
      .prepare("INSERT INTO search_history (last_access_time, sorted_fsearch) VALUES (?, ?)")
      .run("2026-01-01T00:00:00.000Z", "will-fail-hash");
    const beforeSchema = schemaFingerprint(database);
    const beforeArchives = snapshotRows(database, "archives");

    assert.throws(
      () => migrate(database, migrationDependencies({ sha256Hex: () => "invalid" })),
      /SHA-256 依赖没有返回/,
    );
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 1);
    assert.deepEqual(schemaFingerprint(database), beforeSchema);
    assert.deepEqual(snapshotRows(database, "archives"), beforeArchives);
    assert.equal(
      tableNames(database).some((name) => name.endsWith("_v2_migration")),
      false,
    );
  } finally {
    database.close();
  }
}

function checkCorruptRowsStopBeforeMutation() {
  for (const fixture of [
    {
      name: "negative page",
      mutate: (database) => insertArchive(database, 1, { last_read_page: -1 }),
      pattern: /负数阅读页码/,
    },
    {
      name: "invalid taglist",
      mutate: (database) => insertArchive(database, 1, { taglist: "not-json" }),
      pattern: /taglist 不是有效数组 JSON/,
    },
  ]) {
    const database = new DatabaseSync(":memory:");
    try {
      applyV1Schema(database);
      fixture.mutate(database);
      const before = schemaFingerprint(database);
      assert.throws(() => migrate(database), fixture.pattern, fixture.name);
      assert.equal(database.prepare("PRAGMA user_version").get().user_version, 1);
      assert.deepEqual(schemaFingerprint(database), before);
    } finally {
      database.close();
    }
  }
}

function checkVersion0UpgradeThenV2Migration() {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(CURRENT_SCHEMA_STATEMENTS.find((statement) => statement.name === "archives").sql);
    database.exec(CURRENT_SCHEMA_STATEMENTS.find((statement) => statement.name === "config").sql);
    insertArchive(database, 88, { title: "from-v0", last_read_page: 9 });
    initializeDatabase(createQueue(database));
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 1);
    migrate(database);
    assert.equal(database.prepare("SELECT title FROM archive_entries WHERE gid = 88").get().title, "from-v0");
    assert.equal(database.prepare("SELECT last_read_page FROM reading_state WHERE gid = 88").get().last_read_page, 9);
  } finally {
    database.close();
  }
}

function checkPureHelpers() {
  assert.equal(
    stableSearchEntityId("artist:alice", (value) => sha256Hex(value).toUpperCase()),
    sha256Hex("artist:alice"),
  );
  assert.ok(initialBookmarkPositionKey(0) < initialBookmarkPositionKey(1));
  assert.throws(() => initialBookmarkPositionKey(-1), /位置序号无效/);
}

function run() {
  checkPureHelpers();
  checkRichVersion1Migration();
  checkMigrationRollback();
  checkCorruptRowsStopBeforeMutation();
  checkVersion0UpgradeThenV2Migration();
  console.log(
    "DB v2 迁移 fixture 通过：v0/v1 数据复制、稳定 ID、顺序、不可同步表保留、边缘清理、损坏拒绝及中途故障回滚均符合预期。",
  );
}

run();
