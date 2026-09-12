-- Run only after successful validation, inside the migration transaction.
DROP INDEX IF EXISTS idx_ai_translation_services_single_selected;
DROP TRIGGER IF EXISTS enforce_webdav_services_single_enabled;
DROP TABLE IF EXISTS archives;
DROP TABLE IF EXISTS archive_taglist;
DROP TABLE IF EXISTS ai_translation_services;
DROP TABLE IF EXISTS webdav_services;
DROP TABLE IF EXISTS marked_tags;
DROP TABLE IF EXISTS marked_uploaders;
DROP TABLE IF EXISTS search_history;
DROP TABLE IF EXISTS search_history_search_terms;
DROP TABLE IF EXISTS search_bookmarks;
DROP TABLE IF EXISTS search_bookmarks_search_terms;
DROP TABLE IF EXISTS tag_access_count;
DROP TABLE IF EXISTS download_records;
DROP TABLE IF EXISTS gallery_reader_config;
DROP TABLE IF EXISTS favorite_images;
