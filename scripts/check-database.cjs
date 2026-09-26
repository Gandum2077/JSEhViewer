// Requires Node.js 22.13+ (node:sqlite). Run: node --test scripts/check-database.cjs
// Compile application code and run its SQL against temporary real SQLite files.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "jsehviewer-database-"));
after(() => fs.rmSync(output, { recursive: true, force: true }));
execFileSync("tsc", ["--outDir", output], { cwd: root, stdio: "pipe" });
const legacy = fs.readFileSync(path.join(root, "app/assets/migrations/db-v1.sql"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup({
  version,
  seed = "",
  failSql,
  assets = {},
  failCredentialsWrite,
  onSql,
  onQuery,
  onWait,
  httpRequest,
  onAppLog,
} = {}) {
  const dir = fs.mkdtempSync(path.join(output, "db-"));
  const dbPath = path.join(dir, "database.db");
  if (version !== undefined) {
    const db = new DatabaseSync(dbPath);
    if (version < 2) db.exec(legacy);
    db.exec(`PRAGMA user_version = ${version}`);
    if (seed) db.exec(seed);
    db.close();
  }
  const connections = new Set();
  const bind = (options) =>
    (typeof options === "string" ? [] : options.args || []).map((value) =>
      typeof value === "boolean" ? Number(value) : (value ?? null),
    );
  const sqlOf = (options) => (typeof options === "string" ? options : options.sql);
  const open = (filename) => {
    const native = new DatabaseSync(filename);
    const adapter = {
      update(options) {
        const sql = sqlOf(options);
        onSql?.(sql);
        try {
          if (failSql?.(sql)) throw new Error("injected database failure");
          native.prepare(sql).run(...bind(options));
          return { result: true, error: null };
        } catch (error) {
          return { result: false, error };
        }
      },
      query(options, callback) {
        let rows, columns;
        try {
          const statement = native.prepare(sqlOf(options));
          columns = statement.columns().map((column) => column.name);
          rows = statement.all(...bind(options));
          onQuery?.(sqlOf(options), rows.length);
        } catch (error) {
          callback(null, error);
          return;
        }
        let index = -1;
        callback(
          {
            next: () => ++index < rows.length,
            columnCount: columns.length,
            nameForIndex: (n) => columns[n],
            get: (n) => rows[index][typeof n === "number" ? columns[n] : n],
            close() {},
            get values() {
              return rows[index];
            },
          },
          null,
        );
      },
      close() {
        if (connections.delete(adapter)) native.close();
      },
    };
    connections.add(adapter);
    return adapter;
  };
  const modules = new Map();
  const allowed = new Set([
    "sync/schema",
    "sync/store",
    "sync/engine",
    "sync/errors",
    "sync/logging",
    "utils/database",
    "utils/database-migration",
    "utils/sqlite",
    "utils/database-records",
    "utils/config",
    "utils/credentials",
    "utils/device-identity",
    "utils/tag-access-counts",
    "utils/status",
    "utils/favorite-image",
    "utils/api",
    "ai-translations/preset",
    "ai-translations/user-custom-validation",
    "ai-translations/config-form-utils",
    "ai-translations/secure-config",
  ]);
  const globals = {
    console,
    setTimeout,
    clearTimeout,
    $sqlite: { open, close: (db) => db.close() },
    $keychain: new Proxy(
      {},
      {
        get() {
          throw new Error("Keychain must never be used");
        },
      },
    ),
    $file: {
      absolutePath: (filename) => filename,
      read: (filename) => ({
        string:
          assets[filename] ??
          fs.readFileSync(path.isAbsolute(filename) ? filename : path.join(root, "app", filename), "utf8"),
      }),
      exists: (filename) => path.isAbsolute(filename) && fs.existsSync(filename),
      copy({ src, dst }) {
        fs.copyFileSync(src, dst);
        return true;
      },
      mkdir() {},
      delete() {},
      list: () => [],
      write() {},
    },
    $text: {
      SHA256: (text) => crypto.createHash("sha256").update(text).digest("hex"),
      get uuid() {
        return crypto.randomUUID();
      },
      HTMLUnescape: (text) => text,
    },
    $data: (value) => ({
      ...value,
      ocValue: () => ({
        invoke(method, filename, atomic) {
          assert.equal(method, "writeToFile:atomically:");
          assert.equal(atomic, true);
          if (failCredentialsWrite?.(JSON.parse(value.string))) return false;
          fs.writeFileSync(filename + ".tmp", value.string);
          fs.renameSync(filename + ".tmp", filename);
          return true;
        },
      }),
    }),
    $wait: onWait ?? (async () => {}),
    $http: { request: httpRequest },
  };
  const context = vm.createContext(globals);
  function load(id) {
    if (id === "url-parse") return require("url-parse");
    if (id === "utils/glv")
      return { databasePath: dbPath, imagePath: "image/", thumbnailPath: "thumb/", galleryInfoPath: "info/" };
    if (id === "utils/tools") return { appLog: onAppLog ?? (() => {}) };
    if (id === "ehentai-parser")
      return { EHAPIHandler: class {}, tagNamespaces: ["artist", "female", "language", "temp"] };
    if (id === "jsbox-cview")
      return {
        cvid: {
          get newId() {
            return crypto.randomUUID();
          },
        },
      };
    if (!allowed.has(id)) return {};
    if (modules.has(id)) return modules.get(id).exports;
    const module = { exports: {} };
    modules.set(id, module);
    const source = fs.readFileSync(path.join(output, id + ".js"), "utf8");
    const requireLocal = (name) =>
      load(name.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(id), name)) : name);
    vm.runInContext(`(function(require, module, exports) {${source}\n})`, context, { filename: id })(
      requireLocal,
      module,
      module.exports,
    );
    return module.exports;
  }
  const inspect = (sql, args = []) => {
    const db = new DatabaseSync(dbPath);
    try {
      return db.prepare(sql).all(...args);
    } finally {
      db.close();
    }
  };
  return {
    dir,
    dbPath,
    credentialsPath: path.join(dir, "credentials.json"),
    load,
    reload: (id) => {
      modules.delete(id);
      return load(id);
    },
    inspect,
    connectionCount: () => connections.size,
    backups: () => fs.readdirSync(dir).filter((name) => name.includes(".before-v2-") && name.endsWith(".db")),
    close: () => {
      for (const db of [...connections]) db.close();
    },
  };
}

const seedV1 = `
INSERT INTO archives(gid,token,title,taglist,length,readlater,downloaded,first_access_time,last_access_time,rating,is_my_rating,last_read_page)
 VALUES(123,'token','legacy','[]',12,1,1,'2020-01-01','2026-09-12',4.5,1,7);
INSERT INTO archive_taglist VALUES(123,'artist','a;|b');
INSERT INTO download_records VALUES(123,12,0),(999,5,0);
INSERT INTO favorite_images VALUES(123,3,'2026-09-11');
INSERT INTO gallery_reader_config VALUES(123,'vertical',1,1,0,'swipe');
INSERT INTO config VALUES('pageDirection','"right_to_left"'),('spreadModeEnabled','true'),('skipFirstPageInSpread','false');
INSERT INTO search_history VALUES(4,'2026-09-12','artist:a;|b');
INSERT INTO search_history_search_terms VALUES(4,'artist',NULL,'a;|b',1,0,0);
INSERT INTO search_bookmarks VALUES(10,1,'second'),(20,0,'first');
INSERT INTO search_bookmarks_search_terms VALUES(20,NULL,NULL,'first;|term',0,0,0);
INSERT INTO marked_tags VALUES(0,'artist','local',1,0,'',10),(NULL,'artist','null-local',0,1,'',5),(42,'artist','remote',1,0,'',3);
INSERT INTO marked_uploaders VALUES('uploader');
INSERT INTO tag_access_count VALUES('artist','','tag',8);
INSERT INTO webdav_services VALUES('dav','localhost',443,1,'/','user','test-password',1);
INSERT INTO ai_translation_services VALUES(1,'service',1,'async () => {}','[]','{}');
`;
const gallery = (gid = 123) => ({
  gid,
  token: "token",
  english_title: "English",
  japanese_title: "Japanese",
  thumbnail_url: "cover",
  category: "Manga",
  posted_time: "2026-09-12",
  visible: true,
  length: 3,
  uploader: "uploader",
  disowned: false,
  torrent_count: 1,
  comments: [],
  average_rating: 3.5,
  display_rating: 4,
  is_my_rating: false,
  favorited: true,
  favcat: 2,
  taglist: [{ namespace: "artist", tags: ["a;|b", "other"] }],
  total_pages: 1,
  num_of_images_on_each_page: 3,
  thumbnail_size: "large",
  images: {},
});

test("fresh install creates only v2 tables, defaults, presets, and foreign-key-enabled connections", () => {
  const env = setup();
  try {
    const { dbManager: db } = env.load("utils/database");
    assert.equal(db.query("PRAGMA user_version")[0].user_version, 2);
    assert.equal(db.query("PRAGMA foreign_keys")[0].foreign_keys, 1);
    assert.equal(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='archives'").length, 0);
    assert.equal(db.query("SELECT * FROM ai_translation_services_v2").length, 2);
    assert.equal(db.query("SELECT * FROM favcat_titles").length, 10);
    const { configManager: config } = env.load("utils/config");
    assert.deepEqual(plain(config.getCommonReaderConfig()), {
      pageDirection: "left_to_right",
      spreadModeEnabled: false,
      skipFirstPageInSpread: true,
      skipLandscapePagesInSpread: true,
      pagingGesture: "tap_and_swipe",
    });
    assert.equal(env.backups().length, 0);
  } finally {
    env.close();
  }
});

test("v1 migration preserves application data, removes old tables, backs up, and restarts idempotently", () => {
  const env = setup({ version: 1, seed: seedV1 });
  try {
    const { dbManager: db } = env.load("utils/database");
    const { configManager: config } = env.load("utils/config");
    const { statusManager: status } = env.load("utils/status");
    const { favoriteImageManager: favorites } = env.load("utils/favorite-image");
    assert.equal(status.getArchiveItem(123).last_read_page, 7);
    assert.equal(status.getArchiveItem(123).rating, 4.5);
    assert.equal(status.getArchiveItem(123).taglist[0].tags[0], "a;|b");
    assert.equal(config.searchHistory[0].searchTerms[0].term, "a;|b");
    assert.deepEqual(plain(config.searchBookmarks.map((b) => b.id)), ["first", "second"]);
    assert.equal(config.searchBookmarks[0].searchTerms[0].term, "first;|term");
    assert.equal(config.pageDirection, "right_to_left");
    assert.equal(config.skipFirstPageInSpread, false);
    assert.equal(config.skipLandscapePagesInSpread, true);
    assert.equal(config.getGalleryReaderConfig(123).pageDirection, "vertical");
    assert.equal(favorites.queryAll()[0].page_index, 3);
    assert.equal(config.getMarkedTag("artist", "local").tagid, 0);
    assert.equal(db.query("SELECT * FROM local_marked_tags_v2").length, 2);
    assert.equal(db.query("SELECT * FROM downloaded_marked_tags_v2").length, 1);
    assert.equal(config.aiTranslationServices[0].id.length, 64);
    assert.equal(config.webDAVServices[0].id.length, 64);
    assert.equal(db.query("SELECT * FROM archive_download_state_v2").length, 1);
    assert.equal(db.query("SELECT finished FROM archive_download_state_v2")[0].finished, 0);
    assert.equal(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='archives'").length, 0);
    assert.equal(db.query("SELECT * FROM config WHERE key='pageDirection'").length, 0);
    const backup = new DatabaseSync(path.join(env.dir, env.backups()[0]));
    assert.equal(backup.prepare("PRAGMA user_version").get().user_version, 1);
    assert.equal(backup.prepare("SELECT title FROM archives").get().title, "legacy");
    backup.close();
    env.load("utils/database-migration").initializeDatabase(env.dbPath);
    assert.equal(env.backups().length, 1);
    assert.equal(db.query("PRAGMA foreign_key_check").length, 0);
  } finally {
    env.close();
  }
});

test("v0 upgrades JSON-encoded service selection and configuration", () => {
  const env = setup({
    version: 0,
    seed: `INSERT INTO config VALUES('selectedAiTranslationService','"manga-image-translator"'),
    ('aiTranslationSavedConfigText','{"manga-image-translator":{"url":"local-service"}}');`,
  });
  try {
    const { configManager: config } = env.load("utils/config");
    assert.equal(config.selectedAiTranslationServiceName, "manga-image-translator");
    assert.equal(config.aiTranslationServices[0].config.url, "local-service");
  } finally {
    env.close();
  }
});

test("validation, cleanup and COMMIT failures restore all v1 data and its version", () => {
  for (const failSql of [(sql) => sql.includes("DROP TABLE IF EXISTS archives"), (sql) => sql === "COMMIT"]) {
    const env = setup({ version: 1, seed: seedV1, failSql });
    try {
      assert.throws(() => env.load("utils/database"), /injected database failure/);
      assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
      assert.equal(env.inspect("SELECT COUNT(*) AS n FROM archives")[0].n, 1);
      assert.equal(env.inspect("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='archive_entries_v2'")[0].n, 0);
      assert.equal(env.backups().length, 1);
    } finally {
      env.close();
    }
  }
  const env = setup({ version: 1, seed: seedV1 + "UPDATE config SET value='null' WHERE key='pageDirection';" });
  try {
    assert.throws(() => env.load("utils/database"), /全局阅读设置/);
    assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
    assert.equal(env.inspect("SELECT COUNT(*) AS n FROM archives")[0].n, 1);
  } finally {
    env.close();
  }
});

test("unsupported versions and failed backup do not modify the source", () => {
  for (const options of [
    { version: 3 },
    { version: 1, seed: seedV1, failSql: (sql) => sql.startsWith("VACUUM INTO") },
  ]) {
    const env = setup(options);
    try {
      assert.throws(() => env.load("utils/database"));
      assert.equal(env.inspect("PRAGMA user_version")[0].user_version, options.version);
      assert.equal(env.inspect("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='archive_entries_v2'")[0].n, 0);
    } finally {
      env.close();
    }
  }
});

test("reader settings use v2 for writes and missing v1 keys retain v1 defaults", () => {
  const env = setup();
  try {
    const { configManager: config } = env.load("utils/config");
    const { dbManager: db } = env.load("utils/database");
    for (const direction of ["left_to_right", "right_to_left", "vertical"]) {
      for (const gesture of ["tap_and_swipe", "swipe", "tap"]) {
        config.pageDirection = direction;
        config.pagingGesture = gesture;
        assert.equal(db.query("SELECT pageDirection FROM global_reader_config_v2")[0].pageDirection, direction);
        assert.equal(db.query("SELECT pagingGesture FROM global_reader_config_v2")[0].pagingGesture, gesture);
      }
    }
    assert.equal(db.query("SELECT * FROM config WHERE key='pageDirection'").length, 0);
  } finally {
    env.close();
  }
});

test("search history and bookmarks round-trip punctuation, empty IDs, soft deletion and reordering", () => {
  const env = setup();
  try {
    const { configManager: config } = env.load("utils/config");
    const term = { term: 'a;|b:"quoted"', dollar: false, subtract: true, tilde: false };
    config.addOrUpdateSearchHistory("", [term]);
    assert.equal(config.searchHistory[0].searchTerms[0].term, term.term);
    config.deleteSearchHistory("");
    assert.equal(config.searchHistory.length, 0);
    config.addOrUpdateSearchHistory("", [term]);
    assert.equal(config.searchHistory.length, 1);
    assert.equal(config.getSomeLastAccessSearchTerms()[0].term, term.term);
    assert.equal(config.addSearchBookmark("", []), true);
    assert.equal(config.addSearchBookmark("", []), false);
    config.addSearchBookmark("second", [term]);
    config.reorderSearchBookmarks(["second", ""]);
    assert.deepEqual(plain(config.searchBookmarks.map((b) => b.id)), ["second", ""]);
    assert.equal(config.searchBookmarks[0].searchTerms[0].term, term.term);
    config.deleteSearchBookmark("second");
    config.addSearchBookmark("second", [term]);
    assert.deepEqual(plain(config.searchBookmarks.map((b) => b.id)), ["", "second"]);
    assert.throws(() => config.updateTagAccessCount([term]), /冒号/);
    const countTerm = { ...term, term: 'a;|b "quoted"' };
    config.updateTagAccessCount([countTerm, countTerm]);
    assert.equal(config.getTenMostAccessedTags()[0].count, 2);
  } finally {
    env.close();
  }
});

test("service edits retain IDs, selection remains unique and deleted names can be reused", () => {
  const env = setup({ version: 1, seed: seedV1 });
  try {
    const { configManager: config } = env.load("utils/config");
    const service = { ...config.aiTranslationServices[0], config: { changed: true } };
    config.editAITranslationService(service);
    assert.equal(config.aiTranslationServices[0].id, service.id);
    config.deleteAITranslationService(service.name);
    config.addAITranslationService({ name: service.name, scriptText: "async () => {}", selected: true });
    assert.notEqual(config.aiTranslationServices[0].id, service.id);
    const dav = config.getCopiedWebDAVServices()[0];
    config.updateAllWebDAVServices([{ ...dav, host: "changed-host" }]);
    assert.equal(config.webDAVServices[0].id, dav.id);
    assert.equal(config.webDAVServices[0].host, "changed-host");
    config.updateAllWebDAVServices([]);
    assert.equal(config.webDAVServices.length, 0);
  } finally {
    env.close();
  }
});

test("refreshing website tags preserves local tags and uploader tombstones are reversible", () => {
  const env = setup({ version: 1, seed: seedV1 });
  try {
    const { configManager: config } = env.load("utils/config");
    config.updateAllMarkedTags([]);
    assert.equal(config.getMarkedTag("artist", "local").watched, true);
    assert.equal(config.getMarkedTag("artist", "remote"), undefined);
    config.deleteMarkedTag("artist", "local");
    assert.equal(config.getMarkedTag("artist", "local"), undefined);
    config.addMarkedTag({ tagid: 0, namespace: "artist", name: "local", watched: true, hidden: false, weight: 9 });
    assert.equal(config.getMarkedTag("artist", "local").weight, 9);
    config.deleteMarkedUploader("uploader");
    assert.equal(config.markedUploaders.length, 0);
    config.addMarkedUploader("uploader");
    assert.equal(config.markedUploaders[0], "uploader");
  } finally {
    env.close();
  }
});

test("gallery refresh preserves favorites, reader config and pending downloads; deletes and recreation stay consistent", () => {
  const env = setup();
  try {
    const { statusManager: status } = env.load("utils/status");
    const { configManager: config } = env.load("utils/config");
    const { favoriteImageManager: favorites } = env.load("utils/favorite-image");
    const { dbManager: db } = env.load("utils/database");
    status.updateArchiveItem(123, { infos: gallery(), downloaded: true, last_read_page: 2 });
    config.setGalleryReaderConfig(123, config.getCommonReaderConfig());
    assert.equal(favorites.add(123, 1), true);
    db.update("UPDATE archive_download_state_v2 SET finished = 0 WHERE id = '123'");
    status.updateArchiveItem(123, { infos: gallery(), readlater: true, my_rating: 5 });
    assert.equal(favorites.isFavorite(123, 1), true);
    assert.ok(config.getGalleryReaderConfig(123));
    assert.equal(status.getArchiveItem(123).last_read_page, 2);
    assert.equal(status.getArchiveItem(123).rating, 5);
    assert.equal(db.query("SELECT average_rating FROM archive_rate_state_v2")[0].average_rating, 3.5);
    assert.equal(db.query("SELECT finished FROM archive_download_state_v2")[0].finished, 0);
    assert.equal(status.get("archive").queryArchiveItemCount({ fromPage: 0, toPage: 0, type: "readlater" }), 1);
    assert.deepEqual(
      plain(
        status.queryArchiveGids({
          fromPage: 0,
          toPage: 0,
          searchTerms: [{ namespace: "artist", term: "a;|b", dollar: true }],
        }),
      ),
      [123],
    );
    assert.equal(favorites.queryGroups({})[0].pages[0], 1);
    favorites.remove(123, 1);
    assert.equal(favorites.queryAll().length, 0);
    favorites.add(123, 1);
    status.deleteArchiveItem(123);
    assert.equal(status.getArchiveItem(123), undefined);
    assert.equal(favorites.queryAll().length, 0);
    assert.equal(config.getGalleryReaderConfig(123), undefined);
    status.updateArchiveItem(123, { infos: gallery() });
    assert.equal(status.getArchiveItem(123).last_read_page, 0);
    assert.equal(favorites.queryAll().length, 0);
    assert.equal(db.query("PRAGMA foreign_key_check").length, 0);
  } finally {
    env.close();
  }
});

test("download task persistence distinguishes pending, completed and cancelled tasks", () => {
  const env = setup();
  try {
    const { downloaderManager: manager } = env.load("utils/api");
    const { dbManager: db } = env.load("utils/database");
    const d = manager.add(123, gallery());
    d.background = true;
    assert.equal(db.query("SELECT finished FROM archive_download_state_v2")[0].finished, 0);
    d.result.htmls.forEach((row) => (row.success = true));
    d.result.thumbnails.forEach((row) => (row.path = "cached"));
    d.result.images.forEach((row) => (row.path = "cached"));
    d.result.topThumbnail.path = "cached";
    d.finishHandler();
    assert.equal(db.query("SELECT finished FROM archive_download_state_v2")[0].finished, 1);
    assert.ok(db.query("SELECT downloaded_at FROM archive_download_state_v2")[0].downloaded_at);
    d.result.images[0].path = undefined;
    d.background = true;
    assert.equal(db.query("SELECT finished FROM archive_download_state_v2")[0].finished, 0);
    d.background = false;
    assert.equal(db.query("SELECT finished FROM archive_download_state_v2")[0].finished, 1);
  } finally {
    env.close();
  }
});

test("migration backup includes committed WAL data", () => {
  const env = setup({ version: 1 });
  const writer = new DatabaseSync(env.dbPath);
  try {
    writer.exec("PRAGMA journal_mode=WAL; INSERT INTO archives(gid,title) VALUES(123,'from-WAL')");
    env.load("utils/database");
    const backup = new DatabaseSync(path.join(env.dir, env.backups()[0]));
    try {
      assert.equal(backup.prepare("SELECT title FROM archives").get().title, "from-WAL");
    } finally {
      backup.close();
    }
    assert.equal(env.inspect("SELECT title FROM archive_entries_v2")[0].title, "from-WAL");
  } finally {
    writer.close();
    env.close();
  }
});

test("older v1 databases missing additive tables migrate; standalone v2 databases finish cleanup without recopying", () => {
  const env = setup({ version: 1, seed: seedV1 + "DROP TABLE favorite_images; DROP TABLE gallery_reader_config;" });
  try {
    const { dbManager: db } = env.load("utils/database");
    assert.equal(db.query("PRAGMA user_version")[0].user_version, 2);
    db.close();
    const native = new DatabaseSync(env.dbPath);
    native.exec(legacy);
    native.exec(
      "DROP VIEW archive_records_v2; INSERT INTO archives(gid,title) VALUES(123,'stale-v1'); UPDATE archive_entries_v2 SET title='latest-v2'",
    );
    native.close();
    env.load("utils/database-migration").initializeDatabase(env.dbPath);
    assert.equal(env.inspect("SELECT title FROM archive_records_v2")[0].title, "latest-v2");
    assert.equal(env.inspect("SELECT name FROM sqlite_master WHERE name='archives'").length, 0);
  } finally {
    env.close();
  }
});

test("v1 migration preserves all 72 valid global reader setting combinations", () => {
  for (const direction of ["left_to_right", "right_to_left", "vertical"]) {
    for (const gesture of ["tap_and_swipe", "swipe", "tap"]) {
      for (let flags = 0; flags < 8; flags++) {
        const env = setup({ version: 1 });
        try {
          const db = new DatabaseSync(env.dbPath);
          const values = {
            pageDirection: direction,
            pagingGesture: gesture,
            spreadModeEnabled: Boolean(flags & 1),
            skipFirstPageInSpread: Boolean(flags & 2),
            skipLandscapePagesInSpread: Boolean(flags & 4),
          };
          for (const [key, value] of Object.entries(values))
            db.prepare("INSERT INTO config VALUES(?,?)").run(key, JSON.stringify(value));
          db.close();
          const { configManager: config } = env.load("utils/config");
          assert.deepEqual(plain(config.getCommonReaderConfig()), values);
        } finally {
          env.close();
        }
      }
    }
  }
});

test("colliding derived IDs abort migration without losing either legacy row", () => {
  const env = setup({
    version: 1,
    seed: "INSERT INTO marked_tags(tagid,namespace,name) VALUES(0,'artist:x','y'),(0,'artist','x:y')",
  });
  try {
    assert.throws(() => env.load("utils/database"), /ID 存在冲突/);
    assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
    assert.equal(env.inspect("SELECT COUNT(*) AS n FROM marked_tags")[0].n, 2);
  } finally {
    env.close();
  }
});

test("old history cleanup protects downloaded and favorited galleries and clearAll hides all dependent data", () => {
  const env = setup();
  try {
    const { configManager: config } = env.load("utils/config");
    const { statusManager: status } = env.load("utils/status");
    const { favoriteImageManager: favorites } = env.load("utils/favorite-image");
    const { dbManager: db } = env.load("utils/database");
    const { getPendingDownloads } = env.load("utils/database-records");
    for (const gid of [123, 124, 125]) status.updateArchiveItem(gid, { infos: gallery(gid), downloaded: gid === 124 });
    favorites.add(123, 1);
    db.update("UPDATE archive_read_state_v2 SET last_access_time='2000-01-01'");
    db.update("UPDATE archive_download_state_v2 SET finished=0");
    assert.deepEqual(plain(getPendingDownloads().map((row) => row.gid)), [124]);
    config.clearOldReadRecords(0);
    assert.equal(status.getArchiveItem(125), undefined);
    assert.ok(status.getArchiveItem(123));
    assert.ok(status.getArchiveItem(124));
    config.clearAll();
    assert.equal(favorites.queryAll().length, 0);
    assert.equal(db.query("SELECT * FROM archive_records_v2").length, 0);
    assert.equal(getPendingDownloads().length, 0);
    assert.equal(db.query("SELECT COUNT(*) AS n FROM archive_entries_v2 WHERE deleted=1")[0].n, 3);
    assert.equal(db.query("PRAGMA foreign_key_check").length, 0);
  } finally {
    env.close();
  }
});

test("reverse migration checks use the legacy primary key and reject noncanonical IDs", () => {
  const env = setup({ version: 1, seed: seedV1 });
  const native = new DatabaseSync(env.dbPath);
  try {
    native.exec(fs.readFileSync(path.join(root, "app/assets/migrations/db-v2.sql"), "utf8"));
    const { splitSqlScript } = env.load("utils/sqlite");
    const checks = splitSqlScript(
      fs.readFileSync(path.join(root, "app/assets/migrations/validate-v1-to-v2.sql"), "utf8"),
    );
    for (const name of [
      "unexpected_download_states",
      "unexpected_orphan_archive_tags",
      "unexpected_orphan_gallery_reader_configs",
    ]) {
      const sql = checks.find((sql) => sql.includes(`AS ${name}`));
      assert.ok(sql, name);
      const plan = native
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((row) => row.detail)
        .join("\n");
      assert.match(plan, /SEARCH (?:source|archive) USING INTEGER PRIMARY KEY/, name);
    }
    native.exec("INSERT INTO archive_entries_v2(id) VALUES('123'),('00123')");
    native.exec(
      "INSERT INTO archive_taglist_v2(id,namespace,tag) VALUES('123','artist','valid'),('00123','artist','invalid')",
    );
    const check = checks.find((sql) => sql.includes("AS unexpected_orphan_archive_tags"));
    assert.equal(native.prepare(check).get().unexpected_orphan_archive_tags, 1);
  } finally {
    native.close();
    env.close();
  }
});

function bootstrapHarness(env) {
  let thread = "main";
  let ready = false;
  const main = [],
    background = [],
    logs = [],
    loading = [],
    alerts = [];
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    console,
    require: () => ({
      isDatabaseReady(...args) {
        assert.equal(thread, "background");
        return env.load("utils/database-migration").isDatabaseReady(...args);
      },
      initializeDatabase(...args) {
        assert.equal(thread, "background");
        return env.load("utils/database-migration").initializeDatabase(...args);
      },
    }),
    $thread: {
      main: (task) => {
        assert.notEqual(logs.at(-1)?.status, "running");
        main.push(task.handler);
      },
      background: (task) => background.push(task.handler),
    },
    $ui: {
      loading(value) {
        assert.equal(thread, "main");
        loading.push(value);
      },
      alert(value) {
        assert.equal(thread, "main");
        alerts.push(value);
      },
    },
    $data: (value) => value,
    $file: {
      write({ data }) {
        assert.equal(thread, "background");
        logs.push(JSON.parse(data.string));
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(output, "utils/database-bootstrap.js"), "utf8"), context);
  module.exports.startAfterDatabaseReady(env.dbPath, () => {
    assert.equal(thread, "main");
    assert.equal(env.connectionCount(), 0);
    assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 2);
    assert.equal(env.inspect("SELECT COUNT(*) n FROM sqlite_master WHERE name='archives'")[0].n, 0);
    ready = true;
  });
  return {
    logs,
    loading,
    alerts,
    isReady: () => ready,
    work() {
      thread = "background";
      background.shift()();
      thread = "main";
    },
    show() {
      while (main.length) main.shift()();
    },
  };
}

test("startup waits for background migration and commit before opening the application", () => {
  const env = setup({ version: 1, seed: seedV1 });
  try {
    const boot = bootstrapHarness(env);
    assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
    assert.equal(boot.loading.length, 0);
    boot.work();
    boot.show();
    assert.equal(boot.loading.length, 1);
    assert.equal(boot.isReady(), false);
    boot.work();
    assert.equal(boot.isReady(), false);
    assert.equal(boot.logs.at(-1).status, "complete");
    assert.ok(boot.logs.some((log) => log.phase.includes("unexpected_orphan_archive_tags")));
    assert.ok(boot.logs.some((log) => log.phase.includes("DROP TABLE IF EXISTS archives")));
    boot.show();
    assert.equal(boot.loading.at(-1), false);
    assert.equal(boot.isReady(), true);
    assert.equal(boot.alerts.length, 0);
  } finally {
    env.close();
  }
});

test("failed background commit rolls back, records the failed phase and does not launch the application", () => {
  const env = setup({ version: 1, seed: seedV1, failSql: (sql) => sql === "COMMIT" });
  try {
    const boot = bootstrapHarness(env);
    boot.work();
    boot.show();
    boot.work();
    boot.show();
    assert.equal(boot.isReady(), false);
    assert.equal(boot.logs.at(-1).status, "failed");
    assert.equal(boot.logs.at(-1).phase, "提交迁移事务");
    assert.equal(boot.alerts.length, 1);
    assert.match(boot.alerts[0].message, /migration.log/);
    assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
    assert.equal(env.inspect("SELECT COUNT(*) n FROM archives")[0].n, 1);
    assert.equal(env.backups().length, 1);
  } finally {
    env.close();
  }
});

test("normal v2 startup is silent and does not repeat migration, backup or logging", () => {
  const env = setup({ version: 1, seed: seedV1 });
  try {
    env.load("utils/database-migration").initializeDatabase(env.dbPath);
    const backups = env.backups();
    for (let restart = 0; restart < 2; restart++) {
      const boot = bootstrapHarness(env);
      boot.work();
      boot.show();
      assert.equal(boot.isReady(), true);
      assert.equal(boot.loading.length, 0);
      assert.equal(boot.logs.length, 0);
      assert.equal(boot.alerts.length, 0);
      assert.deepEqual(env.backups(), backups);
    }
    // A v2 number alone does not prove migration cleanup completed.
    const db = new DatabaseSync(env.dbPath);
    db.exec("DROP VIEW archive_records_v2");
    db.close();
    const boot = bootstrapHarness(env);
    boot.work();
    boot.show();
    assert.equal(boot.isReady(), false);
    assert.equal(boot.loading.length, 1);
    boot.work();
    boot.show();
    assert.equal(boot.isReady(), true);
  } finally {
    env.close();
  }
});

test("entry defers business imports until ready and rejects extension environments", () => {
  for (const appEnv of [true, false]) {
    let loaded = false,
      ready,
      rejected = false;
    const context = vm.createContext({
      exports: {},
      require(name) {
        if (name === "./utils/database-bootstrap")
          return {
            startAfterDatabaseReady(path, callback) {
              ready = callback;
            },
          };
        if (name === "./utils/glv") return { databasePath: "assets/database.db" };
        assert.equal(name, "./application");
        loaded = true;
      },
      $app: { env: appEnv ? 1 : 2 },
      $env: { app: 1 },
      $ui: {
        error() {
          rejected = true;
        },
      },
    });
    vm.runInContext(fs.readFileSync(path.join(output, "index.js"), "utf8"), context);
    assert.equal(loaded, false);
    if (appEnv) {
      assert.equal(typeof ready, "function");
      ready();
      assert.equal(loaded, true);
    } else {
      assert.equal(ready, undefined);
      assert.equal(rejected, true);
    }
  }
});

const secureForm = [
  { type: "string", key: "host", title: "Host", summary: true, default: "localhost" },
  { type: "string", key: "apiKey", title: "API Key", secure: true, summary: true, default: "" },
];

test("secure schema validation, templates, summaries and preference rows preserve sensitivity", () => {
  const env = setup();
  try {
    const { validateUserCustomConfigFormText: validate } = env.load("ai-translations/user-custom-validation");
    const { CONFIG_FORM_TEMPLATE } = env.load("ai-translations/preset");
    const { buildAITranslationConfig, buildAITranslationSummary } = env.load("ai-translations/config-form-utils");
    assert.equal(validate(CONFIG_FORM_TEMPLATE).ok, true);
    assert.ok(validate(CONFIG_FORM_TEMPLATE).configForm.some((row) => row.secure));
    const parsed = validate(JSON.stringify(secureForm));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.configForm[1].secure, true);
    assert.equal(validate(JSON.stringify([{ ...secureForm[1], secure: "true" }])).ok, false);
    assert.equal(validate(JSON.stringify([{ ...secureForm[1], default: "secret-in-schema" }])).ok, false);
    for (const row of [
      { type: "integer", default: 0 },
      { type: "boolean", default: false },
      { type: "list", items: ["a"], default: 0 },
    ])
      assert.equal(validate(JSON.stringify([{ ...secureForm[1], ...row }])).ok, false);
    assert.equal(validate(JSON.stringify([{ ...secureForm[1], secure: false, default: "ordinary" }])).ok, true);
    const config = buildAITranslationConfig(parsed.configForm, { host: "example", apiKey: "secret-value" });
    const summary = buildAITranslationSummary({ configForm: parsed.configForm, config });
    assert.match(summary, /已填写/);
    assert.doesNotMatch(summary, /secret-value/);
    assert.match(buildAITranslationSummary({ configForm: parsed.configForm, config: { apiKey: "" } }), /未填写/);
    const module = { exports: {} };
    vm.runInNewContext(
      fs.readFileSync(path.join(output, "controllers/settings-translation-editor-controller.js"), "utf8"),
      {
        module,
        exports: module.exports,
        require(name) {
          if (name === "jsbox-cview")
            return { Base: class {}, DynamicPreferenceListView: class {}, KeyboardAvoidanceController: class {} };
          if (name.endsWith("config-form-utils")) return env.load("ai-translations/config-form-utils");
          return {};
        },
      },
    );
    const rows = module.exports.mapTranslationConfigRows({ configForm: parsed.configForm, config });
    assert.equal(rows[0].type, "string");
    assert.equal(rows[1].type, "secure");
    assert.equal(rows[1].value, "secret-value");
  } finally {
    env.close();
  }
});

test("AI secrets stay outside SQL, survive reload and rename, and are removed with their field or service", () => {
  const env = setup();
  try {
    let config = env.load("utils/config").configManager;
    config.addAITranslationService({
      name: "secure service",
      selected: false,
      scriptText: "async (imageData, config) => { return imageData; }",
      configForm: secureForm,
      config: { host: "example", apiKey: "secret-one" },
    });
    let service = config.aiTranslationServices.find((row) => row.name === "secure service");
    const id = service.id;
    let stored = env.inspect("SELECT config,config_form FROM ai_translation_services_v2 WHERE id=?", [id])[0];
    assert.deepEqual(JSON.parse(stored.config), { host: "example" });
    assert.doesNotMatch(JSON.stringify(stored), /secret-one/);
    assert.deepEqual(readCredentialsFile(env).aiTranslation[id], { apiKey: "secret-one" });
    config = env.reload("utils/config").configManager;
    service = config.aiTranslationServices.find((row) => row.id === id);
    assert.equal(service.config.apiKey, "secret-one");
    config.editAITranslationService({ ...service, name: "renamed", config: { host: "example", apiKey: "secret-two" } });
    service = config.aiTranslationServices.find((row) => row.id === id);
    assert.equal(service.config.apiKey, "secret-two");
    config.editAITranslationService({ ...service, config: { host: "example", apiKey: "" } });
    config = env.reload("utils/config").configManager;
    service = config.aiTranslationServices.find((row) => row.id === id);
    assert.equal(service.config.apiKey, "");
    config.editAITranslationService({ ...service, configForm: [secureForm[0]], config: { host: "example" } });
    assert.equal(readCredentialsFile(env).aiTranslation[id], undefined);
    config.editAITranslationService({ ...service, config: { host: "example", apiKey: "secret-three" } });
    config.deleteAITranslationService("renamed");
    assert.equal(readCredentialsFile(env).aiTranslation[id], undefined);
    stored = env.inspect("SELECT config,deleted FROM ai_translation_services_v2 WHERE id=?", [id])[0];
    assert.equal(stored.deleted, 1);
    assert.doesNotMatch(stored.config, /secret-three/);
  } finally {
    env.close();
  }
});

test("marking an existing field secure removes its stored value and failed saves preserve both stores", () => {
  let failSql = false,
    failFile = false;
  const env = setup({
    failSql: (sql) => failSql && sql.startsWith("UPDATE ai_translation_services_v2"),
    failCredentialsWrite: () => failFile,
  });
  try {
    const config = env.load("utils/config").configManager;
    config.addAITranslationService({
      name: "conversion",
      selected: false,
      scriptText: "async (imageData) => { return imageData; }",
      configForm: secureForm.map((row) => ({ ...row, secure: false })),
      config: { host: "example", apiKey: "old-secret" },
    });
    let service = config.aiTranslationServices.find((row) => row.name === "conversion");
    config.editAITranslationService({ ...service, configForm: secureForm });
    service = config.aiTranslationServices.find((row) => row.id === service.id);
    assert.equal(service.config.apiKey, "old-secret");
    assert.deepEqual(
      JSON.parse(env.inspect("SELECT config FROM ai_translation_services_v2 WHERE id=?", [service.id])[0].config),
      { host: "example" },
    );
    const before = readCredentialsFile(env);
    failFile = true;
    assert.throws(
      () =>
        config.editAITranslationService({
          ...service,
          name: "failed-file",
          config: { host: "other", apiKey: "new-secret" },
        }),
      /credentials.json/,
    );
    failFile = false;
    failSql = true;
    assert.throws(
      () =>
        config.editAITranslationService({
          ...service,
          name: "failed-sql",
          config: { host: "other", apiKey: "new-secret" },
        }),
      /injected/,
    );
    assert.deepEqual(readCredentialsFile(env), before);
    assert.equal(
      env.inspect("SELECT name FROM ai_translation_services_v2 WHERE id=?", [service.id])[0].name,
      "conversion",
    );
  } finally {
    env.close();
  }
});

test("reading a service with persisted secure fields moves values and clears sensitive schema defaults", () => {
  const env = setup();
  try {
    const { dbManager: db } = env.load("utils/database");
    db.update(
      "INSERT INTO ai_translation_services_v2(id,name,selected,script_text,config_form,config) VALUES(?,?,0,?,?,?)",
      [
        "legacy-secure",
        "legacy secure",
        "async (imageData) => { return imageData; }",
        JSON.stringify([{ ...secureForm[1], default: "old-schema-secret" }]),
        JSON.stringify({ apiKey: "old-config-secret" }),
      ],
    );
    const service = env
      .load("utils/config")
      .configManager.aiTranslationServices.find((row) => row.id === "legacy-secure");
    assert.equal(service.config.apiKey, "old-config-secret");
    assert.equal(service.configForm[0].default, "");
    const stored = env.inspect("SELECT config,config_form FROM ai_translation_services_v2 WHERE id='legacy-secure'")[0];
    assert.doesNotMatch(JSON.stringify(stored), /old-schema-secret|old-config-secret/);
    assert.equal(
      env.reload("utils/config").configManager.aiTranslationServices.find((row) => row.id === "legacy-secure").config
        .apiKey,
      "old-config-secret",
    );
  } finally {
    env.close();
  }
});

const sampleCookie = '[{"name":"session","value":"cookie-secret"}]';
const readCredentialsFile = (env) => JSON.parse(fs.readFileSync(env.credentialsPath, "utf8"));

test("v0 and v1 migrate cookie and WebDAV credentials into the file without sensitive SQL columns", () => {
  for (const version of [0, 1]) {
    const env = setup({ version, seed: seedV1 });
    try {
      const native = new DatabaseSync(env.dbPath);
      native.prepare("INSERT INTO config VALUES('cookie',?)").run(JSON.stringify(sampleCookie));
      native.close();
      const config = env.load("utils/config").configManager;
      const credentials = readCredentialsFile(env);
      assert.equal(credentials.cookie, sampleCookie);
      assert.equal(config.cookie, sampleCookie);
      assert.equal(config.webDAVServices[0].username, "user");
      assert.equal(config.webDAVServices[0].password, "test-password");
      assert.deepEqual(credentials.webdav[config.webDAVServices[0].id], {
        username: "user",
        password: "test-password",
      });
      assert.equal(credentials.transaction, undefined);
      assert.equal(env.inspect("SELECT * FROM config WHERE key='cookie'").length, 0);
      assert.ok(
        env
          .inspect("PRAGMA table_info(webdav_services_v2)")
          .every((row) => !["username", "password"].includes(row.name)),
      );
      assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 2);
      assert.doesNotMatch(JSON.stringify(env.inspect("SELECT * FROM webdav_services_v2")), /test-password/);
      const before = fs.readFileSync(env.credentialsPath, "utf8");
      env.load("utils/database-migration").initializeDatabase(env.dbPath);
      assert.equal(fs.readFileSync(env.credentialsPath, "utf8"), before);
    } finally {
      env.close();
    }
  }
});

test("draft v2 removes old credential columns while preserving IDs, sync versions and tombstones", () => {
  const env = setup();
  try {
    const migration = env.load("utils/database-migration");
    migration.initializeDatabase(env.dbPath);
    const previous = readCredentialsFile(env);
    const native = new DatabaseSync(env.dbPath);
    native.exec(
      "ALTER TABLE webdav_services_v2 ADD COLUMN username TEXT; ALTER TABLE webdav_services_v2 ADD COLUMN password TEXT",
    );
    native.exec(
      "INSERT INTO webdav_services_v2(id,sync_version,deleted,name,host,username,password,enabled) VALUES('stable',7,0,'dav','host','draft-user','draft-password',1),('deleted',9,1,'gone','host','removed','removed',0)",
    );
    native.prepare("INSERT INTO config VALUES('cookie',?)").run(JSON.stringify(sampleCookie));
    native.close();
    assert.equal(migration.isDatabaseReady(env.dbPath), false);
    migration.initializeDatabase(env.dbPath);
    assert.equal(migration.isDatabaseReady(env.dbPath), true);
    assert.deepEqual(
      env.inspect("SELECT id,sync_version,deleted FROM webdav_services_v2 ORDER BY rowid"),
      [
        { id: "stable", sync_version: 7, deleted: 0 },
        { id: "deleted", sync_version: 9, deleted: 1 },
      ].map((row) => Object.assign(Object.create(null), row)),
    );
    assert.deepEqual(readCredentialsFile(env).webdav.stable, { username: "draft-user", password: "draft-password" });
    assert.equal(readCredentialsFile(env).webdav.deleted, undefined);
    assert.equal(readCredentialsFile(env).cookie, sampleCookie);
    assert.equal(env.inspect("PRAGMA foreign_key_check").length, 0);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(env.dir, env.backups()[0] + ".credentials.json"), "utf8")),
      previous,
    );
  } finally {
    env.close();
  }
});

test("cookie and WebDAV edits, rename, deletion and reload use credentials.json", () => {
  const env = setup();
  try {
    let config = env.load("utils/config").configManager;
    assert.equal(config.cookie, "");
    config.cookie = sampleCookie;
    config.updateAllWebDAVServices([
      { name: "dav", host: "host", https: true, enabled: true, username: "user", password: "password-one" },
    ]);
    let service = config.webDAVServices[0];
    const id = service.id;
    config.updateAllWebDAVServices([{ ...service, name: "renamed", password: "password-two" }]);
    config = env.reload("utils/config").configManager;
    service = config.webDAVServices[0];
    assert.equal(service.id, id);
    assert.equal(service.password, "password-two");
    assert.equal(config.cookie, sampleCookie);
    config.cookie = "";
    assert.equal(readCredentialsFile(env).webdav[id].password, "password-two");
    config.updateAllWebDAVServices([]);
    assert.deepEqual(readCredentialsFile(env).webdav, {});
    assert.equal(readCredentialsFile(env).cookie, "");
    assert.equal(env.inspect("SELECT deleted FROM webdav_services_v2 WHERE id=?", [id])[0].deleted, 1);
    assert.equal(env.inspect("SELECT * FROM config WHERE key='cookie'").length, 0);
    assert.doesNotMatch(JSON.stringify(env.inspect("SELECT * FROM config")), /cookie-secret/);
  } finally {
    env.close();
  }
});

test("credential file and SQL failures preserve the previous database and credentials", () => {
  let failFile = false,
    failCommit = false;
  const env = setup({ failCredentialsWrite: () => failFile, failSql: (sql) => failCommit && sql === "COMMIT" });
  try {
    const config = env.load("utils/config").configManager;
    config.cookie = "before";
    config.updateAllWebDAVServices([
      { name: "before", host: "before", https: true, enabled: true, password: "before" },
    ]);
    const previous = readCredentialsFile(env);
    failFile = true;
    assert.throws(() => {
      config.cookie = "after";
    }, /credentials.json/);
    assert.deepEqual(readCredentialsFile(env), previous);
    failFile = false;
    failCommit = true;
    assert.throws(
      () => config.updateAllWebDAVServices([{ ...config.webDAVServices[0], name: "after", password: "after" }]),
      /injected/,
    );
    assert.deepEqual(readCredentialsFile(env), previous);
    assert.equal(env.inspect("SELECT name FROM webdav_services_v2 WHERE deleted=0")[0].name, "before");
    failCommit = false;
    assert.equal(config.cookie, "before");
  } finally {
    env.close();
  }
});

test("migration stops before deleting secrets when credentials cannot be written", () => {
  const env = setup({ version: 1, seed: seedV1, failCredentialsWrite: () => true });
  try {
    assert.throws(() => env.load("utils/database-migration").initializeDatabase(env.dbPath), /credentials.json/);
    assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
    assert.equal(env.inspect("SELECT password FROM webdav_services")[0].password, "test-password");
    assert.equal(env.inspect("SELECT name FROM sqlite_master WHERE name='webdav_services_v2'").length, 0);
  } finally {
    env.close();
  }
});

test("restart resolves interrupted credential writes from the committed SQL revision", () => {
  for (const committed of [false, true]) {
    const env = setup();
    try {
      const migration = env.load("utils/database-migration");
      migration.initializeDatabase(env.dbPath);
      const { prepareCredentialsUpdate, CREDENTIALS_REVISION_KEY } = env.load("utils/credentials");
      const previous = readCredentialsFile(env);
      const next = {
        ...previous,
        cookie: "next-cookie",
        githubToken: "next-token",
        aiTranslation: { service: { apiKey: "next-ai-secret" } },
      };
      const pending = prepareCredentialsUpdate(env.credentialsPath, previous, next);
      if (committed) {
        const native = new DatabaseSync(env.dbPath);
        native
          .prepare("UPDATE config SET value=? WHERE key=?")
          .run(JSON.stringify(pending.revision), CREDENTIALS_REVISION_KEY);
        native.close();
      }
      // Simulate process death: neither finish() nor rollback() runs.
      assert.equal(migration.isDatabaseReady(env.dbPath), true);
      assert.deepEqual(readCredentialsFile(env), committed ? next : previous);
    } finally {
      env.close();
    }
  }
});

test("invalid credentials are not overwritten and parser errors do not disclose their contents", () => {
  const env = setup({ version: 1, seed: seedV1 });
  try {
    const malformed = '{"cookie":"secret-do-not-log"';
    fs.writeFileSync(env.credentialsPath, malformed);
    assert.throws(
      () => env.load("utils/database-migration").initializeDatabase(env.dbPath),
      (error) => /credentials.json/.test(error.message) && !/secret-do-not-log/.test(error.message),
    );
    assert.equal(fs.readFileSync(env.credentialsPath, "utf8"), malformed);
    assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
  } finally {
    env.close();
  }
});

test("failed migration COMMIT restores both the legacy credentials and the preexisting JSON file", () => {
  const env = setup({ version: 1, seed: seedV1, failSql: (sql) => sql === "COMMIT" });
  try {
    const previous = { version: 1, cookie: "previous-cookie", webdav: {} };
    fs.writeFileSync(env.credentialsPath, JSON.stringify(previous));
    assert.throws(() => env.load("utils/database-migration").initializeDatabase(env.dbPath), /injected/);
    assert.deepEqual(readCredentialsFile(env), previous);
    assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
    assert.equal(env.inspect("SELECT password FROM webdav_services")[0].password, "test-password");
  } finally {
    env.close();
  }
});

test("a committed credential update remains readable if recovery snapshot cleanup fails", () => {
  let failCleanup = false;
  const env = setup({ failCredentialsWrite: (document) => failCleanup && !document.transaction });
  try {
    const config = env.load("utils/config").configManager;
    failCleanup = true;
    config.cookie = "committed-cookie";
    assert.ok(readCredentialsFile(env).transaction);
    assert.equal(config.cookie, "committed-cookie");
    failCleanup = false;
    assert.equal(config.cookie, "committed-cookie");
    assert.equal(readCredentialsFile(env).transaction, undefined);
  } finally {
    env.close();
  }
});

test("device counters preserve local visits while merging remote components and retries", () => {
  const env = setup({ version: 1, seed: seedV1 });
  try {
    const { configManager: config } = env.load("utils/config");
    const counters = env.load("utils/tag-access-counts");
    const { dbManager } = env.load("utils/database");
    const own = counters.getLocalTagAccessCounts()[0];
    assert.equal(own.count, 8);
    assert.equal(own.device_id, dbManager.deviceId);
    assert.equal(own.id, `${dbManager.deviceId}::artist:tag`);
    const other = {
      ...plain(own),
      device_id: "other-device",
      id: "other-device::artist:tag",
      count: 5,
      sync_version: 1,
    };
    counters.applyRemoteTagAccessCounts([other, own, other]);
    assert.equal(config.getTenMostAccessedTags()[0].count, 13);
    config.updateTagAccessCount([{ namespace: "artist", term: "tag" }]);
    counters.applyRemoteTagAccessCounts([{ ...other, count: 3, sync_version: 0 }, own]);
    assert.equal(config.getTenMostAccessedTags()[0].count, 14);
    assert.equal(counters.getLocalTagAccessCounts().length, 1);
    assert.equal(counters.getLocalTagAccessCounts()[0].count, 9);
    // Full snapshots replace other devices only; local visits made during download survive.
    counters.applyRemoteTagAccessCounts([{ ...other, count: 6, sync_version: 2 }, own], true);
    assert.equal(config.getTenMostAccessedTags()[0].count, 15);
    assert.throws(() => counters.applyRemoteTagAccessCounts([{ ...other, id: "wrong" }], true), /无效/);
    assert.equal(config.getTenMostAccessedTags()[0].count, 15);
    counters.applyRemoteTagAccessCounts([], true);
    assert.equal(config.getTenMostAccessedTags()[0].count, 9);
    assert.equal(env.reload("utils/database").dbManager.deviceId, dbManager.deviceId);
    assert.equal(env.reload("utils/config").configManager.getTenMostAccessedTags()[0].count, 9);
  } finally {
    env.close();
  }
});

test("counter ranking sums device contributions before taking the top ten", () => {
  const env = setup();
  try {
    const { configManager: config } = env.load("utils/config");
    const counters = env.load("utils/tag-access-counts");
    const row = (device, term, count) => ({
      id: `${device}:::${term}`,
      device_id: device,
      qualifier: "",
      namespace: "",
      term,
      count,
      sync_version: 0,
      deleted: 0,
    });
    counters.applyRemoteTagAccessCounts([
      ...Array.from({ length: 11 }, (_, i) => row("other", `tag-${i}`, 10 + i)),
      row("device-a", "combined", 11),
      row("device-b", "combined", 11),
    ]);
    const top = config.getTenMostAccessedTags();
    assert.equal(top.length, 10);
    assert.equal(top[0].term, "combined");
    assert.equal(top[0].count, 22);
    assert.equal(counters.getLocalTagAccessCounts().length, 0);
  } finally {
    env.close();
  }
});

test("draft v2 counters acquire a stable local identity and failed upgrades roll back", () => {
  for (const failCommit of [false, true]) {
    let fail = false;
    const env = setup({ failSql: (sql) => fail && sql === "COMMIT" });
    try {
      const migration = env.load("utils/database-migration");
      migration.initializeDatabase(env.dbPath);
      const db = new DatabaseSync(env.dbPath);
      db.exec(`DROP TABLE tag_access_count_v2;
        DELETE FROM config WHERE key='_sync_device_id';
        CREATE TABLE tag_access_count_v2(id TEXT PRIMARY KEY,sync_version INTEGER DEFAULT 0,deleted INTEGER DEFAULT 0,
          namespace TEXT DEFAULT '',qualifier TEXT DEFAULT '',term TEXT DEFAULT '',count INTEGER DEFAULT 0);
        INSERT INTO tag_access_count_v2 VALUES(':artist:tag',0,0,'artist','','tag',17);`);
      db.close();
      assert.equal(migration.isDatabaseReady(env.dbPath), false);
      fail = failCommit;
      if (fail) {
        assert.throws(() => migration.initializeDatabase(env.dbPath), /injected/);
        assert.equal(
          env.inspect("PRAGMA table_info(tag_access_count_v2)").some((c) => c.name === "device_id"),
          false,
        );
        assert.equal(env.inspect("SELECT count FROM tag_access_count_v2")[0].count, 17);
        assert.equal(env.inspect("SELECT * FROM config WHERE key='_sync_device_id'").length, 0);
        fail = false;
      }
      migration.initializeDatabase(env.dbPath);
      const own = env.load("utils/tag-access-counts").getLocalTagAccessCounts()[0];
      assert.equal(own.count, 17);
      assert.equal(own.id, `${own.device_id}::artist:tag`);
      assert.equal(migration.isDatabaseReady(env.dbPath), true);
      const backups = fs.readdirSync(env.dir).filter((n) => n.includes("before-v2"));
      migration.initializeDatabase(env.dbPath);
      assert.deepEqual(
        fs.readdirSync(env.dir).filter((n) => n.includes("before-v2")),
        backups,
      );
    } finally {
      env.close();
    }
  }
});

test("invalid or overflowing device counts do not partially apply", () => {
  let fail = false;
  const env = setup({ failSql: (sql) => fail && sql.includes("INSERT INTO tag_access_count_v2") });
  try {
    const { configManager: config } = env.load("utils/config");
    const counters = env.load("utils/tag-access-counts");
    const remote = {
      id: "other:::tag",
      device_id: "other",
      qualifier: "",
      namespace: "",
      term: "tag",
      count: 5,
      sync_version: 0,
      deleted: 0,
    };
    counters.applyRemoteTagAccessCounts([remote]);
    for (const patch of [
      { count: -1 },
      { count: 1.5 },
      { count: Number.MAX_SAFE_INTEGER + 1 },
      { deleted: 2 },
      { sync_version: -1 },
    ])
      assert.throws(() => counters.applyRemoteTagAccessCounts([{ ...remote, ...patch }], true), /无效/);
    assert.throws(() => config.updateTagAccessCount([{ term: "valid" }, { term: "bad:term" }]), /冒号/);
    assert.equal(counters.getLocalTagAccessCounts().length, 0);
    fail = true;
    assert.throws(() => counters.applyRemoteTagAccessCounts([{ ...remote, count: 6 }], true), /injected/);
    assert.equal(config.getTenMostAccessedTags()[0].count, 5);
  } finally {
    env.close();
  }
});

// Protocol simulator deliberately returns current records, supports split pages,
// caches exact request bytes, and can lose a response after committing a write.
function syncServer() {
  const records = new Map(),
    devices = new Map(),
    writes = [],
    reads = [];
  let seq = 0;
  const key = (table, id) => JSON.stringify([table, id]);
  const put = (record) => {
    records.set(key(record.tablename, record.id), plain(record));
    seq++;
  };
  const server = { records, devices, writes, reads, put, loseWrite: false, onRead: null, onWrite: null };
  server.transport = async (method, path, raw) => {
    const b = raw ? JSON.parse(raw) : {};
    if (method === "PUT") {
      const id = decodeURIComponent(path.split("/").pop());
      if (!devices.has(id)) devices.set(id, { id, last_request_seq: 0, disabled: false });
      return { device: plain(devices.get(id)) };
    }
    if (path === "/v1/write") {
      writes.push(raw);
      const d = devices.get(b.device_id);
      if (b.request_seq === d.last_request_seq) {
        assert.equal(raw, d.raw);
        return plain(d.result);
      }
      assert.equal(b.request_seq, d.last_request_seq + 1);
      const results = b.operations.map((op, index) => {
        const current = records.get(key(op.tablename, op.id));
        const result = { index, tablename: op.tablename, id: op.id };
        let code;
        if (!op.forced) {
          if (op.operation === "create" && current && !current.deleted) code = "ALREADY_EXISTS";
          if (op.operation !== "create" && (!current || current.deleted)) code = "ENTITY_NOT_FOUND";
          else if (op.operation !== "create" && current.sync_version !== op.base_sync_version)
            code = "VERSION_CONFLICT";
        }
        if (code) return { ...result, success: false, code };
        const record = {
          tablename: op.tablename,
          id: op.id,
          sync_version: (current?.sync_version ?? 0) + 1,
          deleted: op.operation === "delete",
          ...(op.operation === "delete" ? {} : { content: op.content }),
        };
        put(record);
        return { ...result, success: true, sync_version: record.sync_version, deleted: record.deleted };
      });
      d.last_request_seq = b.request_seq;
      d.raw = raw;
      d.result = { request_seq: b.request_seq, results };
      if (server.onWrite) {
        const callback = server.onWrite;
        server.onWrite = null;
        callback();
      }
      if (server.loseWrite) {
        server.loseWrite = false;
        throw new Error("simulated lost response");
      }
      return plain(d.result);
    }
    if (path === "/v1/read") {
      reads.push(b);
      return {
        results: b.keys.map((k) => {
          const record = records.get(key(k.tablename, k.id));
          return record
            ? { ...plain(record), found: true, server_updated_at: 1000, updated_by_device_id: "other" }
            : { ...k, found: false };
        }),
      };
    }
    if (path === "/v1/full-download" || path === "/v1/table-download") {
      reads.push(b);
      const sorted = [...records.values()]
        .filter((record) => path !== "/v1/table-download" || record.tablename === b.tablename)
        .sort((a, b) => a.tablename.localeCompare(b.tablename) || a.id.localeCompare(b.id));
      const offset = b.cursor?.offset ?? 0;
      const data = sorted.slice(offset, offset + 1),
        more = offset + 1 < sorted.length;
      const start = b.cursor?.start_seq ?? seq;
      return {
        start_seq: start,
        data: plain(data),
        has_more: more,
        next_cursor: more
          ? { start_seq: start, after: { tablename: data[0].tablename, id: data[0].id }, offset: offset + 1 }
          : null,
      };
    }
    if (path === "/v1/sync") {
      reads.push(b);
      if (server.onRead) {
        const callback = server.onRead;
        server.onRead = null;
        callback();
      }
      return { changes: b.seq < seq ? plain([...records.values()]) : [], next_seq: seq, has_more: false };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return server;
}

function syncSetup(env, names, server = syncServer()) {
  const store = env.load("sync/store"),
    { SyncEngine } = env.load("sync/engine");
  const engine = new SyncEngine(server.transport);
  engine.configure("https://sync.example.com", "a".repeat(64));
  store.selectTables(names);
  return { store, engine, server, db: env.load("utils/database").dbManager };
}

test("sync credentials are file-only, preserve old credentials, and roll back with SQL failure", () => {
  let fail = false;
  const env = setup({ version: 1, seed: seedV1, failSql: (sql) => fail && sql.includes("INSERT INTO sync_meta") });
  try {
    const { engine } = syncSetup(env, ["search_history_v2"]);
    const before = readCredentialsFile(env);
    assert.equal(before.sync.url, "https://sync.example.com");
    assert.ok(Object.values(before.webdav).some((v) => v.password === "test-password"));
    assert.equal(
      env.inspect("SELECT value FROM config WHERE value LIKE '%sync.example.com%' OR value LIKE '%aaaaaaaaaaaaaaaa%' ")
        .length,
      0,
    );
    fail = true;
    assert.throws(() => engine.configure("https://other.example.com", "b".repeat(64)), /injected/);
    assert.deepEqual(readCredentialsFile(env), before);
  } finally {
    env.close();
  }
});

test("sync tracks aggregate edits atomically and ignores local-only service selection", () => {
  let fail = false;
  const env = setup({ failSql: (sql) => fail && sql === "SELECT injected" });
  try {
    const { db, store } = syncSetup(env, ["search_history_v2", "webdav_services_v2"]);
    const config = env.load("utils/config").configManager;
    config.addOrUpdateSearchHistory("x", [{ term: "x" }]);
    assert.equal(db.query("SELECT * FROM sync_pending WHERE id='x'").length, 1);
    assert.equal(store.localRecord("search_history_v2", "x").content.children[0].term, "x");
    db.update("INSERT INTO webdav_services_v2(id,enabled) VALUES('dav',0)");
    db.update("DELETE FROM sync_pending");
    db.update("UPDATE webdav_services_v2 SET enabled=1 WHERE id='dav'");
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
    fail = true;
    assert.throws(() =>
      db.transactionUpdate([
        { sql: "UPDATE search_history_v2 SET last_access_time='edited' WHERE id='x'" },
        { sql: "SELECT injected" },
      ]),
    );
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
    assert.throws(() => store.selectTables(["favorite_images_v2"]), /图库记录/);
  } finally {
    env.close();
  }
});

test("sync replays identical bytes after a lost response and preserves edits made during upload", async () => {
  const env = setup();
  try {
    const { db, store, engine, server } = syncSetup(env, ["marked_uploaders_v2"]);
    db.update("INSERT INTO marked_uploaders_v2(id) VALUES('alice')");
    server.loseWrite = true;
    server.onWrite = () => db.update("UPDATE marked_uploaders_v2 SET deleted=1 WHERE id='alice'");
    await assert.rejects(engine.synchronize(), /lost response/);
    const saved = store.getMeta("inflight", null);
    assert.ok(saved);
    assert.equal(db.query("SELECT deleted FROM marked_uploaders_v2 WHERE id='alice'")[0].deleted, 1);
    assert.throws(() => store.selectTables([]), /未完成/);
    await engine.synchronize();
    assert.equal(server.writes[0], server.writes[1]);
    assert.equal(server.records.get(JSON.stringify(["marked_uploaders_v2", "alice"])).deleted, true);
    assert.equal(store.getMeta("inflight", null), null);
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
  } finally {
    env.close();
  }
});

test("sync stages all pages, logs orphan rows, retries them when their parent arrives, and applies tombstones without content", async () => {
  const env = setup();
  try {
    const { db, store, engine, server } = syncSetup(env, ["archive_entries_v2", "archive_read_state_v2"]);
    server.put({
      tablename: "archive_read_state_v2",
      id: "77",
      content: { first_access_time: "a", last_access_time: "b", readlater: 0, last_read_page: 2 },
      sync_version: 1,
      deleted: false,
    });
    await engine.synchronize();
    assert.equal(db.query("SELECT * FROM archive_read_state_v2 WHERE id='77'").length, 0);
    assert.equal(db.query("SELECT code FROM sync_log WHERE id='77'")[0].code, "FOREIGN_KEY");
    assert.ok(store.mirror("archive_read_state_v2", "77"));
    db.atomic((tx) => tx.execute("INSERT INTO archive_entries_v2(id,title) VALUES('77','parent')"), true);
    const content = plain(store.localRecord("archive_entries_v2", "77").content);
    db.atomic((tx) => tx.execute("DELETE FROM archive_entries_v2 WHERE id='77'"), true);
    server.put({ tablename: "archive_entries_v2", id: "77", content, sync_version: 1, deleted: false });
    await engine.synchronize();
    assert.equal(db.query("SELECT last_read_page FROM archive_read_state_v2 WHERE id='77'")[0].last_read_page, 2);
    assert.equal(db.query("SELECT * FROM sync_log WHERE id='77'").length, 0);
    server.put({ tablename: "archive_read_state_v2", id: "missing", deleted: true, sync_version: 2 });
    await engine.synchronize();
    assert.equal(store.mirror("archive_read_state_v2", "missing").deleted, true);
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
  } finally {
    env.close();
  }
});

test("sync keeps local edits during download and requires explicit conflict resolution", async () => {
  const env = setup();
  try {
    const { db, store, engine, server } = syncSetup(env, ["search_history_v2"]);
    const config = env.load("utils/config").configManager;
    config.addOrUpdateSearchHistory("x", [{ term: "local" }]);
    server.put({
      tablename: "search_history_v2",
      id: "x",
      content: {
        last_access_time: "remote",
        children: [
          { term_index: 0, namespace: null, qualifier: null, term: "cloud", dollar: 0, subtract: 0, tilde: 0 },
        ],
      },
      deleted: false,
      sync_version: 2,
    });
    server.onRead = () => config.addOrUpdateSearchHistory("x", [{ term: "new-local" }]);
    await engine.synchronize();
    assert.equal(store.localRecord("search_history_v2", "x").content.children[0].term, "new-local");
    assert.equal(db.query("SELECT conflict FROM sync_pending WHERE id='x'")[0].conflict, "ALREADY_EXISTS");
    engine.resolve(
      "search_history_v2",
      "x",
      "local",
      (
        await engine.readConflicts(
          db.query("SELECT * FROM sync_pending WHERE tablename=? AND id=?", ["search_history_v2", "x"]),
        )
      )[0],
    );
    await engine.synchronize();
    assert.equal(server.records.get(JSON.stringify(["search_history_v2", "x"])).content.children[0].term, "new-local");
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
    assert.equal(JSON.parse(server.writes.at(-1)).operations[0].forced, undefined);
  } finally {
    env.close();
  }
});

test("newly selected tables get full history and downloaded services remain off without changing local selection", async () => {
  const env = setup();
  try {
    const { db, store, engine, server } = syncSetup(env, ["marked_uploaders_v2"]);
    server.put({
      tablename: "webdav_services_v2",
      id: "remote",
      content: { name: "Remote", host: "host", port: null, https: 1, path: null },
      sync_version: 1,
      deleted: false,
    });
    await engine.synchronize();
    assert.equal(db.query("SELECT * FROM webdav_services_v2 WHERE id='remote'").length, 0);
    store.selectTables(["marked_uploaders_v2", "webdav_services_v2"]);
    await engine.synchronize();
    assert.equal(db.query("SELECT enabled FROM webdav_services_v2 WHERE id='remote'")[0].enabled, 0);
    db.update("UPDATE webdav_services_v2 SET enabled=1 WHERE id='remote'");
    await engine.synchronize();
    assert.equal(db.query("SELECT enabled FROM webdav_services_v2 WHERE id='remote'")[0].enabled, 1);
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
    assert.equal(store.localRecord("webdav_services_v2", "remote").content.enabled, undefined);
  } finally {
    env.close();
  }
});

test("sync commits no partial pages or cursor when a later download fails", async () => {
  const env = setup();
  try {
    const server = syncServer();
    server.put({ tablename: "marked_uploaders_v2", id: "a", content: {}, sync_version: 1, deleted: false });
    server.put({ tablename: "marked_uploaders_v2", id: "b", content: {}, sync_version: 1, deleted: false });
    const transport = server.transport;
    let fail = true;
    server.transport = async (method, path, raw) => {
      if (fail && path === "/v1/full-download" && JSON.parse(raw).cursor) throw new Error("page interrupted");
      return transport(method, path, raw);
    };
    const { db, store, engine } = syncSetup(env, ["marked_uploaders_v2"], server);
    await assert.rejects(engine.synchronize(), /page interrupted/);
    assert.equal(db.query("SELECT * FROM marked_uploaders_v2").length, 0);
    assert.equal(store.getMeta("seq", 0), 0);
    assert.equal(db.query("SELECT * FROM sync_stage").length, 1);
    fail = false;
    await engine.synchronize();
    assert.equal(db.query("SELECT * FROM marked_uploaders_v2 WHERE deleted=0").length, 2);
    assert.equal(store.getMeta("seq", 0), 2);
    assert.equal(db.query("SELECT * FROM sync_stage").length, 0);
  } finally {
    env.close();
  }
});

test("counter sync uses versions and tombstones, preserves local unconfirmed visits, and never uploads other devices", async () => {
  const env = setup();
  try {
    const { db, engine, server } = syncSetup(env, ["tag_access_count_v2"]);
    const content = { device_id: "other", namespace: "artist", qualifier: "", term: "x", count: 10 };
    server.put({ tablename: "tag_access_count_v2", id: "other::artist:x", content, sync_version: 5, deleted: false });
    await engine.synchronize();
    server.put({
      tablename: "tag_access_count_v2",
      id: "other::artist:x",
      content: { ...content, count: 2 },
      sync_version: 6,
      deleted: false,
    });
    await engine.synchronize();
    assert.equal(db.query("SELECT count FROM tag_access_count_v2 WHERE device_id='other'")[0].count, 2);
    server.put({ tablename: "tag_access_count_v2", id: "other::artist:x", sync_version: 7, deleted: true });
    await engine.synchronize();
    assert.equal(env.load("utils/config").configManager.getTenMostAccessedTags().length, 0);
    assert.equal(server.writes.length, 0);
    env.load("utils/config").configManager.updateTagAccessCount([{ term: "mine" }]);
    server.onWrite = () => env.load("utils/config").configManager.updateTagAccessCount([{ term: "mine" }]);
    await engine.synchronize();
    assert.equal(db.query("SELECT * FROM sync_pending").length, 1);
    assert.equal(db.query("SELECT count FROM tag_access_count_v2 WHERE device_id=?", [db.deviceId])[0].count, 2);
    await engine.synchronize();
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
    assert.ok(
      server.writes.every((body) => JSON.parse(body).operations.every((op) => op.content.device_id === db.deviceId)),
    );
  } finally {
    env.close();
  }
});

// Optional actual Worker + workerd/D1 contract check. Uses only ephemeral storage
// and a fixed fake master key, never the sibling repository's .dev.vars.
test("sync interoperates with the rebuilt Worker on real workerd/D1", { skip: !process.env.D1_SYNC_REPO }, async () => {
  const repo = process.env.D1_SYNC_REPO;
  const { createRequire } = require("node:module");
  const backendRequire = createRequire(path.join(repo, "package.json"));
  const { build } = backendRequire("esbuild");
  const { Miniflare, convertV4MiniflareOptions } = backendRequire("miniflare");
  const bundle = await build({
    entryPoints: [path.join(repo, "src/index.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    external: ["node:*"],
    target: "es2022",
    write: false,
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "sync",
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-08-15",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      bindings: { MASTER_KEY: "a".repeat(64) },
      ratelimits: { API_LIMITER: { namespace_id: "1001", simple: { limit: 10000, period: 60 } } },
    }),
  );
  const a = setup(),
    b = setup();
  try {
    const d1 = await mf.getD1Database("DB");
    const migrationsDir = path.join(repo, "migrations");
    const sql = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => fs.readFileSync(path.join(migrationsDir, name), "utf8"))
      .join("\n");
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await d1.prepare(statement).run();
    const transport = async (method, p, raw) => {
      const response = await mf.dispatchFetch("http://sync.local" + p, {
        method,
        headers: { Authorization: "Bearer " + "a".repeat(64), "Content-Type": "application/json" },
        ...(raw ? { body: raw } : {}),
      });
      const result = await response.json();
      assert.ok(response.ok, JSON.stringify(result));
      return result;
    };
    const left = syncSetup(a, ["search_history_v2"], { transport });
    const right = syncSetup(b, ["search_history_v2"], { transport });
    a.load("utils/config").configManager.addOrUpdateSearchHistory("shared", [{ term: "hello" }]);
    await left.engine.synchronize();
    await right.engine.synchronize();
    assert.equal(right.store.localRecord("search_history_v2", "shared").content.children[0].term, "hello");
    a.load("utils/config").configManager.addOrUpdateSearchHistory("shared", [{ term: "left" }]);
    b.load("utils/config").configManager.addOrUpdateSearchHistory("shared", [{ term: "right" }]);
    await left.engine.synchronize();
    await right.engine.synchronize();
    assert.equal(right.db.query("SELECT conflict FROM sync_pending WHERE id='shared'")[0].conflict, "VERSION_CONFLICT");
    right.engine.resolve(
      "search_history_v2",
      "shared",
      "cloud",
      (
        await right.engine.readConflicts(
          right.db.query("SELECT * FROM sync_pending WHERE tablename=? AND id=?", ["search_history_v2", "shared"]),
        )
      )[0],
    );
    assert.equal(right.store.localRecord("search_history_v2", "shared").content.children[0].term, "left");
    a.load("utils/config").configManager.deleteSearchHistory("shared");
    await left.engine.synchronize();
    await right.engine.synchronize();
    assert.equal(right.store.localRecord("search_history_v2", "shared").deleted, true);
    left.store.selectTables(["search_history_v2", "marked_uploaders_v2"]);
    right.store.selectTables(["search_history_v2", "marked_uploaders_v2"]);
    left.db.batchUpdate(
      "INSERT INTO marked_uploaders_v2(id) VALUES(?)",
      Array.from({ length: 105 }, (_, i) => [`uploader-${i}`]),
    );
    await left.engine.synchronize();
    await right.engine.synchronize();
    assert.equal(right.db.query("SELECT COUNT(*) AS n FROM marked_uploaders_v2 WHERE deleted=0")[0].n, 105);
    assert.equal(left.db.query("SELECT * FROM sync_pending").length, 0);
  } finally {
    a.close();
    b.close();
    await mf.dispose();
  }
});

test("an unseen tag tombstone is uploaded and hides website tags on a new device", async () => {
  const a = setup(),
    b = setup(),
    server = syncServer();
  try {
    const left = syncSetup(a, ["local_marked_tags_v2"], server);
    const right = syncSetup(b, ["local_marked_tags_v2"], server);
    a.load("utils/config").configManager.deleteMarkedTag("artist", "hidden");
    await left.engine.synchronize();
    const record = server.records.get(JSON.stringify(["local_marked_tags_v2", "artist:hidden"]));
    assert.equal(record.deleted, true);
    assert.equal(record.sync_version, 2);
    right.db.update("INSERT INTO downloaded_marked_tags_v2(namespace,name,tagid) VALUES('artist','hidden',5)");
    await right.engine.synchronize();
    assert.equal(right.db.query("SELECT deleted FROM local_marked_tags_v2 WHERE id='artist:hidden'")[0].deleted, 1);
    assert.equal(b.load("utils/config").configManager.getMarkedTag("artist", "hidden"), undefined);
    assert.equal(right.db.query("SELECT * FROM sync_pending").length, 0);
  } finally {
    a.close();
    b.close();
  }
});

test("deleting an unsynced key cannot erase a cloud record without explicit resolution", async () => {
  const env = setup();
  try {
    const { db, engine, server } = syncSetup(env, ["marked_uploaders_v2"]);
    db.update("INSERT INTO marked_uploaders_v2(id,deleted) VALUES('same',1)");
    server.put({ tablename: "marked_uploaders_v2", id: "same", content: {}, sync_version: 1, deleted: false });
    await engine.synchronize();
    assert.equal(server.writes.length, 0);
    assert.equal(db.query("SELECT conflict FROM sync_pending WHERE id='same'")[0].conflict, "VERSION_CONFLICT");
    engine.resolve(
      "marked_uploaders_v2",
      "same",
      "local",
      (
        await engine.readConflicts(
          db.query("SELECT * FROM sync_pending WHERE tablename=? AND id=?", ["marked_uploaders_v2", "same"]),
        )
      )[0],
    );
    await engine.synchronize();
    assert.equal(server.records.get(JSON.stringify(["marked_uploaders_v2", "same"])).deleted, true);
  } finally {
    env.close();
  }
});

// Linear simulator for the performance fixture, with real 100-record pages and
// 10-operation requests. Server time is excluded from SQL-operation assertions.
function scaleSyncServer(initial = []) {
  const records = [...initial],
    devices = new Map();
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    transport: async (method, path, raw) => {
      const b = raw ? JSON.parse(raw) : {};
      if (method === "PUT") {
        const id = decodeURIComponent(path.split("/").pop());
        if (!devices.has(id)) devices.set(id, 0);
        return { device: { id, last_request_seq: devices.get(id), disabled: false } };
      }
      if (path === "/v1/write") {
        assert.ok(b.operations.length <= 10);
        assert.equal(b.request_seq, devices.get(b.device_id) + 1);
        devices.set(b.device_id, b.request_seq);
        writes++;
        return {
          request_seq: b.request_seq,
          results: b.operations.map((op, index) => {
            assert.equal(op.operation, "create");
            records.push({ tablename: op.tablename, id: op.id, content: op.content, sync_version: 1, deleted: false });
            return { index, tablename: op.tablename, id: op.id, success: true, sync_version: 1, deleted: false };
          }),
        };
      }
      if (path === "/v1/read") {
        reads.push(b);
        return {
          results: b.keys.map((k) => {
            const record = records.get(key(k.tablename, k.id));
            return record
              ? { ...plain(record), found: true, server_updated_at: 1000, updated_by_device_id: "other" }
              : { ...k, found: false };
          }),
        };
      }
      if (path === "/v1/full-download" || path === "/v1/table-download") {
        const start = b.cursor?.start_seq ?? records.length;
        const offset = b.cursor?.offset ?? 0;
        const data = records.slice(offset, offset + 100),
          has_more = offset + data.length < records.length;
        const last = data.at(-1);
        return {
          start_seq: start,
          data,
          has_more,
          next_cursor: has_more
            ? { start_seq: start, after: { tablename: last.tablename, id: last.id }, offset: offset + data.length }
            : null,
        };
      }
      if (path === "/v1/sync") {
        const next = Math.min(records.length, b.seq + b.limit);
        return { changes: records.slice(b.seq, next), next_seq: next, has_more: next < records.length };
      }
      throw new Error("unexpected scale-test request");
    },
  };
}

for (const direction of ["upload", "download"])
  test(`15000-record ${direction} has bounded SQL work and no repeated history reloads`, async (t) => {
    const size = 15000;
    let measuring = false,
      pendingRows = 0,
      mirrorRows = 0,
      maxPendingPage = 0,
      businessInserts = 0,
      termQueries = 0,
      waits = 0;
    const env = setup({
      onSql: (sql) => {
        if (measuring && /^INSERT INTO search_history(?:_v2|_search_terms_v2)/.test(sql)) businessInserts++;
      },
      onQuery: (sql, count) => {
        if (!measuring) return;
        if (sql.includes("SELECT * FROM sync_pending INDEXED")) {
          pendingRows += count;
          maxPendingPage = Math.max(maxPendingPage, count);
        }
        if (sql.includes("SELECT m.* FROM")) mirrorRows += count;
        if (sql.startsWith("SELECT t.* FROM search_history_search_terms_v2")) termQueries++;
      },
      onWait: () =>
        new Promise((resolve) =>
          setImmediate(() => {
            waits++;
            resolve();
          }),
        ),
    });
    try {
      const record = (i) => ({
        tablename: "search_history_v2",
        id: `history-${String(i).padStart(5, "0")}`,
        sync_version: 1,
        deleted: false,
        content: {
          last_access_time: "2026-09-20",
          children: [0, 1, 2].map((term_index) => ({
            term_index,
            namespace: null,
            qualifier: null,
            term: `term-${i}-${term_index}`,
            dollar: 0,
            subtract: 0,
            tilde: 0,
          })),
        },
      });
      const server = scaleSyncServer(direction === "download" ? Array.from({ length: size }, (_, i) => record(i)) : []);
      const { db, engine, store } = syncSetup(env, ["search_history_v2"], server);
      if (direction === "upload")
        db.atomic((tx) => {
          for (let i = 0; i < size; i++) {
            const row = record(i);
            tx.execute("INSERT INTO search_history_v2(id,last_access_time) VALUES(?,?)", [
              row.id,
              row.content.last_access_time,
            ]);
            for (const c of row.content.children)
              tx.execute("INSERT INTO search_history_search_terms_v2(history_id,term_index,term) VALUES(?,?,?)", [
                row.id,
                c.term_index,
                c.term,
              ]);
          }
        });
      const plan = env.inspect(
        "EXPLAIN QUERY PLAN SELECT * FROM sync_pending INDEXED BY sync_pending_ready WHERE tablename=? AND conflict IS NULL AND revision<=? ORDER BY revision,id LIMIT 10",
        ["search_history_v2", 9999999],
      );
      assert.ok(plan.some((r) => r.detail.includes("SEARCH sync_pending USING INDEX sync_pending_ready")));
      assert.ok(plan.every((r) => !r.detail.includes("TEMP B-TREE")));
      let maxTransactionMs = 0;
      const atomic = db.atomic.bind(db);
      db.atomic = (...args) => {
        const start = performance.now();
        try {
          return atomic(...args);
        } finally {
          maxTransactionMs = Math.max(maxTransactionMs, performance.now() - start);
        }
      };
      measuring = true;
      const started = performance.now();
      await engine.synchronize();
      const elapsed = Math.round(performance.now() - started);
      assert.equal(db.query("SELECT COUNT(*) AS n FROM search_history_v2 WHERE deleted=0")[0].n, size);
      assert.equal(db.query("SELECT COUNT(*) AS n FROM search_history_search_terms_v2")[0].n, size * 3);
      assert.equal(store.getMeta("seq", 0), size);
      assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
      if (direction === "upload") {
        assert.equal(server.writes, size / 10);
        assert.equal(pendingRows, size);
        assert.equal(maxPendingPage, 10);
        assert.equal(businessInserts, 0); // acknowledgements must never replay business rows
        assert.equal(termQueries, 0);
        assert.equal(mirrorRows, 0); // own echoed records already have acknowledged versions
        assert.ok(waits >= size / 10);
      } else {
        assert.equal(server.writes, 0);
        assert.equal(mirrorRows, size);
        assert.ok(businessInserts <= (size / 100) * 4); // 1 parent + 3 child statements per 100 records
        assert.equal(termQueries, 1); // one joined query, not 15000 per-record queries
        assert.equal(env.load("utils/config").configManager.searchHistory.length, size);
      }
      const previous = { businessInserts, termQueries, mirrorRows, pendingRows };
      await engine.synchronize();
      assert.deepEqual({ businessInserts, termQueries, mirrorRows, pendingRows }, previous);
      t.diagnostic(
        `${direction}: ${elapsed} ms local test, max transaction ${Math.round(maxTransactionMs)} ms, pending rows ${pendingRows}, projected rows ${mirrorRows}, business INSERT calls ${businessInserts}, history-term queries ${termQueries}`,
      );
    } finally {
      env.close();
    }
  });

test("bulk projection isolates a bad aggregate and commits valid neighbours", async () => {
  const env = setup();
  try {
    const make = (id, term_index) => ({
      tablename: "search_history_v2",
      id,
      sync_version: 1,
      deleted: false,
      content: {
        last_access_time: "2026-09-20",
        children: [{ term_index, namespace: null, qualifier: null, term: "x", dollar: 0, subtract: 0, tilde: 0 }],
      },
    });
    const server = scaleSyncServer([make("good-before", 0), make("invalid", -1), make("good-after", 0)]);
    const { db, engine, store } = syncSetup(env, ["search_history_v2"], server);
    await engine.synchronize();
    assert.deepEqual(plain(db.query("SELECT id FROM search_history_v2 ORDER BY id").map((r) => r.id)), [
      "good-after",
      "good-before",
    ]);
    assert.equal(db.query("SELECT COUNT(*) AS n FROM search_history_search_terms_v2")[0].n, 2);
    assert.equal(db.query("SELECT code FROM sync_log WHERE id='invalid'")[0].code, "INVALID_CONTENT");
    assert.ok(store.mirror("search_history_v2", "invalid"));
    assert.equal(store.getMeta("seq", 0), 3);
  } finally {
    env.close();
  }
});

test("bulk projection failure rolls back all business rows and the formal cursor", async () => {
  let armed = false,
    projecting = false,
    fail = true;
  const env = setup({
    onSql: (sql) => {
      if (armed && sql.startsWith("INSERT INTO search_history_v2")) projecting = true;
    },
    failSql: (sql) => {
      if (fail && projecting && sql === "COMMIT") {
        fail = false;
        return true;
      }
      return false;
    },
  });
  try {
    const server = scaleSyncServer(
      Array.from({ length: 120 }, (_, i) => ({
        tablename: "search_history_v2",
        id: `x-${i}`,
        sync_version: 1,
        deleted: false,
        content: { last_access_time: "2026-09-20", children: [] },
      })),
    );
    const { db, engine, store } = syncSetup(env, ["search_history_v2"], server);
    armed = true;
    await assert.rejects(engine.synchronize(), /injected/);
    assert.equal(db.query("SELECT COUNT(*) AS n FROM search_history_v2")[0].n, 0);
    assert.equal(db.query("SELECT COUNT(*) AS n FROM sync_mirror")[0].n, 0);
    assert.equal(store.getMeta("seq", 0), 0);
    assert.equal(db.query("SELECT COUNT(*) AS n FROM sync_stage")[0].n, 120);
    await engine.synchronize();
    assert.equal(db.query("SELECT COUNT(*) AS n FROM search_history_v2")[0].n, 120);
    assert.equal(store.getMeta("seq", 0), 120);
  } finally {
    env.close();
  }
});

for (const [code, word, httpStatus] of [
  ["D1_READ_QUOTA_EXCEEDED", "读取额度", 429],
  ["D1_WRITE_QUOTA_EXCEEDED", "写入额度", 429],
  ["D1_STORAGE_QUOTA_EXCEEDED", "账户存储", 507],
  ["D1_DATABASE_SIZE_EXCEEDED", "数据库容量", 507],
]) {
  test(`sync transport preserves ${code} without automatic retry`, async () => {
    let requests = 0;
    const env = setup({
      httpRequest: async () => {
        requests++;
        return {
          response: { statusCode: httpStatus, headers: { "Retry-After": "3600" } },
          error: { description: "HTTP error" },
          rawData: { string: JSON.stringify({ error: { code, message: "untrusted details" } }) },
        };
      },
      onWait: () => assert.fail("quota errors must not retry"),
    });
    try {
      const { SyncEngine } = env.load("sync/engine");
      const engine = new SyncEngine();
      engine.configure("https://sync.example.com", "a".repeat(64));
      await assert.rejects(engine.connectionTest(), { message: code });
      assert.equal(requests, 1);
      assert.ok(env.load("sync/errors").syncErrorMessages[code].includes(word));
      assert.equal(engine.busy, false);
    } finally {
      env.close();
    }
  });
}

test("quota failure preserves the exact unconfirmed upload for later recovery", async () => {
  const server = syncServer();
  let exhausted = true;
  const uploads = [];
  const env = setup({
    httpRequest: async (request) => {
      const route = new URL(request.url).pathname;
      if (route === "/v1/write") {
        uploads.push(request.body.string);
        if (exhausted)
          return {
            response: { statusCode: 429 },
            rawData: { string: JSON.stringify({ error: { code: "D1_WRITE_QUOTA_EXCEEDED" } }) },
          };
      }
      return {
        response: { statusCode: 200 },
        rawData: { string: JSON.stringify(await server.transport(request.method, route, request.body?.string)) },
      };
    },
  });
  try {
    const { SyncEngine } = env.load("sync/engine"),
      store = env.load("sync/store"),
      db = env.load("utils/database").dbManager;
    const engine = new SyncEngine();
    engine.configure("https://sync.example.com", "a".repeat(64));
    store.selectTables(["search_history_v2"]);
    env.load("utils/config").configManager.addOrUpdateSearchHistory("pending", [{ term: "preserved" }]);
    await assert.rejects(engine.synchronize(), { message: "D1_WRITE_QUOTA_EXCEEDED" });
    assert.equal(uploads.length, 1);
    assert.equal(store.getMeta("inflight", null).body, uploads[0]);
    assert.equal(db.query("SELECT * FROM sync_pending").length, 1);
    assert.equal(db.query("SELECT code FROM sync_log WHERE tablename='' AND id=''")[0].code, "D1_WRITE_QUOTA_EXCEEDED");
    exhausted = false;
    await engine.synchronize();
    assert.equal(uploads.length, 2);
    assert.equal(uploads[0], uploads[1]);
    assert.equal(store.getMeta("inflight", null), null);
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
  } finally {
    env.close();
  }
});

test("HTTP 200 streamed quota errors discard the page and preserve the cursor", async () => {
  const server = syncServer();
  let pages = 0;
  const env = setup({
    httpRequest: async (request) => {
      const route = new URL(request.url).pathname;
      if (route === "/v1/full-download") {
        pages++;
        return {
          response: { statusCode: 200 },
          rawData: {
            string: JSON.stringify({
              data: [{ tablename: "search_history_v2", id: "partial", sync_version: 1, deleted: false, content: {} }],
              error: { code: "D1_READ_QUOTA_EXCEEDED" },
            }),
          },
        };
      }
      return {
        response: { statusCode: 200 },
        rawData: { string: JSON.stringify(await server.transport(request.method, route, request.body?.string)) },
      };
    },
  });
  try {
    const { SyncEngine } = env.load("sync/engine"),
      store = env.load("sync/store"),
      db = env.load("utils/database").dbManager;
    const engine = new SyncEngine();
    engine.configure("https://sync.example.com", "a".repeat(64));
    store.selectTables(["search_history_v2"]);
    const before = store.getMeta("seq", 0);
    await assert.rejects(engine.synchronize(), { message: "D1_READ_QUOTA_EXCEEDED" });
    assert.equal(pages, 1);
    assert.equal(store.getMeta("seq", 0), before);
    assert.equal(store.getMeta("needsFull", true), true);
    for (const table of ["sync_stage", "sync_mirror", "search_history_v2"])
      assert.equal(db.query(`SELECT * FROM ${table}`).length, 0);
  } finally {
    env.close();
  }
});

test("transient database failures still retry and retain their original code", async () => {
  let requests = 0;
  const waits = [];
  const env = setup({
    httpRequest: async () => {
      requests++;
      return {
        response: { statusCode: 503 },
        rawData: { string: JSON.stringify({ error: { code: "DATABASE_UNAVAILABLE" } }) },
      };
    },
    onWait: async (delay) => {
      waits.push(delay);
    },
  });
  try {
    const engine = new (env.load("sync/engine").SyncEngine)();
    engine.configure("https://sync.example.com", "a".repeat(64));
    await assert.rejects(engine.connectionTest(), { message: "DATABASE_UNAVAILABLE" });
    assert.equal(requests, 3);
    assert.deepEqual(waits, [1, 2]);
  } finally {
    env.close();
  }
});

test("v1-to-v2 extracts GitHub and AI secrets before ConfigManager is loaded", () => {
  for (const version of [0, 1]) {
    const env = setup({ version, seed: seedV1 });
    try {
      const native = new DatabaseSync(env.dbPath);
      native.prepare("INSERT INTO config VALUES('githubToken',?)").run(JSON.stringify("github-secret"));
      native
        .prepare("INSERT INTO config VALUES('aiTranslationSavedConfigText',?)")
        .run(JSON.stringify("obsolete-secret"));
      native
        .prepare("UPDATE ai_translation_services SET config_form=?,config=? WHERE id=1")
        .run(
          JSON.stringify([
            ...secureForm,
            { ...secureForm[1], key: "defaultKey", default: "schema-secret" },
            { ...secureForm[1], key: "emptyKey", default: "fallback-secret" },
          ]),
          JSON.stringify({ host: "example", apiKey: "ai-secret", emptyKey: "" }),
        );
      native.close();
      const migration = env.load("utils/database-migration");
      migration.initializeDatabase(env.dbPath);
      const [row] = env.inspect("SELECT * FROM ai_translation_services_v2");
      const credentials = readCredentialsFile(env);
      assert.equal(credentials.githubToken, "github-secret");
      assert.deepEqual(credentials.aiTranslation[row.id], {
        apiKey: "ai-secret",
        defaultKey: "schema-secret",
        emptyKey: "",
      });
      assert.deepEqual(JSON.parse(row.config), { host: "example" });
      assert.ok(
        JSON.parse(row.config_form)
          .filter((item) => item.secure)
          .every((item) => item.default === ""),
      );
      assert.equal(
        env.inspect("SELECT * FROM config WHERE key IN ('githubToken','aiTranslationSavedConfigText')").length,
        0,
      );
      assert.doesNotMatch(JSON.stringify(row), /ai-secret|schema-secret|fallback-secret/);
      assert.equal(migration.isDatabaseReady(env.dbPath), true);
      const before = fs.readFileSync(env.credentialsPath, "utf8");
      migration.initializeDatabase(env.dbPath);
      assert.equal(fs.readFileSync(env.credentialsPath, "utf8"), before);
      const config = env.load("utils/config").configManager;
      assert.equal(config.githubToken, "github-secret");
      assert.equal(config.aiTranslationServices[0].config.apiKey, "ai-secret");
      assert.equal(env.inspect("SELECT * FROM config WHERE key='githubToken'").length, 0);
    } finally {
      env.close();
    }
  }
});

test("GitHub token edits, clearing and reload remain file-only and roll back on failure", () => {
  let failFile = false,
    failCommit = false;
  const env = setup({ failCredentialsWrite: () => failFile, failSql: (sql) => failCommit && sql === "COMMIT" });
  try {
    let config = env.load("utils/config").configManager;
    assert.equal(config.githubToken, "");
    config.githubToken = "github-one";
    config = env.reload("utils/config").configManager;
    assert.equal(config.githubToken, "github-one");
    const before = readCredentialsFile(env);
    failFile = true;
    assert.throws(() => {
      config.githubToken = "github-two";
    }, /credentials.json/);
    failFile = false;
    failCommit = true;
    assert.throws(() => {
      config.githubToken = "github-three";
    }, /injected/);
    failCommit = false;
    assert.deepEqual(readCredentialsFile(env), before);
    config.githubToken = "";
    assert.equal(env.reload("utils/config").configManager.githubToken, "");
    assert.equal(env.inspect("SELECT * FROM config WHERE key='githubToken'").length, 0);
  } finally {
    env.close();
  }
});

test("secure flags move arbitrary fields in both directions repeatedly without losing values", () => {
  const env = setup();
  try {
    let config = env.load("utils/config").configManager;
    config.addAITranslationService({
      name: "toggle",
      selected: false,
      scriptText: "async () => {}",
      configForm: secureForm,
      config: { host: "private-host", apiKey: "secret-key" },
    });
    const id = config.aiTranslationServices.find((s) => s.name === "toggle").id;
    for (let index = 0; index < 4; index++) {
      const service = config.aiTranslationServices.find((s) => s.id === id);
      const form = secureForm.map((item) => ({
        ...item,
        secure: index % 2 === 0 ? item.key === "host" : item.key === "apiKey",
      }));
      // Use only SQL values: the file must supply a formerly secure field during schema edits.
      const stored = env.inspect("SELECT config FROM ai_translation_services_v2 WHERE id=?", [id])[0];
      config.editAITranslationService({ ...service, configForm: form, config: JSON.parse(stored.config) });
      const next = readCredentialsFile(env).aiTranslation[id];
      const sql = JSON.parse(env.inspect("SELECT config FROM ai_translation_services_v2 WHERE id=?", [id])[0].config);
      assert.deepEqual(next, index % 2 === 0 ? { host: "private-host" } : { apiKey: "secret-key" });
      assert.deepEqual(sql, index % 2 === 0 ? { apiKey: "secret-key" } : { host: "private-host" });
      config = env.reload("utils/config").configManager;
      assert.deepEqual(plain(config.aiTranslationServices.find((s) => s.id === id).config), {
        host: "private-host",
        apiKey: "secret-key",
      });
    }
    const service = config.aiTranslationServices.find((s) => s.id === id);
    // A schema-only removal with stale runtime values must not leak the removed secret into SQL.
    config.editAITranslationService({ ...service, configForm: [secureForm[0]] });
    assert.equal(readCredentialsFile(env).aiTranslation[id], undefined);
    assert.deepEqual(
      JSON.parse(env.inspect("SELECT config FROM ai_translation_services_v2 WHERE id=?", [id])[0].config),
      { host: "private-host" },
    );
  } finally {
    env.close();
  }
});

test("schema changes loaded from SQL restore ordinary fields and prune removed credentials", () => {
  const env = setup();
  try {
    let config = env.load("utils/config").configManager;
    config.addAITranslationService({
      name: "external-schema",
      selected: false,
      scriptText: "async () => {}",
      configForm: secureForm,
      config: { host: "example", apiKey: "local-secret" },
    });
    const id = config.aiTranslationServices.find((s) => s.name === "external-schema").id;
    const db = env.load("utils/database").dbManager;
    db.update("UPDATE ai_translation_services_v2 SET config_form=? WHERE id=?", [
      JSON.stringify(secureForm.map((s) => ({ ...s, secure: false }))),
      id,
    ]);
    config = env.reload("utils/config").configManager;
    assert.equal(config.aiTranslationServices.find((s) => s.id === id).config.apiKey, "local-secret");
    assert.equal(readCredentialsFile(env).aiTranslation[id], undefined);
    assert.equal(
      JSON.parse(env.inspect("SELECT config FROM ai_translation_services_v2 WHERE id=?", [id])[0].config).apiKey,
      "local-secret",
    );
    db.update("UPDATE ai_translation_services_v2 SET config_form=? WHERE id=?", [JSON.stringify(secureForm), id]);
    config = env.reload("utils/config").configManager;
    assert.equal(readCredentialsFile(env).aiTranslation[id].apiKey, "local-secret");
    db.update("UPDATE ai_translation_services_v2 SET deleted=1 WHERE id=?", [id]);
    env.reload("utils/config");
    assert.equal(readCredentialsFile(env).aiTranslation[id], undefined);
  } finally {
    env.close();
  }
});

test("draft v2 with GitHub or inline AI credentials completes the same migration", () => {
  const env = setup();
  try {
    const migration = env.load("utils/database-migration");
    migration.initializeDatabase(env.dbPath);
    const native = new DatabaseSync(env.dbPath);
    native.prepare("INSERT INTO config VALUES('githubToken',?)").run(JSON.stringify("draft-github"));
    native
      .prepare(
        "INSERT INTO ai_translation_services_v2(id,name,script_text,config_form,config,sync_version) VALUES(?,?,?,?,?,?)",
      )
      .run(
        "draft-ai",
        "draft",
        "async () => {}",
        JSON.stringify(secureForm),
        JSON.stringify({ apiKey: "draft-secret" }),
        7,
      );
    native.close();
    assert.equal(migration.isDatabaseReady(env.dbPath), false);
    migration.initializeDatabase(env.dbPath);
    assert.equal(migration.isDatabaseReady(env.dbPath), true);
    assert.equal(readCredentialsFile(env).githubToken, "draft-github");
    assert.deepEqual(readCredentialsFile(env).aiTranslation["draft-ai"], { apiKey: "draft-secret" });
    const [row] = env.inspect("SELECT * FROM ai_translation_services_v2 WHERE id='draft-ai'");
    assert.equal(row.sync_version, 7);
    assert.doesNotMatch(row.config, /draft-secret/);
  } finally {
    env.close();
  }
});

test("migration failures preserve legacy GitHub and AI values and the previous credentials file", () => {
  for (const failure of ["file", "commit"]) {
    const env = setup({
      version: 1,
      seed: seedV1,
      failCredentialsWrite: () => failure === "file",
      failSql: (sql) => failure === "commit" && sql === "COMMIT",
    });
    try {
      const previous = {
        version: 1,
        cookie: "old-cookie",
        webdav: {},
        githubToken: "old-github",
        aiTranslation: { other: { key: "old-ai" } },
      };
      fs.writeFileSync(env.credentialsPath, JSON.stringify(previous));
      const native = new DatabaseSync(env.dbPath);
      native.prepare("INSERT INTO config VALUES('githubToken',?)").run(JSON.stringify("legacy-github"));
      native
        .prepare("UPDATE ai_translation_services SET config_form=?,config=?")
        .run(JSON.stringify(secureForm), JSON.stringify({ apiKey: "legacy-ai" }));
      native.close();
      assert.throws(
        () => env.load("utils/database-migration").initializeDatabase(env.dbPath),
        /credentials.json|injected/,
      );
      assert.deepEqual(readCredentialsFile(env), previous);
      assert.equal(env.inspect("PRAGMA user_version")[0].user_version, 1);
      assert.equal(
        JSON.parse(env.inspect("SELECT value FROM config WHERE key='githubToken'")[0].value),
        "legacy-github",
      );
      assert.equal(JSON.parse(env.inspect("SELECT config FROM ai_translation_services")[0].config).apiKey, "legacy-ai");
    } finally {
      env.close();
    }
  }
});

async function conflictDetail(engine, db, table, id) {
  return (
    await engine.readConflicts(db.query("SELECT * FROM sync_pending WHERE tablename=? AND id=?", [table, id]))
  )[0];
}

test("point reads distinguish missing, tombstone and live records without changing cursors or local intent", async () => {
  const env = setup();
  try {
    const { engine, store, db, server } = syncSetup(env, ["marked_uploaders_v2"]);
    for (const id of ["missing", "deleted", "live"]) db.update("INSERT INTO marked_uploaders_v2(id) VALUES(?)", [id]);
    db.update("UPDATE sync_pending SET conflict='VERSION_CONFLICT'");
    server.put({ tablename: "marked_uploaders_v2", id: "deleted", deleted: true, sync_version: 3 });
    server.put({ tablename: "marked_uploaders_v2", id: "live", deleted: false, content: {}, sync_version: 5 });
    const before = plain(db.query("SELECT * FROM sync_pending ORDER BY id"));
    const details = await engine.readConflicts(before);
    assert.equal(details.find((d) => d.pending.id === "missing").cloud.found, false);
    assert.equal(details.find((d) => d.pending.id === "deleted").cloud.deleted, true);
    assert.equal(details.find((d) => d.pending.id === "live").cloud.server_updated_at, 1000);
    assert.deepEqual(plain(db.query("SELECT * FROM sync_pending ORDER BY id")), before);
    assert.equal(store.getMeta("seq", 0), 0);
    assert.equal(store.getMeta("requestSeq", 0), 0);
    assert.equal(db.query("SELECT * FROM sync_mirror").length, 0);
    assert.equal(server.reads.filter((r) => r.keys).length, 1);
    engine.resolve(
      "marked_uploaders_v2",
      "missing",
      "cloud",
      details.find((d) => d.pending.id === "missing"),
    );
    assert.equal(db.query("SELECT deleted FROM marked_uploaders_v2 WHERE id='missing'")[0].deleted, 1);
    assert.equal(db.query("SELECT * FROM sync_pending WHERE id='missing'").length, 0);
    assert.equal(db.query("SELECT * FROM sync_mirror WHERE id='missing'").length, 0);
    engine.resolve(
      "marked_uploaders_v2",
      "deleted",
      "cloud",
      details.find((d) => d.pending.id === "deleted"),
    );
    assert.equal(store.mirror("marked_uploaders_v2", "deleted").sync_version, 3);
  } finally {
    env.close();
  }
});

test("reviewed local choices create missing records and conflict again on later remote edits", async () => {
  const env = setup();
  try {
    const { engine, store, db, server } = syncSetup(env, ["search_history_v2"]);
    const config = env.load("utils/config").configManager;
    config.addOrUpdateSearchHistory("x", [{ term: "local" }]);
    db.update("UPDATE sync_pending SET conflict='ENTITY_NOT_FOUND'");
    engine.resolve("search_history_v2", "x", "local", await conflictDetail(engine, db, "search_history_v2", "x"));
    await engine.synchronize();
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
    const cloud = server.records.get(JSON.stringify(["search_history_v2", "x"]));
    config.addOrUpdateSearchHistory("x", [{ term: "edited-local" }]);
    server.put({ ...cloud, content: { ...cloud.content, last_access_time: "first remote change" }, sync_version: 2 });
    await engine.synchronize();
    const detail = await conflictDetail(engine, db, "search_history_v2", "x");
    engine.resolve("search_history_v2", "x", "local", detail);
    server.put({ ...cloud, content: { ...cloud.content, last_access_time: "later remote change" }, sync_version: 3 });
    await engine.synchronize();
    assert.equal(db.query("SELECT conflict FROM sync_pending WHERE id='x'")[0].conflict, "VERSION_CONFLICT");
    assert.equal(server.records.get(JSON.stringify(["search_history_v2", "x"])).sync_version, 3);
    assert.equal(store.localRecord("search_history_v2", "x").content.children[0].term, "edited-local");
    assert.equal(JSON.parse(server.writes.at(-1)).operations[0].forced, undefined);
  } finally {
    env.close();
  }
});

test("conflict decisions reject changed local content and roll back invalid cloud projections", async () => {
  const env = setup();
  try {
    const { engine, db, server } = syncSetup(env, ["search_history_v2"]);
    const config = env.load("utils/config").configManager;
    config.addOrUpdateSearchHistory("x", [{ term: "local" }]);
    db.update("UPDATE sync_pending SET conflict='ALREADY_EXISTS'");
    server.put({ tablename: "search_history_v2", id: "x", deleted: false, sync_version: 1, content: {} });
    const stale = await conflictDetail(engine, db, "search_history_v2", "x");
    config.addOrUpdateSearchHistory("x", [{ term: "new edit" }]);
    assert.throws(() => engine.resolve("search_history_v2", "x", "cloud", stale), /本机内容已修改/);
    const current = await conflictDetail(engine, db, "search_history_v2", "x");
    assert.throws(() => engine.resolve("search_history_v2", "x", "cloud", current), /缺少业务字段/);
    assert.equal(db.query("SELECT conflict FROM sync_pending WHERE id='x'")[0].conflict, "ALREADY_EXISTS");
    assert.equal(db.query("SELECT * FROM sync_mirror").length, 0);
  } finally {
    env.close();
  }
});

test("point read failures and stale versions never consume conflicts or change a known cloud baseline", async () => {
  const env = setup();
  try {
    const server = syncServer();
    const original = server.transport;
    let bad;
    server.transport = async (method, path, raw) => (path === "/v1/read" && bad ? bad : original(method, path, raw));
    const { engine, store, db } = syncSetup(env, ["marked_uploaders_v2"], server);
    server.put({ tablename: "marked_uploaders_v2", id: "x", content: {}, deleted: false, sync_version: 3 });
    await engine.synchronize();
    db.update("UPDATE marked_uploaders_v2 SET deleted=1 WHERE id='x'");
    db.update("UPDATE sync_pending SET conflict='VERSION_CONFLICT'");
    const pending = db.query("SELECT * FROM sync_pending");
    bad = { results: [{ tablename: "marked_uploaders_v2", id: "x", found: false }] };
    await assert.rejects(engine.readConflicts(pending), /早于本机/);
    bad = { error: { code: "D1_READ_QUOTA_EXCEEDED" }, results: [] };
    await assert.rejects(engine.readConflicts(pending), /D1_READ_QUOTA_EXCEEDED/);
    assert.equal(store.mirror("marked_uploaders_v2", "x").sync_version, 3);
    assert.equal(db.query("SELECT * FROM sync_pending").length, 1);
    assert.equal(engine.busy, false);
  } finally {
    env.close();
  }
});

test("pause during download keeps the committed cursor and resumes without partial projection", async () => {
  const env = setup();
  try {
    const { engine, db, store, server } = syncSetup(env, ["marked_uploaders_v2"]);
    server.put({ tablename: "marked_uploaders_v2", id: "a", content: {}, deleted: false, sync_version: 1 });
    server.put({ tablename: "marked_uploaders_v2", id: "b", content: {}, deleted: false, sync_version: 1 });
    let paused = false;
    const result = await engine.synchronize((message) => {
      if (message.includes("第 1 页") && !paused) {
        paused = true;
        engine.pause();
      }
    });
    assert.equal(result, false);
    assert.equal(engine.busy, false);
    assert.equal(store.getMeta("paused", false), true);
    assert.equal(store.getMeta("seq", 0), 0);
    assert.equal(db.query("SELECT * FROM marked_uploaders_v2").length, 0);
    assert.equal(await engine.synchronize(), true);
    assert.equal(db.query("SELECT * FROM marked_uploaders_v2").length, 2);
    assert.equal(store.getMeta("paused", true), false);
  } finally {
    env.close();
  }
});

test("pause preserves an unconfirmed upload and resumes using its exact bytes", async () => {
  const env = setup();
  try {
    const { engine, db, store, server } = syncSetup(env, ["marked_uploaders_v2"]);
    db.update("INSERT INTO marked_uploaders_v2(id) VALUES('local')");
    server.onWrite = () => engine.pause();
    server.loseWrite = true;
    await assert.rejects(engine.synchronize(), /lost response/);
    const inflight = store.getMeta("inflight", null);
    assert.ok(inflight);
    assert.throws(() => engine.leave(), /未完成/);
    await engine.synchronize();
    assert.equal(server.writes[0], server.writes[1]);
    assert.equal(store.getMeta("inflight", null), null);
    assert.equal(db.query("SELECT * FROM sync_pending").length, 0);
  } finally {
    env.close();
  }
});

test("single-table catchup includes inserts behind the page cursor and keeps the global cursor independent", async () => {
  const env = setup();
  try {
    const server = syncServer();
    const original = server.transport;
    const requests = [];
    server.transport = async (method, path, raw) => {
      requests.push({ path, body: raw ? JSON.parse(raw) : {} });
      return original(method, path, raw);
    };
    const { engine, db, store } = syncSetup(env, ["marked_uploaders_v2"], server);
    server.put({ tablename: "marked_uploaders_v2", id: "old", content: {}, deleted: false, sync_version: 1 });
    await engine.synchronize();
    const oldSeq = store.getMeta("seq", 0);
    const dav = {
      tablename: "webdav_services_v2",
      id: "z",
      content: { name: "z", host: "host", port: null, https: 1, path: null },
      deleted: false,
      sync_version: 1,
    };
    server.put(dav);
    store.selectTables(["marked_uploaders_v2", "webdav_services_v2"]);
    server.onRead = () => {
      server.put({ ...dav, id: "a", content: { ...dav.content, name: "inserted behind cursor" } });
      server.put({ tablename: "marked_uploaders_v2", id: "new", content: {}, deleted: false, sync_version: 1 });
    };
    requests.length = 0;
    await engine.synchronize((message) => {
      if (message === "下载云端变化…") {
        assert.equal(store.getMeta("seq", 0), oldSeq);
        assert.equal(db.query("SELECT * FROM webdav_services_v2").length, 2);
        assert.equal(db.query("SELECT * FROM marked_uploaders_v2 WHERE id='new'").length, 0);
      }
    });
    assert.ok(requests.some((r) => r.path === "/v1/table-download" && r.body.tablename === "webdav_services_v2"));
    assert.equal(
      requests.some((r) => r.path === "/v1/full-download"),
      false,
    );
    assert.equal(db.query("SELECT * FROM marked_uploaders_v2 WHERE id='new'").length, 1);
    assert.deepEqual(plain(store.getMeta("needsTables", [])), []);
    requests.length = 0;
    store.selectTables(["marked_uploaders_v2"]);
    await engine.synchronize();
    assert.equal(
      requests.some((r) => r.path.includes("download")),
      false,
    );
  } finally {
    env.close();
  }
});

test("leaving sync preserves local data and other credentials and rolls back failures", async () => {
  let fail = false;
  const env = setup({ version: 1, seed: seedV1, failSql: (sql) => fail && sql === "DELETE FROM sync_pending" });
  try {
    const { engine, db, store } = syncSetup(env, ["marked_uploaders_v2"]);
    db.update("INSERT INTO marked_uploaders_v2(id,sync_version) VALUES('local',8)");
    const credentials = readCredentialsFile(env);
    fail = true;
    assert.throws(() => engine.leave(), /injected/);
    assert.deepEqual(readCredentialsFile(env), credentials);
    assert.equal(store.selectedTables().length, 1);
    assert.equal(db.query("SELECT sync_version FROM marked_uploaders_v2 WHERE id='local'")[0].sync_version, 8);
    fail = false;
    engine.leave();
    assert.equal(readCredentialsFile(env).sync, undefined);
    assert.deepEqual(readCredentialsFile(env).webdav, credentials.webdav);
    assert.equal(db.query("SELECT sync_version FROM marked_uploaders_v2 WHERE id='local'")[0].sync_version, 0);
    assert.equal(store.selectedTables().length, 0);
    engine.configure("https://sync.example.com", "a".repeat(64));
    store.selectTables(["marked_uploaders_v2"]);
    assert.equal(db.query("SELECT * FROM sync_pending WHERE id='local'").length, 1);
  } finally {
    env.close();
  }
});

test("sync observers can detach or fail without interrupting work, and completion reaches a replacement screen", async () => {
  const env = setup();
  try {
    const { engine } = syncSetup(env, ["marked_uploaders_v2"]);
    let oldScreen = 0,
      newScreen = 0;
    const detach = engine.subscribe(() => oldScreen++);
    engine.subscribe(() => {
      throw new Error("removed native view");
    });
    engine.subscribe((_message, finished) => {
      if (finished) newScreen++;
    });
    detach();
    assert.equal(await engine.synchronize(), true);
    assert.equal(oldScreen, 0);
    assert.equal(newScreen, 1);
  } finally {
    env.close();
  }
});

test("sync filter cancellation and download-page confirmation release the operation lock", async () => {
  let menu, logSections, downloadSections;
  const starts = [],
    toasts = [];
  let confirmations = 0,
    confirmationIndex = 0,
    pops = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(output, "controllers/settings-sync-controller.js"), "utf8"), {
    module,
    exports: module.exports,
    require(name) {
      if (name === "jsbox-cview") return { BaseController: class {}, controllerStatus: { removed: 4 } };
      if (name.endsWith("sync-management-view"))
        return {
          SyncActionRowView: class {
            constructor(options) {
              Object.assign(this, options);
            }
          },
        };
      if (name.endsWith("utils/database")) return { dbManager: { query: () => [] } };
      if (name.endsWith("sync/engine")) return { syncEngine: { busy: false } };
      if (name.endsWith("sync/store"))
        return {
          getMeta: (_key, fallback) => fallback,
          selectedTables: () => ["search_history_v2"],
        };
      if (name.endsWith("sync/schema"))
        return {
          tableSpec: () => ({ title: "搜索历史" }),
          SYNC_TABLES: [{ name: "search_history_v2", title: "搜索历史" }],
        };
      return {};
    },
    $ui: {
      menu(options) {
        menu = options;
        // Reproduce JSBox: the promise form stays pending on cancellation.
        if (!options.handler) return new Promise(() => {});
      },
      alert: async () => {
        confirmations++;
        return { index: confirmationIndex };
      },
      pop: () => pops++,
      toast: (text) => toasts.push(text),
    },
  });
  const controller = Object.create(module.exports.SettingsSyncController.prototype);
  controller.acting = false;
  controller.refresh = () => {};
  controller.push = (title, sections) => {
    if (title === "同步日志") logSections = sections;
    if (title === "重新下载") downloadSections = sections;
    return { status: 1 };
  };
  controller.start = async (...args) => {
    starts.push(args);
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  controller.logs();

  // Both tapping Cancel and dismissing outside the menu emit finished(true).
  for (let i = 0; i < 2; i++) {
    logSections()[0].rows[0].events.tapped();
    assert.equal(controller.acting, true);
    assert.equal(typeof menu.finished, "function");
    menu.finished(true);
    await settle();
    assert.equal(controller.acting, false);
    assert.equal(logSections()[0].rows[0].props.title, "筛选 · 全部");

    // Opening the download page holds no lock while waiting for a selection.
    await controller.run(() => controller.redownload());
    assert.equal(controller.acting, false);
  }
  assert.equal(confirmations, 0);
  assert.equal(starts.length, 0);

  logSections()[0].rows[0].events.tapped();
  menu.handler("错误", 3);
  menu.finished(false);
  await settle();
  assert.equal(logSections()[0].rows[0].props.title, "筛选 · 错误");
  assert.equal(controller.acting, false);

  downloadSections()[1].rows[0].events.tapped();
  await settle();
  assert.equal(controller.acting, false);
  assert.equal(starts.length, 0);
  assert.equal(pops, 0);

  confirmationIndex = 1;
  downloadSections()[1].rows[0].events.tapped();
  await settle();
  assert.deepEqual(plain(starts), [[false, "search_history_v2"]]);
  assert.equal(confirmations, 2);
  assert.equal(pops, 1);
  assert.equal(controller.acting, false);
  assert.deepEqual(toasts, []);
});

test("sync request logs redact credentials without changing transmitted bytes and identify NOT_FOUND routes", async () => {
  const key = "abcdef0123456789".repeat(4);
  const logs = [],
    requests = [];
  const server = syncServer();
  const env = setup({
    onAppLog: (entry, level) => logs.push({ entry: plain(entry), level }),
    httpRequest: async (request) => {
      requests.push(request);
      const route = new URL(request.url).pathname;
      if (route === "/v1/table-download")
        return {
          response: { statusCode: 404 },
          error: { description: `Authorization: Bearer ${key}` },
          rawData: { string: JSON.stringify({ error: { code: "NOT_FOUND", message: `missing route; key=${key}` } }) },
        };
      return {
        response: { statusCode: 200 },
        rawData: { string: JSON.stringify(await server.transport(request.method, route, request.body?.string)) },
      };
    },
  });
  try {
    const engine = new (env.load("sync/engine").SyncEngine)();
    const store = env.load("sync/store");
    engine.configure("https://sync.example.com", key);
    store.selectTables(["search_history_v2"]);
    env.load("utils/config").configManager.addOrUpdateSearchHistory("log-test", [{ term: key }]);
    await engine.synchronize();
    const upload = requests.find((r) => r.url.endsWith("/v1/write"));
    assert.equal(upload.header.Authorization, `Bearer ${key}`);
    assert.ok(upload.body.string.includes(key));
    const info = logs.find((r) => r.entry.event === "request" && r.entry.details.path === "/v1/write");
    assert.equal(info.level, "info");
    assert.equal(info.entry.details.headers.Authorization, "[REDACTED]");
    assert.equal(info.entry.details.body.operations[0].content.children[0].term, "[REDACTED]");
    assert.equal(info.entry.details.body.request_seq, JSON.parse(upload.body.string).request_seq);
    store.selectTables(["search_history_v2", "marked_uploaders_v2"]);
    await assert.rejects(engine.synchronize(), (error) => {
      assert.equal(error.message, "NOT_FOUND");
      assert.match(env.load("sync/errors").syncErrorMessage(error), /POST \/v1\/table-download/);
      return true;
    });
    const failure = logs.find((r) => r.entry.event === "request_error");
    assert.equal(failure.level, "error");
    assert.equal(failure.entry.details.path, "/v1/table-download");
    assert.equal(failure.entry.details.status, 404);
    assert.equal(failure.entry.details.error.code, "NOT_FOUND");
    assert.ok(
      logs.some((r) => r.entry.event === "request" && r.entry.details.requestId === failure.entry.details.requestId),
    );
    assert.equal(JSON.stringify(logs).includes(key), false);
    assert.equal(engine.busy, false);
  } finally {
    env.close();
  }
});

test("sync logs each retry and keeps HTTP errors distinct from transport and JSON errors", async () => {
  const key = "abcdef0123456789".repeat(4);
  const logs = [];
  let mode = "retry";
  const env = setup({
    onAppLog: (entry, level) => logs.push({ entry: plain(entry), level }),
    httpRequest: async () => {
      if (mode === "network") throw new Error(`request failed: ${key}`);
      if (mode === "retry")
        return {
          response: { statusCode: 503 },
          rawData: { string: JSON.stringify({ error: { code: "DATABASE_UNAVAILABLE" } }) },
        };
      return {
        response: { statusCode: 404 },
        error: { description: "HTTP failure" },
        rawData: { string: "x".repeat(3980) + key.toUpperCase() },
      };
    },
  });
  try {
    const engine = new (env.load("sync/engine").SyncEngine)();
    engine.configure("https://sync.example.com", key);
    await assert.rejects(engine.connectionTest(), { message: "DATABASE_UNAVAILABLE" });
    assert.deepEqual(
      logs.filter((r) => r.level === "info").map((r) => r.entry.details.attempt),
      [1, 2, 3],
    );
    assert.equal(logs.filter((r) => r.level === "error").length, 3);
    mode = "html";
    await assert.rejects(engine.connectionTest(), { message: "HTTP_404" });
    const preview = logs.at(-1).entry.details.responsePreview;
    assert.equal(preview, "x".repeat(3980) + "[REDACTED]");
    mode = "network";
    await assert.rejects(engine.connectionTest(), /网络请求失败/);
    assert.match(logs.at(-1).entry.details.error.message, /request failed: \[REDACTED\]/);
    assert.equal(logs.at(-1).entry.details.status, 0);
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(key, "i"));
  } finally {
    env.close();
  }
});

test("sync diagnostic snapshots mask nested secrets, handle circular errors and never mutate requests", () => {
  const logs = [];
  let fail = false;
  const env = setup({
    onAppLog: (entry, level) => {
      if (fail) throw new Error("log storage unavailable");
      logs.push({ entry: plain(entry), level });
    },
  });
  try {
    const { syncLog } = env.load("sync/logging");
    const key = "a".repeat(64);
    const details = {
      master_key: key,
      nested: { MASTER_KEY: "another-secret", Authorization: `Bearer ${key}`, password: "password-value" },
    };
    details.self = details;
    syncLog("test", details, "error", key);
    assert.equal(logs[0].entry.details.master_key, "[REDACTED]");
    assert.equal(logs[0].entry.details.nested.MASTER_KEY, "[REDACTED]");
    assert.equal(logs[0].entry.details.nested.password, "[REDACTED]");
    assert.equal(logs[0].entry.details.self, "[Circular]");
    assert.equal(details.master_key, key);
    assert.equal(details.nested.password, "password-value");
    fail = true;
    assert.doesNotThrow(() => syncLog("test", details, "info", key));
  } finally {
    env.close();
  }
});
