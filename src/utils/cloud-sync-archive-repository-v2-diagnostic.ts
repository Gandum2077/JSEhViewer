import { DBArchiveItem } from "../types";
import {
  ARCHIVE_ENTRY_ENTITY_TYPE,
  ArchiveEntryPayloadV1,
  READING_PROGRESS_ENTITY_TYPE,
  READING_READ_LATER_ENTITY_TYPE,
  ReadingProgressPayloadV1,
  ReadingReadLaterPayloadV1,
  V2ArchiveRepository,
} from "../repositories/archive-repository-v2";
import { MutationOrigin } from "../repositories/mutation-origin";
import { RepositoryDatabase } from "../repositories/repository-database";
import { RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "../repositories/sync-mutation-writer";
import { CloudSyncDiagnosticEntityCodec } from "./cloud-sync-diagnostic-entity-codec";
import { DATABASE_V2_DRAFT_SCHEMA_STATEMENTS, DATABASE_V2_DRAFT_USER_VERSION } from "./database-schema-v2-draft";
import {
  checkedSqliteUpdate,
  querySqliteRows,
  SqliteTransactionContext,
  SqliteValue,
  withSqliteQueueOperation,
  withSqliteTransaction,
} from "./sqlite-safe";

const DATABASE_PATH = "assets/cloud-sync-phase1-archive-repository-v2.db";

export interface CloudSyncArchiveRepositoryV2DiagnosticResult {
  ok: true;
  seededArchiveCount: number;
  splitEntities: true;
  queryCompatible: true;
  localOnlyDownload: true;
  remoteOrdering: true;
  deletionSemantics: true;
  sharedRowPruning: true;
  rollbackAtomic: true;
  reopenPersisted: true;
  cleanupComplete: true;
  durationMs: number;
}

export class CloudSyncArchiveRepositoryV2DiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudSyncArchiveRepositoryV2DiagnosticError";
  }
}

function archive(gid: number, overrides: Partial<DBArchiveItem> = {}): DBArchiveItem {
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

function entryPayload(gid: number, title: string): ArchiveEntryPayloadV1 {
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
    },
  };
}

function progressPayload(gid: number, page: number): ReadingProgressPayloadV1 {
  return {
    format: 1,
    gid,
    progress: {
      token: `remote-token-${gid}`,
      firstAccessTime: "2026-01-01T00:00:00.000Z",
      lastAccessTime: "2026-02-01T00:00:00.000Z",
      lastReadPage: page,
    },
  };
}

function readLaterPayload(gid: number, readLater: boolean): ReadingReadLaterPayloadV1 {
  return {
    format: 1,
    gid,
    readLater,
    token: readLater ? `remote-token-${gid}` : null,
    addedAt: readLater ? "2026-01-01T00:00:00.000Z" : null,
  };
}

function databaseFiles(path: string): string[] {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
}

function removeDatabase(path: string): void {
  for (const file of databaseFiles(path)) {
    if ($file.exists(file) && !$file.delete(file)) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError(`无法清理 v2 图库临时数据库：${file}`);
    }
  }
}

function createDatabase(queue: SqliteTypes.SqliteQueueInstance): RepositoryDatabase {
  return {
    query(sql: string, args?: SqliteValue[]) {
      return withSqliteQueueOperation(
        queue,
        (db) => querySqliteRows(db, sql, args, "v2 图库临时库查询"),
        "v2 图库临时库查询队列",
      );
    },
    transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T {
      return withSqliteQueueOperation(
        queue,
        (db) => withSqliteTransaction(db, callback, operation || "v2 图库临时库事务"),
        `${operation || "v2 图库临时库事务"}队列`,
      );
    },
  };
}

function withQueue<T>(callback: (queue: SqliteTypes.SqliteQueueInstance) => T): T {
  const queue = $sqlite.dbQueue(DATABASE_PATH);
  try {
    withSqliteQueueOperation(
      queue,
      (db) => checkedSqliteUpdate(db, "PRAGMA foreign_keys = ON", undefined, "启用 v2 图库临时库外键"),
      "启用 v2 图库临时库外键队列",
    );
    return callback(queue);
  } finally {
    queue.close();
  }
}

function queryOne<T extends Record<string, any>>(database: RepositoryDatabase, sql: string, args?: SqliteValue[]): T {
  const row = database.query(sql, args)[0] as T | undefined;
  if (!row) throw new CloudSyncArchiveRepositoryV2DiagnosticError("v2 图库诊断缺少预期数据库行");
  return row;
}

function execute(queue: SqliteTypes.SqliteQueueInstance, sql: string, operation: string): void {
  withSqliteQueueOperation(queue, (db) => checkedSqliteUpdate(db, sql, undefined, operation), `${operation}队列`);
}

function objectKey(codec: CloudSyncDiagnosticEntityCodec, entityType: string, gid: number): string {
  return codec.deriveObjectKey(entityType, String(gid));
}

function remoteMutation(
  codec: CloudSyncDiagnosticEntityCodec,
  entityType: string,
  gid: number,
  payload: ArchiveEntryPayloadV1 | ReadingProgressPayloadV1 | ReadingReadLaterPayloadV1,
  wallMs: number,
  opId: string,
  deleted = false,
  logicalCounter = 0,
): RemoteSyncMutation {
  const version: SyncVersion = {
    objectKey: objectKey(codec, entityType, gid),
    entityType,
    wallMs,
    logicalCounter,
    deviceId: "phase1-device-b",
    deleted,
    opId,
  };
  return {
    ...version,
    origin: MutationOrigin.remote,
    envelopeJson: codec.encodeEnvelope(entityType, payload, version),
  };
}

function insertSeed(transaction: SqliteTransactionContext, item: DBArchiveItem): void {
  transaction.update(
    `INSERT INTO archive_entries (
       gid, token, title, english_title, japanese_title, thumbnail_url, category, posted_time,
       visible, rating, is_my_rating, length, torrent_available, favorited, favcat, uploader,
       disowned, taglist_json, comment, refreshed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.gid,
      item.token,
      item.title,
      item.english_title,
      item.japanese_title,
      item.thumbnail_url,
      item.category,
      item.posted_time,
      item.visible,
      item.rating,
      item.is_my_rating,
      item.length,
      item.torrent_available,
      item.favorited,
      item.favcat,
      item.uploader,
      item.disowned,
      JSON.stringify(item.taglist),
      item.comment,
      "2026-01-10T00:00:00.000Z",
    ],
  );
  transaction.update(
    `INSERT INTO reading_state
     (gid, token, first_access_time, last_access_time, readlater, last_read_page)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      item.gid,
      item.token,
      item.first_access_time,
      item.last_access_time,
      item.readlater,
      item.last_read_page,
    ],
  );
  transaction.update(
    "INSERT INTO local_gallery_state (gid, downloaded, downloaded_at) VALUES (?, ?, ?)",
    [item.gid, item.downloaded, item.downloaded ? "2026-01-11T00:00:00.000Z" : null],
  );
  for (const group of item.taglist) {
    for (const tag of group.tags) {
      transaction.update("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)", [
        item.gid,
        group.namespace,
        tag,
      ]);
    }
  }
}

function populateAndCheck(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    database.transaction((transaction) => {
      for (const statement of DATABASE_V2_DRAFT_SCHEMA_STATEMENTS) {
        transaction.update(statement.sql, undefined, `创建 v2 图库诊断用 ${statement.name}`);
      }
      transaction.update(`PRAGMA user_version = ${DATABASE_V2_DRAFT_USER_VERSION}`, undefined, "设置诊断库版本");
      insertSeed(transaction, archive(1, { readlater: true, last_read_page: 9 }));
      insertSeed(transaction, archive(2, { downloaded: true, last_read_page: 7 }));
    }, "创建 v2 图库诊断库");

    let nowMs = 1000;
    let isoSequence = 10;
    let opSequence = 0;
    const codec = new CloudSyncDiagnosticEntityCodec();
    const writer = new SyncMutationWriter({
      deviceId: "phase1-device-a",
      nowMs: () => nowMs,
      createOpId: () => {
        opSequence += 1;
        return `00000000-0000-4000-8000-${String(opSequence).padStart(12, "0")}`;
      },
    });
    const repository = new V2ArchiveRepository(database, writer, codec, () => {
      isoSequence += 1;
      return `2026-03-${String(isoSequence).padStart(2, "0")}T00:00:00.000Z`;
    });

    const seeded = repository.seedExistingArchives();
    const repeated = repository.seedExistingArchives();
    if (
      seeded.archiveEntries !== 2 ||
      seeded.readingProgress !== 2 ||
      seeded.readLater !== 2 ||
      repeated.archiveEntries !== 0 ||
      repeated.readingProgress !== 0 ||
      repeated.readLater !== 0 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 6
    ) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("图库三类同步对象 seed 不是可重入操作");
    }
    if (
      repository.count({ fromPage: 0, toPage: 0 }) !== 2 ||
      repository.get(1)?.readlater !== true ||
      repository.get(2)?.downloaded !== true ||
      repository.queryGids({
        fromPage: 0,
        toPage: 0,
        searchTerms: [{ qualifier: "tag", namespace: "artist", term: "artist-1", dollar: true } as any],
      })[0] !== 1
    ) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("v2 拆表后的图库兼容查询不正确");
    }

    nowMs = 1100;
    repository.save(
      archive(3, {
        downloaded: true,
        last_read_page: 12,
        taglist: [{ namespace: "language", tags: ["chinese", "translated"] }],
      }),
      MutationOrigin.user,
    );
    const entryOutbox = queryOne<{ envelope_json: string }>(
      database,
      "SELECT envelope_json FROM sync_outbox WHERE object_key = ?",
      [objectKey(codec, ARCHIVE_ENTRY_ENTITY_TYPE, 3)],
    );
    const rawEnvelope = JSON.parse(entryOutbox.envelope_json) as { payload?: Record<string, unknown> };
    const rawEntry = rawEnvelope.payload?.entry;
    if (
      !rawEnvelope.payload ||
      typeof rawEntry !== "object" ||
      rawEntry === null ||
      "downloaded" in rawEntry ||
      "lastReadPage" in rawEntry
    ) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("列表快照 payload 混入下载状态或阅读进度");
    }
    const outboxBeforeDownload = Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count);
    repository.update(3, { downloaded: false }, MutationOrigin.localMaintenance);
    if (
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !==
        outboxBeforeDownload ||
      repository.get(3)?.downloaded !== false
    ) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("本机下载状态错误进入 outbox");
    }

    const failureKey = objectKey(codec, READING_PROGRESS_ENTITY_TYPE, 4);
    execute(
      queue,
      `CREATE TRIGGER fail_v2_archive_progress_outbox
       BEFORE INSERT ON sync_outbox
       WHEN NEW.object_key = '${failureKey}'
       BEGIN
         SELECT RAISE(ABORT, 'injected v2 archive progress outbox failure');
       END`,
      "创建 v2 图库 outbox 故障触发器",
    );
    let saveFailureRejected = false;
    try {
      repository.save(archive(4), MutationOrigin.user);
    } catch {
      saveFailureRejected = true;
    }
    execute(queue, "DROP TRIGGER fail_v2_archive_progress_outbox", "删除 v2 图库 outbox 故障触发器");
    if (
      !saveFailureRejected ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM archive_entries WHERE gid = 4").count) !==
        0 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM reading_state WHERE gid = 4").count) !==
        0 ||
      Number(
        queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM local_gallery_state WHERE gid = 4").count,
      ) !== 0
    ) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("图库中途 outbox 故障没有完整回滚三张业务表");
    }

    nowMs = 1200;
    repository.update(
      3,
      {
        readlater: true,
        last_read_page: 2,
        last_access_time: "2026-04-01T00:00:00.000Z",
      },
      MutationOrigin.user,
    );
    const stale = repository.applyRemoteReadingProgress(
      remoteMutation(
        codec,
        READING_PROGRESS_ENTITY_TYPE,
        3,
        progressPayload(3, 99),
        1199,
        "10000000-0000-4000-8000-000000000001",
        false,
        99,
      ),
    );
    const newer = repository.applyRemoteReadingProgress(
      remoteMutation(
        codec,
        READING_PROGRESS_ENTITY_TYPE,
        3,
        progressPayload(3, 1),
        1300,
        "10000000-0000-4000-8000-000000000002",
      ),
    );
    const duplicate = repository.applyRemoteReadingProgress(
      remoteMutation(
        codec,
        READING_PROGRESS_ENTITY_TYPE,
        3,
        progressPayload(3, 1),
        1300,
        "10000000-0000-4000-8000-000000000002",
      ),
    );
    if (stale.applied || !newer.applied || duplicate.applied || repository.getLastReadPage(3) !== 1) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("阅读进度远端版本顺序或低页码覆盖不正确");
    }

    nowMs = 2000;
    repository.delete(3, MutationOrigin.user, true);
    for (const entityType of [
      ARCHIVE_ENTRY_ENTITY_TYPE,
      READING_PROGRESS_ENTITY_TYPE,
      READING_READ_LATER_ENTITY_TYPE,
    ]) {
      if (
        Number(
          queryOne<{ deleted: number }>(database, "SELECT deleted FROM sync_versions WHERE object_key = ?", [
            objectKey(codec, entityType, 3),
          ]).deleted,
        ) !== 1
      ) {
        throw new CloudSyncArchiveRepositoryV2DiagnosticError("用户删除没有为三个图库实体生成 tombstone");
      }
    }
    repository.delete(2, MutationOrigin.localMaintenance, true);
    for (const entityType of [
      ARCHIVE_ENTRY_ENTITY_TYPE,
      READING_PROGRESS_ENTITY_TYPE,
      READING_READ_LATER_ENTITY_TYPE,
    ]) {
      if (
        Number(
          queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE object_key = ?", [
            objectKey(codec, entityType, 2),
          ]).count,
        ) !== 0
      ) {
        throw new CloudSyncArchiveRepositoryV2DiagnosticError("本机维护删除保留了旧版本或制造了 tombstone");
      }
    }

    const tempGid = 8;
    repository.applyRemoteReadingProgress(
      remoteMutation(
        codec,
        READING_PROGRESS_ENTITY_TYPE,
        tempGid,
        progressPayload(tempGid, 7),
        2200,
        "10000000-0000-4000-8000-000000000003",
      ),
    );
    repository.applyRemoteReadLater(
      remoteMutation(
        codec,
        READING_READ_LATER_ENTITY_TYPE,
        tempGid,
        readLaterPayload(tempGid, true),
        2201,
        "10000000-0000-4000-8000-000000000004",
      ),
    );
    repository.applyRemoteReadingProgress(
      remoteMutation(
        codec,
        READING_PROGRESS_ENTITY_TYPE,
        tempGid,
        { format: 1, gid: tempGid, progress: null },
        2300,
        "10000000-0000-4000-8000-000000000005",
        true,
      ),
    );
    if (Number(queryOne<{ readlater: number }>(database, "SELECT readlater FROM reading_state WHERE gid = 8").readlater) !== 1) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("进度 tombstone 删除了独立 read-later 状态");
    }
    repository.applyRemoteReadLater(
      remoteMutation(
        codec,
        READING_READ_LATER_ENTITY_TYPE,
        tempGid,
        readLaterPayload(tempGid, false),
        2400,
        "10000000-0000-4000-8000-000000000006",
        true,
      ),
    );
    if (Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM reading_state WHERE gid = 8").count) !== 0) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("两个阅读实体均删除后没有清理共享业务行");
    }

    repository.clearAllLocalData(MutationOrigin.localMaintenance);
    const finalGid = 9;
    repository.applyRemoteArchiveEntry(
      remoteMutation(
        codec,
        ARCHIVE_ENTRY_ENTITY_TYPE,
        finalGid,
        entryPayload(finalGid, "remote-persisted"),
        3000,
        "10000000-0000-4000-8000-000000000007",
      ),
    );
    repository.applyRemoteReadingProgress(
      remoteMutation(
        codec,
        READING_PROGRESS_ENTITY_TYPE,
        finalGid,
        progressPayload(finalGid, 5),
        3001,
        "10000000-0000-4000-8000-000000000008",
      ),
    );
    repository.applyRemoteReadLater(
      remoteMutation(
        codec,
        READING_READ_LATER_ENTITY_TYPE,
        finalGid,
        readLaterPayload(finalGid, true),
        3002,
        "10000000-0000-4000-8000-000000000009",
      ),
    );
    const finalItem = repository.get(finalGid);
    if (
      finalItem?.title !== "remote-persisted" ||
      finalItem.last_read_page !== 5 ||
      !finalItem.readlater ||
      finalItem.downloaded ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions").count) !== 3 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 0
    ) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("远端全量重建后的图库拆分状态不完整");
    }
  });
}

function checkReopen(): void {
  withQueue((queue) => {
    const database = createDatabase(queue);
    const repository = new V2ArchiveRepository(
      database,
      new SyncMutationWriter({
        deviceId: "phase1-reopen",
        nowMs: () => 4000,
        createOpId: () => "20000000-0000-4000-8000-000000000001",
      }),
      new CloudSyncDiagnosticEntityCodec(),
      () => "2026-04-01T00:00:00.000Z",
    );
    const item = repository.get(9);
    if (
      item?.title !== "remote-persisted" ||
      item.last_read_page !== 5 ||
      !item.readlater ||
      item.downloaded ||
      repository.queryGids({
        fromPage: 0,
        toPage: 0,
        searchTerms: [{ qualifier: "tag", namespace: "language", term: "remote-9", dollar: true } as any],
      })[0] !== 9 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_versions").count) !== 3 ||
      Number(queryOne<{ count: number }>(database, "SELECT COUNT(*) AS count FROM sync_outbox").count) !== 0
    ) {
      throw new CloudSyncArchiveRepositoryV2DiagnosticError("关闭重开后图库、阅读状态、标签索引或版本不完整");
    }
  });
}

export function runCloudSyncArchiveRepositoryV2Diagnostic(): CloudSyncArchiveRepositoryV2DiagnosticResult {
  const startedAt = Date.now();
  removeDatabase(DATABASE_PATH);
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    populateAndCheck();
    checkReopen();
  } catch (error) {
    operationError = error;
  }
  try {
    removeDatabase(DATABASE_PATH);
  } catch (error) {
    cleanupError = error;
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return {
    ok: true,
    seededArchiveCount: 2,
    splitEntities: true,
    queryCompatible: true,
    localOnlyDownload: true,
    remoteOrdering: true,
    deletionSemantics: true,
    sharedRowPruning: true,
    rollbackAtomic: true,
    reopenPersisted: true,
    cleanupComplete: true,
    durationMs: Date.now() - startedAt,
  };
}
