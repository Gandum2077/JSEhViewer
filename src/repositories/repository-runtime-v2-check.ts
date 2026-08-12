import { DBArchiveItem, MarkedTag } from "../types";
import { bookmarkPositionKeyForIndex } from "./bookmark-position-key";
import { MarkedTagMode } from "./marked-tag-repository";
import { MutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";
import { V2RepositoryRuntime } from "./repository-runtime";

export interface V2RepositoryRuntimeExpectedState {
  archiveGid: number;
  historyId: string;
  bookmarkIds: string[];
  markedUploaders: string[];
  bannedUploaders: string[];
  markedTagNames: string[];
}

export interface V2RepositoryRuntimeCheckResult {
  seededObjects: number;
  entityTypes: number;
  expected: V2RepositoryRuntimeExpectedState;
}

export class V2RepositoryRuntimeCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V2RepositoryRuntimeCheckError";
  }
}

function requireCheck(value: unknown, message: string): asserts value {
  if (!value) throw new V2RepositoryRuntimeCheckError(message);
}

function count(database: RepositoryDatabase, sql: string, args?: (string | number)[]): number {
  return Number((database.query(sql, args)[0] as { count?: number } | undefined)?.count ?? 0);
}

function archive(gid: number, overrides: Partial<DBArchiveItem> = {}): DBArchiveItem {
  return {
    gid,
    readlater: false,
    downloaded: false,
    first_access_time: "2026-08-01T00:00:00.000Z",
    last_access_time: "2026-08-01T00:00:00.000Z",
    token: `runtime-token-${gid}`,
    title: `runtime-title-${gid}`,
    english_title: `runtime-english-${gid}`,
    japanese_title: `runtime-japanese-${gid}`,
    thumbnail_url: `https://runtime.test/${gid}.jpg`,
    category: "Manga",
    posted_time: "2026-07-01T00:00:00.000Z",
    visible: true,
    rating: 4.2,
    is_my_rating: false,
    length: 52,
    torrent_available: false,
    favorited: false,
    uploader: "runtime-uploader",
    disowned: false,
    taglist: [{ namespace: "artist", tags: ["runtime-artist"] }],
    comment: "runtime comment",
    last_read_page: 8,
    ...overrides,
  };
}

function tag(tagid: number, name: string): MarkedTag {
  return {
    tagid,
    namespace: "artist",
    name,
    watched: true,
    hidden: false,
    color: "#123456",
    weight: 3,
  };
}

function insertMigratedFixtures(database: RepositoryDatabase, deriveSearchId: (value: string) => string): void {
  const historyQuery = "runtime-seeded-history";
  const bookmarkQuery = "runtime-seeded-bookmark";
  database.transaction((transaction) => {
    const item = archive(501, { readlater: true, last_read_page: 19 });
    transaction.update(
      `INSERT INTO archive_entries
       (gid, token, title, english_title, japanese_title, thumbnail_url, category, posted_time,
        visible, rating, is_my_rating, length, torrent_available, favorited, favcat, uploader,
        disowned, taglist_json, comment, refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        null,
        item.uploader,
        item.disowned,
        JSON.stringify(item.taglist),
        item.comment,
        "2026-08-01T00:00:00.000Z",
      ],
    );
    transaction.update(
      `INSERT INTO reading_state
       (gid, token, first_access_time, last_access_time, readlater, last_read_page)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.gid, item.token, item.first_access_time, item.last_access_time, item.readlater, item.last_read_page],
    );
    transaction.update("INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)", [
      item.gid,
      "artist",
      "runtime-artist",
    ]);

    const historyId = deriveSearchId(historyQuery).toLowerCase();
    transaction.update("INSERT INTO search_history (history_id, last_access_time, sorted_fsearch) VALUES (?, ?, ?)", [
      historyId,
      "2026-08-01T00:00:00.000Z",
      historyQuery,
    ]);
    transaction.update(
      `INSERT INTO search_history_search_terms
       (history_id, term_index, namespace, term, dollar, subtract, tilde)
       VALUES (?, 0, 'artist', 'runtime-seeded', 0, 0, 0)`,
      [historyId],
    );

    const bookmarkId = deriveSearchId(bookmarkQuery).toLowerCase();
    transaction.update("INSERT INTO search_bookmarks (bookmark_id, position_key, sorted_fsearch) VALUES (?, ?, ?)", [
      bookmarkId,
      bookmarkPositionKeyForIndex(0),
      bookmarkQuery,
    ]);
    transaction.update(
      `INSERT INTO search_bookmarks_search_terms
       (bookmark_id, term_index, term, dollar, subtract, tilde)
       VALUES (?, 0, 'runtime-seeded-bookmark', 0, 0, 0)`,
      [bookmarkId],
    );
    transaction.update("INSERT INTO marked_uploaders (uploader) VALUES ('runtime-seeded-uploader')");
    transaction.update(
      `INSERT INTO marked_tags (tagid, namespace, name, watched, hidden, color, weight)
       VALUES (1, 'artist', 'runtime-seeded-tag', 1, 0, '#123456', 3)`,
    );
  }, "创建 v2 Repository 整库迁移后 fixture");
}

function seedAll(runtime: V2RepositoryRuntime): number {
  const archiveSeed = runtime.adapters.archive.seedExistingArchives();
  return (
    archiveSeed.archiveEntries +
    archiveSeed.readingProgress +
    archiveSeed.readLater +
    runtime.adapters.searchHistory.seedExistingHistory() +
    runtime.adapters.searchBookmark.seedExistingBookmarks() +
    runtime.adapters.uploader.seedExistingMarkedUploaders() +
    runtime.adapters.markedTag.seedExistingLocalTags(MarkedTagMode.localSync)
  );
}

function requireId(id: number | string, name: string): string {
  requireCheck(typeof id === "string" && /^[0-9a-f]{64}$/u.test(id), `${name}没有使用 v2 稳定字符串 ID`);
  return id;
}

function checkVersionAndOutboxLinkage(database: RepositoryDatabase): number {
  const brokenLinks = count(
    database,
    `SELECT COUNT(*) AS count
     FROM sync_outbox AS outbox
     LEFT JOIN sync_versions AS versions ON versions.object_key = outbox.object_key
     WHERE versions.object_key IS NULL
        OR versions.last_op_id <> outbox.op_id
        OR versions.wall_ms <> outbox.wall_ms
        OR versions.logical_counter <> outbox.logical_counter
        OR versions.device_id <> outbox.device_id
        OR versions.deleted <> outbox.deleted`,
  );
  requireCheck(brokenLinks === 0, "共享运行时产生了与 sync_versions 不一致的 outbox");
  const versions = database.query(
    `SELECT wall_ms, logical_counter, device_id
     FROM sync_versions ORDER BY wall_ms, logical_counter, device_id`,
  ) as { wall_ms: number; logical_counter: number; device_id: string }[];
  const clocks = new Set(versions.map((row) => `${row.wall_ms}:${row.logical_counter}:${row.device_id}`));
  requireCheck(clocks.size === versions.length, "五类 Repository 没有共享单调且唯一的 HLC 序列");
  return count(database, "SELECT COUNT(DISTINCT entity_type) AS count FROM sync_versions");
}

export function exerciseV2RepositoryRuntime(
  runtime: V2RepositoryRuntime,
  database: RepositoryDatabase,
  deriveSearchId: (value: string) => string,
): V2RepositoryRuntimeCheckResult {
  requireCheck(runtime.schemaVersion === 2, "整库回归没有装配 v2 Repository runtime");
  insertMigratedFixtures(database, deriveSearchId);
  const seededObjects = seedAll(runtime);
  requireCheck(seededObjects === 7, "五类 v2 Adapter 没有完整 seed 迁移后的七个同步对象");
  requireCheck(seedAll(runtime) === 0, "五类 v2 Adapter 的组合 seed 不是可重入操作");

  const archiveRepository = runtime.archiveRepository;
  archiveRepository.update(
    501,
    { last_read_page: 2, last_access_time: "2026-08-10T00:00:00.000Z" },
    MutationOrigin.user,
  );
  const outboxBeforeLocalDownload = count(database, "SELECT COUNT(*) AS count FROM sync_outbox");
  archiveRepository.update(501, { downloaded: true }, MutationOrigin.localMaintenance);
  requireCheck(
    count(database, "SELECT COUNT(*) AS count FROM sync_outbox") === outboxBeforeLocalDownload,
    "ConfigManager 本机下载状态路径错误地产生了同步操作",
  );
  requireCheck(archiveRepository.getLastReadPage(501) === 2, "StatusManager 低页码阅读进度路径不兼容 v2");
  requireCheck(archiveRepository.listDownloadedGids().join(",") === "501", "本机下载列表查询不兼容 v2");
  requireCheck(
    archiveRepository.save(archive(502, { last_read_page: 4 }), MutationOrigin.user),
    "StatusManager 新图库保存路径没有进入 v2 runtime",
  );
  const archiveOptions = { fromPage: 0, toPage: 0, pageSize: 20, type: "all" as const };
  requireCheck(archiveRepository.count(archiveOptions) === 2, "图库计数路径不兼容 v2 runtime");
  requireCheck(
    archiveRepository.query({
      ...archiveOptions,
      searchTerms: [{ namespace: "artist", term: "runtime-artist", dollar: true, subtract: false, tilde: false }],
    }).length === 2,
    "图库标签筛选路径不兼容 v2 runtime",
  );
  requireCheck(archiveRepository.getMetadataByGids([501, 502]).size === 2, "图库元数据批量查询不兼容 v2");
  archiveRepository.delete(501, MutationOrigin.user, true);
  requireCheck(archiveRepository.get(501) === undefined, "用户删除图库没有通过 v2 runtime 写入 tombstone");

  const searchRepository = runtime.searchRepository;
  const seededHistory = searchRepository
    .queryHistory()
    .find((item) => item.sorted_fsearch === "runtime-seeded-history");
  requireCheck(seededHistory, "ConfigManager 启动查询没有读到迁移搜索历史");
  const latestHistory = searchRepository.upsertHistory(
    "runtime-latest-history",
    [{ qualifier: "uploader", term: "runtime-latest", dollar: false, subtract: false, tilde: false }],
    MutationOrigin.user,
    "2026-08-12T00:00:00.000Z",
  );
  const historyId = requireId(latestHistory.id, "搜索历史");
  searchRepository.deleteHistoryLocally(seededHistory.id);
  requireCheck(
    searchRepository
      .queryHistory()
      .map((item) => item.id)
      .join(",") === historyId,
    "ConfigManager 搜索历史新增/本机删除后的缓存重查路径不兼容 v2",
  );
  requireCheck(
    searchRepository.getSomeLastAccessSearchTerms(1)[0]?.term === "runtime-latest",
    "ConfigManager 最近搜索词路径不兼容 v2",
  );

  for (const value of ["runtime-bookmark-a", "runtime-bookmark-b"]) {
    requireCheck(
      searchRepository.addBookmark(
        value,
        [{ term: value, dollar: false, subtract: false, tilde: false }],
        MutationOrigin.user,
      ),
      "ConfigManager 新增书签路径不兼容 v2",
    );
  }
  const reversedBookmarks = searchRepository
    .queryBookmarks()
    .map((item) => requireId(item.id, "搜索书签"))
    .reverse();
  searchRepository.reorderBookmarks(reversedBookmarks, MutationOrigin.user);
  searchRepository.deleteBookmark(reversedBookmarks[0], MutationOrigin.user);
  const bookmarkIds = searchRepository.queryBookmarks().map((item) => requireId(item.id, "搜索书签"));
  requireCheck(
    bookmarkIds.join(",") === reversedBookmarks.slice(1).join(","),
    "ConfigManager 书签重排/删除后的缓存重查路径不兼容 v2",
  );

  const uploaderRepository = runtime.uploaderRepository;
  requireCheck(
    uploaderRepository.addMarkedUploader("runtime-blocked", MutationOrigin.user),
    "ConfigManager 标记上传者路径不兼容 v2",
  );
  const bannedResult = uploaderRepository.replaceBannedUploaders(["runtime-blocked"], MutationOrigin.upstreamMirror);
  requireCheck(
    bannedResult.removedMarkedUploaders.join(",") === "runtime-blocked",
    "上游屏蔽上传者刷新没有隔离本机标记",
  );
  requireCheck(
    uploaderRepository.addMarkedUploader("runtime-alice", MutationOrigin.user),
    "ConfigManager 新增标记上传者失败",
  );
  requireCheck(
    uploaderRepository.deleteMarkedUploader("runtime-seeded-uploader", MutationOrigin.user),
    "ConfigManager 删除标记上传者没有生成 tombstone",
  );
  const markedUploaders = uploaderRepository.queryMarkedUploaders();
  requireCheck(markedUploaders.join(",") === "runtime-alice", "上传者缓存重查路径结果不正确");

  const markedTagRepository = runtime.markedTagRepository;
  markedTagRepository.upsertLocalTag(tag(0, "runtime-local-tag"), MarkedTagMode.localSync, MutationOrigin.user);
  requireCheck(
    markedTagRepository.clearForRelogin(MutationOrigin.localMaintenance) === 2,
    "重新登录没有整表清理迁移标签与本机标签",
  );
  requireCheck(
    count(database, "SELECT COUNT(*) AS count FROM sync_versions WHERE entity_type = 'marked.tag.local.v1'") === 0,
    "重新登录后仍残留本地标签版本或 outbox",
  );
  markedTagRepository.replaceUpstreamMirror(
    [tag(900, "runtime-upstream-tag")],
    MarkedTagMode.upstreamMirror,
    MutationOrigin.upstreamMirror,
  );
  requireCheck(
    markedTagRepository.clearForRelogin(MutationOrigin.localMaintenance) === 1,
    "syncMyTags 模式切换前没有清空网站镜像",
  );
  markedTagRepository.upsertLocalTag(tag(0, "runtime-local-rebuilt"), MarkedTagMode.localSync, MutationOrigin.user);
  const markedTagNames = markedTagRepository.queryMarkedTags().map((item) => item.name);
  requireCheck(markedTagNames.join(",") === "runtime-local-rebuilt", "标签模式切换后的本地重建路径不正确");

  const entityTypes = checkVersionAndOutboxLinkage(database);
  requireCheck(entityTypes === 7, "组合运行时没有覆盖预期的七种同步实体类型");
  const expected: V2RepositoryRuntimeExpectedState = {
    archiveGid: 502,
    historyId,
    bookmarkIds,
    markedUploaders,
    bannedUploaders: uploaderRepository.queryBannedUploaders(),
    markedTagNames,
  };
  verifyPersistedV2RepositoryRuntime(runtime, database, expected);
  return { seededObjects, entityTypes, expected };
}

export function verifyPersistedV2RepositoryRuntime(
  runtime: V2RepositoryRuntime,
  database: RepositoryDatabase,
  expected: V2RepositoryRuntimeExpectedState,
): void {
  requireCheck(
    runtime.archiveRepository.query({ fromPage: 0, toPage: 0, type: "all" }).length === 1,
    "重开后图库数量不正确",
  );
  requireCheck(runtime.archiveRepository.get(expected.archiveGid)?.last_read_page === 4, "重开后图库/阅读状态不完整");
  requireCheck(runtime.searchRepository.queryHistory()[0]?.id === expected.historyId, "重开后搜索历史不完整");
  requireCheck(
    runtime.searchRepository
      .queryBookmarks()
      .map((item) => String(item.id))
      .join(",") === expected.bookmarkIds.join(","),
    "重开后搜索书签或顺序不完整",
  );
  requireCheck(
    runtime.uploaderRepository.queryMarkedUploaders().join(",") === expected.markedUploaders.join(","),
    "重开后标记上传者不完整",
  );
  requireCheck(
    runtime.uploaderRepository.queryBannedUploaders().join(",") === expected.bannedUploaders.join(","),
    "重开后屏蔽上传者镜像不完整",
  );
  requireCheck(
    runtime.markedTagRepository
      .queryMarkedTags()
      .map((item) => item.name)
      .join(",") === expected.markedTagNames.join(","),
    "重开后标签模式数据不完整",
  );
  checkVersionAndOutboxLinkage(database);
}
