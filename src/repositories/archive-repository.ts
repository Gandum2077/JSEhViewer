import { EHCategory, EHQualifier, EHTagListItem } from "ehentai-parser";
import { ArchiveSearchOptions, DBArchiveItem } from "../types";
import { SqliteTransactionContext, SqliteValue } from "../utils/sqlite-safe";
import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";

interface ArchiveRepositoryDatabase {
  query(sql: string, args?: SqliteValue[]): Record<string, any>[];
  transaction<T>(callback: (transaction: SqliteTransactionContext) => T, operation?: string): T;
}

type ArchiveItemDBRawData = {
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
  favcat?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  uploader?: string;
  disowned: number;
  taglist: string | null;
  comment: string;
  last_read_page: number;
};

export interface ArchiveStateUpdate {
  readlater?: boolean;
  downloaded?: boolean;
  last_read_page?: number;
  last_access_time?: string;
  my_rating?: number;
  favorite_info?: { favorited: false } | { favorited: true; favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}

export interface ArchiveMetadata {
  token: string;
  length: number;
  title: string;
}

function mapArchiveRow(row: ArchiveItemDBRawData): DBArchiveItem {
  return {
    gid: row.gid,
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
    rating: row.rating,
    is_my_rating: Boolean(row.is_my_rating),
    length: row.length,
    torrent_available: Boolean(row.torrent_available),
    favorited: Boolean(row.favorited),
    favcat: row.favcat ?? undefined,
    uploader: row.uploader,
    disowned: Boolean(row.disowned),
    taglist: JSON.parse(row.taglist || "[]") as EHTagListItem[],
    comment: row.comment,
    last_read_page: row.last_read_page,
  };
}

export function buildArchiveSearchSQLQuery(
  options: ArchiveSearchOptions,
  countOnly = false,
  gidOnly = false,
): { sql: string; args: SqliteValue[] } {
  const {
    fromPage,
    toPage,
    pageSize,
    type,
    sort,
    searchTerms,
    excludedCategories,
    minimumPages,
    maximumPages,
    minimumRating,
  } = options;

  let sql = countOnly
    ? "SELECT COUNT(*) AS total FROM archives"
    : gidOnly
      ? "SELECT archives.gid FROM archives"
      : "SELECT archives.* FROM archives";
  const conditions: string[] = [];
  const args: SqliteValue[] = [];

  if (type === "readlater") conditions.push("readlater = 1");
  if (type === "downloaded") conditions.push("downloaded = 1");
  if (excludedCategories?.length) {
    conditions.push(`category NOT IN (${excludedCategories.map(() => "?").join(", ")})`);
    args.push(...excludedCategories);
  }
  if (minimumPages !== undefined) {
    conditions.push("length >= ?");
    args.push(minimumPages);
  }
  if (maximumPages !== undefined) {
    conditions.push("length <= ?");
    args.push(maximumPages);
  }
  if (minimumRating !== undefined) {
    conditions.push("rating >= ?");
    args.push(minimumRating);
  }

  if (searchTerms?.length) {
    const specialQualifiers: EHQualifier[] = ["uploader", "title", "gid", "comment"];
    const specialTerms = searchTerms.filter((term) => term.qualifier && specialQualifiers.includes(term.qualifier));
    const tagTerms = searchTerms.filter((term) => !term.qualifier || !specialQualifiers.includes(term.qualifier));

    for (const term of specialTerms) {
      switch (term.qualifier) {
        case "uploader":
          conditions.push(term.subtract ? "uploader <> ? COLLATE NOCASE" : "uploader = ? COLLATE NOCASE");
          args.push(term.term);
          break;
        case "title": {
          conditions.push(
            term.subtract
              ? "(title NOT LIKE ? AND english_title NOT LIKE ? AND japanese_title NOT LIKE ?)"
              : "(title LIKE ? OR english_title LIKE ? OR japanese_title LIKE ?)",
          );
          const value = `%${term.term}%`;
          args.push(value, value, value);
          break;
        }
        case "gid":
          conditions.push(term.subtract ? "gid <> ?" : "gid = ?");
          args.push(Number(term.term));
          break;
        case "comment":
          conditions.push(term.subtract ? "comment NOT LIKE ?" : "comment LIKE ?");
          args.push(`%${term.term}%`);
          break;
      }
    }

    for (const term of tagTerms.filter((item) => !item.qualifier && !item.namespace && !item.tilde)) {
      conditions.push("(title LIKE ? OR english_title LIKE ? OR japanese_title LIKE ? OR taglist LIKE ?)");
      const value = `%${term.term}%`;
      args.push(value, value, value, value);
    }

    const requiredTagConditions: string[] = [];
    const alternativeTagConditions: string[] = [];
    const addTagCondition = (target: string[], term: (typeof searchTerms)[number]) => {
      if (term.namespace && term.dollar) {
        target.push("(namespace = ? AND tag = ?)");
        args.push(term.namespace, term.term);
      } else if (term.namespace) {
        target.push("(namespace = ? AND tag LIKE ?)");
        args.push(term.namespace, `${term.term}%`);
      } else if (term.dollar) {
        target.push("(tag = ?)");
        args.push(term.term);
      } else {
        target.push("(tag LIKE ?)");
        args.push(`${term.term}%`);
      }
    };

    tagTerms
      .filter((term) => (!term.tilde && term.qualifier === "tag") || term.namespace)
      .forEach((term) => addTagCondition(requiredTagConditions, term));
    tagTerms.filter((term) => term.tilde).forEach((term) => addTagCondition(alternativeTagConditions, term));

    if (requiredTagConditions.length && alternativeTagConditions.length) {
      conditions.push(`gid IN (
        SELECT DISTINCT gid FROM archive_taglist
        WHERE ${requiredTagConditions.join(" OR ")}
          AND gid IN (
            SELECT DISTINCT gid FROM archive_taglist
            WHERE ${alternativeTagConditions.join(" OR ")}
          )
        GROUP BY gid
        HAVING COUNT(*) = ${requiredTagConditions.length}
      )`);
    } else if (requiredTagConditions.length) {
      conditions.push(`gid IN (
        SELECT DISTINCT gid FROM archive_taglist
        WHERE ${requiredTagConditions.join(" OR ")}
        GROUP BY gid
        HAVING COUNT(*) = ${requiredTagConditions.length}
      )`);
    } else if (alternativeTagConditions.length) {
      conditions.push(`gid IN (
        SELECT DISTINCT gid FROM archive_taglist
        WHERE ${alternativeTagConditions.join(" OR ")}
      )`);
    }
  }

  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  if (!countOnly && !gidOnly) {
    sql += ` ORDER BY ${sort || "first_access_time"} DESC`;
    const actualPageSize = pageSize || 50;
    sql += " LIMIT ? OFFSET ?";
    args.push((toPage - fromPage + 1) * actualPageSize, fromPage * actualPageSize);
  }
  return { sql, args };
}

const ARCHIVE_COLUMNS = [
  "gid",
  "readlater",
  "downloaded",
  "first_access_time",
  "last_access_time",
  "token",
  "title",
  "english_title",
  "japanese_title",
  "thumbnail_url",
  "category",
  "posted_time",
  "visible",
  "rating",
  "is_my_rating",
  "length",
  "torrent_available",
  "favorited",
  "favcat",
  "uploader",
  "disowned",
  "taglist",
  "comment",
  "last_read_page",
] as const;

function archiveValues(item: DBArchiveItem): SqliteValue[] {
  return [
    item.gid,
    item.readlater,
    item.downloaded,
    item.first_access_time,
    item.last_access_time,
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
    item.last_read_page,
  ];
}

export class ArchiveRepository {
  constructor(private readonly database: ArchiveRepositoryDatabase) {}

  count(options: ArchiveSearchOptions): number {
    const { sql, args } = buildArchiveSearchSQLQuery(options, true);
    const rows = this.database.query(sql, args) as { total: number }[];
    return rows[0]?.total ?? 0;
  }

  query(options: ArchiveSearchOptions): DBArchiveItem[] {
    const { sql, args } = buildArchiveSearchSQLQuery(options);
    return (this.database.query(sql, args) as ArchiveItemDBRawData[]).map(mapArchiveRow);
  }

  queryGids(options: ArchiveSearchOptions): number[] {
    const { sql, args } = buildArchiveSearchSQLQuery(options, false, true);
    return (this.database.query(sql, args) as { gid: number }[]).map((row) => row.gid);
  }

  get(gid: number): DBArchiveItem | undefined {
    const rows = this.database.query("SELECT * FROM archives WHERE gid = ?", [gid]) as ArchiveItemDBRawData[];
    return rows.length ? mapArchiveRow(rows[0]) : undefined;
  }

  getLastReadPage(gid: number): number {
    const rows = this.database.query("SELECT last_read_page FROM archives WHERE gid = ?", [gid]) as {
      last_read_page: number;
    }[];
    return rows[0]?.last_read_page ?? 0;
  }

  save(item: DBArchiveItem, origin: MutationOrigin, replaceExisting = false): boolean {
    requireMutationOrigin(origin);
    return this.database.transaction((transaction) => {
      const exists =
        transaction.query<{ gid: number }>("SELECT gid FROM archives WHERE gid = ?", [item.gid]).length > 0;
      if (exists && !replaceExisting) return false;

      const placeholders = ARCHIVE_COLUMNS.map(() => "?").join(", ");
      const updates = ARCHIVE_COLUMNS.filter((column) => column !== "gid")
        .map((column) => `${column} = excluded.${column}`)
        .join(", ");
      transaction.update(
        `INSERT INTO archives (${ARCHIVE_COLUMNS.join(", ")}) VALUES (${placeholders})
           ON CONFLICT(gid) DO UPDATE SET ${updates}`,
        archiveValues(item),
        "保存图库列表记录",
      );
      transaction.update("DELETE FROM archive_taglist WHERE gid = ?", [item.gid], "重建图库标签索引");
      for (const group of item.taglist) {
        for (const tag of group.tags) {
          transaction.update(
            "INSERT INTO archive_taglist (gid, namespace, tag) VALUES (?, ?, ?)",
            [item.gid, group.namespace, tag],
            "写入图库标签索引",
          );
        }
      }
      return true;
    }, `保存图库 ${item.gid}`);
  }

  update(gid: number, update: ArchiveStateUpdate, origin: MutationOrigin): void {
    requireMutationOrigin(origin);
    this.database.transaction((transaction) => {
      if (update.readlater !== undefined)
        transaction.update("UPDATE archives SET readlater = ? WHERE gid = ?", [update.readlater, gid]);
      if (update.downloaded !== undefined)
        transaction.update("UPDATE archives SET downloaded = ? WHERE gid = ?", [update.downloaded, gid]);
      if (update.last_read_page !== undefined)
        transaction.update("UPDATE archives SET last_read_page = ? WHERE gid = ?", [update.last_read_page, gid]);
      if (update.last_access_time !== undefined)
        transaction.update("UPDATE archives SET last_access_time = ? WHERE gid = ?", [update.last_access_time, gid]);
      if (update.my_rating !== undefined)
        transaction.update("UPDATE archives SET is_my_rating = 1, rating = ? WHERE gid = ?", [update.my_rating, gid]);
      if (update.favorite_info?.favorited) {
        transaction.update("UPDATE archives SET favorited = 1, favcat = ? WHERE gid = ?", [
          update.favorite_info.favcat,
          gid,
        ]);
      } else if (update.favorite_info) {
        transaction.update("UPDATE archives SET favorited = 0 WHERE gid = ?", [gid]);
      }
    }, `更新图库 ${gid}`);
  }

  findOldRemovableGids(before: string): number[] {
    const rows = this.database.query(
      `SELECT a.gid FROM archives a
       WHERE a.last_access_time < ?
         AND COALESCE(a.downloaded, 0) <> 1
         AND NOT EXISTS (SELECT 1 FROM favorite_images f WHERE f.gid = a.gid)`,
      [before],
    ) as { gid: number }[];
    return rows.map((row) => row.gid);
  }

  listDownloadedGids(): number[] {
    return (this.database.query("SELECT gid FROM archives WHERE downloaded = 1") as { gid: number }[]).map(
      (row) => row.gid,
    );
  }

  delete(gid: number, origin: MutationOrigin, deleteReaderConfig = false): void {
    this.deleteMany([gid], origin, deleteReaderConfig);
  }

  deleteMany(gids: number[], origin: MutationOrigin, deleteReaderConfig = false): void {
    requireMutationOrigin(origin);
    if (!gids.length) return;
    this.database.transaction((transaction) => {
      for (const gid of gids) {
        transaction.update("DELETE FROM archive_taglist WHERE gid = ?", [gid]);
        if (deleteReaderConfig) transaction.update("DELETE FROM gallery_reader_config WHERE gid = ?", [gid]);
        transaction.update("DELETE FROM archives WHERE gid = ?", [gid]);
      }
    }, "删除图库列表记录");
  }

  clearAllLocalData(origin: MutationOrigin): void {
    requireMutationOrigin(origin);
    this.database.transaction((transaction) => {
      transaction.update("DELETE FROM favorite_images");
      transaction.update("DELETE FROM archive_taglist");
      transaction.update("DELETE FROM gallery_reader_config");
      transaction.update("DELETE FROM archives");
      transaction.update("DELETE FROM download_records");
    }, "清除图库相关本机数据");
  }

  getMetadataByGids(gids: number[]): Map<number, ArchiveMetadata> {
    if (!gids.length) return new Map();
    const rows = this.database.query(
      `SELECT gid, COALESCE(token, '') AS token, COALESCE(length, 0) AS length,
        COALESCE(NULLIF(japanese_title, ''), NULLIF(english_title, ''), NULLIF(title, ''), '') AS title
       FROM archives WHERE gid IN (${gids.map(() => "?").join(", ")})`,
      gids,
    ) as (ArchiveMetadata & { gid: number })[];
    return new Map(rows.map(({ gid, ...metadata }) => [gid, metadata]));
  }
}
