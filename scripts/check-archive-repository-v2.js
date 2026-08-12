const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const {
  ARCHIVE_ENTRY_ENTITY_TYPE,
  READING_PROGRESS_ENTITY_TYPE,
  READING_READ_LATER_ENTITY_TYPE,
  V2ArchiveRepository,
} = require("../dist/repositories/archive-repository-v2");
const { MutationOrigin } = require("../dist/repositories/mutation-origin");
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

function entryPayload(gid, title = `remote-${gid}`, overrides = {}) {
  return {
    format: 1,
    gid,
    entry: {
      token: `remote-token-${gid}`,
      title,
      englishTitle: `${title}-en`,
      japaneseTitle: `${title}-jp`,
      thumbnailUrl: `https://remote.test/${gid}.jpg`,
      category: "Manga",
      postedTime: "2026-01-01T00:00:00.000Z",
      visible: true,
      rating: 4.5,
      isMyRating: false,
      length: 55,
      torrentAvailable: false,
      favorited: false,
      favcat: null,
      uploader: "remote-uploader",
      disowned: false,
      taglist: [{ namespace: "language", tags: ["chinese", `remote-${gid}`] }],
      comment: "remote comment",
      refreshedAt: "2026-02-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

function progressPayload(gid, page, overrides = {}) {
  return {
    format: 1,
    gid,
    progress: {
      token: `remote-token-${gid}`,
      firstAccessTime: "2026-01-01T00:00:00.000Z",
      lastAccessTime: "2026-02-01T00:00:00.000Z",
      lastReadPage: page,
      ...overrides,
    },
  };
}

function readLaterPayload(gid, readLater) {
  return {
    format: 1,
    gid,
    readLater,
    token: readLater ? `remote-token-${gid}` : null,
    addedAt: readLater ? "2026-01-01T00:00:00.000Z" : null,
  };
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) database.exec(statement.sql);

function insertSeed(item) {
  database
    .prepare(
      `INSERT INTO archive_entries (
         gid, token, title, english_title, japanese_title, thumbnail_url, category, posted_time,
         visible, rating, is_my_rating, length, torrent_available, favorited, favcat, uploader,
         disowned, taglist_json, comment, refreshed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.gid,
      item.token,
      item.title,
      item.english_title,
      item.japanese_title,
      item.thumbnail_url,
      item.category,
      item.posted_time,
      Number(item.visible),
      item.rating,
      Number(item.is_my_rating),
      item.length,
      Number(item.torrent_available),
      Number(item.favorited),
      item.favcat ?? null,
      item.uploader ?? null,
      Number(item.disowned),
      JSON.stringify(item.taglist),
      item.comment,
      "2026-01-10T00:00:00.000Z",
    );
  database
    .prepare(
      `INSERT INTO reading_state
       (gid, token, first_access_time, last_access_time, readlater, last_read_page)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.gid,
      item.token,
      item.first_access_time,
      item.last_access_time,
      Number(item.readlater),
      item.last_read_page,
    );
  database
    .prepare("INSERT INTO local_gallery_state (gid, downloaded, downloaded_at) VALUES (?, ?, ?)")
    .run(item.gid, Number(item.downloaded), item.downloaded ? "2026-01-11T00:00:00.000Z" : null);
  for (const group of item.taglist) {
    for (const tag of group.tags) {
      database.prepare("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)").run(
        item.gid,
        group.namespace,
        tag,
      );
    }
  }
}

insertSeed(archive(1, { readlater: true, last_read_page: 9 }));
insertSeed(archive(2, { downloaded: true, last_read_page: 7 }));

let nowMs = 1000;
let isoSequence = 10;
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
const repository = new V2ArchiveRepository(createRepositoryDatabase(database), writer, codec, () => {
  isoSequence += 1;
  return `2026-03-${String(isoSequence).padStart(2, "0")}T00:00:00.000Z`;
});

function objectKey(entityType, gid) {
  return codec.deriveObjectKey(entityType, String(gid));
}

function remoteMutation(entityType, gid, payloadValue, wallMs, opId, deleted = false, logicalCounter = 0) {
  const version = {
    objectKey: objectKey(entityType, gid),
    entityType,
    wallMs,
    logicalCounter,
    deviceId: "device-b",
    deleted,
    opId,
  };
  return {
    ...version,
    origin: MutationOrigin.remote,
    envelopeJson: codec.encodeEnvelope(entityType, payloadValue, version),
  };
}

assert.deepEqual(repository.seedExistingArchives(), {
  archiveEntries: 2,
  readingProgress: 2,
  readLater: 2,
});
assert.deepEqual(repository.seedExistingArchives(), {
  archiveEntries: 0,
  readingProgress: 0,
  readLater: 0,
});
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions").get().count, 6);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 6);
assert.equal(
  database
    .prepare("SELECT deleted FROM sync_versions WHERE object_key = ?")
    .get(objectKey(READING_READ_LATER_ENTITY_TYPE, 2)).deleted,
  1,
  "readlater=false 的 seed 必须成为 membership tombstone",
);

const entryOutbox = database
  .prepare(
    `SELECT outbox.envelope_json, versions.wall_ms, versions.logical_counter,
            versions.device_id, versions.deleted, versions.last_op_id
     FROM sync_outbox AS outbox JOIN sync_versions AS versions USING (object_key)
     WHERE outbox.object_key = ?`,
  )
  .get(objectKey(ARCHIVE_ENTRY_ENTITY_TYPE, 1));
const decodedEntry = codec.decodeEnvelope(ARCHIVE_ENTRY_ENTITY_TYPE, entryOutbox.envelope_json, {
  objectKey: objectKey(ARCHIVE_ENTRY_ENTITY_TYPE, 1),
  entityType: ARCHIVE_ENTRY_ENTITY_TYPE,
  wallMs: entryOutbox.wall_ms,
  logicalCounter: entryOutbox.logical_counter,
  deviceId: entryOutbox.device_id,
  deleted: entryOutbox.deleted === 1,
  opId: entryOutbox.last_op_id,
});
assert.equal("downloaded" in decodedEntry, false);
assert.equal("lastReadPage" in decodedEntry.entry, false);

assert.equal(repository.count({ fromPage: 0, toPage: 0 }), 2);
assert.deepEqual(
  repository.queryGids({
    fromPage: 0,
    toPage: 0,
    searchTerms: [{ qualifier: "tag", namespace: "artist", term: "artist-1", dollar: true }],
  }),
  [1],
);
assert.equal(repository.get(1).readlater, true);
assert.equal(repository.get(2).downloaded, true);
assert.equal(repository.getLastReadPage(1), 9);

nowMs = 1100;
assert.equal(
  repository.save(
    archive(3, {
      readlater: false,
      downloaded: true,
      last_read_page: 12,
      taglist: [{ namespace: "language", tags: ["chinese", "translated"] }],
    }),
    MutationOrigin.user,
  ),
  true,
);
assert.equal(repository.save(archive(3), MutationOrigin.user), false);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key IN (?, ?, ?)").get(
  objectKey(ARCHIVE_ENTRY_ENTITY_TYPE, 3),
  objectKey(READING_PROGRESS_ENTITY_TYPE, 3),
  objectKey(READING_READ_LATER_ENTITY_TYPE, 3),
).count, 3);
assert.equal(repository.get(3).downloaded, true);

const failureProgressKey = objectKey(READING_PROGRESS_ENTITY_TYPE, 4);
database.exec(`CREATE TRIGGER fail_v2_archive_progress_outbox
  BEFORE INSERT ON sync_outbox
  WHEN NEW.object_key = '${failureProgressKey}'
  BEGIN
    SELECT RAISE(ABORT, 'injected v2 archive progress outbox failure');
  END`);
assert.throws(() => repository.save(archive(4), MutationOrigin.user), /injected v2 archive progress outbox failure/);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM archive_entries WHERE gid = 4").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM reading_state WHERE gid = 4").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM local_gallery_state WHERE gid = 4").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(failureProgressKey).count, 0);
database.exec("DROP TRIGGER fail_v2_archive_progress_outbox");

nowMs = 1200;
repository.update(
  3,
  {
    readlater: true,
    downloaded: false,
    last_read_page: 2,
    last_access_time: "2026-04-01T00:00:00.000Z",
    my_rating: 4.75,
    favorite_info: { favorited: true, favcat: 3 },
  },
  MutationOrigin.user,
);
assert.equal(repository.get(3).last_read_page, 2, "阅读进度必须允许从高页回到低页");
assert.equal(repository.get(3).readlater, true);
assert.equal(repository.get(3).downloaded, false);
assert.equal(repository.get(3).rating, 4.75);
const outboxBeforeDownloadedMaintenance = database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count;
repository.update(3, { downloaded: true }, MutationOrigin.localMaintenance);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, outboxBeforeDownloadedMaintenance);
assert.throws(
  () => repository.update(3, { last_read_page: 8 }, MutationOrigin.localMaintenance),
  /本机维护只能更新 downloaded/,
);

nowMs = 1250;
repository.update(3, { readlater: false }, MutationOrigin.user);
assert.equal(
  database
    .prepare("SELECT deleted FROM sync_versions WHERE object_key = ?")
    .get(objectKey(READING_READ_LATER_ENTITY_TYPE, 3)).deleted,
  1,
);
const staleProgress = repository.applyRemoteReadingProgress(
  remoteMutation(
    READING_PROGRESS_ENTITY_TYPE,
    3,
    progressPayload(3, 99),
    1199,
    "10000000-0000-4000-8000-000000000001",
    false,
    99,
  ),
);
const newerProgress = repository.applyRemoteReadingProgress(
  remoteMutation(
    READING_PROGRESS_ENTITY_TYPE,
    3,
    progressPayload(3, 1),
    1300,
    "10000000-0000-4000-8000-000000000002",
  ),
);
const duplicateProgress = repository.applyRemoteReadingProgress(
  remoteMutation(
    READING_PROGRESS_ENTITY_TYPE,
    3,
    progressPayload(3, 1),
    1300,
    "10000000-0000-4000-8000-000000000002",
  ),
);
assert.equal(staleProgress.applied, false);
assert.equal(newerProgress.applied, true);
assert.equal(duplicateProgress.applied, false);
assert.equal(repository.getLastReadPage(3), 1);

const newerReadLater = repository.applyRemoteReadLater(
  remoteMutation(
    READING_READ_LATER_ENTITY_TYPE,
    3,
    readLaterPayload(3, true),
    1350,
    "10000000-0000-4000-8000-000000000003",
  ),
);
assert.equal(newerReadLater.applied, true);
assert.equal(newerReadLater.readLater, true);
assert.equal(repository.get(3).readlater, true);

const remoteEntry = repository.applyRemoteArchiveEntry(
  remoteMutation(
    ARCHIVE_ENTRY_ENTITY_TYPE,
    3,
    entryPayload(3, "remote-newer"),
    1400,
    "10000000-0000-4000-8000-000000000004",
  ),
);
assert.equal(remoteEntry.applied, true);
assert.equal(repository.get(3).title, "remote-newer");
assert.deepEqual(
  repository.queryGids({
    fromPage: 0,
    toPage: 0,
    searchTerms: [{ qualifier: "tag", namespace: "language", term: "remote-3", dollar: true }],
  }),
  [3],
);

database.prepare("INSERT INTO gallery_reader_config (gid) VALUES (3)").run();
nowMs = 2000;
repository.delete(3, MutationOrigin.user, true);
assert.equal(repository.get(3), undefined);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM reading_state WHERE gid = 3").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM local_gallery_state WHERE gid = 3").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM gallery_reader_config WHERE gid = 3").get().count, 0);
for (const entityType of [ARCHIVE_ENTRY_ENTITY_TYPE, READING_PROGRESS_ENTITY_TYPE, READING_READ_LATER_ENTITY_TYPE]) {
  assert.equal(
    database.prepare("SELECT deleted FROM sync_versions WHERE object_key = ?").get(objectKey(entityType, 3)).deleted,
    1,
  );
}
const entryTombstone = database
  .prepare(
    `SELECT outbox.envelope_json, versions.wall_ms, versions.logical_counter,
            versions.device_id, versions.last_op_id
     FROM sync_versions AS versions JOIN sync_outbox AS outbox USING (object_key)
     WHERE versions.object_key = ?`,
  )
  .get(objectKey(ARCHIVE_ENTRY_ENTITY_TYPE, 3));
assert.deepEqual(
  codec.decodeEnvelope(ARCHIVE_ENTRY_ENTITY_TYPE, entryTombstone.envelope_json, {
    objectKey: objectKey(ARCHIVE_ENTRY_ENTITY_TYPE, 3),
    entityType: ARCHIVE_ENTRY_ENTITY_TYPE,
    wallMs: entryTombstone.wall_ms,
    logicalCounter: entryTombstone.logical_counter,
    deviceId: entryTombstone.device_id,
    deleted: true,
    opId: entryTombstone.last_op_id,
  }),
  { format: 1, gid: 3, entry: null },
);

const staleEntry = repository.applyRemoteArchiveEntry(
  remoteMutation(
    ARCHIVE_ENTRY_ENTITY_TYPE,
    3,
    entryPayload(3, "must-not-revive"),
    1999,
    "10000000-0000-4000-8000-000000000005",
    false,
    99,
  ),
);
const revivedEntry = repository.applyRemoteArchiveEntry(
  remoteMutation(
    ARCHIVE_ENTRY_ENTITY_TYPE,
    3,
    entryPayload(3, "revived-entry"),
    2100,
    "10000000-0000-4000-8000-000000000006",
  ),
);
assert.equal(staleEntry.applied, false);
assert.equal(revivedEntry.applied, true);
assert.equal(repository.get(3).title, "revived-entry");
assert.equal(repository.get(3).last_read_page, 0, "列表快照恢复不得复活已删除的独立阅读进度");
assert.equal(repository.get(3).downloaded, false, "远端列表快照不得传播本机下载状态");

const restoredProgress = repository.applyRemoteReadingProgress(
  remoteMutation(
    READING_PROGRESS_ENTITY_TYPE,
    3,
    progressPayload(3, 4),
    2200,
    "10000000-0000-4000-8000-000000000007",
  ),
);
const restoredReadLater = repository.applyRemoteReadLater(
  remoteMutation(
    READING_READ_LATER_ENTITY_TYPE,
    3,
    readLaterPayload(3, true),
    2201,
    "10000000-0000-4000-8000-000000000008",
  ),
);
assert.equal(restoredProgress.progressPresent, true);
assert.equal(restoredReadLater.readLater, true);
const deletedProgress = repository.applyRemoteReadingProgress(
  remoteMutation(
    READING_PROGRESS_ENTITY_TYPE,
    3,
    { format: 1, gid: 3, progress: null },
    2300,
    "10000000-0000-4000-8000-000000000009",
    true,
  ),
);
assert.equal(deletedProgress.progressPresent, false);
assert.equal(repository.get(3).readlater, true, "进度 tombstone 不得删除独立的稍后阅读 membership");
assert.equal(repository.getLastReadPage(3), 0);
const deletedReadLater = repository.applyRemoteReadLater(
  remoteMutation(
    READING_READ_LATER_ENTITY_TYPE,
    3,
    readLaterPayload(3, false),
    2400,
    "10000000-0000-4000-8000-000000000010",
    true,
  ),
);
assert.equal(deletedReadLater.readLater, false);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM reading_state WHERE gid = 3").get().count,
  0,
  "进度和稍后阅读均为 tombstone 时应删除共享业务行",
);
assert.equal(repository.get(3).title, "revived-entry", "阅读状态 tombstone 不得删除列表快照");

const gid2Keys = [
  objectKey(ARCHIVE_ENTRY_ENTITY_TYPE, 2),
  objectKey(READING_PROGRESS_ENTITY_TYPE, 2),
  objectKey(READING_READ_LATER_ENTITY_TYPE, 2),
];
repository.delete(2, MutationOrigin.localMaintenance, true);
assert.equal(repository.get(2), undefined);
for (const key of gid2Keys) {
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?").get(key).count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE object_key = ?").get(key).count, 0);
}

assert.deepEqual(repository.listDownloadedGids(), []);
assert.equal(repository.getMetadataByGids([1]).get(1).title, "japanese-1");
assert.deepEqual(repository.findOldRemovableGids("2027-01-01T00:00:00.000Z"), [1, 3]);

database
  .prepare(
    `INSERT INTO sync_versions
     (object_key, entity_type, wall_ms, logical_counter, device_id, deleted, last_op_id)
     VALUES ('unrelated', 'marked.uploader.v1', 1, 0, 'device-a', 0, 'unrelated-op')`,
  )
  .run();
repository.clearAllLocalData(MutationOrigin.localMaintenance);
assert.equal(repository.count({ fromPage: 0, toPage: 0 }), 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM reading_state").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM local_gallery_state").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE entity_type LIKE 'archive.%' OR entity_type LIKE 'reading.%'").get().count, 0);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = 'unrelated'").get().count, 1);

database.close();
console.log("v2 archive repository checks passed");
