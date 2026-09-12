CREATE TABLE IF NOT EXISTS archives (
  gid INTEGER PRIMARY KEY,
  readlater INTEGER,
  downloaded INTEGER,
  first_access_time TEXT,
  last_access_time TEXT,
  token TEXT,
  title TEXT,
  english_title TEXT,
  japanese_title TEXT,
  thumbnail_url TEXT,
  category TEXT,
  posted_time TEXT,
  visible INTEGER,
  rating REAL,
  is_my_rating INTEGER,
  length INTEGER,
  torrent_available INTEGER,
  favorited INTEGER,
  favcat INTEGER,
  uploader TEXT,
  disowned INTEGER,
  taglist TEXT,
  comment TEXT,
  last_read_page INTEGER
);

-- 标签表，用于搜索
CREATE TABLE IF NOT EXISTS archive_taglist (
  gid INTEGER NOT NULL,
  namespace TEXT NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE (gid, namespace, tag)
);

-- 设置表
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);

-- AI翻译服务配置表
CREATE TABLE IF NOT EXISTS ai_translation_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
  script_text TEXT NOT NULL,
  config_form TEXT,
  config TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_translation_services_single_selected ON ai_translation_services (selected)
WHERE
  selected = 1;

-- webdavServices
CREATE TABLE IF NOT EXISTS webdav_services (
  name TEXT,
  host TEXT,
  port INTEGER,
  https INTEGER,
  path TEXT,
  username TEXT,
  password TEXT,
  enabled INTEGER
);

-- 翻译表
CREATE TABLE IF NOT EXISTS translation_data (
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  translation TEXT,
  intro TEXT,
  links TEXT,
  UNIQUE (namespace, name)
);

-- 标记的标签
CREATE TABLE IF NOT EXISTS marked_tags (
  tagid INTEGER,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  watched INTEGER,
  hidden INTEGER,
  color TEXT,
  weight INTEGER,
  UNIQUE (namespace, name)
);

-- 标记的上传者 只保存于本地
CREATE TABLE IF NOT EXISTS marked_uploaders (uploader TEXT, UNIQUE (uploader));

-- 被禁止的上传者 和ehentai同步
CREATE TABLE IF NOT EXISTS banned_uploaders (uploader TEXT, UNIQUE (uploader));

-- favcat_titles 和ehentai同步
CREATE TABLE IF NOT EXISTS favcat_titles (
  favcat INTEGER PRIMARY KEY CHECK (
    favcat >= 0
    AND favcat <= 9
  ),
  title TEXT
);

-- 搜索页历史记录
-- last_access_time 是最后一次访问的时间
-- sorted_fsearch 是searchTerms的排序后组装的字符串，具有唯一性
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER,
  last_access_time TEXT,
  sorted_fsearch TEXT UNIQUE,
  PRIMARY KEY (id AUTOINCREMENT)
);

-- 搜索页历史记录中的searchTerms
CREATE TABLE IF NOT EXISTS search_history_search_terms (
  search_history_id INTEGER,
  namespace TEXT,
  qualifier TEXT,
  term TEXT NOT NULL,
  dollar INTEGER,
  subtract INTEGER,
  tilde INTEGER
);

-- 搜索页书签
CREATE TABLE IF NOT EXISTS search_bookmarks (
  id INTEGER,
  sort_order INTEGER,
  sorted_fsearch TEXT UNIQUE,
  PRIMARY KEY (id AUTOINCREMENT)
);

-- 搜索页书签中的searchTerms
CREATE TABLE IF NOT EXISTS search_bookmarks_search_terms (
  search_bookmarks_id INTEGER,
  namespace TEXT,
  qualifier TEXT,
  term TEXT NOT NULL,
  dollar INTEGER,
  subtract INTEGER,
  tilde INTEGER
);

-- 标签访问次数统计
-- 此表要求namespace, qualifier, term不能为null，且组合是唯一的
CREATE TABLE IF NOT EXISTS tag_access_count (
  namespace TEXT NOT NULL default '',
  qualifier TEXT NOT NULL default '',
  term TEXT NOT NULL default '',
  count INTEGER,
  UNIQUE (namespace, qualifier, term)
);

-- 下载记录表
-- 只记录gid和finished，供下次启动时恢复下载使用
CREATE TABLE IF NOT EXISTS download_records (
  gid INTEGER PRIMARY KEY,
  length INTEGER NOT NULL,
  finished INTEGER
);

-- 对特定图库生效的阅读配置表
-- pageDirection: "left_to_right" | "right_to_left" | "vertical"; // 翻页方向
-- spreadModeEnabled: boolean; // 双页模式
-- skipFirstPageInSpread: boolean; // 双页模式中跳过首页
-- skipLandscapePagesInSpread: boolean; // 双页模式中跳过横图
-- pagingGesture: "tap_and_swipe" | "swipe" | "tap"; // 翻页手势
CREATE TABLE IF NOT EXISTS gallery_reader_config (
  gid INTEGER PRIMARY KEY,
  pageDirection TEXT CHECK (
    pageDirection IN ('left_to_right', 'right_to_left', 'vertical')
  ),
  spreadModeEnabled INTEGER CHECK (spreadModeEnabled IN (0, 1)),
  skipFirstPageInSpread INTEGER CHECK (skipFirstPageInSpread IN (0, 1)),
  skipLandscapePagesInSpread INTEGER CHECK (skipLandscapePagesInSpread IN (0, 1)),
  pagingGesture TEXT CHECK (
    pagingGesture IN ('tap_and_swipe', 'swipe', 'tap')
  )
);
-- 图片收藏表
CREATE TABLE IF NOT EXISTS favorite_images (
  gid INTEGER NOT NULL,
  page_index INTEGER NOT NULL,
  favorited_at TEXT NOT NULL,
  PRIMARY KEY (gid, page_index)
);
