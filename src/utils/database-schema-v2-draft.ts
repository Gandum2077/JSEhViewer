import type { DatabaseSchemaStatement } from "./database-initialization";

/**
 * DB v2 的可执行草案。
 *
 * 该数组暂时不接入 initializeDatabase，也不会修改正式 database.db。
 * 评审与迁移 fixture 通过后，才会成为 CURRENT_SCHEMA_STATEMENTS。
 */
export const DATABASE_V2_DRAFT_USER_VERSION = 2;

export const DATABASE_V2_UNCHANGED_SCHEMA_OBJECTS = [
  "config",
  "ai_translation_services",
  "idx_ai_translation_services_single_selected",
  "webdav_services",
  "translation_data",
  "marked_tags",
  "favcat_titles",
  "tag_access_count",
  "download_records",
  "gallery_reader_config",
  "favorite_images",
  "enforce_webdav_services_single_enabled_insert",
  "enforce_webdav_services_single_enabled_update",
] as const;

export const DATABASE_V2_DRAFT_SCHEMA_STATEMENTS: DatabaseSchemaStatement[] = [
  {
    name: "archive_entries",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS archive_entries (
      gid INTEGER PRIMARY KEY,
      token TEXT,
      title TEXT,
      english_title TEXT,
      japanese_title TEXT,
      thumbnail_url TEXT,
      category TEXT,
      posted_time TEXT,
      visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
      rating REAL,
      is_my_rating INTEGER NOT NULL DEFAULT 0 CHECK (is_my_rating IN (0, 1)),
      length INTEGER,
      torrent_available INTEGER NOT NULL DEFAULT 0 CHECK (torrent_available IN (0, 1)),
      favorited INTEGER NOT NULL DEFAULT 0 CHECK (favorited IN (0, 1)),
      favcat INTEGER,
      uploader TEXT,
      disowned INTEGER NOT NULL DEFAULT 0 CHECK (disowned IN (0, 1)),
      taglist_json TEXT NOT NULL DEFAULT '[]',
      comment TEXT,
      refreshed_at TEXT NOT NULL
    )`,
  },
  {
    name: "idx_archive_entries_posted_time",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_archive_entries_posted_time
      ON archive_entries(posted_time DESC, gid DESC)`,
  },
  {
    name: "reading_state",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS reading_state (
      gid INTEGER PRIMARY KEY,
      token TEXT,
      first_access_time TEXT NOT NULL,
      last_access_time TEXT NOT NULL,
      readlater INTEGER NOT NULL DEFAULT 0 CHECK (readlater IN (0, 1)),
      last_read_page INTEGER NOT NULL DEFAULT 0 CHECK (last_read_page >= 0)
    )`,
  },
  {
    name: "idx_reading_state_last_access_time",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_reading_state_last_access_time
      ON reading_state(last_access_time DESC, gid DESC)`,
  },
  {
    name: "idx_reading_state_readlater",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_reading_state_readlater
      ON reading_state(readlater, last_access_time DESC)`,
  },
  {
    name: "local_gallery_state",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS local_gallery_state (
      gid INTEGER PRIMARY KEY,
      downloaded INTEGER NOT NULL DEFAULT 0 CHECK (downloaded IN (0, 1)),
      downloaded_at TEXT
    )`,
  },
  {
    name: "idx_local_gallery_state_downloaded",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_local_gallery_state_downloaded
      ON local_gallery_state(downloaded, gid)`,
  },
  {
    name: "archive_taglist",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS archive_taglist (
      gid INTEGER NOT NULL,
      namespace TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (gid, namespace, tag),
      FOREIGN KEY (gid) REFERENCES archive_entries(gid) ON DELETE CASCADE
    )`,
  },
  {
    name: "config",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
  },
  {
    name: "ai_translation_services",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS ai_translation_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      script_text TEXT NOT NULL,
      config_form TEXT,
      config TEXT
    )`,
  },
  {
    name: "idx_ai_translation_services_single_selected",
    type: "index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_translation_services_single_selected
      ON ai_translation_services(selected)
      WHERE selected = 1`,
  },
  {
    name: "webdav_services",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS webdav_services (
      name TEXT,
      host TEXT,
      port INTEGER,
      https INTEGER,
      path TEXT,
      username TEXT,
      password TEXT,
      enabled INTEGER
    )`,
  },
  {
    name: "translation_data",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS translation_data (
      namespace TEXT NOT NULL,
      name TEXT NOT NULL,
      translation TEXT,
      intro TEXT,
      links TEXT,
      UNIQUE(namespace, name)
    )`,
  },
  {
    name: "marked_tags",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS marked_tags (
      tagid INTEGER,
      namespace TEXT NOT NULL,
      name TEXT NOT NULL,
      watched INTEGER,
      hidden INTEGER,
      color TEXT,
      weight INTEGER,
      UNIQUE(namespace, name)
    )`,
  },
  {
    name: "marked_uploaders",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS marked_uploaders (
      uploader TEXT PRIMARY KEY NOT NULL
    )`,
  },
  {
    name: "banned_uploaders",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS banned_uploaders (
      uploader TEXT PRIMARY KEY NOT NULL
    )`,
  },
  {
    name: "favcat_titles",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS favcat_titles (
      favcat INTEGER PRIMARY KEY CHECK (favcat >= 0 AND favcat <= 9),
      title TEXT
    )`,
  },
  {
    name: "search_history",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS search_history (
      history_id TEXT PRIMARY KEY NOT NULL,
      last_access_time TEXT NOT NULL,
      sorted_fsearch TEXT NOT NULL UNIQUE
    )`,
  },
  {
    name: "idx_search_history_last_access_time",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_search_history_last_access_time
      ON search_history(last_access_time DESC, history_id)`,
  },
  {
    name: "search_history_search_terms",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS search_history_search_terms (
      history_id TEXT NOT NULL,
      term_index INTEGER NOT NULL CHECK (term_index >= 0),
      namespace TEXT,
      qualifier TEXT,
      term TEXT NOT NULL,
      dollar INTEGER NOT NULL DEFAULT 0 CHECK (dollar IN (0, 1)),
      subtract INTEGER NOT NULL DEFAULT 0 CHECK (subtract IN (0, 1)),
      tilde INTEGER NOT NULL DEFAULT 0 CHECK (tilde IN (0, 1)),
      PRIMARY KEY (history_id, term_index),
      FOREIGN KEY (history_id) REFERENCES search_history(history_id) ON DELETE CASCADE
    )`,
  },
  {
    name: "search_bookmarks",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS search_bookmarks (
      bookmark_id TEXT PRIMARY KEY NOT NULL,
      position_key TEXT NOT NULL,
      sorted_fsearch TEXT NOT NULL UNIQUE
    )`,
  },
  {
    name: "idx_search_bookmarks_position",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_search_bookmarks_position
      ON search_bookmarks(position_key, bookmark_id)`,
  },
  {
    name: "search_bookmarks_search_terms",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS search_bookmarks_search_terms (
      bookmark_id TEXT NOT NULL,
      term_index INTEGER NOT NULL CHECK (term_index >= 0),
      namespace TEXT,
      qualifier TEXT,
      term TEXT NOT NULL,
      dollar INTEGER NOT NULL DEFAULT 0 CHECK (dollar IN (0, 1)),
      subtract INTEGER NOT NULL DEFAULT 0 CHECK (subtract IN (0, 1)),
      tilde INTEGER NOT NULL DEFAULT 0 CHECK (tilde IN (0, 1)),
      PRIMARY KEY (bookmark_id, term_index),
      FOREIGN KEY (bookmark_id) REFERENCES search_bookmarks(bookmark_id) ON DELETE CASCADE
    )`,
  },
  {
    name: "tag_access_count",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS tag_access_count (
      namespace TEXT NOT NULL DEFAULT '',
      qualifier TEXT NOT NULL DEFAULT '',
      term TEXT NOT NULL DEFAULT '',
      count INTEGER,
      UNIQUE(namespace, qualifier, term)
    )`,
  },
  {
    name: "download_records",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS download_records (
      gid INTEGER PRIMARY KEY,
      length INTEGER NOT NULL,
      finished INTEGER
    )`,
  },
  {
    name: "gallery_reader_config",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS gallery_reader_config (
      gid INTEGER PRIMARY KEY,
      pageDirection TEXT CHECK (pageDirection IN ('left_to_right', 'right_to_left', 'vertical')),
      spreadModeEnabled INTEGER CHECK (spreadModeEnabled IN (0, 1)),
      skipFirstPageInSpread INTEGER CHECK (skipFirstPageInSpread IN (0, 1)),
      skipLandscapePagesInSpread INTEGER CHECK (skipLandscapePagesInSpread IN (0, 1)),
      pagingGesture TEXT CHECK (pagingGesture IN ('tap_and_swipe', 'swipe', 'tap'))
    )`,
  },
  {
    name: "favorite_images",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS favorite_images (
      gid INTEGER NOT NULL,
      page_index INTEGER NOT NULL,
      favorited_at TEXT NOT NULL,
      PRIMARY KEY (gid, page_index)
    )`,
  },
  {
    name: "sync_profile",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS sync_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      endpoint TEXT NOT NULL,
      device_id TEXT NOT NULL,
      profile_epoch TEXT NOT NULL,
      cursor INTEGER NOT NULL DEFAULT 0 CHECK (cursor >= 0),
      protocol INTEGER NOT NULL CHECK (protocol >= 1),
      key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version >= 1),
      last_success_at TEXT,
      last_error_code TEXT
    )`,
  },
  {
    name: "sync_clock",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS sync_clock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      wall_ms INTEGER NOT NULL DEFAULT 0 CHECK (wall_ms >= 0),
      logical_counter INTEGER NOT NULL DEFAULT 0 CHECK (logical_counter >= 0)
    )`,
  },
  {
    name: "sync_versions",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS sync_versions (
      object_key TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      wall_ms INTEGER NOT NULL CHECK (wall_ms >= 0),
      logical_counter INTEGER NOT NULL CHECK (logical_counter >= 0),
      device_id TEXT NOT NULL,
      deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
      last_op_id TEXT NOT NULL
    )`,
  },
  {
    name: "idx_sync_versions_entity_type",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_sync_versions_entity_type
      ON sync_versions(entity_type, object_key)`,
  },
  {
    name: "sync_outbox",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS sync_outbox (
      op_id TEXT PRIMARY KEY,
      object_key TEXT NOT NULL UNIQUE,
      wall_ms INTEGER NOT NULL CHECK (wall_ms >= 0),
      logical_counter INTEGER NOT NULL CHECK (logical_counter >= 0),
      device_id TEXT NOT NULL,
      deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
      envelope_json TEXT,
      created_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TEXT,
      CHECK (deleted = 1 OR envelope_json IS NOT NULL),
      FOREIGN KEY (object_key) REFERENCES sync_versions(object_key) ON DELETE CASCADE
    )`,
  },
  {
    name: "idx_sync_outbox_retry",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_sync_outbox_retry
      ON sync_outbox(next_attempt_at, created_at)`,
  },
  {
    name: "enforce_webdav_services_single_enabled_insert",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS enforce_webdav_services_single_enabled_insert
      BEFORE INSERT ON webdav_services
      FOR EACH ROW
      WHEN NEW.enabled = 1
      BEGIN
        SELECT RAISE(ABORT, 'Only one row can have enabled = 1')
        WHERE (SELECT COUNT(*) FROM webdav_services WHERE enabled = 1) >= 1;
      END`,
  },
  {
    name: "enforce_webdav_services_single_enabled_update",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS enforce_webdav_services_single_enabled_update
      BEFORE UPDATE OF enabled ON webdav_services
      FOR EACH ROW
      WHEN NEW.enabled = 1
      BEGIN
        SELECT RAISE(ABORT, 'Only one row can have enabled = 1')
        WHERE EXISTS (
          SELECT 1 FROM webdav_services
          WHERE enabled = 1 AND rowid <> OLD.rowid
        );
      END`,
  },
];
