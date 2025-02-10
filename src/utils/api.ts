import { EHAPIHandler, EHGallery, EHMPV, EHPage } from "ehentai-parser";
import { appLog, cropImageData, isNameMatchGid } from "./tools";
import { aiTranslationPath, imagePath, originalImagePath, thumbnailPath } from "./glv";
import { aiTranslate } from "../ai-translations/ai-translate";
import { WebDAVClient } from "./webdav";

type CompoundThumbnail = {
  thumbnail_url: string;
  startIndex: number;
  endIndex: number;
  images: {
    page: number; // 从0开始
    name: string;
    imgkey: string;
    page_url: string;
    thumbnail_url: string;
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  }[]
}

class RetryTooManyError extends Error {
  name = "RetryTooManyError";
  constructor(times: number) {
    super(`重试次数达到${times}次`);
  }
}

// APIHandler中补充的方法均不抛出错误，所有错误都在内部处理。
class APIHandler extends EHAPIHandler {
  private _mpvAvailable: boolean;
  constructor(exhentai: boolean, mpvAvailable: boolean) {
    super(exhentai);
    this._mpvAvailable = mpvAvailable;
  }

  get mpvAvailable() {
    return this._mpvAvailable;
  }

  set mpvAvailable(value: boolean) {
    this._mpvAvailable = value;
  }

  async getMPVInfoWithNoError(
    gid: number,
    token: string
  ): Promise<{ success: false, error: string } | { success: true, info: EHMPV }> {
    try {
      const info = await this.getMPVInfo(gid, token);
      return { success: true, info };
    } catch (error: any) {
      appLog("获取MPV信息失败", "error");
      return { success: false, error: error.name };
    }
  }

  async getMPVInfoWithTwoRetries(
    gid: number,
    token: string
  ): Promise<{ success: false, error: string } | { success: true, info: EHMPV }> {
    let result: { success: false, error: string }
      | { success: true, info: EHMPV } = { success: false, error: "RetryTooManyError" };
    for (let i = 0; i < 2; i++) {
      result = await this.getMPVInfoWithNoError(gid, token);
      if (result.success) return result;
    }
    return result;
  }

  async getGalleryImagesWithNoError(
    gid: number,
    token: string,
    page: number
  ): Promise<{ success: false, error: string } | { success: true, images: EHGallery["images"] }> {
    try {
      const info = await this.getGalleryInfo(gid, token, false, page);
      return { success: true, images: info.images };
    } catch (error: any) {
      appLog(`获取图库页面失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name };
    }
  }

  async getGalleryImagesWithTwoRetries(
    gid: number,
    token: string,
    page: number
  ): Promise<{ success: false, error: string } | { success: true, images: EHGallery["images"] }> {
    let info;
    let result: { success: false, error: string } | { success: true, images: EHGallery["images"] } = { success: false, error: "RetryTooManyError" };
    for (let i = 0; i < 2; i++) {
      result = await this.getGalleryImagesWithNoError(gid, token, page);
      if (result.success) return result;
    }
    return result;
  }

  async downloadImageByPageInfo(
    gid: number,
    imgkey: string,
    page: number,
    reloadKey?: string
  ): Promise<{ success: true, info: EHPage, data: NSData } | { success: false, info?: EHPage, error: string }> {
    let pageInfo;
    try {
      pageInfo = await this.getPageInfo(gid, imgkey, page, reloadKey);
      const data = await this.downloadImage(pageInfo.imageUrl);
      return { success: true, info: pageInfo, data };
    } catch (error: any) {
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name, info: pageInfo };
    }
  }

  async downloadImageByPageInfoWithThreeRetries(
    gid: number,
    imgkey: string,
    page: number
  ) {
    let result: { success: true, info: EHPage, data: NSData }
      | { success: false, info?: EHPage, error: string } = { success: false, error: "RetryTooManyError" };
    let reloadKey: string | undefined;
    for (let i = 0; i < 3; i++) {
      result = await this.downloadImageByPageInfo(gid, imgkey, page, reloadKey);
      if (result.success) {
        return result;
      } else {
        reloadKey = result.info?.reloadKey;
      }
    }
    return result;
  }

  async downloadImageByMpv(
    gid: number,
    key: string,
    mpvkey: string,
    page: number,
    reloadKey?: string
  ): Promise<{ success: true, info: EHPage, data: NSData } | { success: false, info?: EHPage, error: string }> {
    let pageInfo;
    try {
      pageInfo = await this.fetchImageInfo(gid, key, mpvkey, page, reloadKey);
      const data = await this.downloadImage(pageInfo.imageUrl);
      return { success: true, info: pageInfo, data };
    } catch (error: any) {
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name, info: pageInfo };
    }
  }

  async downloadImageByMpvWithThreeRetries(
    gid: number,
    key: string,
    mpvkey: string,
    page: number   // 注意：这里的page是从1开始的
  ) {
    let result: { success: true, info: EHPage, data: NSData }
      | { success: false, info?: EHPage, error: string } = { success: false, error: "RetryTooManyError" };
    let reloadKey: string | undefined;
    for (let i = 0; i < 3; i++) {
      result = await this.downloadImageByMpv(gid, key, mpvkey, page, reloadKey);
      if (result.success) {
        return result;
      } else {
        reloadKey = result.info?.reloadKey;
      }
    }
    return result;
  }

  async downloadThumbnailNoError(
    url: string
  ): Promise<{ success: false, error: string } | { success: true, data: NSData }> {
    const ehgt = !this.exhentai;
    try {
      const data = await this.downloadThumbnail(url, ehgt);
      return { success: true, data };
    } catch (error: any) {
      appLog(error, "error");
      return { success: false, error: error.name };
    }
  }

  async downloadThumbnailWithTwoRetries(
    url: string
  ): Promise<{ success: false, error: string } | { success: true, data: NSData }> {
    let result: { success: false, error: string }
      | { success: true, data: NSData } = { success: false, error: "RetryTooManyError" };
    for (let i = 0; i < 2; i++) {
      result = await this.downloadThumbnailNoError(url);
      if (result.success) return result;
    }
    return result;
  }

  async downloadOriginalImageByPageInfoNoError(
    gid: number,
    imgkey: string,
    page: number,
  ): Promise<{ success: false, error: string } | { success: true, data: NSData }> {
    try {
      const pageInfo = await this.getPageInfo(gid, imgkey, page);
      if (!pageInfo.fullSizeUrl) {
        return { success: false, error: "noOriginalImage" };
      }
      const data = await this.downloadOriginalImage(pageInfo.fullSizeUrl);
      return { success: true, data };
    } catch (error: any) {
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name };
    }
  }

  async downloadOriginalImageByPageInfoWithTwoRetries(
    gid: number,
    imgkey: string,
    page: number,
  ): Promise<{ success: false, error: string } | { success: true, data: NSData }> {
    let result: { success: false, error: string }
      | { success: true, data: NSData } = { success: false, error: "RetryTooManyError" };
    for (let i = 0; i < 2; i++) {
      result = await this.downloadOriginalImageByPageInfoNoError(gid, imgkey, page);
      if (result.success) return result;
    }
    return result;
  }
}

export const api = new APIHandler(false, false);

interface Task {
  index: number;
  handler: () => Promise<void>;
}

abstract class ConcurrentDownloaderBase {
  protected _paused = true;
  protected abstract _maxConcurrency: number;
  protected _running = 0;
  constructor() { }

  protected abstract _getNextTask(): Task | undefined;

  protected async _runSingleTask() {
    if (this._paused) return;
    const task = this._getNextTask();
    if (task) {
      this._running++;
      try {
        appLog(`开始任务: 任务数量=${this._running}`, "debug");
        await task.handler();
      } finally {
        this._running--;
        await this._runSingleTask();
      }
    }
  }

  protected _run() {
    const remainedConcurrency = this._maxConcurrency - this._running;
    for (let i = 0; i < remainedConcurrency; i++) {
      this._runSingleTask().then();
    }
  }

  start() {
    this._paused = false;
    this._run();
  }

  /**
   * 暂停任务(但无法暂停正在执行的任务)
   */
  pause() {
    this._paused = true;
  }

  get running() {
    return this._running;
  }
}

/**
 * 标签缩略图下载器。
 * 
 * 它的实例应该跟随标签而存在。任务的index对应标签item的index。
 */
export class TabThumbnailDownloader extends ConcurrentDownloaderBase {
  protected _maxConcurrency = 10;
  private currentReadingIndex = 0;
  private _items: {
    index: number;
    gid: number;
    url: string;
    path: string;
    started: boolean;
    success: boolean;
    error: boolean;
  }[];

  constructor() {
    super();
    this._items = []
  }

  protected _getNextTask(): Task | undefined {
    // 查找未开始的缩略图，先从currentReadingIndex开始找
    let thumbnailItem = this._items.find(thumbnail => thumbnail.index >= this.currentReadingIndex && !thumbnail.started);
    // 如果找不到，则从头开始查找
    if (!thumbnailItem) thumbnailItem = this._items.find(thumbnail => !thumbnail.started);
    if (thumbnailItem) {
      return this.createThumbnailTask(
        thumbnailItem.index,
        thumbnailItem.gid,
        thumbnailItem.url
      );
    }
    return
  }

  add(thumbnailItems: { gid: number, url: string }[]) {
    const currentLength = this._items.length;
    const mapped = thumbnailItems.map(({ gid, url }, index) => {
      const exist = $file.exists(thumbnailPath + `${gid}.jpg`);
      return {
        index: currentLength + index,
        gid,
        url,
        path: thumbnailPath + `${gid}.jpg`,
        started: exist,
        success: exist,
        error: false
      }
    })
    this._items.push(...mapped);
    if (!this._paused) this._run();
  }

  private createThumbnailTask(index: number, gid: number, url: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载标签缩略图: gid=${gid}, index=${index}`, "debug");
        this._items[index].started = true;
        const result = await api.downloadThumbnailWithTwoRetries(url);
        if (result.success) {
          appLog(`标签缩略图下载成功: gid=${gid}, index=${index}`, "debug");
          $file.write({
            data: result.data,
            path: thumbnailPath + `${gid}.jpg`
          })
          this._items[index].success = true;
        } else {
          this._items[index].error = true;
        }
      }
    }
  }

  clear() {
    this._items = [];
  }

  get pending() {
    return this._items.filter(thumbnail => !thumbnail.started).length;
  }

  get finished() {
    return this._items.filter(thumbnail => thumbnail.success).length;
  }

  get failed() {
    return this._items.filter(thumbnail => thumbnail.error).length;
  }
}

/**
 * MPV图库下载器，包括html、图片、缩略图。前提是使用mpv的api。
 * 
 * 步骤：
 * 1. 首先通过mpv api获取数据。
 * 2. 混编缩略图和图片队列，并开始下载
 * 
 * 不存在清除任务的方法，此对象要废除的话，可以暂停后删除对象
 */
class GalleryMPVDownloader extends ConcurrentDownloaderBase {
  protected _maxConcurrency = 5;
  private infos: EHGallery;
  private gid: number;
  private mpvInfo?: EHMPV;
  downloadingImages = false; // 是否下载图片，如果为false，则只下载缩略图，可以从外部设置
  currentReadingIndex = 0;  // 当前正在阅读的图片的index，可以从外部设置
  background = false; // 是否后台下载，可以从外部设置

  result: {
    thumbnails: { index: number, path?: string, error: boolean, started: boolean }[],
    images: { index: number, path?: string, error: boolean, started: boolean }[]
    topThumbnail: { path?: string, error: boolean, started: boolean }
  }
  constructor(infos: EHGallery) {
    super();
    this.infos = infos;
    this.gid = infos.gid;
    this.result = {
      thumbnails: [...Array(this.infos.length)].map((_, i) => ({ index: i, error: false, started: false })),
      images: [...Array(this.infos.length)].map((_, i) => ({ index: i, error: false, started: false })),
      topThumbnail: {
        error: false,
        started: false
      }
    }
    this.initialize();
  }

  protected _getNextTask(): Task | undefined {
    if (!this.result.topThumbnail.started) {
      return this.createThumbnailTask(
        0,
        this.infos.thumbnail_url,
        thumbnailPath + `${this.gid}.jpg`
      );
    }
    if (!this.mpvInfo) {
      // 如果mpvInfo不存在，则查找this.infos.images中尚未下载的缩略图
      const imagesOnPage0 = this.infos.images[0]
      for (let i = 0; i < imagesOnPage0.length; i++) {
        if (!this.result.thumbnails[i].started) {
          return this.createThumbnailTask(
            i,
            imagesOnPage0[i].thumbnail_url
          );
        }
      }
      return;
    }
    // 查找未开始的缩略图，先从currentReadingIndex开始找
    let thumbnailItem = this.result.thumbnails.find(thumbnail => (thumbnail.index >= this.currentReadingIndex) && !thumbnail.started);
    // 如果找不到，则从头开始查找
    if (!thumbnailItem) thumbnailItem = this.result.thumbnails.find(thumbnail => !thumbnail.started);
    if (this.downloadingImages) {
      // 查找未开始的图片，先从currentReadingIndex开始找
      let imageItem = this.result.images.find(image => (image.index >= this.currentReadingIndex) && !image.started);
      // 如果找不到，则从头开始查找
      if (!imageItem) imageItem = this.result.images.find(image => !image.started);

      if (thumbnailItem && imageItem) {
        // 如果缩略图的index和图片的index都大于currentReadingIndex，则比较index，先下载index小的
        // 如果缩略图的index和图片的index都小于currentReadingIndex，则比较index，先下载index小的
        // 如果缩略图的index大于currentReadingIndex，图片的index小于currentReadingIndex，则下载缩略图
        // 如果缩略图的index小于currentReadingIndex，图片的index大于currentReadingIndex，则下载图片
        if (
          (thumbnailItem.index >= this.currentReadingIndex && imageItem.index >= this.currentReadingIndex) ||
          (thumbnailItem.index < this.currentReadingIndex && imageItem.index < this.currentReadingIndex)
        ) {
          return thumbnailItem.index <= imageItem.index ? this.createThumbnailTask(
            thumbnailItem.index,
            this.mpvInfo.images[thumbnailItem.index].thumbnail_url
          ) : this.createImageTask(
            imageItem.index,
            this.mpvInfo.images[imageItem.index].key,
            this.mpvInfo.mpvkey
          );
        } else if (thumbnailItem.index >= this.currentReadingIndex) {
          return this.createThumbnailTask(
            thumbnailItem.index,
            this.mpvInfo.images[thumbnailItem.index].thumbnail_url
          );
        } else {
          return this.createImageTask(
            imageItem.index,
            this.mpvInfo.images[imageItem.index].key,
            this.mpvInfo.mpvkey
          );
        }
      } else if (thumbnailItem) {
        return this.createThumbnailTask(
          thumbnailItem.index,
          this.mpvInfo.images[thumbnailItem.index].thumbnail_url
        );
      } else if (imageItem) {
        return this.createImageTask(
          imageItem.index,
          this.mpvInfo.images[imageItem.index].key,
          this.mpvInfo.mpvkey
        );
      }
    } else {
      if (thumbnailItem) {
        return this.createThumbnailTask(
          thumbnailItem.index,
          this.mpvInfo.images[thumbnailItem.index].thumbnail_url
        );
      }
    }
  }

  /**
   * 创建后会自动调用，对已存在的缩略图和图片进行标记。
   * 也可以手动调用。
   */
  initialize() {
    // 查找已经存在的缩略图
    const galleryThumbnailPath = thumbnailPath + `${this.gid}`;
    if (!$file.exists(galleryThumbnailPath)) $file.mkdir(galleryThumbnailPath);
    $file.list(galleryThumbnailPath)
      .forEach(name => {
        if (!name.endsWith(".jpg")) return;
        const page1 = parseInt(name.split(".")[0]); // 此处的page1是从1开始的
        if (isNaN(page1)) return;
        this.result.thumbnails[page1 - 1].path = galleryThumbnailPath + "/" + name;
        this.result.thumbnails[page1 - 1].started = true;
      });

    // 查找已经存在的图片
    const galleryImagePath = imagePath + `${this.gid}`;
    if (!$file.exists(galleryImagePath)) $file.mkdir(galleryImagePath);
    $file.list(galleryImagePath)
      .forEach(name => {
        if (!name.endsWith(".jpg") && !name.endsWith(".png") && !name.endsWith(".gif")) return;
        const page1 = parseInt(name.split(".")[0].split("_")[0]); // 此处的page1是从1开始的
        if (isNaN(page1)) return;
        this.result.images[page1 - 1].path = galleryImagePath + "/" + name;
        this.result.images[page1 - 1].started = true;
      });

    // 查找已经存在的顶部缩略图
    const topThumbnailPath = thumbnailPath + `${this.gid}.jpg`;
    if ($file.exists(topThumbnailPath)) {
      this.result.topThumbnail.path = topThumbnailPath;
      this.result.topThumbnail.started = true;
    }
  }

  async refreshMPVInfo() {
    const result = await api.getMPVInfoWithTwoRetries(this.gid, this.infos.token)
    if (result.success) {
      this.mpvInfo = result.info;
      // 如果没有处于暂停状态，那么重新启动任务
      if (!this._paused) await this._run();
    } else {
      appLog("获取MPV信息失败", "error");
      // 如果获取失败，将所有未开始的缩略图任务和图片任务标记为error
      this.result.thumbnails.filter(thumbnail => !thumbnail.started).forEach(thumbnail => {
        thumbnail.error = true;
        thumbnail.started = true;
      });
      this.result.images.filter(image => !image.started).forEach(image => {
        image.error = true;
        image.started = true;
      });
    }
    return result;
  }

  private createThumbnailTask(index: number, url: string, path?: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载图库缩略图: gid=${this.gid}, index=${index}`, "debug");
        this.result.thumbnails[index].started = true;
        const result = await api.downloadThumbnailWithTwoRetries(url);
        if (result.success) {
          appLog(`图库缩略图下载成功: gid=${this.gid}, index=${index}`, "debug");
          if (!path) path = thumbnailPath + `${this.gid}/${index + 1}.jpg`;
          $file.write({
            data: result.data,
            path
          })
          this.result.thumbnails[index].path = path;
        }
      }
    }
  }

  private createImageTask(index: number, key: string, mpvkey: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载图库图片: gid=${this.gid}, index=${index}`, "debug");
        this.result.images[index].started = true;
        const result = await api.downloadImageByMpvWithThreeRetries(this.gid, key, mpvkey, index + 1);
        if (result.success) {
          appLog(`图库图片下载成功: gid=${this.gid}, index=${index}`, "debug");
          const name = this.mpvInfo!.images[index].name;
          let extname = name.slice(name.lastIndexOf(".")).toLowerCase();
          if (extname === ".jpeg") extname = ".jpg";
          const path = imagePath + `${this.gid}/${index + 1}` + extname;
          $file.write({
            data: result.data,
            path
          })
          this.result.images[index].path = path;
        } else {
          this.result.images[index].error = true;
        }
      }
    }
  }

  get pendingOfThumbnails() {
    return this.result.thumbnails.filter(thumbnail => !thumbnail.started).length;
  }

  get pendingOfImages() {
    return this.result.images.filter(image => !image.started).length;
  }

  get pending() {
    return this.pendingOfThumbnails + this.pendingOfImages + (this.result.topThumbnail.started ? 0 : 1);
  }

  get finishedOfThumbnails() {
    return this.result.thumbnails.filter(thumbnail => thumbnail.path).length;
  }

  get finishedOfImages() {
    return this.result.images.filter(image => image.path).length;
  }

  get finished() {
    return this.finishedOfThumbnails + this.finishedOfImages + (this.result.topThumbnail.path ? 1 : 0);
  }

  get isAllFinished(): boolean {
    return this.finished === this.result.thumbnails.length + this.result.images.length + 1;
  }
}

/**
 * 通用图库下载器，包括html、图片、缩略图。不需要使用mpv的api。
 * 
 * 不存在清除任务的方法，此对象要废除的话，可以暂停后删除对象
 */
class GalleryCommonDownloader extends ConcurrentDownloaderBase {
  protected _maxConcurrency = 5;

  readonly infos: EHGallery;
  readonly gid: number;
  private finishHandler: () => void;

  currentReadingIndex = 0;  // 当前正在阅读的图片的index，可以从外部设置
  reading = false; // 是否正在阅读，可以从外部设置
  background = false; // 是否后台下载，可以从外部设置
  backgroundPaused = false; // 是否后台暂停，可以从外部设置
  webDAVConfig: { enabled: true, client: WebDAVClient, filesOnWebDAV: string[] } | { enabled: false } = { enabled: false };

  result: {
    htmls: { index: number, success: boolean, error: boolean, started: boolean }[],
    thumbnails: { index: number, path?: string, error: boolean, started: boolean }[],
    images: { index: number, path?: string, error: boolean, started: boolean }[],
    topThumbnail: { path?: string, error: boolean, started: boolean },
    originalImages: { index: number, userSelected: boolean, path?: string, error: boolean, noOriginalImage: boolean, started: boolean }[],
    aiTranslations: { index: number, userSelected: boolean, path?: string, error: boolean, started: boolean }[]
  }
  constructor(infos: EHGallery, finishHandler: () => void) {
    super();
    this.infos = infos;
    this.gid = infos.gid;
    this.finishHandler = finishHandler;
    this.result = {
      htmls: [...Array(this.infos.total_pages)].map((_, i) => ({ index: i, success: false, error: false, started: false })),
      thumbnails: [...Array(this.infos.length)].map((_, i) => ({ index: i, error: false, started: false })),
      images: [...Array(this.infos.length)].map((_, i) => ({ index: i, error: false, started: false })),
      topThumbnail: { error: false, started: false },
      originalImages: [...Array(this.infos.length)].map((_, i) => ({ index: i, userSelected: false, error: false, noOriginalImage: false, started: false })),
      aiTranslations: [...Array(this.infos.length)].map((_, i) => ({ index: i, userSelected: false, error: false, started: false }))
    }
    this.initialize();
  }

  /**
   * 创建后会自动调用，对已存在的缩略图和图片进行标记。
   * 也可以手动调用。
   */
  initialize() {
    // 查找已经存在的html信息
    for (let i of Object.keys(this.infos.images)) {
      const page = parseInt(i);
      if (isNaN(page)) continue;
      this.result.htmls[page].started = true;
      this.result.htmls[page].success = true;
    }
    // 查找已经存在的缩略图
    const galleryThumbnailPath = thumbnailPath + `${this.gid}`;
    if (!$file.exists(galleryThumbnailPath)) $file.mkdir(galleryThumbnailPath);
    $file.list(galleryThumbnailPath)
      .forEach(name => {
        if (!name.endsWith(".jpg")) return;
        const page1 = parseInt(name.split(".")[0]); // 此处的page1是从1开始的
        if (isNaN(page1)) return;
        this.result.thumbnails[page1 - 1].path = galleryThumbnailPath + "/" + name;
        this.result.thumbnails[page1 - 1].started = true;
      });

    // 查找已经存在的图片
    const galleryImagePath = imagePath + `${this.gid}`;
    if (!$file.exists(galleryImagePath)) $file.mkdir(galleryImagePath);
    $file.list(galleryImagePath)
      .forEach(name => {
        if (!name.endsWith(".jpg") && !name.endsWith(".png") && !name.endsWith(".gif") && !name.endsWith("webp")) return;
        const page1 = parseInt(name.split(".")[0].split("_")[0]); // 此处的page1是从1开始的
        if (isNaN(page1)) return;
        this.result.images[page1 - 1].path = galleryImagePath + "/" + name;
        this.result.images[page1 - 1].started = true;
      });

    // 查找已经存在的顶部缩略图
    const topThumbnailPath = thumbnailPath + `${this.gid}.jpg`;
    if ($file.exists(topThumbnailPath)) {
      this.result.topThumbnail.path = topThumbnailPath;
      this.result.topThumbnail.started = true;
    }

    // 查找已经存在的原图
    const originalImagePathThisGallery = originalImagePath + `${this.gid}`;
    if (!$file.exists(originalImagePathThisGallery)) $file.mkdir(originalImagePathThisGallery);
    $file.list(originalImagePathThisGallery)
      .forEach(name => {
        if (!name.endsWith(".jpg") && !name.endsWith(".png") && !name.endsWith(".gif") && !name.endsWith("webp")) return;
        const page1 = parseInt(name.split(".")[0].split("_")[0]); // 此处的page1是从1开始的
        if (isNaN(page1)) return;
        this.result.originalImages[page1 - 1].path = originalImagePathThisGallery + "/" + name;
        this.result.originalImages[page1 - 1].started = true;
        this.result.originalImages[page1 - 1].userSelected = true;
      });

    // 查找已经存在的AI翻译
    const aiTranslationPathThisGallery = aiTranslationPath + `${this.gid}`;
    if (!$file.exists(aiTranslationPathThisGallery)) $file.mkdir(aiTranslationPathThisGallery);
    $file.list(aiTranslationPathThisGallery)
      .forEach(name => {
        if (!name.endsWith(".jpg") && !name.endsWith(".png") && !name.endsWith(".gif") && !name.endsWith("webp")) return;
        const page1 = parseInt(name.split(".")[0].split("_")[0]); // 此处的page1是从1开始的
        if (isNaN(page1)) return;
        this.result.aiTranslations[page1 - 1].path = aiTranslationPathThisGallery + "/" + name;
        this.result.aiTranslations[page1 - 1].started = true;
        this.result.aiTranslations[page1 - 1].userSelected = true;
      });
  }

  protected _getNextTask(): Task | undefined {
    // 1. 最优先：如果顶部缩略图未开始，则下载顶部缩略图
    if (!this.result.topThumbnail.started) {
      return this.createTopThumbnailTask(
        this.infos.thumbnail_url,
        thumbnailPath + `${this.gid}.jpg`
      );
    }

    // 2. 如果currentReadingIndex所对应的html还没有开始，则下载html
    if (this.infos.num_of_images_on_each_page) {
      // 如果没有num_of_images_on_each_page，则无需考虑html任务（因为只有1页）
      const page = Math.floor(this.currentReadingIndex / this.infos.num_of_images_on_each_page);
      if (!this.result.htmls[page].started) {
        return this.createHtmlTask(page);
      }
    }

    // 3. 在html任务中查找已开始但未完成的任务（started为true, success和error都是false）
    // 如果数量小于等于1，则查找未开始的html任务。保证有两个html任务在同时下载，优先完成html任务。
    const runningHtmlTaskNum = this.result.htmls.filter(html => html.started && !html.success && !html.error).length;
    if (runningHtmlTaskNum <= 1) {
      const htmlTask = this.result.htmls.find(html => !html.started);
      if (htmlTask) return this.createHtmlTask(htmlTask.index);
    }

    // 插入aiTranslation任务
    // 如果存在可执行但未开始的任务，则优先执行它们
    // 可执行的标准为：userSelected为true，started为false, images中对应index的path存在
    const aiTranslationItem = this.result.aiTranslations.find(task => {
      return task.userSelected && !task.started && this.result.images[task.index].path;
    });
    if (aiTranslationItem) {
      return this.createAiTranslationTask(
        aiTranslationItem.index,
        this.result.images[aiTranslationItem.index].path || ""
      );
    }

    // 插入originalImages任务
    // 如果存在可执行但未开始的任务，则优先执行它们
    // 可执行的标准为：对应html任务已完成，userSelected为true，started为false
    const originalImageItem = this.result.originalImages.find(originalImage => {
      const page = this.infos.num_of_images_on_each_page
        ? Math.floor(originalImage.index / this.infos.num_of_images_on_each_page)
        : 0;
      return this.result.htmls[page].success && originalImage.userSelected && !originalImage.started;
    });

    if (originalImageItem) {
      const htmlPageOfFoundImageItem = this.infos.num_of_images_on_each_page
        ? Math.floor(originalImageItem.index / this.infos.num_of_images_on_each_page)
        : 0;
      return this.createOriginalImageTask(
        originalImageItem.index,
        this.infos.images[htmlPageOfFoundImageItem].find(image => image.page === originalImageItem.index)!.imgkey
      );
    }

    // 将当前的this.infos.images转换为url唯一的结构
    const compoundThumbnails: CompoundThumbnail[] = [];
    for (let i of Object.keys(this.infos.images)) {
      const page = parseInt(i);
      if (isNaN(page)) continue;
      const imagesOnThisPage = this.infos.images[page];
      // 从第一个开始，查找具有相同thumbnail_url的图片
      let compoundThumbnail: CompoundThumbnail = {
        thumbnail_url: imagesOnThisPage[0].thumbnail_url,
        startIndex: imagesOnThisPage[0].page,
        endIndex: imagesOnThisPage[0].page,
        images: [imagesOnThisPage[0]]
      }
      for (let i = 1; i < imagesOnThisPage.length; i++) {
        if (imagesOnThisPage[i].thumbnail_url === compoundThumbnail.thumbnail_url) {
          compoundThumbnail.endIndex = imagesOnThisPage[i].page;
          compoundThumbnail.images.push(imagesOnThisPage[i]);
        } else {
          compoundThumbnails.push(compoundThumbnail);
          compoundThumbnail = {
            thumbnail_url: imagesOnThisPage[i].thumbnail_url,
            startIndex: imagesOnThisPage[i].page,
            endIndex: imagesOnThisPage[i].page,
            images: [imagesOnThisPage[i]]
          }
        }
      }
      compoundThumbnails.push(compoundThumbnail);
    }
    // 4. 查找未开始的缩略图任务
    // 规则为：在对应html任务已经完成的缩略图任务中，先从currentReadingIndex开始找，如果找不到，则从头开始找
    // 2024-11-20 update: 由于ehentai图库页面改版，改为从compoundThumbnails中查找

    // 4.1 先从currentReadingIndex开始找
    let compoundThumbnailItem = compoundThumbnails
      .find(n => n.endIndex >= this.currentReadingIndex
        && this.result.thumbnails
          .filter(i => i.index >= n.startIndex && i.index <= n.endIndex)
          .some(i => i.started === false));
    // 4.2 如果找不到，则从头开始找
    if (!compoundThumbnailItem) compoundThumbnailItem = compoundThumbnails
      .find(n => this.result.thumbnails
        .filter(i => i.index >= n.startIndex && i.index <= n.endIndex)
        .some(i => i.started === false));

    // 如果background为true且backgroundPaused为false，或者downloadingImages为true，则尝试进行图片任务
    if (this.background && !this.backgroundPaused || this.reading) {
      // 5. 查找未开始的图片任务
      // 规则为：在对应html任务已经完成的图片任务中，先从currentReadingIndex开始找，如果找不到，则从头开始找
      let imageItem = this.result.images.find(image => {
        const page = this.infos.num_of_images_on_each_page
          ? Math.floor(image.index / this.infos.num_of_images_on_each_page)
          : 0;
        return this.result.htmls[page].success && (image.index >= this.currentReadingIndex) && !image.started
      });
      if (!imageItem) imageItem = this.result.images.find(image => {
        const page = this.infos.num_of_images_on_each_page
          ? Math.floor(image.index / this.infos.num_of_images_on_each_page)
          : 0;
        return this.result.htmls[page].success && !image.started
      });
      if (compoundThumbnailItem && imageItem) {
        // 如果图片对应的缩略图还没有开始，则下载缩略图，否则下载图片
        const imageItemIndex = imageItem.index;
        if (imageItem.index >= compoundThumbnailItem.startIndex && imageItem.index <= compoundThumbnailItem.endIndex) {
          return this.createCompoundThumbnailTask(compoundThumbnailItem);
        } else {
          const htmlPageOfFoundImageItem = this.infos.num_of_images_on_each_page
            ? Math.floor(imageItem.index / this.infos.num_of_images_on_each_page)
            : 0;
          return this.createImageTask(
            imageItem.index,
            this.infos.images[htmlPageOfFoundImageItem].find(image => image.page === imageItemIndex)!.imgkey
          );
        }
      } else if (compoundThumbnailItem) {
        return this.createCompoundThumbnailTask(compoundThumbnailItem);
      } else if (imageItem) {
        const imageItemIndex = imageItem.index;
        const htmlPageOfFoundImageItem = this.infos.num_of_images_on_each_page
          ? Math.floor(imageItem.index / this.infos.num_of_images_on_each_page)
          : 0;
        return this.createImageTask(
          imageItem.index,
          this.infos.images[htmlPageOfFoundImageItem].find(image => image.page === imageItemIndex)!.imgkey
        );
      }
    } else {
      if (compoundThumbnailItem) {
        return this.createCompoundThumbnailTask(compoundThumbnailItem);
      }
    }
    return
  }

  private createHtmlTask(index: number) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载图库页面: gid=${this.gid}, index=${index}`, "debug");
        this.result.htmls[index].started = true;
        const result = await api.getGalleryImagesWithTwoRetries(this.gid, this.infos.token, index);
        if (result.success) {
          appLog(`图库页面下载成功: gid=${this.gid}, index=${index}`, "debug");
          this.result.htmls[index].success = true;
          this.infos.images[index] = result.images[index];
          // 特殊：在完成后，重新启动任务
          if (!this._paused) await this._run();
        } else {
          this.result.htmls[index].error = true;
          // 除了html任务自己标记为失败，与此任务关联的未开始的缩略图和图片任务也标记为失败
          if (this.infos.num_of_images_on_each_page) {
            // 如果没有num_of_images_on_each_page，则无需考虑此种情况（因为只有1页）
            const startIndex = index * this.infos.num_of_images_on_each_page;
            const endIndex = startIndex + this.infos.num_of_images_on_each_page;
            this.result.thumbnails.filter(thumbnail => {
              return thumbnail.index >= startIndex && thumbnail.index < endIndex && !thumbnail.started;
            }).forEach(thumbnail => {
              thumbnail.started = true;
              thumbnail.error = true;
            });
            this.result.images.filter(image => {
              return image.index >= startIndex && image.index < endIndex && !image.started;
            }).forEach(image => {
              image.started = true;
              image.error = true;
            });
          }
        }
      }
    }
  }

  private createTopThumbnailTask(url: string, path: string) {
    return {
      index: 0,
      handler: async () => {
        appLog(`开始下载图库顶部缩略图: gid=${this.gid}`, "debug");
        this.result.topThumbnail.started = true;
        const result = await api.downloadThumbnailWithTwoRetries(url);
        if (result.success) {
          appLog(`图库顶部缩略图下载成功: gid=${this.gid}`, "debug");
          $file.write({
            data: result.data,
            path
          })
          this.result.topThumbnail.path = path;
        } else {
          this.result.topThumbnail.error = true;
        }
        if (this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      }
    }
  }

  private createCompoundThumbnailTask(compoundThumbnailItem: CompoundThumbnail) {
    const startIndex = compoundThumbnailItem.startIndex;
    const endIndex = compoundThumbnailItem.endIndex;
    const url = compoundThumbnailItem.thumbnail_url;
    const images = compoundThumbnailItem.images;
    return {
      index: startIndex,
      handler: async () => {
        appLog(`开始下载图库缩略图: gid=${this.gid}, startIndex=${startIndex}, endIndex=${endIndex}`, "debug");
        this.result.thumbnails
          .filter(thumbnail => thumbnail.index >= startIndex && thumbnail.index <= endIndex)
          .forEach(thumbnail => { thumbnail.started = true });
        const result = await api.downloadThumbnailWithTwoRetries(url);
        if (result.success) {
          appLog(`图库缩略图下载成功: gid=${this.gid}, startIndex=${startIndex}, endIndex=${endIndex}`, "debug");
          const data = result.data;
          const image = data.image;  // 此处的读取image必须放在循环外面，以减少调用次数，否则会出现莫名其妙为空的情况
          const filtered = this.result.thumbnails
            .filter(thumbnail => thumbnail.index >= startIndex && thumbnail.index <= endIndex)
          for (let i = 0; i < filtered.length; i++) {
            const thumbnail = filtered[i];
            const index = thumbnail.index;
            const frame = images.find(image => image.page === index)!.frame;
            const dataCropped = cropImageData(data, image, frame);
            // 此处有可能会出现dataCropped为空的情况，需要处理
            if (!dataCropped) {
              thumbnail.error = true;
              continue;
            }
            const path = thumbnailPath + `${this.gid}/${index + 1}.jpg`;
            $file.write({
              data: dataCropped,
              path
            })
            this.result.thumbnails[index].path = path;
            await $wait(0.2);
          }
        } else {
          this.result.thumbnails
            .filter(thumbnail => thumbnail.index >= startIndex && thumbnail.index <= endIndex)
            .forEach(thumbnail => { thumbnail.error = true });
        }
        if (this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      }
    }
  }

  private createImageTask(index: number, imgkey: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载图库图片: gid=${this.gid}, index=${index}, webdav=${this.webDAVConfig.enabled}`, "debug");
        this.result.images[index].started = true;
        const result = this.webDAVConfig.enabled
          ? await this.webDAVConfig.client.downloadNoError(this.webDAVConfig.filesOnWebDAV[index])
          : await api.downloadImageByPageInfoWithThreeRetries(
            this.gid,
            imgkey,
            index
          );

        if (result.success) {
          appLog(`图库图片下载成功: gid=${this.gid}, index=${index}, webdav=${this.webDAVConfig.enabled}`, "debug");
          let extname = result.data.info.mimeType.split("/")[1];;
          if (extname === "jpeg") extname = "jpg";
          const path = imagePath + `${this.gid}/${index + 1}.${extname}`;
          $file.write({
            data: result.data,
            path
          })
          this.result.images[index].path = path;
        } else {
          this.result.images[index].error = true;
        }
        if (this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      }
    }
  }

  private createOriginalImageTask(index: number, imgkey: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载原图: gid=${this.gid}, index=${index}`, "debug");
        this.result.originalImages[index].started = true;
        const result = await api.downloadOriginalImageByPageInfoWithTwoRetries(
          this.gid,
          imgkey,
          index
        );
        if (result.success) {
          appLog(`原图下载成功: gid=${this.gid}, index=${index}`, "debug");
          let extname = result.data.info.mimeType.split("/")[1];
          if (extname === "jpeg") extname = "jpg";
          const path = originalImagePath + `${this.gid}/${index + 1}.${extname}`;
          $file.write({
            data: result.data,
            path
          })
          this.result.originalImages[index].path = path;
        } else {
          this.result.originalImages[index].error = true;
          if (result.error === "noOriginalImage") {
            this.result.originalImages[index].noOriginalImage = true;
          }
        }
      }
    }
  }

  private createAiTranslationTask(index: number, path: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始进行AI翻译: gid=${this.gid}, index=${index}`, "debug");
        this.result.aiTranslations[index].started = true;
        const result = await aiTranslate(path);
        if (result.success) {
          appLog(`AI翻译成功: gid=${this.gid}, index=${index}`, "debug");
          const path = aiTranslationPath + `${this.gid}/${index + 1}.jpg`;
          $file.write({
            data: result.data,
            path
          })
          this.result.aiTranslations[index].path = path;
        } else {
          this.result.aiTranslations[index].error = true;
        }
      }
    }
  }

  get pendingOfHtmls() {
    return this.result.htmls.filter(html => !html.started).length;
  }

  get pendingOfThumbnails() {
    return this.result.thumbnails.filter(thumbnail => !thumbnail.started).length;
  }

  get pendingOfImages() {
    return this.result.images.filter(image => !image.started).length;
  }

  get pending() {
    return this.pendingOfHtmls + this.pendingOfThumbnails + this.pendingOfImages + (this.result.topThumbnail.started ? 0 : 1);
  }

  get finishedOfHtmls() {
    return this.result.htmls.filter(html => html.success).length;
  }

  get finishedOfThumbnails() {
    return this.result.thumbnails.filter(thumbnail => thumbnail.path).length;
  }

  get finishedOfImages() {
    return this.result.images.filter(image => image.path).length;
  }

  get finished() {
    return this.finishedOfHtmls + this.finishedOfThumbnails + this.finishedOfImages + (this.result.topThumbnail.path ? 1 : 0);
  }

  get isAllFinished(): boolean {
    return this.finished === this.result.htmls.length + this.result.thumbnails.length + this.result.images.length + 1;
  }

  get isAllFinishedDespiteError(): boolean {
    const topThumbnailFinishedDespiteError = this.result.topThumbnail.path || this.result.topThumbnail.error;
    const finishedOfHtmlsDespiteError = this.result.htmls.filter(html => html.success || html.error).length;
    const finishedOfThumbnailsDespiteError = this.result.thumbnails.filter(thumbnail => thumbnail.path || thumbnail.error).length;
    const finishedOfImagesDespiteError = this.result.images.filter(image => image.path || image.error).length;
    return Boolean(topThumbnailFinishedDespiteError) &&
      finishedOfHtmlsDespiteError === this.result.htmls.length &&
      finishedOfThumbnailsDespiteError === this.result.thumbnails.length &&
      finishedOfImagesDespiteError === this.result.images.length;
  }
}

/**
 * 
 */
class GalleryWebDAVUploader extends ConcurrentDownloaderBase {
  protected _maxConcurrency = 1;

  readonly infos: EHGallery;
  readonly gid: number;
  private finishHandler: () => void;
  private _client: WebDAVClient;

  backgroundPaused = false; // 用户主动暂停, 可从外部设置

  result: {
    mkdir: { path?: string, success: boolean, error: boolean, started: boolean },
    upload: { index: number, src: string, success: boolean, error: boolean, started: boolean }[],
  }
  constructor(infos: EHGallery, client: WebDAVClient, finishHandler: () => void) {
    super();
    this.infos = infos;
    this.gid = infos.gid;
    this.finishHandler = finishHandler;
    this._client = client;
    const filesOnLocal = $file.list(imagePath + `${this.gid}/`).map(n => imagePath + `${this.gid}/` + n)
    this.result = {
      mkdir: { success: false, error: false, started: false },
      upload: filesOnLocal.map((n, index) => ({ index, src: n, success: false, error: false, started: false }))
    }
  }

  protected _getNextTask() {
    // 如果mkdir未开始，则创建mkdir任务
    if (!this.result.mkdir.started) {
      return this.createMkdirTask();
    }
    // 需要先等待mkdir任务完成
    if (!this.result.mkdir.success) {
      return;
    }
    // 如果backgroundPaused为true，则暂停
    if (this.backgroundPaused) {
      return;
    }
    // 在upload中查找未开始的任务，并创建upload任务
    const uploadTask = this.result.upload.find(n => !n.started);
    if (uploadTask) {
      return this.createUploadTask(uploadTask.index, uploadTask.src);
    }
  }

  private createMkdirTask() {
    return {
      index: 0,
      handler: async () => {
        this.result.mkdir.started = true;
        // 执行3个动作：
        // 1. 查询目录是否存在
        // 2. 如果不存在，则创建目录
        // 3. 如果存在，则清空目录下的所有文件
        try {
          const files = await this._client.list({ path: '' });
          const target = files.find(file => isNameMatchGid(file.name, this.gid));
          if (!target) {
            // 不存在，则创建目录
            await this._client.mkdir(this.gid.toString());
            this.result.mkdir.success = true;
            this.result.mkdir.path = this.gid.toString();
          } else {
            // 存在，则清空目录下的所有文件
            const needToDeleteFiles = await this._client.list({ path: target.name });
            for (const file of needToDeleteFiles) {
              if (file.isfile) {
                await this._client.delete(target.name + "/" + file.name);
              }
            }
            this.result.mkdir.success = true;
            this.result.mkdir.path = target.name;
          }
        } catch (e: any) {
          this.result.mkdir.error = true;
        }
      }
    }
  }

  private createUploadTask(index: number, src: string) {
    return {
      index,
      handler: async () => {
        this.result.upload[index].started = true;
        if (!this.result.mkdir.path) {
          this.result.upload[index].error = true;
          return;
        }
        const data = $file.read(src);
        const contentType = data.info.mimeType;
        const dst = `${this.result.mkdir.path}/${index + 1}.${contentType.split("/")[1]}`;
        console.log(dst);
        const result = await this._client.uploadNoError(dst, data, contentType);
        if (result.success) {
          this.result.upload[index].success = true;
        } else {
          this.result.upload[index].error = true;
        }
        if (this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      }
    }
  }

  get pending() {
    return this.result.upload.filter(n => !n.started).length;
  }

  get finished() {
    return this.result.upload.filter(n => n.success).length;
  }

  get isAllFinished() {
    return this.result.upload.every(n => n.success);
  }

  get isAllFinishedDespiteError() {
    return this.result.upload.every(n => n.success || n.error);
  }
}

/**
 * 下载器管理器。
 * 
 * 1. 始终都只能有一个下载器在下载，其他下载器都处于暂停状态。
 * TODO：为galleryDownloaders添加background属性，当前下载器下载完成后，会自动查找background为true的下载器并启动。
 */
class DownloaderManager {
  tabDownloaders: Map<string, TabThumbnailDownloader>; // key为tab的id
  galleryDownloaders: Map<number, GalleryCommonDownloader>;
  galleryWebDAVUploaders: Map<number, GalleryWebDAVUploader>;
  mpv = false; // 是否使用mpv的api TODO：暂时不支持动态修改

  constructor() {
    this.tabDownloaders = new Map() as Map<string, TabThumbnailDownloader>;
    this.galleryDownloaders = new Map() as Map<number, GalleryCommonDownloader>;
    this.galleryWebDAVUploaders = new Map() as Map<number, GalleryWebDAVUploader>;
  }

  /**
   * 添加一个图库下载器
   * @param gid 图库id
   * @param infos 图库信息
   */
  add(gid: number, infos: EHGallery) {
    const downloader = new GalleryCommonDownloader(infos, () => {
      for (const [k, v] of this.galleryDownloaders) {
        if (k !== gid && v.background && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
          this.startOne(k);
          break;
        }
      }
    })
    this.galleryDownloaders.set(gid, downloader);
    return downloader;
  }

  /**
   * 删除一个图库下载器
   * @param gid 图库id
   */
  remove(gid: number) {
    this.galleryDownloaders.get(gid)?.pause();
    return this.galleryDownloaders.delete(gid);
  }

  /**
   * 获取一个图库下载器
   */
  get(gid: number) {
    return this.galleryDownloaders.get(gid);
  }

  /**
   * 启动某一个图库下载器，并暂停其他全部图库下载器
   */
  startOne(gid: number) {
    let success = false;
    for (const [k, v] of this.galleryDownloaders) {
      if (k === gid) {
        v.start();
        success = true;
      } else {
        v.pause();
      }
    }
    for (const v of this.tabDownloaders.values()) {
      v.pause();
    }
    for (const v of this.galleryWebDAVUploaders.values()) {
      v.pause();
    }
    return success;
  }

  /**
   * 新建一个标签缩略图下载器
   */
  addTabDownloader(id: string) {
    const tabDownloader = new TabThumbnailDownloader();
    this.tabDownloaders.set(id, tabDownloader);
    return tabDownloader;
  }

  /**
   * 获取一个标签缩略图下载器
   */
  getTabDownloader(id: string) {
    return this.tabDownloaders.get(id);
  }

  /**
   * 暂停一个标签缩略图下载器
   */
  pauseTabDownloader(id: string) {
    this.tabDownloaders.get(id)?.pause();
  }

  /**
   * 删除一个标签缩略图下载器
   */
  removeTabDownloader(id: string) {
    this.tabDownloaders.get(id)?.pause();
    return this.tabDownloaders.delete(id);
  }

  /**
   * 启动指定的标签缩略图下载器，并暂停其他全部下载器
   */
  startTabDownloader(id: string) {
    let success = false;
    for (const [k, v] of this.tabDownloaders) {
      if (k === id) {
        v.start();
        success = true;
      } else {
        v.pause();
      }
    }
    for (const v of this.galleryDownloaders.values()) {
      v.pause();
    }
    for (const v of this.galleryWebDAVUploaders.values()) {
      v.pause();
    }
    return success;
  }

  /**
   * 新建一个图库WebDAV上传器
   */
  addGalleryWebDAVUploader(infos: EHGallery, client: WebDAVClient) {
    const uploader = new GalleryWebDAVUploader(infos, client, () => { });
    this.galleryWebDAVUploaders.set(infos.gid, uploader);
    return uploader;
  }

  /**
   * 获取一个图库WebDAV上传器
   */
  getGalleryWebDAVUploader(gid: number) {
    return this.galleryWebDAVUploaders.get(gid);
  }

  /**
   * 暂停一个图库WebDAV上传器
   */
  pauseGalleryWebDAVUploader(gid: number) {
    this.galleryWebDAVUploaders.get(gid)?.pause();
  }

  /**
   * 删除一个图库WebDAV上传器
   */
  removeGalleryWebDAVUploader(gid: number) {
    this.galleryWebDAVUploaders.get(gid)?.pause();
    return this.galleryWebDAVUploaders.delete(gid);
  }

  /**
   * 启动指定的图库WebDAV上传器，并暂停其他全部下载器
   */
  startGalleryWebDAVUploader(gid: number) {
    let success = false;
    for (const [k, v] of this.galleryWebDAVUploaders) {
      if (k === gid) {
        v.start();
        success = true;
      } else {
        v.pause();
      }
    }
    for (const v of this.tabDownloaders.values()) {
      v.pause();
    }
    for (const v of this.galleryDownloaders.values()) {
      v.pause();
    }
    return success;
  }

  /**
   * 暂停所有图库下载器
   */
  pauseAll() {
    for (const v of this.tabDownloaders.values()) {
      v.pause();
    }
    for (const v of this.galleryDownloaders.values()) {
      v.pause();
    }
    for (const v of this.galleryWebDAVUploaders.values()) {
      v.pause();
    }
  }
}

export const downloaderManager = new DownloaderManager();