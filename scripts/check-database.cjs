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
  keychain = new Map(),
  failKeychain,
  failCredentialsWrite,
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
    $keychain: {
      get: (key, domain) => keychain.get(`${domain}/${key}`),
      set(key, value, domain) {
        if (failKeychain?.()) return false;
        keychain.set(`${domain}/${key}`, value);
        return true;
      },
      remove(key, domain) {
        if (failKeychain?.()) return false;
        return keychain.delete(`${domain}/${key}`);
      },
    },
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
    $wait: async () => {},
  };
  const context = vm.createContext(globals);
  function load(id) {
    if (id === "utils/glv")
      return { databasePath: dbPath, imagePath: "image/", thumbnailPath: "thumb/", galleryInfoPath: "info/" };
    if (id === "utils/tools") return { appLog() {} };
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
  const keychain = new Map();
  const env = setup({ keychain });
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
    assert.equal(keychain.size, 1);
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
    assert.equal(keychain.size, 0);
    config.editAITranslationService({ ...service, config: { host: "example", apiKey: "secret-three" } });
    config.deleteAITranslationService("renamed");
    assert.equal(keychain.size, 0);
    stored = env.inspect("SELECT config,deleted FROM ai_translation_services_v2 WHERE id=?", [id])[0];
    assert.equal(stored.deleted, 1);
    assert.doesNotMatch(stored.config, /secret-three/);
  } finally {
    env.close();
  }
});

test("marking an existing field secure removes its stored value and failed saves preserve both stores", () => {
  let failSql = false,
    failKeychain = false;
  const keychain = new Map();
  const env = setup({
    keychain,
    failSql: (sql) => failSql && sql.startsWith("UPDATE ai_translation_services_v2"),
    failKeychain: () => failKeychain,
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
    const before = [...keychain.entries()];
    failKeychain = true;
    assert.throws(
      () =>
        config.editAITranslationService({
          ...service,
          name: "failed-keychain",
          config: { host: "other", apiKey: "new-secret" },
        }),
      /敏感配置/,
    );
    failKeychain = false;
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
    assert.deepEqual([...keychain.entries()], before);
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
      const next = { ...previous, cookie: "next-cookie" };
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
      { deleted: 1 },
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
