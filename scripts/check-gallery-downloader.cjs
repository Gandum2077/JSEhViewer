// Run with: node --test scripts/check-gallery-downloader.cjs
// Compile the real implementation; isolate JSBox/network/file APIs in a VM.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const output = mkdtempSync(path.join(tmpdir(), 'gallery-downloader-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync('tsc', ['--outDir', output], { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
const source = readFileSync(path.join(output, 'utils/api.js'), 'utf8');

function setup({ start = 0, count = 0, cached = [], mpv = false, top = false, reading = true, length = 12 } = {}) {
  const calls = [];
  const writes = [];
  const info = {
    gid: 123, token: 'token', length, total_pages: Math.ceil(length / 4),
    num_of_images_on_each_page: 4, thumbnail_size: 'large', thumbnail_url: 'cover', images: {},
  };
  const pageImages = (page) => Array.from({ length: Math.min(4, length - page * 4) }, (_, n) => ({
    page: page * 4 + n, imgkey: `key-${page * 4 + n}`, thumbnail_url: `sprite-${page}`,
    frame: { x: n, y: 0, width: 1, height: 1 },
  }));
  for (const page of cached) info.images[page] = pageImages(page);
  const deps = {
    'ehentai-parser': { EHAPIHandler: class {} },
    './tools': { appLog() {}, cropImageData: () => ({}) },
    './glv': { thumbnailPath: 'thumb/', imagePath: 'image/', originalImagePath: 'original/', aiTranslationPath: 'ai/', galleryInfoPath: 'info/' },
    './config': { configManager: { mpvAvailable: mpv } },
    './database': { dbManager: { update() {} } },
    './database-records': { storeArchiveRecord() {} },
    './error': { FatalError: Error },
  };
  const context = vm.createContext({
    exports: {}, require: (name) => deps[name] || {},
    $file: { exists: () => false, mkdir() {}, list: () => [], write: (value) => writes.push(value.path) },
    $data: (value) => value, $wait: async () => {},
  });
  vm.runInContext(source + '\nexports.TestDownloader = GalleryCommonDownloader;', context);
  const api = context.exports.api;
  const data = { image: {}, info: { mimeType: 'image/jpeg' } };
  api.getGalleryImagesWithTwoRetries = async (_gid, _token, page) => {
    calls.push(['html', page]);
    return { success: true, info, images: { [page]: pageImages(page) } };
  };
  api.downloadThumbnailWithTwoRetries = async (url) => {
    calls.push(['thumbnail', url]);
    return { success: true, data };
  };
  api.downloadImageByPageInfoWithThreeRetries = async (_gid, _key, index) => {
    calls.push(['image', index]);
    return { success: true, data };
  };
  api.downloadImageByMpvWithThreeRetries = async (_gid, _key, _mpvkey, index) => {
    calls.push(['image', index]);
    return { success: true, data };
  };
  api.getMPVInfoWithTwoRetries = async () => {
    calls.push(['mpv']);
    return { success: true, info: { mpvkey: 'mpv', images: Array.from({ length: info.total_pages }, (_, p) => pageImages(p)).flat() } };
  };
  const make = () => new context.exports.TestDownloader({ infos: structuredClone(info), mpvAvailable: mpv, imageDownloadCount: count, thumbnailDownloadCount: count, downloadTopThumbnail: top, finishHandler() {} });
  const d = make();
  d.currentReadingIndex = start;
  d.currentThumbnailIndex = start;
  d.reading = reading;
  return { d, api, calls, writes, make, manager: context.exports.downloaderManager };
}
async function drain(d) {
  for (let n = 0; n < 100; n++) {
    const task = d._getNextTask();
    if (!task) return;
    await task.handler();
  }
  assert.fail('scheduler did not stop');
}
async function idle(d) {
  for (let n = 0; n < 100; n++) {
    await new Promise(setImmediate);
    if (d.running === 0) return;
  }
  assert.fail('downloader did not become idle');
}

test('bounded download refreshes pagination then fetches only target resources; no cover', async () => {
  const { d, calls, writes } = setup({ start: 5, count: 2 });
  d.start();
  await idle(d);
  assert.deepEqual(calls, [['html', 0], ['html', 1], ['thumbnail', 'sprite-1'], ['image', 5], ['image', 6]]);
  assert.deepEqual(writes.sort(), ['image/123/6.jpg', 'image/123/7.jpg', 'thumb/123/5.jpg', 'thumb/123/6.jpg', 'thumb/123/7.jpg', 'thumb/123/8.jpg']);
  assert.equal(d.result.thumbnails[4].path, 'thumb/123/5.jpg');
  assert.equal(d.result.thumbnails[7].path, 'thumb/123/8.jpg');
});

test('partial cached HTML is discarded and pagination is refreshed', async () => {
  const { d, calls } = setup({ start: 5, count: 1, cached: [1] });
  await drain(d);
  assert.deepEqual(calls, [['html', 0], ['html', 1], ['thumbnail', 'sprite-1'], ['image', 5]]);
});

test('bounded window crossing HTML pages downloads only those pages', async () => {
  const { d, calls } = setup({ start: 7, count: 2 });
  await drain(d);
  assert.deepEqual(calls, [['html', 0], ['html', 1], ['thumbnail', 'sprite-1'], ['image', 7], ['html', 2], ['thumbnail', 'sprite-2'], ['image', 8]]);
});

test('unlimited mode wraps; bounded mode stops at the gallery end', async () => {
  const unlimited = setup({ start: 10 });
  await drain(unlimited.d);
  assert.deepEqual(unlimited.calls.filter(([kind]) => kind === 'image').map(([, index]) => index), [10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const bounded = setup({ start: 11, count: 3 });
  await drain(bounded.d);
  assert.deepEqual(bounded.calls.filter(([kind]) => kind === 'image'), [['image', 11]]);
});

test('MPV runs first, without HTML or speculative thumbnails, then respects the range', async () => {
  const { d, calls } = setup({ start: 5, count: 1, mpv: true });
  const task = d._getNextTask();
  const pending = task.handler();
  assert.equal(d._getNextTask(), undefined);
  await pending;
  await drain(d);
  assert.deepEqual(calls, [['mpv'], ['thumbnail', 'sprite-1'], ['image', 5]]);
});

test('HTML stays serial within one downloader but different downloaders can overlap', async () => {
  const { d, api, calls, make } = setup({ count: 1 });
  const original = api.getGalleryImagesWithTwoRetries;
  const releases = [];
  let active = 0;
  let maxActive = 0;
  api.getGalleryImagesWithTwoRetries = async (...args) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => releases.push(resolve));
    const result = await original(...args);
    active--;
    return result;
  };
  const first = d._getNextTask().handler();
  await new Promise(setImmediate);
  d.currentReadingIndex = 8;
  d.currentThumbnailIndex = 8;
  assert.equal(d._getNextTask(), undefined);
  const other = make();
  other.currentReadingIndex = 4;
  other.currentThumbnailIndex = 4;
  const second = other._getNextTask().handler();
  await new Promise(setImmediate);
  assert.equal(releases.length, 2);
  releases.shift()();
  await first;
  await new Promise(setImmediate);
  releases.shift()();
  await second;
  assert.equal(maxActive, 2);
  assert.deepEqual(calls, [['html', 0], ['html', 0]]);
  assert.equal(d._getNextTask().index, 2);
});

test('manager starts thumbnail-only work even when the target image is cached', async () => {
  const { d, manager, calls } = setup({ start: 5, count: 1, cached: [0, 1, 2], reading: false });
  d.result.images[5].started = true;
  d.result.images[5].path = 'cached';
  manager.galleryDownloaders.set(d.gid, d);
  assert.equal(manager.startOne(d.gid), true);
  await idle(d);
  assert.deepEqual(calls, [['thumbnail', 'sprite-1']]);
});

test('cover is optional and excluded from completion totals when disabled', async () => {
  const noCover = setup({ length: 4 });
  await drain(noCover.d);
  assert.equal(noCover.d.isAllFinished, true);
  assert.equal(noCover.d.isAllFinishedDespiteError, true);
  assert.equal(noCover.d.pending, 0);
  const withCover = setup({ length: 4, top: true });
  await drain(withCover.d);
  assert.deepEqual(withCover.calls[0], ['thumbnail', 'cover']);
  assert.equal(withCover.d.isAllFinished, true);
});

test('HTML errors do not retry forever or trigger out-of-range resources', async () => {
  const { d, api, calls } = setup({ start: 5, count: 1 });
  api.getGalleryImagesWithTwoRetries = async (_gid, _token, page) => {
    calls.push(['html', page]);
    return { success: false, error: 'network' };
  };
  await drain(d);
  assert.deepEqual(calls, [['html', 0]]);
});

test('changing a bounded range starts only the new window, even in background mode', async () => {
  const { d, calls } = setup({ start: 5, count: 1 });
  d.background = true;
  await drain(d);
  d.currentReadingIndex = 9;
  d.currentThumbnailIndex = 9;
  await drain(d);
  assert.deepEqual(calls.filter(([kind]) => kind === 'html'), [['html', 0], ['html', 1], ['html', 2]]);
  assert.deepEqual(calls.filter(([kind]) => kind === 'image'), [['image', 5], ['image', 9]]);
});

test('cached target resources do not require any HTML request', async () => {
  const { d, calls } = setup({ start: 5, count: 1 });
  d.result.images[5].started = true;
  d.result.images[5].path = 'cached-image';
  d.result.thumbnails[5].started = true;
  d.result.thumbnails[5].path = 'cached-thumbnail';
  await drain(d);
  assert.deepEqual(calls, []);
});

test('manager passes initialization options through to the downloader', async () => {
  const { d, manager, calls } = setup();
  const managed = manager.add(456, { ...d.infos, gid: 456 }, { imageDownloadCount: 1, thumbnailDownloadCount: 1, downloadTopThumbnail: false });
  managed.currentReadingIndex = 5;
  managed.currentThumbnailIndex = 5;
  managed.reading = true;
  manager.startOne(456);
  await idle(managed);
  assert.deepEqual(calls, [['html', 0], ['html', 1], ['thumbnail', 'sprite-1'], ['image', 5]]);
});


test('complete cached pagination is retained', async () => {
  const { d, calls } = setup({ start: 5, count: 1, cached: [0, 1, 2] });
  await drain(d);
  assert.deepEqual(calls, [['thumbnail', 'sprite-1'], ['image', 5]]);
});

test('changed page size is learned from page zero before locating the target', async () => {
  const { d, api, calls } = setup({ start: 9, count: 1, cached: [0, 2] });
  assert.equal(Object.keys(d.infos.images).length, 0);
  assert.equal(d.result.htmls.some((html) => html.success), false);
  api.getGalleryImagesWithTwoRetries = async (_gid, _token, page) => {
    calls.push(['html', page]);
    return {
      success: true,
      info: { ...d.infos, total_pages: 2, num_of_images_on_each_page: 6 },
      images: { [page]: Array.from({ length: 6 }, (_, offset) => ({
        page: page * 6 + offset, imgkey: `new-key-${page * 6 + offset}`,
        thumbnail_url: `new-sprite-${page}`, frame: { x: offset, y: 0, width: 1, height: 1 },
      })) },
    };
  };
  await drain(d);
  assert.equal(d.infos.num_of_images_on_each_page, 6);
  assert.equal(d.result.htmls.length, 2);
  assert.deepEqual(calls, [['html', 0], ['html', 1], ['thumbnail', 'new-sprite-1'], ['image', 9]]);
});


test('one URL groups all known thumbnails outside the window, including other HTML pages', async () => {
  const { d, calls } = setup({ start: 5, count: 1, cached: [0, 1, 2] });
  d.infos.images[0][1].thumbnail_url = 'sprite-1';
  await drain(d);
  assert.deepEqual(calls, [['thumbnail', 'sprite-1'], ['image', 5]]);
  for (const index of [1, 4, 5, 6, 7]) {
    assert.equal(d.result.thumbnails[index].path, `thumb/123/${index + 1}.jpg`);
  }
  assert.equal(d.result.thumbnails[0].started, false);
  assert.equal(d.result.thumbnails[8].started, false);
  d.currentReadingIndex = 7;
  d.currentThumbnailIndex = 7;
  await drain(d);
  assert.deepEqual(calls, [['thumbnail', 'sprite-1'], ['image', 5], ['image', 7]]);
});

test('limiting images does not stop unlimited thumbnails from loading forward and wrapping', async () => {
  const { d, calls } = setup({ start: 5, count: 1 });
  d.thumbnailDownloadCount = 0;
  await drain(d);
  assert.deepEqual(calls.filter(([kind]) => kind === 'image'), [['image', 5]]);
  assert.deepEqual(calls.filter(([kind]) => kind === 'thumbnail'), [
    ['thumbnail', 'sprite-1'], ['thumbnail', 'sprite-2'], ['thumbnail', 'sprite-0'],
  ]);
  assert.equal(d.result.thumbnails.every((item) => item.path), true);
});

test('thumbnail browsing has its own position and current reading image gets priority', async () => {
  const { d, calls } = setup({ start: 9, count: 1, cached: [0, 1, 2] });
  d.currentThumbnailIndex = 1;
  await drain(d);
  assert.deepEqual(calls, [['image', 9], ['thumbnail', 'sprite-0']]);
  assert.equal(d.currentReadingIndex, 9);
  assert.equal(d.result.thumbnails[9].started, false);
});

test('image and thumbnail tasks alternate after prioritizing the current reading image', async () => {
  const { d, calls } = setup({ cached: [0, 1, 2] });
  for (const image of Object.values(d.infos.images).flat()) image.thumbnail_url = `individual-${image.page}`;
  await drain(d);
  assert.deepEqual(calls.slice(0, 8), [
    ['thumbnail', 'individual-0'], ['image', 0],
    ['thumbnail', 'individual-1'], ['image', 1],
    ['thumbnail', 'individual-2'], ['image', 2],
    ['thumbnail', 'individual-3'], ['image', 3],
  ]);
});

test('favorite image scope fetches only bootstrap HTML, target HTML, target sprite and image', async () => {
  const { d, manager, calls } = setup();
  const favorite = manager.add(456, { ...d.infos, gid: 456 }, {
    imageDownloadCount: 1,
    thumbnailDownloadCount: 1,
    downloadTopThumbnail: false,
  });
  favorite.currentReadingIndex = 9;
  favorite.currentThumbnailIndex = 9;
  favorite.reading = true;
  manager.startOne(456);
  await idle(favorite);
  assert.deepEqual(calls, [['html', 0], ['html', 2], ['thumbnail', 'sprite-2'], ['image', 9]]);
  assert.equal(favorite.result.images[8].started, false);
  assert.equal(favorite.result.images[10].started, false);
  assert.equal(favorite.result.htmls[1].started, false);
});

test('single-page completion wakes the next gallery and leaves existing ranges untouched', async () => {
  const { d, manager, calls } = setup();
  d.currentReadingIndex = 3;
  d.currentThumbnailIndex = 7;
  d.imageDownloadCount = 4;
  manager.galleryDownloaders.set(d.gid, d);
  await manager.downloadSinglePage(structuredClone(d.infos), 5).done;
  await manager.downloadSinglePage({ ...structuredClone(d.infos), gid: 456 }, 9).done;
  assert.deepEqual(calls.filter(([kind]) => kind === 'image'), [['image', 5], ['image', 9]]);
  assert.equal(d.currentReadingIndex, 3);
  assert.equal(d.currentThumbnailIndex, 7);
  assert.equal(d.imageDownloadCount, 4);
  assert.equal(d.result.images[5].path, 'image/123/6.jpg');
});

test('single-page failure settles and the following page can run', async () => {
  const { d, api, manager, calls } = setup();
  const original = api.getGalleryImagesWithTwoRetries;
  api.getGalleryImagesWithTwoRetries = async () => ({ success: false, error: 'network' });
  await manager.downloadSinglePage(structuredClone(d.infos), 5).done;
  api.getGalleryImagesWithTwoRetries = original;
  await manager.downloadSinglePage(structuredClone(d.infos), 9).done;
  assert.deepEqual(calls.filter(([kind]) => kind === 'image'), [['image', 9]]);
});

test('cancelling a scoped page lets its running request finish but starts no new resources', async () => {
  const { d, api, manager, calls } = setup();
  let release;
  const original = api.getGalleryImagesWithTwoRetries;
  api.getGalleryImagesWithTwoRetries = async (...args) => {
    await new Promise((resolve) => { release = resolve; });
    return original(...args);
  };
  const task = manager.downloadSinglePage(structuredClone(d.infos), 5);
  task.cancel();
  release();
  await task.done;
  assert.equal(task.isCancelled(), true);
  assert.deepEqual(calls, [['html', 0]]);
});

function favoriteModule(apiModule, files = {}) {
  const updates = [];
  const context = vm.createContext({
    exports: {}, console,
    require: (name) => name === './api' ? apiModule : name === './database' ? {
      dbManager: { update: (...args) => updates.push(args), query: () => [{ id: '123' }] },
    } : name === './glv' ? { imagePath: 'image/', thumbnailPath: 'thumb/', galleryInfoPath: 'info/' } : {},
    $file: { exists: (name) => name in files, list: (name) => files[name] || [], read: (name) => files[name] },
  });
  vm.runInContext(readFileSync(path.join(output, 'utils/favorite-image.js'), 'utf8'), context);
  return { ...context.exports, updates };
}

test('favorites reference original cache paths and add/remove only update the database', () => {
  const { favoriteImageManager: favorites, updates } = favoriteModule({}, {
    'image/123/': ['6.jpg', '7.png'], 'thumb/123/6.jpg': {},
  });
  const file = favorites.getFile(123, 5);
  assert.equal(file.file_name, 'image/123/6.jpg');
  assert.equal(file.thumbnail_file_name, 'thumb/123/6.jpg');
  assert.equal(favorites.add(123, 5), true);
  assert.equal(favorites.remove(123, 5), true);
  assert.equal(updates.length, 2);
  assert.equal(favorites.getFile(123, 5).file_name, 'image/123/6.jpg');
});

test('favorite browsing queue advances after a failed page across galleries', async () => {
  const { d, api, manager, calls } = setup();
  const { FavoriteImageDownloadQueue } = favoriteModule({ api, downloaderManager: manager }, {
    'info/123.json': { string: JSON.stringify(d.infos) },
    'info/456.json': { string: JSON.stringify({ ...d.infos, gid: 456 }) },
  });
  const original = api.getGalleryImagesWithTwoRetries;
  api.getGalleryImagesWithTwoRetries = async (...args) => args[0] === 123 ? { success: false, error: 'network' } : original(...args);
  let changed = 0;
  const queue = new FavoriteImageDownloadQueue();
  queue.start([{ gid: 123, token: 'a', pageIndex: 5 }, { gid: 456, token: 'b', pageIndex: 9 }], () => changed++);
  for (let n = 0; n < 100 && changed < 2; n++) await new Promise(setImmediate);
  assert.equal(changed, 2);
  assert.deepEqual(calls.filter(([kind]) => kind === 'image'), [['image', 9]]);
  queue.stop();
});

test('cache clearing preserves favorite ordinary images/thumbnails and downloaded galleries only', () => {
  const configSource = readFileSync(path.join(output, 'utils/config.js'), 'utf8');
  const deleted = [];
  const files = {
    'thumb/': ['123', '456', '123.jpg'], 'thumb/123': ['6.jpg', '7.jpg'],
    'image/': ['123', '456', '789'], 'image/123': ['6.jpg', '7.png', '6_original.jpg'],
  };
  const context = vm.createContext({
    exports: {}, require: (name) => name === './database' ? { dbManager: {
      query: (sql) => sql.includes('favorite_images') ? [{ gid: 123, page_index: 5 }] : [{ gid: 456 }],
    } } : name === './glv' ? { imagePath: 'image/', thumbnailPath: 'thumb/', originalImagePath: 'original/', aiTranslationPath: 'ai/' } : {},
    $file: { list: (name) => files[name] || [], delete: (name) => deleted.push(name) },
  });
  vm.runInContext(configSource.replace(/exports.configManager = new ConfigManager\(\);/, 'exports.ConfigManager = ConfigManager;'), context);
  context.exports.ConfigManager.prototype.clearCache.call({});
  assert.deepEqual(deleted.sort(), ['ai/', 'image/123/7.png', 'image/789', 'original/', 'thumb/123.jpg', 'thumb/123/7.jpg', 'thumb/456']);
});

test('stopping favorite browsing prevents the next gallery from being dispatched', async () => {
  const { d, api, manager, calls } = setup();
  const { FavoriteImageDownloadQueue } = favoriteModule({ api, downloaderManager: manager }, {
    'info/123.json': { string: JSON.stringify(d.infos) },
    'info/456.json': { string: JSON.stringify({ ...d.infos, gid: 456 }) },
  });
  let release;
  const original = api.getGalleryImagesWithTwoRetries;
  api.getGalleryImagesWithTwoRetries = async (...args) => {
    await new Promise((resolve) => { release = resolve; });
    return original(...args);
  };
  const queue = new FavoriteImageDownloadQueue();
  let changed = 0;
  queue.start([{ gid: 123, token: 'a', pageIndex: 5 }, { gid: 456, token: 'b', pageIndex: 9 }], () => changed++);
  queue.stop();
  release();
  for (let n = 0; n < 5; n++) await new Promise(setImmediate);
  assert.equal(changed, 0);
  assert.deepEqual(calls, [['html', 0]]);
});
