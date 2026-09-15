-- Read-only validation queries for the v1 -> v2 migration.
-- Every query in the "must be zero" section must return 0 before committing.

PRAGMA foreign_key_check;
PRAGMA integrity_check;

-- Must be zero: missing base archive rows (download-only parents are excluded).
SELECT COUNT(*) AS missing_archive_entries
FROM archives AS old
LEFT JOIN archive_entries_v2 AS migrated
  ON migrated.id = CAST(old.gid AS TEXT)
WHERE migrated.id IS NULL;

-- Must be zero: missing archive tags.
SELECT COUNT(*) AS missing_archive_tags
FROM archive_taglist AS old
JOIN archives AS source ON source.gid = old.gid
LEFT JOIN archive_taglist_v2 AS migrated
  ON migrated.id = CAST(old.gid AS TEXT)
 AND migrated.namespace = old.namespace
 AND migrated.tag = old.tag
WHERE migrated.id IS NULL;

-- Must be zero: missing archive state rows.
SELECT COUNT(*) AS missing_read_states
FROM archives AS old
LEFT JOIN archive_read_state_v2 AS migrated
  ON migrated.id = CAST(old.gid AS TEXT)
WHERE migrated.id IS NULL;

SELECT COUNT(*) AS missing_favorite_states
FROM archives AS old
LEFT JOIN archive_favorite_state_v2 AS migrated
  ON migrated.id = CAST(old.gid AS TEXT)
WHERE migrated.id IS NULL;

SELECT COUNT(*) AS missing_rate_states
FROM archives AS old
LEFT JOIN archive_rate_state_v2 AS migrated
  ON migrated.id = CAST(old.gid AS TEXT)
WHERE migrated.id IS NULL;

SELECT COUNT(*) AS missing_gallery_reader_configs
FROM gallery_reader_config AS old
JOIN archives AS source ON source.gid = old.gid
LEFT JOIN gallery_reader_config_v2 AS migrated
  ON migrated.id = CAST(old.gid AS TEXT)
WHERE migrated.id IS NULL;

-- Must be zero: every expected state is present. Orphan download_records are
-- intentionally excluded because v2 discards them.
SELECT COUNT(*) AS missing_download_states
FROM archives AS archive
LEFT JOIN archive_download_state_v2 AS migrated
  ON migrated.id = CAST(archive.gid AS TEXT)
WHERE (
    archive.downloaded = 1
    OR EXISTS (SELECT 1 FROM download_records AS record WHERE record.gid = archive.gid)
  )
  AND migrated.id IS NULL;

-- Must be zero: finished is 0 only for an explicit unfinished v1 task.
SELECT COUNT(*) AS incorrect_download_finished_values
FROM archive_download_state_v2 AS migrated
JOIN archives AS archive ON CAST(archive.gid AS TEXT) = migrated.id
LEFT JOIN download_records AS record ON record.gid = archive.gid
WHERE migrated.finished <> CASE WHEN record.finished = 0 THEN 0 ELSE 1 END;

-- Must be zero: no orphan or otherwise unexpected download state was created.
SELECT COUNT(*) AS unexpected_download_states
FROM archive_download_state_v2 AS migrated
LEFT JOIN archives AS archive ON archive.gid = CAST(migrated.id AS INTEGER)
  AND CAST(archive.gid AS TEXT) = migrated.id
WHERE archive.gid IS NULL
   OR NOT (
     archive.downloaded = 1
     OR EXISTS (SELECT 1 FROM download_records AS record WHERE record.gid = archive.gid)
   );

-- Must be zero: search parents or terms lost during migration.
SELECT COUNT(*) AS missing_search_histories
FROM search_history AS old
LEFT JOIN search_history_v2 AS migrated
  ON migrated.id = old.sorted_fsearch
WHERE old.sorted_fsearch IS NOT NULL
  AND migrated.id IS NULL;

SELECT
  (
    SELECT COUNT(*)
    FROM search_history_search_terms AS terms
    JOIN search_history AS history ON history.id = terms.search_history_id
    WHERE history.sorted_fsearch IS NOT NULL
  ) - (
    SELECT COUNT(*) FROM search_history_search_terms_v2
  ) AS search_term_count_difference;

-- Must be zero: deterministic-id entities missing from v2.
SELECT COUNT(*) AS missing_marked_uploaders
FROM marked_uploaders AS old
LEFT JOIN marked_uploaders_v2 AS migrated ON migrated.id = old.uploader
WHERE old.uploader IS NOT NULL
  AND migrated.id IS NULL;

SELECT COUNT(*) AS missing_downloaded_marked_tags
FROM marked_tags AS old
LEFT JOIN downloaded_marked_tags_v2 AS migrated
  ON migrated.namespace = old.namespace
 AND migrated.name = old.name
WHERE old.tagid IS NOT NULL AND old.tagid <> 0
  AND migrated.name IS NULL;

SELECT COUNT(*) AS missing_local_marked_tags
FROM marked_tags AS old
LEFT JOIN local_marked_tags_v2 AS migrated
  ON migrated.id = old.namespace || ':' || old.name
WHERE (old.tagid IS NULL OR old.tagid = 0)
  AND migrated.id IS NULL;

-- Must be zero: local tags must not be classified as downloaded tags.
SELECT COUNT(*) AS incorrectly_downloaded_local_tags
FROM marked_tags AS old
JOIN downloaded_marked_tags_v2 AS migrated
  ON migrated.namespace = old.namespace AND migrated.name = old.name
WHERE old.tagid IS NULL OR old.tagid = 0;

-- Must be zero: exactly one global reader configuration exists at id = '1'.
-- The TypeScript layer also compares its values with the decoded v1 config.
SELECT ABS(COUNT(*) - 1) AS global_reader_config_count_difference
FROM global_reader_config_v2;

SELECT ABS(COUNT(*) - 1) AS missing_global_reader_config
FROM global_reader_config_v2
WHERE id = '1';

SELECT COUNT(*) AS missing_tag_access_counts
FROM tag_access_count AS old
LEFT JOIN tag_access_count_v2 AS migrated
  ON migrated.id = json_extract((SELECT value FROM config WHERE key = '_sync_device_id'), '$') || ':' || old.qualifier || ':' || old.namespace || ':' || old.term
WHERE migrated.id IS NULL OR migrated.count <> COALESCE(old.count, 0) OR migrated.deleted <> 0;

SELECT COUNT(*) AS missing_favorite_images
FROM favorite_images AS old
JOIN archives AS source ON source.gid = old.gid
LEFT JOIN favorite_images_v2 AS migrated
  ON migrated.id = CAST(old.gid AS TEXT) || ':' || CAST(old.page_index AS TEXT)
WHERE migrated.id IS NULL;

-- Must be zero: no v2 gid-dependent row may exist without a source archive.
-- Probe the INTEGER PRIMARY KEY first; casting the source key alone makes each
-- migrated tag rescan all archives. The second predicate preserves canonical IDs.
SELECT COUNT(*) AS unexpected_orphan_archive_tags
FROM archive_taglist_v2 AS migrated
LEFT JOIN archives AS source ON source.gid = CAST(migrated.id AS INTEGER)
  AND CAST(source.gid AS TEXT) = migrated.id
WHERE source.gid IS NULL;

SELECT COUNT(*) AS unexpected_orphan_gallery_reader_configs
FROM gallery_reader_config_v2 AS migrated
LEFT JOIN archives AS source ON source.gid = CAST(migrated.id AS INTEGER)
  AND CAST(source.gid AS TEXT) = migrated.id
WHERE source.gid IS NULL;

SELECT COUNT(*) AS unexpected_orphan_favorite_images
FROM favorite_images_v2 AS migrated
LEFT JOIN archives AS source ON source.gid = migrated.gid
WHERE source.gid IS NULL;

-- Must be zero: every favorite image references its migrated archive parent.
SELECT COUNT(*) AS missing_favorite_image_parents
FROM favorite_images_v2 AS migrated
LEFT JOIN archive_entries_v2 AS parent
  ON parent.id = CAST(migrated.gid AS TEXT)
WHERE parent.id IS NULL;

-- Must be zero: entities migrated by the TypeScript layer.
SELECT
  (SELECT COUNT(*) FROM ai_translation_services) -
  (SELECT COUNT(*) FROM ai_translation_services_v2) AS ai_service_count_difference;

SELECT
  (SELECT COUNT(*) FROM webdav_services) -
  (SELECT COUNT(*) FROM webdav_services_v2) AS webdav_service_count_difference;

SELECT COUNT(*) AS missing_search_bookmarks
FROM search_bookmarks AS old
LEFT JOIN search_bookmarks_v2 AS migrated
  ON migrated.id = old.sorted_fsearch
WHERE old.sorted_fsearch IS NOT NULL
  AND migrated.id IS NULL;

SELECT
  (SELECT COUNT(*) FROM search_bookmarks_search_terms) -
  (SELECT COUNT(*) FROM search_bookmarks_search_terms_v2)
  AS search_bookmark_term_count_difference;
