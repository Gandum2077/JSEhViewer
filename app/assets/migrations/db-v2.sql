PRAGMA foreign_keys = ON;

-- 阅读记录
CREATE TABLE IF NOT EXISTS archive_entries_v2 (
  id TEXT PRIMARY KEY, -- id 是 gid，下列外键关联的表中的 id 均为此意
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  token TEXT,
  title TEXT,
  english_title TEXT,
  japanese_title TEXT,
  thumbnail_url TEXT,
  category TEXT,
  posted_time TEXT,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  length INTEGER,
  torrent_available INTEGER NOT NULL DEFAULT 0 CHECK (torrent_available IN (0, 1)),
  uploader TEXT,
  disowned INTEGER NOT NULL DEFAULT 0 CHECK (disowned IN (0, 1)),
  comment TEXT
);

-- 阅读记录附属表 taglist
CREATE TABLE IF NOT EXISTS archive_taglist_v2 (
  id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (id, namespace, tag),
  FOREIGN KEY (id) REFERENCES archive_entries_v2 (id) ON DELETE CASCADE
);

-- 阅读状态
CREATE TABLE IF NOT EXISTS archive_read_state_v2 (
  id TEXT PRIMARY KEY,
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  first_access_time TEXT NOT NULL,
  last_access_time TEXT NOT NULL,
  readlater INTEGER NOT NULL DEFAULT 0 CHECK (readlater IN (0, 1)),
  last_read_page INTEGER NOT NULL DEFAULT 0 CHECK (last_read_page >= 0),
  FOREIGN KEY (id) REFERENCES archive_entries_v2 (id) ON DELETE CASCADE
);

-- 收藏状态
CREATE TABLE IF NOT EXISTS archive_favorite_state_v2 (
  id TEXT PRIMARY KEY,
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  favorited INTEGER NOT NULL DEFAULT 0 CHECK (favorited IN (0, 1)),
  favcat INTEGER,
  FOREIGN KEY (id) REFERENCES archive_entries_v2 (id) ON DELETE CASCADE
);

-- 评分状态
CREATE TABLE IF NOT EXISTS archive_rate_state_v2 (
  id TEXT PRIMARY KEY,
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  average_rating REAL NOT NULL DEFAULT 0,
  display_rating REAL NOT NULL DEFAULT 0,
  is_my_rating INTEGER NOT NULL DEFAULT 0 CHECK (is_my_rating IN (0, 1)),
  FOREIGN KEY (id) REFERENCES archive_entries_v2 (id) ON DELETE CASCADE
);

-- 下载状态
-- 不参与 Cloudflare D1 同步
CREATE TABLE IF NOT EXISTS archive_download_state_v2 (
  id TEXT PRIMARY KEY,
  downloaded INTEGER NOT NULL DEFAULT 0 CHECK (downloaded IN (0, 1)),
  finished INTEGER NOT NULL DEFAULT 0 CHECK (finished IN (0, 1)),
  downloaded_at TEXT,
  FOREIGN KEY (id) REFERENCES archive_entries_v2 (id) ON DELETE CASCADE
);

-- 图库阅读设置
CREATE TABLE IF NOT EXISTS gallery_reader_config_v2 (
  id TEXT PRIMARY KEY,
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  pageDirection TEXT NOT NULL DEFAULT 'left_to_right' CHECK (
    pageDirection IN ('left_to_right', 'right_to_left', 'vertical')
  ),
  spreadModeEnabled INTEGER NOT NULL DEFAULT 0 CHECK (spreadModeEnabled IN (0, 1)),
  skipFirstPageInSpread INTEGER NOT NULL DEFAULT 0 CHECK (skipFirstPageInSpread IN (0, 1)),
  skipLandscapePagesInSpread INTEGER NOT NULL DEFAULT 0 CHECK (skipLandscapePagesInSpread IN (0, 1)),
  pagingGesture TEXT NOT NULL DEFAULT 'tap_and_swipe' CHECK (
    pagingGesture IN ('tap_and_swipe', 'swipe', 'tap')
  ),
  FOREIGN KEY (id) REFERENCES archive_entries_v2 (id) ON DELETE CASCADE
);

-- 全局阅读设置
CREATE TABLE IF NOT EXISTS global_reader_config_v2 (
  id TEXT PRIMARY KEY CHECK (id = '1'), -- 限制只能有1行
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted = 0),
  pageDirection TEXT NOT NULL DEFAULT 'left_to_right' CHECK (
    pageDirection IN ('left_to_right', 'right_to_left', 'vertical')
  ),
  spreadModeEnabled INTEGER NOT NULL DEFAULT 0 CHECK (spreadModeEnabled IN (0, 1)),
  skipFirstPageInSpread INTEGER NOT NULL DEFAULT 0 CHECK (skipFirstPageInSpread IN (0, 1)),
  skipLandscapePagesInSpread INTEGER NOT NULL DEFAULT 0 CHECK (skipLandscapePagesInSpread IN (0, 1)),
  pagingGesture TEXT NOT NULL DEFAULT 'tap_and_swipe' CHECK (
    pagingGesture IN ('tap_and_swipe', 'swipe', 'tap')
  )
);

-- 搜索记录
CREATE TABLE IF NOT EXISTS search_history_v2 (
  id TEXT PRIMARY KEY, -- sorted_fsearch
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  last_access_time TEXT NOT NULL
);

-- 搜索记录附属表 搜索词
CREATE TABLE IF NOT EXISTS search_history_search_terms_v2 (
  history_id TEXT NOT NULL,
  term_index INTEGER NOT NULL CHECK (term_index >= 0),
  namespace TEXT,
  qualifier TEXT,
  term TEXT NOT NULL,
  dollar INTEGER NOT NULL DEFAULT 0 CHECK (dollar IN (0, 1)),
  subtract INTEGER NOT NULL DEFAULT 0 CHECK (subtract IN (0, 1)),
  tilde INTEGER NOT NULL DEFAULT 0 CHECK (tilde IN (0, 1)),
  PRIMARY KEY (history_id, term_index),
  FOREIGN KEY (history_id) REFERENCES search_history_v2 (id) ON DELETE CASCADE
);

-- 搜索书签
CREATE TABLE IF NOT EXISTS search_bookmarks_v2 (
  id TEXT PRIMARY KEY, -- sorted_fsearch
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  position_key TEXT NOT NULL
);

-- 搜索书签附属表 搜索词
CREATE TABLE IF NOT EXISTS search_bookmarks_search_terms_v2 (
  bookmark_id TEXT NOT NULL,
  term_index INTEGER NOT NULL CHECK (term_index >= 0),
  namespace TEXT,
  qualifier TEXT,
  term TEXT NOT NULL,
  dollar INTEGER NOT NULL DEFAULT 0 CHECK (dollar IN (0, 1)),
  subtract INTEGER NOT NULL DEFAULT 0 CHECK (subtract IN (0, 1)),
  tilde INTEGER NOT NULL DEFAULT 0 CHECK (tilde IN (0, 1)),
  PRIMARY KEY (bookmark_id, term_index),
  FOREIGN KEY (bookmark_id) REFERENCES search_bookmarks_v2 (id) ON DELETE CASCADE
);

-- ai翻译服务
-- secure 字段已由业务层排除，参与 Cloudflare D1 同步
CREATE TABLE IF NOT EXISTS ai_translation_services_v2 (
  id TEXT PRIMARY KEY,  -- 初次创建后根据内容计算hash作为ID，如果重复则使用UUID作为ID
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  name TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
  script_text TEXT NOT NULL,
  config_form TEXT,
  config TEXT
);

-- webdav服务
-- username 和 password 保存在本机 assets/credentials.json，以服务 id 关联
CREATE TABLE IF NOT EXISTS webdav_services_v2 (
  id TEXT PRIMARY KEY,  -- 初次创建后根据内容计算hash作为ID，如果重复则使用UUID作为ID
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  name TEXT,
  host TEXT,
  port INTEGER,
  https INTEGER NOT NULL DEFAULT 0 CHECK (https IN (0, 1)),
  path TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1))
);

-- 标记的标签（从网站下载）
-- 不参与 Cloudflare D1 同步
CREATE TABLE IF NOT EXISTS downloaded_marked_tags_v2 (
  tagid INTEGER,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  watched INTEGER,
  hidden INTEGER,
  color TEXT,
  weight INTEGER,
  UNIQUE (namespace, name)
);

-- 标记的标签（本地产生）
CREATE TABLE IF NOT EXISTS local_marked_tags_v2 (
  id TEXT PRIMARY KEY,  -- 使用 namespace:name 作为 id；namespace 和 name 禁止包含冒号
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  watched INTEGER,
  hidden INTEGER,
  color TEXT,
  weight INTEGER,
  UNIQUE (namespace, name)
);

-- 标记的上传者（本地产生）
CREATE TABLE IF NOT EXISTS marked_uploaders_v2 (
  id TEXT PRIMARY KEY,  -- 使用 uploader 作为 id
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
  );

-- 每台设备独立累计；展示时按搜索词对所有设备求和。
CREATE TABLE IF NOT EXISTS tag_access_count_v2 (
  id TEXT PRIMARY KEY NOT NULL,  -- device_id:qualifier:namespace:term
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 1 AND 200 AND instr(device_id, ':') = 0),
  namespace TEXT NOT NULL DEFAULT '' CHECK (instr(namespace, ':') = 0),
  qualifier TEXT NOT NULL DEFAULT '' CHECK (instr(qualifier, ':') = 0),
  term TEXT NOT NULL DEFAULT '' CHECK (instr(term, ':') = 0),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count BETWEEN 0 AND 9007199254740991),
  UNIQUE (device_id, namespace, qualifier, term),
  CHECK (id = device_id || ':' || qualifier || ':' || namespace || ':' || term)
);

CREATE INDEX IF NOT EXISTS idx_tag_access_count_v2_term
ON tag_access_count_v2 (namespace, qualifier, term) WHERE deleted = 0;

-- 图片收藏表
CREATE TABLE IF NOT EXISTS favorite_images_v2 (
  id TEXT PRIMARY KEY,  -- 使用 gid:page_index 作为 id
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  gid INTEGER NOT NULL,
  page_index INTEGER NOT NULL,
  favorited_at TEXT NOT NULL,
  UNIQUE (gid, page_index),
  FOREIGN KEY (gid) REFERENCES archive_entries_v2 (id) ON DELETE CASCADE
);

-- 被禁止的上传者（从网站下载）
-- 不参与 Cloudflare D1 同步
CREATE TABLE IF NOT EXISTS banned_uploaders (uploader TEXT PRIMARY KEY NOT NULL);

-- favcat_titles（从网站下载）
-- 不参与 Cloudflare D1 同步
CREATE TABLE IF NOT EXISTS favcat_titles (
  favcat INTEGER PRIMARY KEY CHECK (
    favcat >= 0
    AND favcat <= 9
  ),
  title TEXT
);

-- 设置表
-- 不参与 Cloudflare D1 同步
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);

-- 翻译表
-- 不参与 Cloudflare D1 同步
CREATE TABLE IF NOT EXISTS translation_data (
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  translation TEXT,
  intro TEXT,
  links TEXT,
  UNIQUE (namespace, name)
);

-- 限制 ai_translation_services_v2 最多只能有一个 selected = 1
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_ai_translation_services_v2_single_selected
ON ai_translation_services_v2(selected)
WHERE selected = 1 AND deleted = 0;

-- 限制 webdav_services_v2 最多只能有一个 enabled = 1
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_webdav_services_v2_single_enabled
ON webdav_services_v2(enabled)
WHERE enabled = 1 AND deleted = 0;

-- Read-only projection for gallery lists. All writes target the underlying tables.
CREATE VIEW IF NOT EXISTS archive_records_v2 AS
SELECT
  e.id,
  CAST(e.id AS INTEGER) AS gid,
  e.token, e.title, e.english_title, e.japanese_title, e.thumbnail_url,
  e.category, e.posted_time, e.visible, e.length, e.torrent_available,
  e.uploader, e.disowned, e.comment,
  COALESCE(r.readlater, 0) AS readlater,
  COALESCE(r.first_access_time, '') AS first_access_time,
  COALESCE(r.last_access_time, '') AS last_access_time,
  COALESCE(r.last_read_page, 0) AS last_read_page,
  COALESCE(d.downloaded, 0) AS downloaded,
  COALESCE(f.favorited, 0) AS favorited, f.favcat,
  COALESCE(s.display_rating, 0) AS rating,
  COALESCE(s.is_my_rating, 0) AS is_my_rating,
  COALESCE((
    SELECT json_group_array(json_object('namespace', namespace, 'tags', json(tags)))
    FROM (
      SELECT namespace, json_group_array(tag) AS tags
      FROM archive_taglist_v2 WHERE id = e.id GROUP BY namespace
    )
  ), '[]') AS taglist
FROM archive_entries_v2 AS e
LEFT JOIN archive_read_state_v2 AS r ON r.id = e.id AND r.deleted = 0
LEFT JOIN archive_favorite_state_v2 AS f ON f.id = e.id AND f.deleted = 0
LEFT JOIN archive_rate_state_v2 AS s ON s.id = e.id AND s.deleted = 0
LEFT JOIN archive_download_state_v2 AS d ON d.id = e.id
WHERE e.deleted = 0;
