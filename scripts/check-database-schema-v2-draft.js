const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { CURRENT_SCHEMA_STATEMENTS } = require("../dist/utils/database-initialization");
const {
  DATABASE_V2_DRAFT_SCHEMA_STATEMENTS,
  DATABASE_V2_DRAFT_USER_VERSION,
  DATABASE_V2_UNCHANGED_SCHEMA_OBJECTS,
} = require("../dist/utils/database-schema-v2-draft");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function statementByName(statements, name) {
  const statement = statements.find((candidate) => candidate.name === name);
  assert.ok(statement, `找不到 schema 对象：${name}`);
  return statement;
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

function columnNames(database, tableName) {
  return database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row.name);
}

function applyDraftSchema(database) {
  database.exec("PRAGMA foreign_keys = ON");
  for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
    database.exec(statement.sql);
  }
  database.exec(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`);
}

function checkUnchangedSchemaObjects() {
  for (const name of DATABASE_V2_UNCHANGED_SCHEMA_OBJECTS) {
    const current = statementByName(CURRENT_SCHEMA_STATEMENTS, name);
    const draft = statementByName(DATABASE_V2_DRAFT_SCHEMA_STATEMENTS, name);
    assert.equal(draft.type, current.type, `${name} 的对象类型不应在 v2 改变`);
    assert.equal(normalizeSql(draft.sql), normalizeSql(current.sql), `${name} 不应在 v2 改表`);
  }
}

function checkExpectedTables(database) {
  assert.deepEqual(tableNames(database), [
    "ai_translation_services",
    "archive_entries",
    "archive_taglist",
    "banned_uploaders",
    "config",
    "download_records",
    "favcat_titles",
    "favorite_images",
    "gallery_reader_config",
    "local_gallery_state",
    "marked_tags",
    "marked_uploaders",
    "reading_state",
    "search_bookmarks",
    "search_bookmarks_search_terms",
    "search_history",
    "search_history_search_terms",
    "sync_clock",
    "sync_outbox",
    "sync_profile",
    "sync_versions",
    "tag_access_count",
    "translation_data",
    "webdav_services",
  ]);
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, DATABASE_V2_DRAFT_USER_VERSION);
  assert.equal(tableNames(database).includes("archives"), false, "v2 不应继续创建混合职责的 archives 表");
}

function checkArchiveSplit(database) {
  database
    .prepare(
      `INSERT INTO reading_state
       (gid, token, first_access_time, last_access_time, readlater, last_read_page)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(100, "token-only", "2026-08-11T00:00:00.000Z", "2026-08-11T00:00:00.000Z", 1, 17);
  assert.equal(database.prepare("SELECT last_read_page FROM reading_state WHERE gid = 100").get().last_read_page, 17);

  database
    .prepare("INSERT INTO archive_entries (gid, title, refreshed_at) VALUES (?, ?, ?)")
    .run(200, "list snapshot", "2026-08-11T00:00:00.000Z");
  database.prepare("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)").run(200, "artist", "example");
  database.prepare("INSERT INTO local_gallery_state (gid, downloaded) VALUES (?, ?)").run(200, 1);
  database.prepare("DELETE FROM archive_entries WHERE gid = ?").run(200);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM archive_taglist WHERE gid = 200").get().count, 0);
  assert.equal(
    database.prepare("SELECT downloaded FROM local_gallery_state WHERE gid = 200").get().downloaded,
    1,
    "删除列表快照不得删除仅本机下载状态",
  );
  assert.throws(
    () =>
      database
        .prepare("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)")
        .run(999, "artist", "orphan"),
    /constraint/i,
  );
}

function checkStableSearchEntities(database) {
  database
    .prepare("INSERT INTO search_history (history_id, last_access_time, sorted_fsearch) VALUES (?, ?, ?)")
    .run("history-hash", "2026-08-11T00:00:00.000Z", "artist:test");
  database
    .prepare(
      `INSERT INTO search_history_search_terms
       (history_id, term_index, namespace, term, dollar, subtract, tilde)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("history-hash", 0, "artist", "test", 0, 0, 0);
  database.prepare("DELETE FROM search_history WHERE history_id = ?").run("history-hash");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM search_history_search_terms").get().count, 0);

  database
    .prepare("INSERT INTO search_bookmarks (bookmark_id, position_key, sorted_fsearch) VALUES (?, ?, ?)")
    .run("bookmark-hash", "V", "language:chinese");
  database
    .prepare(
      `INSERT INTO search_bookmarks_search_terms
       (bookmark_id, term_index, namespace, term, dollar, subtract, tilde)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("bookmark-hash", 0, "language", "chinese", 0, 0, 0);
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO search_bookmarks_search_terms
           (bookmark_id, term_index, term) VALUES (?, ?, ?)`,
        )
        .run("bookmark-hash", 0, "duplicate index"),
    /constraint/i,
  );
  database.prepare("DELETE FROM search_bookmarks WHERE bookmark_id = ?").run("bookmark-hash");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM search_bookmarks_search_terms").get().count, 0);
}

function checkUploaderIdentity(database) {
  database.prepare("INSERT INTO marked_uploaders (uploader) VALUES (?)").run("alice");
  assert.throws(
    () => database.prepare("INSERT INTO marked_uploaders (uploader) VALUES (?)").run("alice"),
    /constraint/i,
  );
  assert.throws(() => database.prepare("INSERT INTO marked_uploaders (uploader) VALUES (NULL)").run(), /constraint/i);
}

function checkTombstoneBoundary(database) {
  const businessTables = [
    "archive_entries",
    "reading_state",
    "local_gallery_state",
    "search_history",
    "search_bookmarks",
    "marked_tags",
    "marked_uploaders",
  ];
  for (const tableName of businessTables) {
    assert.equal(columnNames(database, tableName).includes("deleted"), false, `${tableName} 不应保存 tombstone`);
  }
  assert.ok(columnNames(database, "sync_versions").includes("deleted"));
  assert.ok(columnNames(database, "sync_outbox").includes("deleted"));

  database
    .prepare(
      `INSERT INTO sync_versions
       (object_key, entity_type, wall_ms, logical_counter, device_id, deleted, last_op_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("object-1", "reading.progress.v1", 1, 0, "device-a", 0, "op-1");
  database
    .prepare(
      `INSERT INTO sync_outbox
       (op_id, object_key, wall_ms, logical_counter, device_id, deleted, envelope_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("op-1", "object-1", 1, 0, "device-a", 0, "{}", "2026-08-11T00:00:00.000Z");
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO sync_outbox
           (op_id, object_key, wall_ms, logical_counter, device_id, deleted, envelope_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("op-2", "object-1", 2, 0, "device-a", 0, "{}", "2026-08-11T00:00:01.000Z"),
    /constraint/i,
  );
  database.prepare("DELETE FROM sync_versions WHERE object_key = ?").run("object-1");
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get("object-1").count,
    0,
  );

  database
    .prepare(
      `INSERT INTO sync_versions
       (object_key, entity_type, wall_ms, logical_counter, device_id, deleted, last_op_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("object-2", "marked.uploader.v1", 2, 0, "device-a", 1, "op-3");
  database
    .prepare(
      `INSERT INTO sync_outbox
       (op_id, object_key, wall_ms, logical_counter, device_id, deleted, envelope_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("op-3", "object-2", 2, 0, "device-a", 1, null, "2026-08-11T00:00:02.000Z");
  assert.equal(database.prepare("SELECT deleted FROM sync_versions WHERE object_key = ?").get("object-2").deleted, 1);
}

function run() {
  checkUnchangedSchemaObjects();
  const database = new DatabaseSync(":memory:");
  try {
    applyDraftSchema(database);
    checkExpectedTables(database);
    checkArchiveSplit(database);
    checkStableSearchEntities(database);
    checkUploaderIdentity(database);
    checkTombstoneBoundary(database);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }

  console.log(
    "DB v2 schema 草案检查通过：职责拆分、稳定 ID、term 顺序/级联、tombstone 边界、同步表约束及 v1 保留表均符合预期。",
  );
}

run();
