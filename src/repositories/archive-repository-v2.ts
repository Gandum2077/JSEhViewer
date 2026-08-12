import { EHCategory, EHTagListItem, TagNamespace, tagNamespaces } from "ehentai-parser";
import { ArchiveSearchOptions, DBArchiveItem } from "../types";
import { SqliteTransactionContext, SqliteValue } from "../utils/sqlite-safe";
import { ArchiveMetadata, ArchiveStateUpdate, buildArchiveSearchSQLQuery } from "./archive-repository";
import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";
import { SyncEntityEnvelopeCodec } from "./sync-entity-envelope-codec";
import { RemoteApplyResult, RemoteSyncMutation, SyncMutationWriter, SyncVersion } from "./sync-mutation-writer";

export const ARCHIVE_ENTRY_ENTITY_TYPE = "archive.entry.v1";
export const READING_PROGRESS_ENTITY_TYPE = "reading.progress.v1";
export const READING_READ_LATER_ENTITY_TYPE = "reading.read-later.v1";

const ID_BATCH_SIZE = 400;
const EH_CATEGORIES: EHCategory[] = [
  "Doujinshi",
  "Manga",
  "Artist CG",
  "Game CG",
  "Western",
  "Non-H",
  "Image Set",
  "Cosplay",
  "Asian Porn",
  "Misc",
  "Private",
];

export interface ArchiveEntrySnapshotV1 {
  token: string;
  title: string;
  englishTitle: string;
  japaneseTitle: string;
  thumbnailUrl: string;
  category: EHCategory;
  postedTime: string;
  visible: boolean;
  rating: number;
  isMyRating: boolean;
  length: number;
  torrentAvailable: boolean;
  favorited: boolean;
  favcat: number | null;
  uploader: string | null;
  disowned: boolean;
  taglist: EHTagListItem[];
  comment: string;
  refreshedAt: string;
}

export interface ArchiveEntryPayloadV1 {
  format: 1;
  gid: number;
  entry: ArchiveEntrySnapshotV1 | null;
}

export interface ReadingProgressSnapshotV1 {
  token: string;
  firstAccessTime: string;
  lastAccessTime: string;
  lastReadPage: number;
}

export interface ReadingProgressPayloadV1 {
  format: 1;
  gid: number;
  progress: ReadingProgressSnapshotV1 | null;
}

export interface ReadingReadLaterPayloadV1 {
  format: 1;
  gid: number;
  readLater: boolean;
  token: string | null;
  addedAt: string | null;
}

export interface SeedExistingArchivesResult {
  archiveEntries: number;
  readingProgress: number;
  readLater: number;
}

export interface ApplyRemoteArchiveEntryResult extends RemoteApplyResult {
  gid: number;
  entryPresent: boolean;
}

export interface ApplyRemoteReadingProgressResult extends RemoteApplyResult {
  gid: number;
  progressPresent: boolean;
}

export interface ApplyRemoteReadLaterResult extends RemoteApplyResult {
  gid: number;
  readLater: boolean;
}

interface ArchiveEntryRow {
  gid: number;
  token: string | null;
  title: string | null;
  english_title: string | null;
  japanese_title: string | null;
  thumbnail_url: string | null;
  category: string | null;
  posted_time: string | null;
  visible: number;
  rating: number | null;
  is_my_rating: number;
  length: number | null;
  torrent_available: number;
  favorited: number;
  favcat: number | null;
  uploader: string | null;
  disowned: number;
  taglist_json: string;
  comment: string | null;
  refreshed_at: string;
}

interface ReadingStateRow {
  gid: number;
  token: string | null;
  first_access_time: string;
  last_access_time: string;
  readlater: number;
  last_read_page: number;
}

interface ArchiveItemDBRawData {
  gid: number;
  readlater: number;
  downloaded: number;
  first_access_time: string;
  last_access_time: string;
  token: string;
  title: string;
  english_title: string;
  japanese_title: string;
  thumbnail_url: string;
  category: string;
  posted_time: string;
  visible: number;
  rating: number;
  is_my_rating: number;
  length: number;
  torrent_available: number;
  favorited: number;
  favcat: number | null;
  uploader: string | null;
  disowned: number;
  taglist: string;
  comment: string;
  last_read_page: number;
}

const ARCHIVES_COMPATIBLE_CTE = `
  SELECT
    entries.gid AS gid,
    COALESCE(reading.readlater, 0) AS readlater,
    COALESCE(local.downloaded, 0) AS downloaded,
    COALESCE(reading.first_access_time, entries.refreshed_at) AS first_access_time,
    COALESCE(reading.last_access_time, entries.refreshed_at) AS last_access_time,
    COALESCE(reading.token, entries.token, '') AS token,
    COALESCE(entries.title, '') AS title,
    COALESCE(entries.english_title, '') AS english_title,
    COALESCE(entries.japanese_title, '') AS japanese_title,
    COALESCE(entries.thumbnail_url, '') AS thumbnail_url,
    COALESCE(entries.category, 'Misc') AS category,
    COALESCE(entries.posted_time, '') AS posted_time,
    entries.visible AS visible,
    COALESCE(entries.rating, 0) AS rating,
    entries.is_my_rating AS is_my_rating,
    COALESCE(entries.length, 0) AS length,
    entries.torrent_available AS torrent_available,
    entries.favorited AS favorited,
    entries.favcat AS favcat,
    entries.uploader AS uploader,
    entries.disowned AS disowned,
    entries.taglist_json AS taglist,
    COALESCE(entries.comment, '') AS comment,
    COALESCE(reading.last_read_page, 0) AS last_read_page
  FROM archive_entries AS entries
  LEFT JOIN reading_state AS reading ON reading.gid = entries.gid
  LEFT JOIN local_gallery_state AS local ON local.gid = entries.gid`;

function withArchivesCte(sql: string): string {
  return `WITH archives AS (${ARCHIVES_COMPATIBLE_CTE}) ${sql}`;
}

function requireGid(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("图库 gid 必须是正安全整数");
  }
  return value;
}

function requireString(value: unknown, name: string, allowEmpty = true): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`${name}必须是${allowEmpty ? "" : "非空"}字符串`);
  }
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name}必须是布尔值`);
  return value;
}

function requireFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name}必须是有限数字`);
  return value;
}

function requireNonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name}必须是非负安全整数`);
  }
  return value;
}

function requireCategory(value: unknown): EHCategory {
  if (typeof value !== "string" || !EH_CATEGORIES.includes(value as EHCategory)) {
    throw new Error("图库分类无效");
  }
  return value as EHCategory;
}

function requireFavcat(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 9) {
    throw new Error("图库收藏分类必须是 0 到 9 或 null");
  }
  return value;
}

function requireNullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  return requireString(value, name);
}

function normalizeTaglist(value: unknown): EHTagListItem[] {
  if (!Array.isArray(value)) throw new Error("图库标签列表必须是数组");
  return value.map((group, groupIndex) => {
    if (typeof group !== "object" || group === null || !("namespace" in group) || !("tags" in group)) {
      throw new Error(`图库第 ${groupIndex + 1} 个标签组格式无效`);
    }
    const namespace = (group as Record<string, unknown>).namespace;
    const tags = (group as Record<string, unknown>).tags;
    if (typeof namespace !== "string" || !tagNamespaces.includes(namespace as TagNamespace) || !Array.isArray(tags)) {
      throw new Error(`图库第 ${groupIndex + 1} 个标签组命名空间或 tags 无效`);
    }
    return {
      namespace: namespace as TagNamespace,
      tags: tags.map((tag, tagIndex) => requireString(tag, `图库第 ${groupIndex + 1} 组第 ${tagIndex + 1} 个标签`, false)),
    };
  });
}

function parseTaglistJson(value: string): EHTagListItem[] {
  try {
    return normalizeTaglist(JSON.parse(value));
  } catch (error) {
    if (error instanceof Error) throw new Error(`图库标签 JSON 无效：${error.message}`);
    throw error;
  }
}

function normalizeArchiveEntrySnapshot(value: unknown): ArchiveEntrySnapshotV1 {
  if (typeof value !== "object" || value === null) throw new Error("图库列表快照格式无效");
  const candidate = value as Record<string, unknown>;
  return {
    token: requireString(candidate.token, "图库 token"),
    title: requireString(candidate.title, "图库标题"),
    englishTitle: requireString(candidate.englishTitle, "图库英文标题"),
    japaneseTitle: requireString(candidate.japaneseTitle, "图库日文标题"),
    thumbnailUrl: requireString(candidate.thumbnailUrl, "图库缩略图 URL"),
    category: requireCategory(candidate.category),
    postedTime: requireString(candidate.postedTime, "图库发布时间"),
    visible: requireBoolean(candidate.visible, "图库 visible"),
    rating: requireFiniteNumber(candidate.rating, "图库评分"),
    isMyRating: requireBoolean(candidate.isMyRating, "图库 isMyRating"),
    length: requireNonNegativeInteger(candidate.length, "图库页数"),
    torrentAvailable: requireBoolean(candidate.torrentAvailable, "图库 torrentAvailable"),
    favorited: requireBoolean(candidate.favorited, "图库 favorited"),
    favcat: requireFavcat(candidate.favcat),
    uploader: requireNullableString(candidate.uploader, "图库上传者"),
    disowned: requireBoolean(candidate.disowned, "图库 disowned"),
    taglist: normalizeTaglist(candidate.taglist),
    comment: requireString(candidate.comment, "图库评论快照"),
    refreshedAt: requireString(candidate.refreshedAt, "图库快照刷新时间", false),
  };
}

function parseArchiveEntryPayload(value: unknown, deleted: boolean): ArchiveEntryPayloadV1 {
  if (typeof value !== "object" || value === null) throw new Error("图库列表同步 payload 格式无效");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== 1) throw new Error("图库列表同步 payload 版本无效");
  const gid = requireGid(candidate.gid);
  if (deleted) {
    if (candidate.entry !== null) throw new Error("图库列表 tombstone 不得携带完整快照");
    return { format: 1, gid, entry: null };
  }
  if (candidate.entry === null) throw new Error("图库列表 upsert 缺少快照");
  return { format: 1, gid, entry: normalizeArchiveEntrySnapshot(candidate.entry) };
}

function normalizeProgress(value: unknown): ReadingProgressSnapshotV1 {
  if (typeof value !== "object" || value === null) throw new Error("阅读进度格式无效");
  const candidate = value as Record<string, unknown>;
  return {
    token: requireString(candidate.token, "阅读进度 token"),
    firstAccessTime: requireString(candidate.firstAccessTime, "首次访问时间", false),
    lastAccessTime: requireString(candidate.lastAccessTime, "最后访问时间", false),
    lastReadPage: requireNonNegativeInteger(candidate.lastReadPage, "最后阅读页码"),
  };
}

function parseProgressPayload(value: unknown, deleted: boolean): ReadingProgressPayloadV1 {
  if (typeof value !== "object" || value === null) throw new Error("阅读进度同步 payload 格式无效");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== 1) throw new Error("阅读进度同步 payload 版本无效");
  const gid = requireGid(candidate.gid);
  if (deleted) {
    if (candidate.progress !== null) throw new Error("阅读进度 tombstone 不得携带完整状态");
    return { format: 1, gid, progress: null };
  }
  if (candidate.progress === null) throw new Error("阅读进度 upsert 缺少状态");
  return { format: 1, gid, progress: normalizeProgress(candidate.progress) };
}

function parseReadLaterPayload(value: unknown, deleted: boolean): ReadingReadLaterPayloadV1 {
  if (typeof value !== "object" || value === null) throw new Error("稍后阅读同步 payload 格式无效");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== 1) throw new Error("稍后阅读同步 payload 版本无效");
  const gid = requireGid(candidate.gid);
  const readLater = requireBoolean(candidate.readLater, "稍后阅读 readLater");
  if (readLater === deleted) throw new Error("稍后阅读 payload 与 tombstone 标志不一致");
  const token = requireNullableString(candidate.token, "稍后阅读 token");
  const addedAt = requireNullableString(candidate.addedAt, "稍后阅读加入时间");
  if (!deleted && (token === null || addedAt === null || addedAt.length === 0)) {
    throw new Error("稍后阅读 membership 缺少 token 或加入时间");
  }
  return { format: 1, gid, readLater, token, addedAt };
}

function archivePayloadFromItem(item: DBArchiveItem, refreshedAt: string): ArchiveEntryPayloadV1 {
  requireGid(item.gid);
  return {
    format: 1,
    gid: item.gid,
    entry: normalizeArchiveEntrySnapshot({
      token: item.token,
      title: item.title,
      englishTitle: item.english_title,
      japaneseTitle: item.japanese_title,
      thumbnailUrl: item.thumbnail_url,
      category: item.category,
      postedTime: item.posted_time,
      visible: item.visible,
      rating: item.rating,
      isMyRating: item.is_my_rating,
      length: item.length,
      torrentAvailable: item.torrent_available,
      favorited: item.favorited,
      favcat: item.favcat ?? null,
      uploader: item.uploader ?? null,
      disowned: item.disowned,
      taglist: item.taglist,
      comment: item.comment,
      refreshedAt,
    }),
  };
}

function archivePayloadFromRow(row: ArchiveEntryRow): ArchiveEntryPayloadV1 {
  return {
    format: 1,
    gid: requireGid(Number(row.gid)),
    entry: normalizeArchiveEntrySnapshot({
      token: row.token ?? "",
      title: row.title ?? "",
      englishTitle: row.english_title ?? "",
      japaneseTitle: row.japanese_title ?? "",
      thumbnailUrl: row.thumbnail_url ?? "",
      category: row.category ?? "Misc",
      postedTime: row.posted_time ?? "",
      visible: row.visible === 1,
      rating: Number(row.rating ?? 0),
      isMyRating: row.is_my_rating === 1,
      length: Number(row.length ?? 0),
      torrentAvailable: row.torrent_available === 1,
      favorited: row.favorited === 1,
      favcat: row.favcat,
      uploader: row.uploader,
      disowned: row.disowned === 1,
      taglist: parseTaglistJson(row.taglist_json),
      comment: row.comment ?? "",
      refreshedAt: row.refreshed_at,
    }),
  };
}

function progressPayloadFromRow(row: ReadingStateRow): ReadingProgressPayloadV1 {
  return {
    format: 1,
    gid: requireGid(Number(row.gid)),
    progress: normalizeProgress({
      token: row.token ?? "",
      firstAccessTime: row.first_access_time,
      lastAccessTime: row.last_access_time,
      lastReadPage: Number(row.last_read_page),
    }),
  };
}

function readLaterPayloadFromRow(row: ReadingStateRow): ReadingReadLaterPayloadV1 {
  const readLater = row.readlater === 1;
  return {
    format: 1,
    gid: requireGid(Number(row.gid)),
    readLater,
    token: readLater ? row.token ?? "" : null,
    addedAt: readLater ? row.first_access_time : null,
  };
}

function mapArchiveRow(row: ArchiveItemDBRawData): DBArchiveItem {
  return {
    gid: Number(row.gid),
    readlater: Boolean(row.readlater),
    downloaded: Boolean(row.downloaded),
    first_access_time: row.first_access_time,
    last_access_time: row.last_access_time,
    token: row.token,
    title: row.title,
    english_title: row.english_title,
    japanese_title: row.japanese_title,
    thumbnail_url: row.thumbnail_url,
    category: row.category as EHCategory,
    posted_time: row.posted_time,
    visible: Boolean(row.visible),
    rating: Number(row.rating),
    is_my_rating: Boolean(row.is_my_rating),
    length: Number(row.length),
    torrent_available: Boolean(row.torrent_available),
    favorited: Boolean(row.favorited),
    favcat: row.favcat === null ? undefined : (row.favcat as DBArchiveItem["favcat"]),
    uploader: row.uploader ?? undefined,
    disowned: Boolean(row.disowned),
    taglist: parseTaglistJson(row.taglist),
    comment: row.comment,
    last_read_page: Number(row.last_read_page),
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asVersion(mutation: RemoteSyncMutation): SyncVersion {
  return {
    objectKey: mutation.objectKey,
    entityType: mutation.entityType,
    wallMs: mutation.wallMs,
    logicalCounter: mutation.logicalCounter,
    deviceId: mutation.deviceId,
    deleted: mutation.deleted,
    opId: mutation.opId,
  };
}

function writeArchiveEntry(transaction: SqliteTransactionContext, payload: ArchiveEntryPayloadV1): void {
  if (!payload.entry) throw new Error("不能把图库 tombstone 写入业务表");
  const entry = payload.entry;
  transaction.update(
    `INSERT INTO archive_entries (
       gid, token, title, english_title, japanese_title, thumbnail_url, category, posted_time,
       visible, rating, is_my_rating, length, torrent_available, favorited, favcat, uploader,
       disowned, taglist_json, comment, refreshed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(gid) DO UPDATE SET
       token = excluded.token,
       title = excluded.title,
       english_title = excluded.english_title,
       japanese_title = excluded.japanese_title,
       thumbnail_url = excluded.thumbnail_url,
       category = excluded.category,
       posted_time = excluded.posted_time,
       visible = excluded.visible,
       rating = excluded.rating,
       is_my_rating = excluded.is_my_rating,
       length = excluded.length,
       torrent_available = excluded.torrent_available,
       favorited = excluded.favorited,
       favcat = excluded.favcat,
       uploader = excluded.uploader,
       disowned = excluded.disowned,
       taglist_json = excluded.taglist_json,
       comment = excluded.comment,
       refreshed_at = excluded.refreshed_at`,
    [
      payload.gid,
      entry.token,
      entry.title,
      entry.englishTitle,
      entry.japaneseTitle,
      entry.thumbnailUrl,
      entry.category,
      entry.postedTime,
      entry.visible,
      entry.rating,
      entry.isMyRating,
      entry.length,
      entry.torrentAvailable,
      entry.favorited,
      entry.favcat,
      entry.uploader,
      entry.disowned,
      JSON.stringify(entry.taglist),
      entry.comment,
      entry.refreshedAt,
    ],
    "写入 v2 图库列表快照",
  );
  transaction.update("DELETE FROM archive_taglist WHERE gid = ?", [payload.gid], "重建 v2 图库标签索引");
  for (const group of entry.taglist) {
    for (const tag of group.tags) {
      transaction.update(
        "INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)",
        [payload.gid, group.namespace, tag],
        "写入 v2 图库标签索引",
      );
    }
  }
}

function writeReadingState(transaction: SqliteTransactionContext, row: ReadingStateRow): void {
  transaction.update(
    `INSERT INTO reading_state
     (gid, token, first_access_time, last_access_time, readlater, last_read_page)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(gid) DO UPDATE SET
       token = excluded.token,
       first_access_time = excluded.first_access_time,
       last_access_time = excluded.last_access_time,
       readlater = excluded.readlater,
       last_read_page = excluded.last_read_page`,
    [row.gid, row.token, row.first_access_time, row.last_access_time, row.readlater, row.last_read_page],
    "写入 v2 阅读状态",
  );
}

function writeLocalGalleryState(
  transaction: SqliteTransactionContext,
  gid: number,
  downloaded: boolean,
  downloadedAt: string,
): void {
  transaction.update(
    `INSERT INTO local_gallery_state (gid, downloaded, downloaded_at)
     VALUES (?, ?, ?)
     ON CONFLICT(gid) DO UPDATE SET
       downloaded = excluded.downloaded,
       downloaded_at = CASE
         WHEN excluded.downloaded = 0 THEN NULL
         ELSE COALESCE(local_gallery_state.downloaded_at, excluded.downloaded_at)
       END`,
    [gid, downloaded, downloaded ? downloadedAt : null],
    "写入本机下载状态",
  );
}

function requireUserOrigin(origin: MutationOrigin, operation: string): void {
  requireMutationOrigin(origin);
  if (origin !== MutationOrigin.user) throw new Error(`${operation}只接受 user 来源`);
}

export class V2ArchiveRepository {
  constructor(
    private readonly database: RepositoryDatabase,
    private readonly syncWriter: SyncMutationWriter,
    private readonly codec: SyncEntityEnvelopeCodec,
    private readonly nowIso: () => string = () => new Date().toISOString(),
  ) {}

  count(options: ArchiveSearchOptions): number {
    const { sql, args } = buildArchiveSearchSQLQuery(options, true);
    return Number((this.database.query(withArchivesCte(sql), args) as { total: number }[])[0]?.total ?? 0);
  }

  query(options: ArchiveSearchOptions): DBArchiveItem[] {
    const { sql, args } = buildArchiveSearchSQLQuery(options);
    return (this.database.query(withArchivesCte(sql), args) as ArchiveItemDBRawData[]).map(mapArchiveRow);
  }

  queryGids(options: ArchiveSearchOptions): number[] {
    const { sql, args } = buildArchiveSearchSQLQuery(options, false, true);
    return (this.database.query(withArchivesCte(sql), args) as { gid: number }[]).map((row) => Number(row.gid));
  }

  get(gid: number): DBArchiveItem | undefined {
    requireGid(gid);
    const rows = this.database.query(withArchivesCte("SELECT * FROM archives WHERE gid = ?"), [
      gid,
    ]) as ArchiveItemDBRawData[];
    return rows[0] ? mapArchiveRow(rows[0]) : undefined;
  }

  getLastReadPage(gid: number): number {
    requireGid(gid);
    const row = this.database.query("SELECT last_read_page FROM reading_state WHERE gid = ?", [gid])[0] as
      | { last_read_page: number }
      | undefined;
    return Number(row?.last_read_page ?? 0);
  }

  save(item: DBArchiveItem, origin: MutationOrigin, replaceExisting = false): boolean {
    requireUserOrigin(origin, "v2 图库保存");
    requireGid(item.gid);
    return this.database.transaction((transaction) => {
      const existingEntry = this.readArchiveEntry(transaction, item.gid);
      if (existingEntry && !replaceExisting) return false;
      const existingReading = this.readReadingState(transaction, item.gid);
      const refreshedAt = requireString(this.nowIso(), "图库快照刷新时间", false);
      const entryPayload = archivePayloadFromItem(item, refreshedAt);
      const progressPayload: ReadingProgressPayloadV1 = {
        format: 1,
        gid: item.gid,
        progress: normalizeProgress({
          token: item.token,
          firstAccessTime: item.first_access_time,
          lastAccessTime: item.last_access_time,
          lastReadPage: item.last_read_page,
        }),
      };
      const readLaterPayload: ReadingReadLaterPayloadV1 = item.readlater
        ? {
            format: 1,
            gid: item.gid,
            readLater: true,
            token: item.token,
            addedAt: item.first_access_time,
          }
        : { format: 1, gid: item.gid, readLater: false, token: null, addedAt: null };

      writeArchiveEntry(transaction, entryPayload);
      writeReadingState(transaction, {
        gid: item.gid,
        token: item.token,
        first_access_time: item.first_access_time,
        last_access_time: item.last_access_time,
        readlater: item.readlater ? 1 : 0,
        last_read_page: item.last_read_page,
      });
      writeLocalGalleryState(transaction, item.gid, item.downloaded, refreshedAt);

      if (
        !this.hasVersion(transaction, ARCHIVE_ENTRY_ENTITY_TYPE, item.gid) ||
        !existingEntry ||
        !sameValue(archivePayloadFromRow(existingEntry), entryPayload)
      ) {
        this.recordArchiveEntry(transaction, entryPayload, MutationOrigin.user);
      }
      if (
        !this.hasVersion(transaction, READING_PROGRESS_ENTITY_TYPE, item.gid) ||
        !existingReading ||
        !sameValue(progressPayloadFromRow(existingReading), progressPayload)
      ) {
        this.recordReadingProgress(transaction, progressPayload, MutationOrigin.user);
      }
      if (
        !this.hasVersion(transaction, READING_READ_LATER_ENTITY_TYPE, item.gid) ||
        !existingReading ||
        !sameValue(readLaterPayloadFromRow(existingReading), readLaterPayload)
      ) {
        this.recordReadLater(transaction, readLaterPayload, MutationOrigin.user, !readLaterPayload.readLater);
      }
      return true;
    }, `原子保存 v2 图库 ${item.gid} 与同步对象`);
  }

  update(gid: number, update: ArchiveStateUpdate, origin: MutationOrigin): void {
    requireGid(gid);
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.user && origin !== MutationOrigin.localMaintenance) {
      throw new Error("v2 图库更新只接受 user 或 localMaintenance 来源");
    }
    const hasSyncUpdate =
      update.readlater !== undefined ||
      update.last_read_page !== undefined ||
      update.last_access_time !== undefined ||
      update.my_rating !== undefined ||
      update.favorite_info !== undefined;
    if (origin === MutationOrigin.localMaintenance && hasSyncUpdate) {
      throw new Error("本机维护只能更新 downloaded，不能制造图库同步变更");
    }
    this.database.transaction((transaction) => {
      const entryRow = this.readArchiveEntry(transaction, gid);
      const readingRow = this.readReadingState(transaction, gid);
      if (!entryRow && !readingRow) throw new Error(`找不到 v2 图库 ${gid}`);

      if (update.downloaded !== undefined) {
        writeLocalGalleryState(transaction, gid, update.downloaded, requireString(this.nowIso(), "下载时间", false));
      }

      if (update.my_rating !== undefined || update.favorite_info !== undefined) {
        if (!entryRow) throw new Error("找不到要更新上游状态快照的图库列表项");
        const current = archivePayloadFromRow(entryRow);
        if (!current.entry) throw new Error("图库列表快照缺失");
        const next: ArchiveEntryPayloadV1 = {
          ...current,
          entry: {
            ...current.entry,
            rating: update.my_rating ?? current.entry.rating,
            isMyRating: update.my_rating === undefined ? current.entry.isMyRating : true,
            favorited: update.favorite_info ? update.favorite_info.favorited : current.entry.favorited,
            favcat:
              update.favorite_info?.favorited === true ? update.favorite_info.favcat : current.entry.favcat,
            refreshedAt: requireString(this.nowIso(), "图库快照刷新时间", false),
          },
        };
        if (!this.hasVersion(transaction, ARCHIVE_ENTRY_ENTITY_TYPE, gid) || !sameValue(current, next)) {
          writeArchiveEntry(transaction, next);
          this.recordArchiveEntry(transaction, next, MutationOrigin.user);
        }
      }

      if (update.readlater !== undefined || update.last_read_page !== undefined || update.last_access_time !== undefined) {
        const fallbackTime = entryRow?.refreshed_at ?? requireString(this.nowIso(), "阅读状态时间", false);
        const current: ReadingStateRow = readingRow ?? {
          gid,
          token: entryRow?.token ?? "",
          first_access_time: fallbackTime,
          last_access_time: fallbackTime,
          readlater: 0,
          last_read_page: 0,
        };
        const next: ReadingStateRow = {
          ...current,
          readlater: update.readlater === undefined ? current.readlater : update.readlater ? 1 : 0,
          last_read_page: update.last_read_page ?? current.last_read_page,
          last_access_time: update.last_access_time ?? current.last_access_time,
        };
        requireNonNegativeInteger(next.last_read_page, "最后阅读页码");
        writeReadingState(transaction, next);
        const currentProgress = progressPayloadFromRow(current);
        const nextProgress = progressPayloadFromRow(next);
        if (
          (update.last_read_page !== undefined || update.last_access_time !== undefined) &&
          (!this.hasVersion(transaction, READING_PROGRESS_ENTITY_TYPE, gid) ||
            !sameValue(currentProgress, nextProgress))
        ) {
          this.recordReadingProgress(transaction, nextProgress, MutationOrigin.user);
        }
        const currentReadLater = readLaterPayloadFromRow(current);
        const nextReadLater = readLaterPayloadFromRow(next);
        if (
          update.readlater !== undefined &&
          (!this.hasVersion(transaction, READING_READ_LATER_ENTITY_TYPE, gid) ||
            !sameValue(currentReadLater, nextReadLater))
        ) {
          this.recordReadLater(transaction, nextReadLater, MutationOrigin.user, !nextReadLater.readLater);
        }
      }
    }, `原子更新 v2 图库 ${gid}`);
  }

  seedExistingArchives(): SeedExistingArchivesResult {
    return this.database.transaction((transaction) => {
      const result: SeedExistingArchivesResult = { archiveEntries: 0, readingProgress: 0, readLater: 0 };
      for (const row of transaction.query<ArchiveEntryRow>("SELECT * FROM archive_entries ORDER BY gid")) {
        const payload = archivePayloadFromRow(row);
        if (!this.hasVersion(transaction, ARCHIVE_ENTRY_ENTITY_TYPE, payload.gid)) {
          this.recordArchiveEntry(transaction, payload, MutationOrigin.migrationSeed);
          result.archiveEntries += 1;
        }
      }
      for (const row of transaction.query<ReadingStateRow>("SELECT * FROM reading_state ORDER BY gid")) {
        const progress = progressPayloadFromRow(row);
        if (!this.hasVersion(transaction, READING_PROGRESS_ENTITY_TYPE, progress.gid)) {
          this.recordReadingProgress(transaction, progress, MutationOrigin.migrationSeed);
          result.readingProgress += 1;
        }
        const readLater = readLaterPayloadFromRow(row);
        if (!this.hasVersion(transaction, READING_READ_LATER_ENTITY_TYPE, readLater.gid)) {
          this.recordReadLater(transaction, readLater, MutationOrigin.migrationSeed, !readLater.readLater);
          result.readLater += 1;
        }
      }
      return result;
    }, "seed v2 图库列表与阅读状态同步对象");
  }

  applyRemoteArchiveEntry(mutation: RemoteSyncMutation): ApplyRemoteArchiveEntryResult {
    this.requireEntityType(mutation, ARCHIVE_ENTRY_ENTITY_TYPE);
    const payload = parseArchiveEntryPayload(
      this.codec.decodeEnvelope(ARCHIVE_ENTRY_ENTITY_TYPE, mutation.envelopeJson, asVersion(mutation)),
      mutation.deleted,
    );
    this.requireObjectKey(mutation, ARCHIVE_ENTRY_ENTITY_TYPE, payload.gid);
    return this.database.transaction((transaction) => {
      const result = this.syncWriter.applyRemoteMutation(transaction, mutation, (businessTransaction) => {
        if (mutation.deleted) {
          businessTransaction.update("DELETE FROM archive_entries WHERE gid = ?", [payload.gid]);
        } else {
          writeArchiveEntry(businessTransaction, payload);
        }
      });
      const entryPresent = Boolean(
        transaction.query<{ found: number }>("SELECT 1 AS found FROM archive_entries WHERE gid = ? LIMIT 1", [
          payload.gid,
        ])[0],
      );
      return { ...result, gid: payload.gid, entryPresent };
    }, "原子应用远端 archive entry change");
  }

  applyRemoteReadingProgress(mutation: RemoteSyncMutation): ApplyRemoteReadingProgressResult {
    this.requireEntityType(mutation, READING_PROGRESS_ENTITY_TYPE);
    const payload = parseProgressPayload(
      this.codec.decodeEnvelope(READING_PROGRESS_ENTITY_TYPE, mutation.envelopeJson, asVersion(mutation)),
      mutation.deleted,
    );
    this.requireObjectKey(mutation, READING_PROGRESS_ENTITY_TYPE, payload.gid);
    return this.database.transaction((transaction) => {
      const result = this.syncWriter.applyRemoteMutation(transaction, mutation, (businessTransaction) => {
        if (mutation.deleted) {
          businessTransaction.update("UPDATE reading_state SET last_read_page = 0 WHERE gid = ?", [payload.gid]);
          return;
        }
        if (!payload.progress) throw new Error("远端阅读进度缺少业务状态");
        const existing = this.readReadingState(businessTransaction, payload.gid);
        writeReadingState(businessTransaction, {
          gid: payload.gid,
          token: payload.progress.token,
          first_access_time: payload.progress.firstAccessTime,
          last_access_time: payload.progress.lastAccessTime,
          readlater: existing?.readlater ?? 0,
          last_read_page: payload.progress.lastReadPage,
        });
      });
      if (result.applied && mutation.deleted) this.pruneReadingState(transaction, payload.gid);
      return {
        ...result,
        gid: payload.gid,
        progressPresent: this.hasLiveVersion(transaction, READING_PROGRESS_ENTITY_TYPE, payload.gid),
      };
    }, "原子应用远端 reading progress change");
  }

  applyRemoteReadLater(mutation: RemoteSyncMutation): ApplyRemoteReadLaterResult {
    this.requireEntityType(mutation, READING_READ_LATER_ENTITY_TYPE);
    const payload = parseReadLaterPayload(
      this.codec.decodeEnvelope(READING_READ_LATER_ENTITY_TYPE, mutation.envelopeJson, asVersion(mutation)),
      mutation.deleted,
    );
    this.requireObjectKey(mutation, READING_READ_LATER_ENTITY_TYPE, payload.gid);
    return this.database.transaction((transaction) => {
      const result = this.syncWriter.applyRemoteMutation(transaction, mutation, (businessTransaction) => {
        const existing = this.readReadingState(businessTransaction, payload.gid);
        if (mutation.deleted) {
          if (existing) {
            businessTransaction.update("UPDATE reading_state SET readlater = 0 WHERE gid = ?", [payload.gid]);
          }
          return;
        }
        if (payload.token === null || payload.addedAt === null) throw new Error("稍后阅读 membership 缺少业务状态");
        writeReadingState(businessTransaction, {
          gid: payload.gid,
          token: existing?.token || payload.token,
          first_access_time: existing?.first_access_time ?? payload.addedAt,
          last_access_time: existing?.last_access_time ?? payload.addedAt,
          readlater: 1,
          last_read_page: existing?.last_read_page ?? 0,
        });
      });
      if (result.applied && mutation.deleted) this.pruneReadingState(transaction, payload.gid);
      const row = this.readReadingState(transaction, payload.gid);
      return { ...result, gid: payload.gid, readLater: row?.readlater === 1 };
    }, "原子应用远端 reading read-later change");
  }

  findOldRemovableGids(before: string): number[] {
    requireString(before, "旧记录清理时间", false);
    return (
      this.database.query(
        `SELECT entries.gid
         FROM archive_entries AS entries
         LEFT JOIN reading_state AS reading ON reading.gid = entries.gid
         LEFT JOIN local_gallery_state AS local ON local.gid = entries.gid
         WHERE COALESCE(reading.last_access_time, entries.refreshed_at) < ?
           AND COALESCE(local.downloaded, 0) <> 1
           AND NOT EXISTS (SELECT 1 FROM favorite_images AS images WHERE images.gid = entries.gid)
         ORDER BY entries.gid`,
        [before],
      ) as { gid: number }[]
    ).map((row) => Number(row.gid));
  }

  listDownloadedGids(): number[] {
    return (
      this.database.query("SELECT gid FROM local_gallery_state WHERE downloaded = 1 ORDER BY gid") as { gid: number }[]
    ).map((row) => Number(row.gid));
  }

  delete(gid: number, origin: MutationOrigin, deleteReaderConfig = false): void {
    this.deleteMany([gid], origin, deleteReaderConfig);
  }

  deleteMany(gids: number[], origin: MutationOrigin, deleteReaderConfig = false): void {
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.user && origin !== MutationOrigin.localMaintenance) {
      throw new Error("v2 图库删除只接受 user 或 localMaintenance 来源");
    }
    if (gids.length === 0) return;
    const uniqueGids = [...new Set(gids.map(requireGid))];
    this.database.transaction((transaction) => {
      for (const gid of uniqueGids) {
        const entry = this.readArchiveEntry(transaction, gid);
        const reading = this.readReadingState(transaction, gid);
        transaction.update("DELETE FROM archive_entries WHERE gid = ?", [gid]);
        transaction.update("DELETE FROM reading_state WHERE gid = ?", [gid]);
        transaction.update("DELETE FROM local_gallery_state WHERE gid = ?", [gid]);
        if (deleteReaderConfig) transaction.update("DELETE FROM gallery_reader_config WHERE gid = ?", [gid]);
        if (origin === MutationOrigin.user) {
          // 用户删除的是整个图库记录。只要任一业务部分存在，就为三个独立实体都写新 tombstone，
          // 防止本设备尚未取得的旧进度或 read-later 对象稍后把记录复活。
          if (entry || reading) {
            this.recordArchiveEntry(transaction, { format: 1, gid, entry: null }, MutationOrigin.user, true);
            this.recordReadingProgress(
              transaction,
              { format: 1, gid, progress: null },
              MutationOrigin.user,
              true,
            );
            this.recordReadLater(
              transaction,
              { format: 1, gid, readLater: false, token: null, addedAt: null },
              MutationOrigin.user,
              true,
            );
          }
        } else {
          this.discardAllGalleryObjects(transaction, gid);
        }
      }
    }, origin === MutationOrigin.user ? "原子删除 v2 图库并写入 tombstone" : "本机维护删除 v2 图库");
  }

  clearAllLocalData(origin: MutationOrigin): void {
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.localMaintenance) throw new Error("清除全部图库数据必须是本机维护操作");
    this.database.transaction((transaction) => {
      transaction.update("DELETE FROM favorite_images");
      transaction.update("DELETE FROM gallery_reader_config");
      transaction.update("DELETE FROM archive_entries");
      transaction.update("DELETE FROM reading_state");
      transaction.update("DELETE FROM local_gallery_state");
      transaction.update("DELETE FROM download_records");
      for (const entityType of [
        ARCHIVE_ENTRY_ENTITY_TYPE,
        READING_PROGRESS_ENTITY_TYPE,
        READING_READ_LATER_ENTITY_TYPE,
      ]) {
        transaction.update("DELETE FROM sync_versions WHERE entity_type = ?", [entityType]);
      }
    }, "本机清除全部 v2 图库数据与待同步状态");
  }

  getMetadataByGids(gids: number[]): Map<number, ArchiveMetadata> {
    if (!gids.length) return new Map();
    const normalizedGids = [...new Set(gids.map(requireGid))];
    const rows: (ArchiveMetadata & { gid: number })[] = [];
    for (let index = 0; index < normalizedGids.length; index += ID_BATCH_SIZE) {
      const batch = normalizedGids.slice(index, index + ID_BATCH_SIZE);
      rows.push(
        ...(this.database.query(
          `SELECT gid, COALESCE(token, '') AS token, COALESCE(length, 0) AS length,
             COALESCE(NULLIF(japanese_title, ''), NULLIF(english_title, ''), NULLIF(title, ''), '') AS title
           FROM archive_entries WHERE gid IN (${batch.map(() => "?").join(", ")})`,
          batch,
        ) as (ArchiveMetadata & { gid: number })[]),
      );
    }
    return new Map(rows.map(({ gid, ...metadata }) => [Number(gid), metadata]));
  }

  private readArchiveEntry(transaction: SqliteTransactionContext, gid: number): ArchiveEntryRow | undefined {
    return transaction.query<ArchiveEntryRow>("SELECT * FROM archive_entries WHERE gid = ?", [gid])[0];
  }

  private readReadingState(transaction: SqliteTransactionContext, gid: number): ReadingStateRow | undefined {
    return transaction.query<ReadingStateRow>("SELECT * FROM reading_state WHERE gid = ?", [gid])[0];
  }

  private objectKey(entityType: string, gid: number): string {
    return this.codec.deriveObjectKey(entityType, String(requireGid(gid)));
  }

  private hasVersion(transaction: SqliteTransactionContext, entityType: string, gid: number): boolean {
    return Boolean(
      transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM sync_versions WHERE object_key = ? AND entity_type = ? LIMIT 1",
        [this.objectKey(entityType, gid), entityType],
      )[0],
    );
  }

  private hasLiveVersion(transaction: SqliteTransactionContext, entityType: string, gid: number): boolean {
    return Boolean(
      transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM sync_versions WHERE object_key = ? AND entity_type = ? AND deleted = 0 LIMIT 1",
        [this.objectKey(entityType, gid), entityType],
      )[0],
    );
  }

  private requireEntityType(mutation: RemoteSyncMutation, expected: string): void {
    if (mutation.entityType !== expected) throw new Error(`远端 change 的 entity type 不是 ${expected}`);
  }

  private requireObjectKey(mutation: RemoteSyncMutation, entityType: string, gid: number): void {
    if (mutation.objectKey !== this.objectKey(entityType, gid)) {
      throw new Error(`${entityType} payload 与 object key 不匹配`);
    }
  }

  private recordArchiveEntry(
    transaction: SqliteTransactionContext,
    payload: ArchiveEntryPayloadV1,
    origin: typeof MutationOrigin.user | typeof MutationOrigin.migrationSeed,
    deleted = false,
  ): SyncVersion {
    return this.recordLocal(transaction, ARCHIVE_ENTRY_ENTITY_TYPE, payload.gid, payload, origin, deleted);
  }

  private recordReadingProgress(
    transaction: SqliteTransactionContext,
    payload: ReadingProgressPayloadV1,
    origin: typeof MutationOrigin.user | typeof MutationOrigin.migrationSeed,
    deleted = false,
  ): SyncVersion {
    return this.recordLocal(transaction, READING_PROGRESS_ENTITY_TYPE, payload.gid, payload, origin, deleted);
  }

  private recordReadLater(
    transaction: SqliteTransactionContext,
    payload: ReadingReadLaterPayloadV1,
    origin: typeof MutationOrigin.user | typeof MutationOrigin.migrationSeed,
    deleted: boolean,
  ): SyncVersion {
    return this.recordLocal(transaction, READING_READ_LATER_ENTITY_TYPE, payload.gid, payload, origin, deleted);
  }

  private recordLocal(
    transaction: SqliteTransactionContext,
    entityType: string,
    gid: number,
    payload: unknown,
    origin: typeof MutationOrigin.user | typeof MutationOrigin.migrationSeed,
    deleted: boolean,
  ): SyncVersion {
    return this.syncWriter.recordLocalMutation(transaction, {
      origin,
      objectKey: this.objectKey(entityType, gid),
      entityType,
      deleted,
      createEnvelopeJson: (version) => this.codec.encodeEnvelope(entityType, payload, version),
    });
  }

  private discardAllGalleryObjects(transaction: SqliteTransactionContext, gid: number): void {
    for (const entityType of [
      ARCHIVE_ENTRY_ENTITY_TYPE,
      READING_PROGRESS_ENTITY_TYPE,
      READING_READ_LATER_ENTITY_TYPE,
    ]) {
      this.syncWriter.discardLocalObject(transaction, {
        origin: MutationOrigin.localMaintenance,
        objectKey: this.objectKey(entityType, gid),
      });
    }
  }

  private pruneReadingState(transaction: SqliteTransactionContext, gid: number): void {
    const progressLive = this.hasLiveVersion(transaction, READING_PROGRESS_ENTITY_TYPE, gid);
    const readLaterLive = this.hasLiveVersion(transaction, READING_READ_LATER_ENTITY_TYPE, gid);
    if (!progressLive && !readLaterLive) transaction.update("DELETE FROM reading_state WHERE gid = ?", [gid]);
  }
}
