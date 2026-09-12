import type { EHGallery, EHListCompactItem, EHListExtendedItem } from "ehentai-parser";
import type { DBArchiveItem } from "../types";
import { dbManager, DatabaseStatement } from "./database";

export function allocateContentId(values: unknown[], usedIds: Set<string>): string {
  let id = $text.SHA256(JSON.stringify(values)).toLowerCase();
  while (usedIds.has(id)) id = $text.uuid.toLowerCase();
  usedIds.add(id);
  return id;
}

export function bookmarkPosition(index: number): string {
  return `v1:${index.toString(36).padStart(12, "0")}`;
}

export function getPendingDownloads(): { gid: number; length: number }[] {
  return dbManager.query(`SELECT CAST(a.id AS INTEGER) AS gid, a.length
    FROM archive_download_state_v2 AS d JOIN archive_entries_v2 AS a ON a.id = d.id
    WHERE a.deleted = 0 AND d.downloaded = 1 AND d.finished = 0`) as { gid: number; length: number }[];
}

export function archiveDeletionStatements(gid?: number): DatabaseStatement[] {
  const where = gid === undefined ? "" : " WHERE id = ?";
  const args = gid === undefined ? [] : [String(gid)];
  return [
    ...[
      "archive_entries_v2",
      "archive_read_state_v2",
      "archive_favorite_state_v2",
      "archive_rate_state_v2",
      "gallery_reader_config_v2",
    ].map((table) => ({ sql: `UPDATE ${table} SET deleted = 1${where}`, args })),
    { sql: `DELETE FROM archive_taglist_v2${where}`, args },
    { sql: `DELETE FROM archive_download_state_v2${where}`, args },
    {
      sql: `UPDATE favorite_images_v2 SET deleted = 1${gid === undefined ? "" : " WHERE gid = ?"}`,
      args: gid === undefined ? [] : [gid],
    },
  ];
}

export function storeArchiveRecord({
  infos,
  first_access_time,
  last_access_time,
  forceUpdate = false,
  readlater = false,
  downloaded = false,
  last_read_page = 0,
}: {
  infos: EHGallery | EHListExtendedItem | EHListCompactItem;
  first_access_time?: string;
  last_access_time?: string;
  forceUpdate?: boolean;
  readlater?: boolean;
  downloaded?: boolean;
  last_read_page?: number;
}): void {
  const id = String(infos.gid);
  if (!forceUpdate && dbManager.query("SELECT id FROM archive_entries_v2 WHERE id = ? AND deleted = 0", [id]).length)
    return;
  const full = !("type" in infos);
  const rating = full ? infos.display_rating : infos.estimated_display_rating;
  const now = new Date().toISOString();
  const data: Omit<DBArchiveItem, "gid" | "taglist"> = {
    token: infos.token,
    title: full ? infos.japanese_title || infos.english_title : infos.title,
    english_title: full ? infos.english_title : "",
    japanese_title: full ? infos.japanese_title : "",
    thumbnail_url: infos.thumbnail_url,
    category: infos.category,
    posted_time: infos.posted_time,
    visible: infos.visible,
    length: infos.length,
    torrent_available: full ? infos.torrent_count > 0 : infos.torrent_available,
    uploader: infos.uploader,
    disowned: infos.disowned,
    comment:
      full && infos.comments.length > 0 && infos.comments[0].is_uploader
        ? $text.HTMLUnescape(infos.comments[0].comment_div)
        : "",
    readlater,
    downloaded,
    first_access_time: first_access_time || now,
    last_access_time: last_access_time || now,
    last_read_page,
    rating,
    is_my_rating: infos.is_my_rating,
    favorited: infos.favorited,
    favcat: infos.favcat,
  };
  const fields = [
    "token",
    "title",
    "english_title",
    "japanese_title",
    "thumbnail_url",
    "category",
    "posted_time",
    "visible",
    "length",
    "torrent_available",
    "uploader",
    "disowned",
    "comment",
  ] as const;
  const statements: DatabaseStatement[] = [
    {
      sql: `INSERT INTO archive_entries_v2 (id, ${fields.join(",")}) VALUES (?, ${fields.map(() => "?").join(",")})
      ON CONFLICT(id) DO UPDATE SET deleted=0, ${fields.map((key) => `${key}=excluded.${key}`).join(",")}`,
      args: [id, ...fields.map((key) => data[key])],
    },
    {
      sql: `INSERT INTO archive_read_state_v2 (id, first_access_time, last_access_time, readlater, last_read_page) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET deleted=0, first_access_time=excluded.first_access_time,
      last_access_time=excluded.last_access_time, readlater=excluded.readlater, last_read_page=excluded.last_read_page`,
      args: [id, data.first_access_time, data.last_access_time, readlater, last_read_page],
    },
    {
      sql: `INSERT INTO archive_favorite_state_v2 (id, favorited, favcat) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET deleted=0, favorited=excluded.favorited, favcat=excluded.favcat`,
      args: [id, data.favorited, data.favcat],
    },
    {
      sql: `INSERT INTO archive_rate_state_v2 (id, average_rating, display_rating, is_my_rating) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET deleted=0, average_rating=excluded.average_rating,
      display_rating=excluded.display_rating, is_my_rating=excluded.is_my_rating`,
      args: [id, full ? infos.average_rating : rating, rating, data.is_my_rating],
    },
    {
      sql: `INSERT INTO archive_download_state_v2 (id, downloaded, finished) VALUES (?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET downloaded=excluded.downloaded`,
      args: [id, downloaded],
    },
    { sql: "DELETE FROM archive_taglist_v2 WHERE id = ?", args: [id] },
  ];
  for (const group of infos.taglist)
    for (const tag of group.tags)
      statements.push({
        sql: "INSERT INTO archive_taglist_v2 (id, namespace, tag) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
        args: [id, group.namespace, tag],
      });
  dbManager.transactionUpdate(statements);
}
