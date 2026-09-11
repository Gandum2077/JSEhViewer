import { EHAPIHandler, EHGallery, EHIgneousExpiredError, EHIPBannedError, EHMPV, EHPage } from "ehentai-parser";
import { appLog, cropImageData, isNameMatchGid } from "./tools";
import { aiTranslationPath, galleryInfoPath, imagePath, originalImagePath, thumbnailPath } from "./glv";
import { aiTranslate } from "../ai-translations/ai-translate";
import { WebDAVClient } from "./webdav";
import { configManager } from "./config";
import { FatalError } from "./error";
import { dbManager } from "./database";

type CompoundThumbnail = {
  thumbnail_url: string;
  startIndex: number;
  endIndex: number;
  images: {
    page: number; // 从0开始
    name: string;
    imgkey: string;
    thumbnail_url: string;
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }[];
};

// APIHandler中补充的方法均不抛出错误，所有错误都在内部处理。
class APIHandler extends EHAPIHandler {
  constructor() {
    super((parsedCookies) => {
      configManager.cookie = JSON.stringify(parsedCookies);
    });
  }

  async getMPVInfoWithNoError(
    gid: number,
    token: string,
  ): Promise<{ success: false; error: string } | { success: true; info: EHMPV }> {
    try {
      const info = await this.getMPVInfo(gid, token);
      return { success: true, info };
    } catch (error: any) {
      appLog(error, "error");
      appLog("获取MPV信息失败", "error");
      return { success: false, error: error.name };
    }
  }

  async getMPVInfoWithTwoRetries(
    gid: number,
    token: string,
  ): Promise<{ success: false; error: string } | { success: true; info: EHMPV }> {
    let result: { success: false; error: string } | { success: true; info: EHMPV } = {
      success: false,
      error: "RetryTooManyError",
    };
    for (let i = 0; i < 2; i++) {
      result = await this.getMPVInfoWithNoError(gid, token);
      if (result.success) return result;
    }
    return result;
  }

  async getGalleryImagesWithNoError(
    gid: number,
    token: string,
    page: number,
  ): Promise<{ success: false; error: string } | { success: true; images: EHGallery["images"]; info: EHGallery }> {
    try {
      const info = await this.getGalleryInfo(gid, token, false, page);
      return { success: true, images: info.images, info };
    } catch (error: any) {
      appLog(error, "error");
      appLog(`获取图库页面失败: gid=${gid}, page=${page}`, "error");
      if (error instanceof EHIgneousExpiredError) {
        throw new FatalError("里站Cookie已过期，且无法自动刷新");
      }
      if (error instanceof EHIPBannedError) {
        throw new FatalError("你的IP地址可能被封禁");
      }
      return { success: false, error: error.name };
    }
  }

  async getGalleryImagesWithTwoRetries(
    gid: number,
    token: string,
    page: number,
  ): Promise<{ success: false; error: string } | { success: true; images: EHGallery["images"]; info: EHGallery }> {
    let result: { success: false; error: string } | { success: true; images: EHGallery["images"]; info: EHGallery } = {
      success: false,
      error: "RetryTooManyError",
    };
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
    reloadKey?: string,
  ): Promise<{ success: true; info: EHPage; data: NSData } | { success: false; info?: EHPage; error: string }> {
    let pageInfo: EHPage | undefined = undefined;
    try {
      pageInfo = await this.getPageInfo(gid, imgkey, page, reloadKey);
      const data = await this.downloadImage(pageInfo.imageUrl);
      return { success: true, info: pageInfo, data };
    } catch (error: any) {
      appLog(error, "error");
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name, info: pageInfo };
    }
  }

  async downloadImageByShowkey(
    gid: number,
    imgkey: string,
    page: number,
    showkey: string,
  ): Promise<{ success: true; info: EHPage; data: NSData } | { success: false; info?: EHPage; error: string }> {
    let pageInfo: EHPage | undefined = undefined;
    try {
      pageInfo = await this.fetchImageInfoByShowpage(gid, imgkey, showkey, page);
      const data = await this.downloadImage(pageInfo.imageUrl);
      return { success: true, info: pageInfo, data };
    } catch (error: any) {
      appLog(error, "error");
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name, info: pageInfo };
    }
  }

  async downloadImageByPageInfoWithThreeRetries(
    gid: number,
    imgkey: string,
    page: number,
    showkey?: string, // 第一次获取，可以通过showkey进行，速度更快
  ) {
    let result: { success: true; info: EHPage; data: NSData } | { success: false; info?: EHPage; error: string } = {
      success: false,
      error: "RetryTooManyError",
    };
    let reloadKey: string | undefined;
    for (let i = 0; i < 3; i++) {
      if (i === 0 && showkey) {
        result = await this.downloadImageByShowkey(gid, imgkey, page, showkey);
      } else {
        result = await this.downloadImageByPageInfo(gid, imgkey, page, reloadKey);
      }
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
    imgkey: string,
    mpvkey: string,
    page: number,
    reloadKey?: string,
  ): Promise<{ success: true; info: EHPage; data: NSData } | { success: false; info?: EHPage; error: string }> {
    let pageInfo;
    try {
      pageInfo = await this.fetchImageInfo(gid, imgkey, mpvkey, page, reloadKey);
      const data = await this.downloadImage(pageInfo.imageUrl);
      return { success: true, info: pageInfo, data };
    } catch (error: any) {
      appLog(error, "error");
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name, info: pageInfo };
    }
  }

  async downloadImageByMpvWithThreeRetries(
    gid: number,
    imgkey: string,
    mpvkey: string,
    page: number, // 注意：这里的page是从1开始的
  ) {
    let result: { success: true; info: EHPage; data: NSData } | { success: false; info?: EHPage; error: string } = {
      success: false,
      error: "RetryTooManyError",
    };
    let reloadKey: string | undefined;
    for (let i = 0; i < 3; i++) {
      result = await this.downloadImageByMpv(gid, imgkey, mpvkey, page, reloadKey);
      if (result.success) {
        return result;
      } else {
        reloadKey = result.info?.reloadKey;
      }
    }
    return result;
  }

  async downloadThumbnailNoError(
    url: string,
  ): Promise<{ success: false; error: string } | { success: true; data: NSData }> {
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
    url: string,
  ): Promise<{ success: false; error: string } | { success: true; data: NSData }> {
    let result: { success: false; error: string } | { success: true; data: NSData } = {
      success: false,
      error: "RetryTooManyError",
    };
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
  ): Promise<{ success: false; error: string } | { success: true; data: NSData }> {
    try {
      const pageInfo = await this.getPageInfo(gid, imgkey, page);
      if (!pageInfo.fullSizeUrl) {
        return { success: false, error: "noOriginalImage" };
      }
      const data = await this.downloadOriginalImage(pageInfo.fullSizeUrl);
      return { success: true, data };
    } catch (error: any) {
      appLog(error, "error");
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name };
    }
  }

  async downloadOriginalImageByPageInfoWithTwoRetries(
    gid: number,
    imgkey: string,
    page: number,
  ): Promise<{ success: false; error: string } | { success: true; data: NSData }> {
    let result: { success: false; error: string } | { success: true; data: NSData } = {
      success: false,
      error: "RetryTooManyError",
    };
    for (let i = 0; i < 2; i++) {
      result = await this.downloadOriginalImageByPageInfoNoError(gid, imgkey, page);
      if (result.success) return result;
    }
    return result;
  }
}

export const api = new APIHandler();

interface Task {
  index: number;
  handler: () => Promise<void>;
}

abstract class ConcurrentDownloaderBase {
  protected _paused = true;
  protected abstract _maxConcurrency: number;
  protected _running = 0;
  constructor() {}

  protected abstract _getNextTask(): Task | undefined;
  onIdle?: () => void;
  onError?: (error: unknown) => void;

  protected async _runSingleTask() {
    if (this._paused) return;
    const task = this._getNextTask();
    if (task) {
      this._running++;
      try {
        appLog(`开始任务: 任务数量=${this._running}`, "debug");
        await task.handler();
      } catch (error) {
        if (this.onError) this.onError(error);
        else throw error;
      } finally {
        this._running--;
        await this._runSingleTask();
        if (this._running === 0) this.onIdle?.();
      }
    } else if (this._running === 0) {
      this.onIdle?.();
    }
  }

  protected _run() {
    const remainedConcurrency = this._maxConcurrency - this._running;
    for (let i = 0; i < remainedConcurrency; i++) {
      this._runSingleTask().catch((error) => {
        if (!this.onError) throw error;
        this.onError(error);
        if (this._running === 0) this.onIdle?.();
      });
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
  currentReadingIndex = 0;
  private _items: {
    index: number;
    gid: number;
    url: string;
    path: string;
    started: boolean;
    success: boolean;
    error: boolean;
  }[];
  private _finishHandler: () => void;

  constructor(finishHandler: () => void) {
    super();
    this._items = [];
    this._finishHandler = finishHandler;
  }

  protected _getNextTask(): Task | undefined {
    // 查找未开始的缩略图，先从currentReadingIndex开始找
    let thumbnailItem = this._items.find(
      (thumbnail) => thumbnail.index >= this.currentReadingIndex && !thumbnail.started,
    );
    // 如果找不到，则从头开始查找
    if (!thumbnailItem) thumbnailItem = this._items.find((thumbnail) => !thumbnail.started);
    if (thumbnailItem) {
      return this.createThumbnailTask(thumbnailItem.index, thumbnailItem.gid, thumbnailItem.url);
    }
    return;
  }

  add(thumbnailItems: { gid: number; url: string }[]) {
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
        error: false,
      };
    });
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
            path: thumbnailPath + `${gid}.jpg`,
          });
          this._items[index].success = true;
        } else {
          this._items[index].error = true;
        }
        if (!this._paused && this.isAllFinishedDespiteError) {
          this._finishHandler();
        }
      },
    };
  }

  clear() {
    this._items = [];
    this.currentReadingIndex = 0;
  }

  get pending() {
    return this._items.filter((thumbnail) => !thumbnail.started).length;
  }

  get finished() {
    return this._items.filter((thumbnail) => thumbnail.success).length;
  }

  get failed() {
    return this._items.filter((thumbnail) => thumbnail.error).length;
  }

  get isAllFinished() {
    return this.finished === this._items.length;
  }

  get isAllFinishedDespiteError() {
    return this._items.filter((thumbnail) => thumbnail.error || thumbnail.success).length === this._items.length;
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
  private mpvAvailable: boolean;
  private finishHandler: () => void;

  private mpvkey?: string;
  private showkey?: string;

  currentReadingIndex = 0; // 当前正在阅读的图片的index，可以从外部设置
  reading = false; // 是否正在阅读，可以从外部设置
  imageDownloadCount = 0; // 从 currentReadingIndex 起允许下载的图片数量；0 表示不限并允许回头查找
  currentThumbnailIndex = 0; // 缩略图浏览的优先位置，与图片阅读位置独立
  thumbnailDownloadCount = 0; // 0 表示不限并允许回头查找，正数限定从 currentThumbnailIndex 起的数量
  private preferImageTask = false;
  private readonly downloadTopThumbnail: boolean;
  private htmlRunning = false;
  private _background = false; // 是否后台下载，可以从外部设置
  backgroundPaused = false; // 是否后台暂停，可以从外部设置
  completeStopped = false; // 彻底停止，打开后将不能写入存储
  webDAVConfig: { enabled: true; client: WebDAVClient; filesOnWebDAV: string[] } | { enabled: false } = {
    enabled: false,
  };

  result: {
    mpv: { success: boolean; error: boolean; started: boolean };
    htmls: {
      index: number;
      success: boolean;
      error: boolean;
      started: boolean;
    }[];
    thumbnails: {
      index: number;
      path?: string;
      error: boolean;
      started: boolean;
    }[];
    images: {
      index: number;
      path?: string;
      error: boolean;
      errorName?: string;
      started: boolean;
    }[];
    topThumbnail: { path?: string; error: boolean; started: boolean };
    originalImages: {
      index: number;
      userSelected: boolean;
      path?: string;
      error: boolean;
      noOriginalImage: boolean;
      started: boolean;
    }[];
    aiTranslations: {
      index: number;
      userSelected: boolean;
      path?: string;
      error: boolean;
      started: boolean;
    }[];
  };
  constructor({
    infos,
    mpvAvailable,
    imageDownloadCount = 0,
    thumbnailDownloadCount = 0,
    downloadTopThumbnail = true,
    finishHandler,
  }: {
    infos: EHGallery;
    mpvAvailable: boolean;
    imageDownloadCount?: number;
    thumbnailDownloadCount?: number;
    downloadTopThumbnail?: boolean;
    finishHandler: () => void;
  }) {
    super();
    this.infos = infos;
    this.gid = infos.gid;
    this.mpvAvailable = mpvAvailable;
    this.imageDownloadCount = imageDownloadCount;
    this.thumbnailDownloadCount = thumbnailDownloadCount;
    this.downloadTopThumbnail = downloadTopThumbnail;
    this.finishHandler = finishHandler;
    this.result = {
      mpv: { success: false, error: false, started: false },
      htmls: [...Array(this.infos.total_pages)].map((_, i) => ({
        index: i,
        success: false,
        error: false,
        started: false,
      })),
      thumbnails: [...Array(this.infos.length)].map((_, i) => ({
        index: i,
        error: false,
        started: false,
      })),
      images: [...Array(this.infos.length)].map((_, i) => ({
        index: i,
        error: false,
        started: false,
      })),
      topThumbnail: { error: false, started: false },
      originalImages: [...Array(this.infos.length)].map((_, i) => ({
        index: i,
        userSelected: false,
        error: false,
        noOriginalImage: false,
        started: false,
      })),
      aiTranslations: [...Array(this.infos.length)].map((_, i) => ({
        index: i,
        userSelected: false,
        error: false,
        started: false,
      })),
    };
    this.initialize();
  }

  /**
   * 创建后会自动调用，对已存在的缩略图和图片进行标记。
   * 也可以手动调用。
   */
  initialize() {
    // 每页缩略图数量可能变化，不能混用不完整的旧分页与新请求结果。
    if (Object.keys(this.infos.images).length !== this.infos.total_pages) {
      this.infos.images = {};
      this.result.htmls = [...Array(this.infos.total_pages)].map((_, index) => ({
        index,
        started: false,
        success: false,
        error: false,
      }));
    } else {
      for (const key of Object.keys(this.infos.images)) {
        const page = Number(key);
        if (!Number.isInteger(page) || !this.result.htmls[page]) continue;
        this.result.htmls[page].started = true;
        this.result.htmls[page].success = true;
      }
    }

    if (this.result.htmls.every((n) => n.success) && !$file.exists(galleryInfoPath + `${this.gid}.json`)) {
      // 如果此时html已经全部下载完成，并且本地文件不存在，保存到本地
      const text = JSON.stringify(this.infos, null, 2);
      $file.write({
        data: $data({ string: text }),
        path: galleryInfoPath + `${this.gid}.json`,
      });
    }

    // 查找已经存在的缩略图
    const galleryThumbnailPath = thumbnailPath + `${this.gid}`;
    if (!$file.exists(galleryThumbnailPath)) $file.mkdir(galleryThumbnailPath);
    $file.list(galleryThumbnailPath)!.forEach((name) => {
      if (!name.endsWith(".jpg")) return;
      const page1 = parseInt(name.split(".")[0]); // 此处的page1是从1开始的
      if (isNaN(page1)) return;
      this.result.thumbnails[page1 - 1].path = galleryThumbnailPath + "/" + name;
      this.result.thumbnails[page1 - 1].started = true;
    });

    // 查找已经存在的图片
    const galleryImagePath = imagePath + `${this.gid}`;
    if (!$file.exists(galleryImagePath)) $file.mkdir(galleryImagePath);
    $file.list(galleryImagePath)!.forEach((name) => {
      if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return;
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
    $file.list(originalImagePathThisGallery)!.forEach((name) => {
      if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return;
      const page1 = parseInt(name.split(".")[0].split("_")[0]); // 此处的page1是从1开始的
      if (isNaN(page1)) return;
      this.result.originalImages[page1 - 1].path = originalImagePathThisGallery + "/" + name;
      this.result.originalImages[page1 - 1].started = true;
      this.result.originalImages[page1 - 1].userSelected = true;
    });

    // 查找已经存在的AI翻译
    const aiTranslationPathThisGallery = aiTranslationPath + `${this.gid}`;
    if (!$file.exists(aiTranslationPathThisGallery)) $file.mkdir(aiTranslationPathThisGallery);
    $file.list(aiTranslationPathThisGallery)!.forEach((name) => {
      if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return;
      const page1 = parseInt(name.split(".")[0].split("_")[0]); // 此处的page1是从1开始的
      if (isNaN(page1)) return;
      this.result.aiTranslations[page1 - 1].path = aiTranslationPathThisGallery + "/" + name;
      this.result.aiTranslations[page1 - 1].started = true;
      this.result.aiTranslations[page1 - 1].userSelected = true;
    });
  }

  private htmlPageForImage(index: number) {
    return this.infos.num_of_images_on_each_page ? Math.floor(index / this.infos.num_of_images_on_each_page) : 0;
  }

  private *downloadIndices(startIndex: number, downloadCount: number) {
    const start = Math.max(0, Math.floor(startIndex));
    const count = Math.max(0, Math.floor(downloadCount));
    const end = count === 0 ? this.infos.length : Math.min(this.infos.length, start + count);
    for (let index = start; index < end; index++) yield index;
    if (count === 0) {
      for (let index = 0; index < Math.min(start, this.infos.length); index++) yield index;
    }
  }

  private requiredHtmlTask(page: number): Task | undefined {
    // started 也包括失败的任务；重试由外部显式重置状态。
    if (this.htmlRunning || this.result.htmls[page].started) return;
    return this.createHtmlTask(page);
  }

  protected _getNextTask(): Task | undefined {
    // MPV 模式先取得全部图片信息，不额外请求第 0 页或预下载缩略图。
    if (this.mpvAvailable && !this.result.mpv.success) {
      if (!this.result.mpv.started) return this.createMpvTask();
      return;
    }

    if (this.downloadTopThumbnail && !this.result.topThumbnail.started) {
      return this.createTopThumbnailTask(this.infos.thumbnail_url, thumbnailPath + `${this.gid}.jpg`);
    }

    const aiTranslation = this.result.aiTranslations.find(
      (task) => task.userSelected && !task.started && this.result.images[task.index].path,
    );
    if (aiTranslation) {
      return this.createAiTranslationTask(aiTranslation.index, this.result.images[aiTranslation.index].path!);
    }

    for (const original of this.result.originalImages) {
      if (!original.userSelected || original.started) continue;
      if (!this.result.htmls[0].success) return this.requiredHtmlTask(0);
      const page = this.htmlPageForImage(original.index);
      if (this.result.htmls[page].error) continue;
      if (!this.result.htmls[page].success) return this.requiredHtmlTask(page);
      const info = this.infos.images[page].find((image) => image.page === original.index)!;
      return this.createOriginalImageTask(original.index, info.imgkey);
    }

    const canDownloadImages = (this._background && !this.backgroundPaused) || this.reading;
    const findPending = (kind: "image" | "thumbnail") => {
      const items = kind === "image" ? this.result.images : this.result.thumbnails;
      const start = kind === "image" ? this.currentReadingIndex : this.currentThumbnailIndex;
      const count = kind === "image" ? this.imageDownloadCount : this.thumbnailDownloadCount;
      for (const index of this.downloadIndices(start, count)) {
        if (items[index].started) continue;
        // 第 0 页完成前分页大小尚未确认，不能使用旧分页状态排除候选。
        if (this.result.htmls[0].success && this.result.htmls[this.htmlPageForImage(index)].error) continue;
        return index;
      }
    };
    const imageIndex = canDownloadImages ? findPending("image") : undefined;
    const thumbnailIndex = findPending("thumbnail");
    if (imageIndex === undefined && thumbnailIndex === undefined) return;

    // 阅读时优先保障当前图片（及其候选缩略图）；其余图片与缩略图交替调度，避免饥饿。
    const currentImagePending = this.reading && imageIndex === this.currentReadingIndex;
    const useImage =
      imageIndex !== undefined &&
      (thumbnailIndex === undefined || (currentImagePending ? thumbnailIndex !== imageIndex : this.preferImageTask));
    const index = (useImage ? imageIndex : thumbnailIndex)!;
    if (!this.result.htmls[0].success) return this.requiredHtmlTask(0);
    const page = this.htmlPageForImage(index);
    if (!this.result.htmls[page].success) return this.requiredHtmlTask(page);
    const info = this.infos.images[page].find((image) => image.page === index)!;
    if (useImage) {
      this.preferImageTask = false;
      return this.createImageTask(index, info.imgkey);
    }

    // 范围只限制任务的触发位置；同一 URL 的已知缩略图一起裁剪和标记，
    // 即使超出 thumbnailDownloadCount，也不必之后重复下载同一个源文件。
    const images = Object.values(this.infos.images)
      .flat()
      .filter((image) => image.thumbnail_url === info.thumbnail_url && !this.result.thumbnails[image.page].started);
    this.preferImageTask = true;
    return this.createCompoundThumbnailTask({
      thumbnail_url: info.thumbnail_url,
      startIndex: Math.min(...images.map((image) => image.page)),
      endIndex: Math.max(...images.map((image) => image.page)),
      images,
    });
  }

  private createMpvTask() {
    return {
      index: 0,
      handler: async () => {
        appLog(`开始下载MPV页面: gid=${this.gid}`, "debug");
        this.result.mpv.started = true;
        const result = await api.getMPVInfoWithTwoRetries(this.gid, this.infos.token);
        if (result.success) {
          this.mpvkey = result.info.mpvkey;
          // 根据num_of_images_on_each_page和total_pages，将infos.images全部填充，并且result.htmls全部标记为完成
          const n = this.infos.num_of_images_on_each_page ?? this.infos.length;
          for (let i = 0; i < this.infos.total_pages; i++) {
            this.infos.images[i] = result.info.images.slice(i * n, (i + 1) * n);
          }

          this.result.htmls.forEach((n) => {
            n.started = true;
            n.success = true;
          });
          this.result.mpv.success = true;
          const text = JSON.stringify(this.infos, null, 2);
          $file.write({
            data: $data({ string: text }),
            path: galleryInfoPath + `${this.gid}.json`,
          });
          appLog(`MPV页面下载成功: gid=${this.gid}`, "debug");

          // 如果没有处于暂停状态，那么重新启动任务
          if (!this._paused) this._run();
        } else {
          appLog("获取MPV信息失败", "error");
          this.result.mpv.error = true;
        }
      },
    };
  }

  private createHtmlTask(index: number) {
    return {
      index,
      handler: async () => {
        this.htmlRunning = true;
        this.result.htmls[index].started = true;
        try {
          appLog(`开始下载图库页面: gid=${this.gid}, index=${index}`, "debug");
          const result = await api.getGalleryImagesWithTwoRetries(this.gid, this.infos.token, index);
          if (result.success && result.info.thumbnail_size === "normal") {
            throw new FatalError("参数错误: thumbnail_size不应为normal");
          }
          // 如果是第0页，那么修改infos.total_pages、infos.num_of_images_on_each_page、result.html的数据
          if (
            result.success &&
            index === 0 &&
            (result.info.total_pages !== this.infos.total_pages ||
              result.info.num_of_images_on_each_page !== this.infos.num_of_images_on_each_page)
          ) {
            this.infos.total_pages = result.info.total_pages;
            this.infos.num_of_images_on_each_page = result.info.num_of_images_on_each_page;
            this.result.htmls = [...Array(this.infos.total_pages)].map((_, i) => ({
              index: i,
              success: false,
              error: false,
              started: false,
            }));
          }
          if (
            result.success &&
            result.info.total_pages === this.infos.total_pages &&
            result.info.num_of_images_on_each_page === this.infos.num_of_images_on_each_page
          ) {
            // 需要total_pages、num_of_images_on_each_page都不变，才算成功
            // 如果改变，说明网页版设置在应用使用中被更改，需要判为失败
            appLog(`图库页面下载成功: gid=${this.gid}, index=${index}`, "debug");
            this.result.htmls[index].started = true;
            this.result.htmls[index].success = true;
            this.infos.images[index] = result.images[index];
            // 特殊：在完成后，重新启动任务
            if (!this._paused) this._run();
          } else {
            this.result.htmls[index].error = true;
            // 除了html任务自己标记为失败，与此任务关联的未开始的缩略图和图片任务也标记为失败
            if (this.infos.num_of_images_on_each_page) {
              // 如果没有num_of_images_on_each_page，则无需考虑此种情况（因为只有1页）
              const startIndex = index * this.infos.num_of_images_on_each_page;
              const endIndex = startIndex + this.infos.num_of_images_on_each_page;
              this.result.thumbnails
                .filter((thumbnail) => {
                  return thumbnail.index >= startIndex && thumbnail.index < endIndex && !thumbnail.started;
                })
                .forEach((thumbnail) => {
                  thumbnail.started = true;
                  thumbnail.error = true;
                });
              this.result.images
                .filter((image) => {
                  return image.index >= startIndex && image.index < endIndex && !image.started;
                })
                .forEach((image) => {
                  image.started = true;
                  image.error = true;
                });
            }
          }

          if (this.result.htmls.every((n) => n.success)) {
            // 在html全部下载完成后，保存到本地
            const text = JSON.stringify(this.infos, null, 2);
            $file.write({
              data: $data({ string: text }),
              path: galleryInfoPath + `${this.gid}.json`,
            });
          }

          if (!this._paused && this.isAllFinishedDespiteError) {
            this.finishHandler();
          }
        } finally {
          this.htmlRunning = false;
        }
      },
    };
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
            path,
          });
          this.result.topThumbnail.path = path;
        } else {
          this.result.topThumbnail.error = true;
        }
        if (!this._paused && this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      },
    };
  }

  private createCompoundThumbnailTask(compoundThumbnailItem: CompoundThumbnail) {
    const startIndex = compoundThumbnailItem.startIndex;
    const endIndex = compoundThumbnailItem.endIndex;
    const url = compoundThumbnailItem.thumbnail_url;
    const images = compoundThumbnailItem.images;
    const indices = new Set(images.map((image) => image.page));
    return {
      index: startIndex,
      handler: async () => {
        appLog(`开始下载图库缩略图: gid=${this.gid}, startIndex=${startIndex}, endIndex=${endIndex}`, "debug");
        this.result.thumbnails
          .filter((thumbnail) => indices.has(thumbnail.index))
          .forEach((thumbnail) => {
            thumbnail.started = true;
          });
        const result = await api.downloadThumbnailWithTwoRetries(url);
        if (result.success) {
          appLog(`图库缩略图下载成功: gid=${this.gid}, startIndex=${startIndex}, endIndex=${endIndex}`, "debug");
          const data = result.data;
          const image = data.image;
          // 此处的读取image必须放在循环外面，以减少调用次数，否则会出现莫名其妙为空的情况
          const filtered = this.result.thumbnails.filter((thumbnail) => indices.has(thumbnail.index));
          for (let i = 0; i < filtered.length; i++) {
            const thumbnail = filtered[i];
            const index = thumbnail.index;
            const frame = images.find((image) => image.page === index)!.frame;
            const dataCropped = cropImageData(data, image, frame);
            // 此处有可能会出现dataCropped为空的情况，需要处理
            if (!dataCropped) {
              thumbnail.error = true;
              continue;
            }
            const path = thumbnailPath + `${this.gid}/${index + 1}.jpg`;
            if (!this.completeStopped) {
              $file.write({
                data: dataCropped,
                path,
              });
            }
            this.result.thumbnails[index].path = path;
            await $wait(0.2);
          }
        } else {
          this.result.thumbnails
            .filter((thumbnail) => indices.has(thumbnail.index))
            .forEach((thumbnail) => {
              thumbnail.error = true;
            });
        }
        if (!this._paused && this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      },
    };
  }

  private createImageTask(index: number, imgkey: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载图库图片: gid=${this.gid}, index=${index}, webdav=${this.webDAVConfig.enabled}`, "debug");
        this.result.images[index].started = true;
        const result:
          | { success: true; data: NSData; info?: EHPage }
          | { success: false; error: string; info?: EHPage } = this.webDAVConfig.enabled
          ? await this.webDAVConfig.client.downloadNoError(this.webDAVConfig.filesOnWebDAV[index])
          : this.mpvAvailable && this.mpvkey
            ? await api.downloadImageByMpvWithThreeRetries(this.gid, imgkey, this.mpvkey, index)
            : await api.downloadImageByPageInfoWithThreeRetries(this.gid, imgkey, index, this.showkey);

        if (!this.showkey && result.info?.showkey) {
          this.showkey = result.info.showkey;
        }

        if (result.success) {
          appLog(`图库图片下载成功: gid=${this.gid}, index=${index}, webdav=${this.webDAVConfig.enabled}`, "debug");
          let extname = result.data.info.mimeType.split("/")[1];
          if (extname === "jpeg") extname = "jpg";
          const path = imagePath + `${this.gid}/${index + 1}.${extname}`;
          if (!this.completeStopped) {
            $file.write({
              data: result.data,
              path,
            });
          }
          this.result.images[index].path = path;
        } else {
          this.result.images[index].error = true;
          this.result.images[index].errorName = result.error;
        }
        if (!this._paused && this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      },
    };
  }

  private createOriginalImageTask(index: number, imgkey: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载原图: gid=${this.gid}, index=${index}`, "debug");
        this.result.originalImages[index].started = true;
        const result = await api.downloadOriginalImageByPageInfoWithTwoRetries(this.gid, imgkey, index);
        if (result.success) {
          appLog(`原图下载成功: gid=${this.gid}, index=${index}`, "debug");
          let extname = result.data.info.mimeType.split("/")[1];
          if (extname === "jpeg") extname = "jpg";
          const path = originalImagePath + `${this.gid}/${index + 1}.${extname}`;
          $file.write({
            data: result.data,
            path,
          });
          this.result.originalImages[index].path = path;
        } else {
          this.result.originalImages[index].error = true;
          if (result.error === "noOriginalImage") {
            this.result.originalImages[index].noOriginalImage = true;
          }
        }
        if (!this._paused && this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      },
    };
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
            path,
          });
          this.result.aiTranslations[index].path = path;
        } else {
          this.result.aiTranslations[index].error = true;
        }
        if (!this._paused && this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      },
    };
  }

  get background() {
    return this._background;
  }

  set background(value: boolean) {
    dbManager.update(
      `INSERT INTO download_records (gid, length, finished) VALUES (?,?,?) 
      ON CONFLICT(gid) DO NOTHING`,
      [this.gid, this.infos.length, false],
    );
    this._background = value;
  }

  get pendingOfHtmls() {
    return this.result.htmls.filter((html) => !html.started).length;
  }

  get pendingOfThumbnails() {
    return this.result.thumbnails.filter((thumbnail) => !thumbnail.started).length;
  }

  get pendingOfImages() {
    return this.result.images.filter((image) => !image.started).length;
  }

  get pending() {
    return (
      this.pendingOfHtmls +
      this.pendingOfThumbnails +
      this.pendingOfImages +
      (this.downloadTopThumbnail && !this.result.topThumbnail.started ? 1 : 0)
    );
  }

  get finishedOfHtmls() {
    return this.result.htmls.filter((html) => html.success).length;
  }

  get finishedOfThumbnails() {
    return this.result.thumbnails.filter((thumbnail) => thumbnail.path).length;
  }

  get finishedOfImages() {
    return this.result.images.filter((image) => image.path).length;
  }

  get finished() {
    return (
      this.finishedOfHtmls +
      this.finishedOfThumbnails +
      this.finishedOfImages +
      (this.downloadTopThumbnail && this.result.topThumbnail.path ? 1 : 0)
    );
  }

  get isAllFinished(): boolean {
    return (
      this.finished ===
      this.result.htmls.length +
        this.result.thumbnails.length +
        this.result.images.length +
        (this.downloadTopThumbnail ? 1 : 0)
    );
  }

  get isAllFinishedDespiteError(): boolean {
    const topThumbnailFinishedDespiteError =
      !this.downloadTopThumbnail || this.result.topThumbnail.path || this.result.topThumbnail.error;
    const finishedOfHtmlsDespiteError = this.result.htmls.filter((html) => html.success || html.error).length;
    const finishedOfThumbnailsDespiteError = this.result.thumbnails.filter(
      (thumbnail) => thumbnail.path || thumbnail.error,
    ).length;
    const finishedOfImagesDespiteError = this.result.images.filter((image) => image.path || image.error).length;
    return (
      Boolean(topThumbnailFinishedDespiteError) &&
      finishedOfHtmlsDespiteError === this.result.htmls.length &&
      finishedOfThumbnailsDespiteError === this.result.thumbnails.length &&
      finishedOfImagesDespiteError === this.result.images.length
    );
  }
}

/**
 * WebDAV上传器，用于将本地图片上传到WebDAV服务器。
 */
class GalleryWebDAVUploader extends ConcurrentDownloaderBase {
  protected _maxConcurrency = 5;

  readonly infos: EHGallery;
  readonly gid: number;
  private finishHandler: () => void;
  private _client: WebDAVClient;

  backgroundPaused = false; // 用户主动暂停, 可从外部设置

  result: {
    mkdir: {
      path?: string;
      success: boolean;
      error: boolean;
      started: boolean;
    };
    upload: {
      index: number;
      src: string;
      success: boolean;
      error: boolean;
      started: boolean;
    }[];
  };
  constructor(infos: EHGallery, client: WebDAVClient, finishHandler: () => void) {
    super();
    this.infos = infos;
    this.gid = infos.gid;
    this.finishHandler = finishHandler;
    this._client = client;
    const filesOnLocal = $file
      .list(imagePath + `${this.gid}/`)!
      .filter((n) => /\.(png|jpe?g|gif|webp)$/i.test(n))
      .sort((a, b) => {
        const aIndex = parseInt(a.split(".")[0]);
        const bIndex = parseInt(b.split(".")[0]);
        return aIndex - bIndex;
      })
      .map((n) => imagePath + `${this.gid}/` + n);
    this.result = {
      mkdir: { success: false, error: false, started: false },
      upload: filesOnLocal.map((n, index) => ({
        index,
        src: n,
        success: false,
        error: false,
        started: false,
      })),
    };
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
    const uploadTask = this.result.upload.find((n) => !n.started);
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
          const files = await this._client.list({ path: "" });
          const target = files.find((file) => isNameMatchGid(file.name, this.gid));
          if (!target) {
            // 不存在，则创建目录
            await this._client.mkdir(this.gid.toString());
            this.result.mkdir.success = true;
            this.result.mkdir.path = this.gid.toString();
          } else {
            // 存在，则清空目录下的所有文件
            const needToDeleteFiles = await this._client.list({
              path: target.name,
            });
            for (const file of needToDeleteFiles) {
              if (file.isfile) {
                await this._client.delete(target.name + "/" + file.name);
              }
            }
            this.result.mkdir.success = true;
            this.result.mkdir.path = target.name;
          }
          // 如果mkdir成功，则重新启动任务
          if (!this._paused) this._run();
        } catch (e: any) {
          appLog(e, "error");
          appLog(`创建WebDAV目录失败: gid=${this.gid}`, "error");
          this.result.mkdir.error = true;
        }
      },
    };
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
        const result = await this._client.uploadNoError(dst, data, contentType);
        if (result.success) {
          this.result.upload[index].success = true;
        } else {
          this.result.upload[index].error = true;
        }
        if (!this._paused && this.isAllFinishedDespiteError) {
          this.finishHandler();
        }
      },
    };
  }

  get pending() {
    return this.result.upload.filter((n) => !n.started).length;
  }

  get finished() {
    return this.result.upload.filter((n) => n.success).length;
  }

  get isAllFinished() {
    return this.result.upload.every((n) => n.success);
  }

  get isAllFinishedDespiteError() {
    return this.result.upload.every((n) => n.success || n.error);
  }
}

/**
 * 下载器管理器。
 *
 * 1. 始终都只能有一个下载器在下载，其他下载器都处于暂停状态。
 */
class DownloaderManager {
  tabDownloaders: Map<string, TabThumbnailDownloader>; // key为tab的id
  galleryDownloaders: Map<number, GalleryCommonDownloader>;
  galleryWebDAVUploaders: Map<number, GalleryWebDAVUploader>;
  mpv = false; // 是否使用mpv的api

  constructor() {
    this.tabDownloaders = new Map() as Map<string, TabThumbnailDownloader>;
    this.galleryDownloaders = new Map() as Map<number, GalleryCommonDownloader>;
    this.galleryWebDAVUploaders = new Map() as Map<number, GalleryWebDAVUploader>;
  }

  private cancelSinglePage?: () => void;
  private singlePageDownloader?: GalleryCommonDownloader;

  downloadSinglePage(infos: EHGallery, pageIndex: number) {
    this.pauseAll();
    let cancelled = false;
    let downloader: GalleryCommonDownloader | undefined;
    let settle!: () => void;
    const done = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const cancel = () => {
      cancelled = true;
      downloader?.pause();
    };
    this.cancelSinglePage = cancel;
    void (async () => {
      // 暂停无法取消在途请求，先等它们结束再派发单页任务。
      while (
        this.singlePageDownloader?.running ||
        [
          ...this.galleryDownloaders.values(),
          ...this.tabDownloaders.values(),
          ...this.galleryWebDAVUploaders.values(),
        ].some((task) => task.running)
      ) {
        if (cancelled) return;
        await $wait(0.1);
      }
      if (cancelled || pageIndex < 0 || pageIndex >= infos.length) return;
      downloader = new GalleryCommonDownloader({
        infos,
        mpvAvailable: configManager.mpvAvailable,
        imageDownloadCount: 1,
        thumbnailDownloadCount: 1,
        downloadTopThumbnail: false,
        finishHandler: () => {},
      });
      this.singlePageDownloader = downloader;
      downloader.currentReadingIndex = pageIndex;
      downloader.currentThumbnailIndex = pageIndex;
      downloader.reading = true;
      downloader.onError = (error) => {
        console.error(error);
        downloader!.pause();
      };
      await new Promise<void>((resolve) => {
        downloader!.onIdle = resolve;
        downloader!.start();
      });
    })()
      .catch((error) => console.error(error))
      .finally(() => {
        // 原有下载器继续复用新缓存，但不改变它的范围、位置或任务错误状态。
        const existing = this.galleryDownloaders.get(infos.gid);
        if (existing && downloader) {
          for (const kind of ["images", "thumbnails"] as const) {
            for (const item of downloader.result[kind]) {
              if (item.path && existing.result[kind][item.index]) {
                Object.assign(existing.result[kind][item.index], { path: item.path, started: true, error: false });
              }
            }
          }
        }
        if (this.cancelSinglePage === cancel) this.cancelSinglePage = undefined;
        if (this.singlePageDownloader === downloader) this.singlePageDownloader = undefined;
        settle();
      });
    return { done, cancel, isCancelled: () => cancelled };
  }

  /**
   * 添加一个图库下载器
   * 不能重复添加，如果gid重复，会直接报错
   * @param gid 图库id
   * @param infos 图库信息
   */
  add(
    gid: number,
    infos: EHGallery,
    options: { imageDownloadCount?: number; thumbnailDownloadCount?: number; downloadTopThumbnail?: boolean } = {},
  ) {
    if (this.galleryDownloaders.has(gid)) throw new Error("Unable to add duplicate image downloader");
    const downloader = new GalleryCommonDownloader({
      infos,
      ...options,
      mpvAvailable: configManager.mpvAvailable,
      finishHandler: () => {
        for (const [k, v] of this.galleryWebDAVUploaders) {
          if (!v.backgroundPaused && !v.isAllFinishedDespiteError) {
            this.startOne(k);
            return;
          }
        }
        for (const [k, v] of this.galleryDownloaders) {
          if (k !== gid && v.background && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
            this.startOne(k);
            return;
          }
        }
        if (downloader.background && downloader.finishedOfImages) {
          checkWebDAVAndCreateUploader(gid, infos);
        }
      },
    });
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
    this.cancelSinglePage?.();
    const d = this.galleryDownloaders.get(gid);
    if (!d) return false;
    // 是否有可运行的任务交给调度器判断，不能仅用普通图片阻止缩略图等任务启动。
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

  pause(gid: number) {
    const downloader = this.galleryDownloaders.get(gid);
    if (downloader) {
      if (downloader.background) downloader.backgroundPaused = true;
      downloader.pause();
    }
    for (const [k, v] of this.galleryWebDAVUploaders) {
      if (!v.backgroundPaused && !v.isAllFinishedDespiteError) {
        this.startOne(k);
        return;
      }
    }
    for (const [k, v] of this.galleryDownloaders) {
      if (k !== gid && v.background && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
        this.startOne(k);
        return;
      }
    }
  }

  /**
   * 后台暂停一个图库下载器，并且查找下一个需要启动的图库下载器或WebDAV上传器
   */
  backgroundPause(gid: number) {
    const downloader = this.galleryDownloaders.get(gid);
    if (downloader) {
      downloader.backgroundPaused = true;
    }
    for (const [k, v] of this.galleryWebDAVUploaders) {
      if (!v.backgroundPaused && !v.isAllFinishedDespiteError) {
        this.startOne(k);
        return;
      }
    }
    for (const [k, v] of this.galleryDownloaders) {
      if (k !== gid && v.background && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
        this.startOne(k);
        return;
      }
    }
  }

  /**
   * 新建一个标签缩略图下载器
   * 不能重复添加，如果id重复，会直接报错
   */
  addTabDownloader(id: string) {
    if (this.tabDownloaders.has(id)) throw new Error("Unable to add duplicate tab downloader");
    const tabDownloader = new TabThumbnailDownloader(() => {
      for (const v of this.galleryWebDAVUploaders.values()) {
        if (!v.backgroundPaused && !v.isAllFinishedDespiteError) {
          this.startOne(v.gid);
          return;
        }
      }
      for (const v of this.galleryDownloaders.values()) {
        if (v.background && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
          this.startOne(v.gid);
          return;
        }
      }
    });
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
    this.cancelSinglePage?.();
    const downloader = this.tabDownloaders.get(id);
    if (!downloader) return false;
    if (downloader.isAllFinishedDespiteError) return false;
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
   * 不能重复添加，如果gid重复，会直接报错
   */
  addGalleryWebDAVUploader(infos: EHGallery, client: WebDAVClient) {
    const gid = infos.gid;
    if (this.galleryWebDAVUploaders.has(gid)) throw new Error("Unable to add duplicate image uploader");
    const uploader = new GalleryWebDAVUploader(infos, client, () => {
      for (const [k, v] of this.galleryWebDAVUploaders) {
        if (k !== gid && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
          this.startOne(k);
          return;
        }
      }
      for (const [k, v] of this.galleryDownloaders) {
        if (v.background && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
          this.startOne(k);
          return;
        }
      }
    });
    this.galleryWebDAVUploaders.set(gid, uploader);
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
    this.cancelSinglePage?.();
    const uploader = this.galleryWebDAVUploaders.get(gid);
    if (!uploader) return false;
    if (uploader.isAllFinishedDespiteError) return false;
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
   * 暂停一个WebDAV上传器，并且查找下一个需要启动的下载器或WebDAV上传器
   */
  backgroundPauseGalleryWebDAVUploader(gid: number) {
    const uploader = this.galleryWebDAVUploaders.get(gid);
    if (uploader) {
      uploader.backgroundPaused = true;
    }
    for (const [k, v] of this.galleryDownloaders) {
      if (k !== gid && v.background && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
        this.startOne(k);
        return;
      }
    }
    for (const [k, v] of this.galleryWebDAVUploaders) {
      if (k !== gid && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
        this.startOne(k);
        return;
      }
    }
  }

  /**
   * 启动一个下载器/上传器/缩略图下载器
   * @param params
   * @param params.prioritized 优先任务
   * @param params.excluded 排除任务
   */
  startIfIdle({
    prioritized,
    excluded,
  }: {
    prioritized?: ({ type: "tab"; id: string } | { type: "gallery" | "webdav"; id: number })[];
    excluded?: ({ type: "tab"; id: string } | { type: "gallery" | "webdav"; id: number })[];
  } = {}) {
    prioritized = prioritized ?? [];
    excluded = excluded ?? [];
    for (const { type, id } of prioritized) {
      switch (type) {
        case "tab": {
          const d = this.getTabDownloader(id);
          if (d && !d.isAllFinishedDespiteError) {
            this.startTabDownloader(id);
            return;
          }
          break;
        }
        case "gallery": {
          const d = this.get(id);
          if (d && !d.isAllFinishedDespiteError) {
            this.startOne(id);
            return;
          }
          break;
        }
        case "webdav": {
          const d = this.getGalleryWebDAVUploader(id);
          if (d && !d.isAllFinishedDespiteError) {
            this.startGalleryWebDAVUploader(id);
            return;
          }
          break;
        }
        default:
          break;
      }
    }
    for (const [k, v] of this.galleryDownloaders) {
      if (
        !excluded.some((n) => n.type === "gallery" && n.id === k) &&
        v.background &&
        !v.backgroundPaused &&
        !v.isAllFinishedDespiteError
      ) {
        this.startOne(k);
        return;
      }
    }
    for (const [k, v] of this.galleryWebDAVUploaders) {
      if (
        !excluded.some((n) => n.type === "webdav" && n.id === k) &&
        !v.backgroundPaused &&
        !v.isAllFinishedDespiteError
      ) {
        this.startOne(k);
        return;
      }
    }
  }

  /**
   * 暂停所有图库下载器
   */
  pauseAll() {
    this.cancelSinglePage?.();
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

/**
 * 检测WebDAV是否可用，如果可用，创建WebDAV上传任务
 */
export function checkWebDAVAndCreateUploader(gid: number, infos: EHGallery) {
  if (!configManager.webdavAutoUpload) return;
  const service = configManager.currentWebDAVService;
  if (!service) return;
  const client = new WebDAVClient(service);
  // 检测WebDAV是否可用
  client
    .listImageFilesByGidNoError(gid)
    .then((result) => {
      if (result.success) {
        const filesOnServer = result.data;
        if (filesOnServer.length !== infos.length) {
          // 如果WebDAV可用，并且服务器上没有完整图库，则创建WebDAV上传任务
          if (!downloaderManager.getGalleryWebDAVUploader(infos.gid)) {
            downloaderManager.addGalleryWebDAVUploader(infos, client);
          }
          downloaderManager.startGalleryWebDAVUploader(gid);
        }
      } else {
        appLog("WebDAV 连接失败, 无法创建上传任务", "warn");
      }
    })
    .catch((error) => {
      appLog(error, "warn");
      appLog("WebDAV 连接失败, 无法创建上传任务", "warn");
    });
}
