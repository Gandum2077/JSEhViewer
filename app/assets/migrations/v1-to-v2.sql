-- v1 -> v2 deterministic data migration
--
-- Preconditions:
--   1. db-v2.sql has already been executed on this connection.
--   2. PRAGMA foreign_keys is enabled on this connection.
--   3. The caller has started a transaction.
--   4. ai_translation_services, webdav_services, search_bookmarks and global
--      reader settings are migrated by the TypeScript orchestration layer.
--      Their identifiers, position keys and JSON config need application logic.
--
-- This file intentionally does not BEGIN, COMMIT, change user_version, or
-- remove v1 tables. Those operations belong to the orchestration layer so a
-- failed validation can roll the entire migration back.

-- Base archive records. CAST(gid AS TEXT) is the canonical v2 archive id.
INSERT INTO archive_entries_v2 (
  id,
  sync_version,
  deleted,
  token,
  title,
  english_title,
  japanese_title,
  thumbnail_url,
  category,
  posted_time,
  visible,
  length,
  torrent_available,
  uploader,
  disowned,
  comment
)
SELECT
  CAST(gid AS TEXT),
  0,
  0,
  token,
  title,
  english_title,
  japanese_title,
  thumbnail_url,
  category,
  posted_time,
  COALESCE(visible, 1),
  length,
  COALESCE(torrent_available, 0),
  uploader,
  COALESCE(disowned, 0),
  comment
FROM archives
WHERE 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO archive_taglist_v2 (id, namespace, tag)
SELECT CAST(tag.gid AS TEXT), tag.namespace, tag.tag
FROM archive_taglist AS tag
JOIN archive_entries_v2 AS archive
  ON archive.id = CAST(tag.gid AS TEXT)
WHERE 1
ON CONFLICT (id, namespace, tag) DO NOTHING;

-- Empty strings preserve the distinction "unknown legacy timestamp" without
-- inventing a time. The application may later choose a richer representation.
INSERT INTO archive_read_state_v2 (
  id,
  sync_version,
  deleted,
  first_access_time,
  last_access_time,
  readlater,
  last_read_page
)
SELECT
  CAST(gid AS TEXT),
  0,
  0,
  COALESCE(first_access_time, ''),
  COALESCE(last_access_time, ''),
  CASE WHEN readlater = 1 THEN 1 ELSE 0 END,
  MAX(COALESCE(last_read_page, 0), 0)
FROM archives
WHERE 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO archive_favorite_state_v2 (
  id,
  sync_version,
  deleted,
  favorited,
  favcat
)
SELECT
  CAST(gid AS TEXT),
  0,
  0,
  CASE WHEN favorited = 1 THEN 1 ELSE 0 END,
  favcat
FROM archives
WHERE 1
ON CONFLICT (id) DO NOTHING;

-- v1 has only one rating value. Preserve it in both v2 display fields until
-- the application can refresh average_rating from the remote gallery data.
INSERT INTO archive_rate_state_v2 (
  id,
  sync_version,
  deleted,
  average_rating,
  display_rating,
  is_my_rating
)
SELECT
  CAST(gid AS TEXT),
  0,
  0,
  COALESCE(rating, 0),
  COALESCE(rating, 0),
  CASE WHEN is_my_rating = 1 THEN 1 ELSE 0 END
FROM archives
WHERE 1
ON CONFLICT (id) DO NOTHING;

-- Migrate only download states backed by an archives row. A state remains
-- unfinished only when v1 has an explicit download_records.finished = 0 row;
-- every other migrated state is considered finished. v1 has no reliable
-- downloaded_at value, so it remains NULL.
INSERT INTO archive_download_state_v2 (
  id,
  downloaded,
  finished,
  downloaded_at
)
SELECT
  CAST(a.gid AS TEXT),
  CASE WHEN a.downloaded = 1 THEN 1 ELSE 0 END,
  CASE WHEN d.finished = 0 THEN 0 ELSE 1 END,
  NULL
FROM archives AS a
LEFT JOIN download_records AS d ON d.gid = a.gid
WHERE a.downloaded = 1 OR d.gid IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO gallery_reader_config_v2 (
  id,
  sync_version,
  deleted,
  pageDirection,
  spreadModeEnabled,
  skipFirstPageInSpread,
  skipLandscapePagesInSpread,
  pagingGesture
)
SELECT
  CAST(config.gid AS TEXT),
  0,
  0,
  COALESCE(pageDirection, 'left_to_right'),
  CASE WHEN spreadModeEnabled = 1 THEN 1 ELSE 0 END,
  CASE WHEN skipFirstPageInSpread = 1 THEN 1 ELSE 0 END,
  CASE WHEN skipLandscapePagesInSpread = 1 THEN 1 ELSE 0 END,
  COALESCE(pagingGesture, 'tap_and_swipe')
FROM gallery_reader_config AS config
JOIN archive_entries_v2 AS archive
  ON archive.id = CAST(config.gid AS TEXT)
WHERE 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO search_history_v2 (
  id,
  sync_version,
  deleted,
  last_access_time
)
SELECT sorted_fsearch, 0, 0, COALESCE(last_access_time, '')
FROM search_history
WHERE sorted_fsearch IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- v1 has no explicit term order. rowid is the best available representation
-- of insertion order and is made zero-based for v2.
INSERT INTO search_history_search_terms_v2 (
  history_id,
  term_index,
  namespace,
  qualifier,
  term,
  dollar,
  subtract,
  tilde
)
SELECT
  h.sorted_fsearch,
  ROW_NUMBER() OVER (
    PARTITION BY t.search_history_id
    ORDER BY t.rowid
  ) - 1,
  t.namespace,
  t.qualifier,
  t.term,
  CASE WHEN t.dollar = 1 THEN 1 ELSE 0 END,
  CASE WHEN t.subtract = 1 THEN 1 ELSE 0 END,
  CASE WHEN t.tilde = 1 THEN 1 ELSE 0 END
FROM search_history_search_terms AS t
JOIN search_history AS h ON h.id = t.search_history_id
WHERE h.sorted_fsearch IS NOT NULL
ON CONFLICT (history_id, term_index) DO NOTHING;

-- tagid is the only v1 field that distinguishes downloaded tags from local
-- tags. v1 creates local tags with tagid = 0; NULL is also treated as local.
INSERT INTO downloaded_marked_tags_v2 (
  tagid,
  namespace,
  name,
  watched,
  hidden,
  color,
  weight
)
SELECT tagid, namespace, name, watched, hidden, color, weight
FROM marked_tags
WHERE tagid IS NOT NULL AND tagid <> 0
ON CONFLICT (namespace, name) DO NOTHING;

INSERT INTO local_marked_tags_v2 (
  id,
  sync_version,
  deleted,
  namespace,
  name,
  watched,
  hidden,
  color,
  weight
)
SELECT
  namespace || ':' || name,
  0,
  0,
  namespace,
  name,
  watched,
  hidden,
  color,
  weight
FROM marked_tags
WHERE tagid IS NULL OR tagid = 0
ON CONFLICT (id) DO NOTHING;

INSERT INTO marked_uploaders_v2 (id, sync_version, deleted)
SELECT uploader, 0, 0
FROM marked_uploaders
WHERE uploader IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO tag_access_count_v2 (
  id,
  sync_version,
  deleted,
  namespace,
  qualifier,
  term,
  count
)
SELECT
  qualifier || ':' || namespace || ':' || term,
  0,
  0,
  namespace,
  qualifier,
  term,
  COALESCE(count, 0)
FROM tag_access_count
WHERE 1
ON CONFLICT (id) DO NOTHING;

-- Parent archives must be migrated first: gid references archive_entries_v2.id
-- with ON DELETE CASCADE. Discard legacy favorites without a source archive,
-- matching the policy for other archive-dependent rows.
INSERT INTO favorite_images_v2 (
  id,
  sync_version,
  deleted,
  gid,
  page_index,
  favorited_at
)
SELECT
  CAST(image.gid AS TEXT) || ':' || CAST(image.page_index AS TEXT),
  0,
  0,
  image.gid,
  image.page_index,
  image.favorited_at
FROM favorite_images AS image
JOIN archives AS source ON source.gid = image.gid
JOIN archive_entries_v2 AS archive
  ON archive.id = CAST(image.gid AS TEXT)
WHERE 1
ON CONFLICT (id) DO NOTHING;
