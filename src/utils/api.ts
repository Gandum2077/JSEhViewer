import { EHAPIHandler, EHGallery, EHMPV, EHPage } from "ehentai-parser";
import { appLog, cropImageData } from "./tools";
import { imagePath, thumbnailPath } from "./glv";
import exp from "constants";

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
 * 图库下载器，包括html、图片、缩略图。前提是使用mpv的api。
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

  private infos: EHGallery;
  private gid: number;
  downloadingImages = false; // 是否下载图片，如果为false，则只下载缩略图，可以从外部设置
  currentReadingIndex = 0;  // 当前正在阅读的图片的index，可以从外部设置

  result: {
    htmls: { index: number, success: boolean, error: boolean, started: boolean }[],
    thumbnails: { index: number, path?: string, error: boolean, started: boolean }[],
    images: { index: number, path?: string, error: boolean, started: boolean }[]
    topThumbnail: { path?: string, error: boolean, started: boolean }
  }
  constructor(infos: EHGallery) {
    super();
    this.infos = infos;
    this.gid = infos.gid;
    this.result = {
      htmls: [...Array(this.infos.total_pages)].map((_, i) => ({ index: i, success: false, error: false, started: false })),
      thumbnails: [...Array(this.infos.length)].map((_, i) => ({ index: i, error: false, started: false })),
      images: [...Array(this.infos.length)].map((_, i) => ({ index: i, error: false, started: false })),
      topThumbnail: {
        error: false,
        started: false
      }
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

  protected _getNextTask(): Task | undefined {
    // 1. 最优先：如果顶部缩略图未开始，则下载顶部缩略图
    if (!this.result.topThumbnail.started) {
      return this.createThumbnailTask(
        0,
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

    // 为4、5两步骤准备两个变量，用于记录找到的缩略图和图片所在的html页面，方便后续查找
    let htmlPageOfFoundThumbnailItem: number = -1;
    let htmlPageOfFoundImageItem: number = -1;

    // 4. 查找未开始的缩略图任务
    // 规则为：在对应html任务已经完成的缩略图任务中，先从currentReadingIndex开始找，如果找不到，则从头开始找
    let thumbnailItem = this.result.thumbnails.find(thumbnail => {
      const page = this.infos.num_of_images_on_each_page
        ? Math.floor(thumbnail.index / this.infos.num_of_images_on_each_page)
        : 0;
      return this.result.htmls[page].success && (thumbnail.index >= this.currentReadingIndex) && !thumbnail.started
    });
    if (!thumbnailItem) thumbnailItem = this.result.thumbnails.find(thumbnail => {
      const page = this.infos.num_of_images_on_each_page
        ? Math.floor(thumbnail.index / this.infos.num_of_images_on_each_page)
        : 0;
      return this.result.htmls[page].success && !thumbnail.started
    });
    if (thumbnailItem) htmlPageOfFoundThumbnailItem = this.infos.num_of_images_on_each_page
      ? Math.floor(thumbnailItem.index / this.infos.num_of_images_on_each_page)
      : 0;

    // 如果downloadingImages 为false，则只下载缩略图
    if (!this.downloadingImages) {
      if (thumbnailItem) {
        const index = thumbnailItem.index;
        const page = this.infos.num_of_images_on_each_page
          ? Math.floor(index / this.infos.num_of_images_on_each_page)
          : 0;
        return this.createThumbnailTask(
          index,
          this.infos.images[page].find(image => image.page === index)!.thumbnail_url
        );
      }
    } else {
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
      if (imageItem) htmlPageOfFoundImageItem = this.infos.num_of_images_on_each_page
        ? Math.floor(imageItem.index / this.infos.num_of_images_on_each_page)
        : 0;

      if (thumbnailItem && imageItem) {
        // 如果缩略图的index和图片的index都大于currentReadingIndex，则比较index，先下载index小的
        // 如果缩略图的index和图片的index都小于currentReadingIndex，则比较index，先下载index小的
        // 如果缩略图的index大于currentReadingIndex，图片的index小于currentReadingIndex，则下载缩略图
        // 如果缩略图的index小于currentReadingIndex，图片的index大于currentReadingIndex，则下载图片
        const thumbnailItemIndex = thumbnailItem.index;
        const imageItemIndex = imageItem.index;
        if (
          (thumbnailItemIndex >= this.currentReadingIndex && imageItemIndex >= this.currentReadingIndex) ||
          (thumbnailItemIndex < this.currentReadingIndex && imageItemIndex < this.currentReadingIndex)
        ) {
          return thumbnailItemIndex <= imageItemIndex ? this.createThumbnailTask(
            thumbnailItemIndex,
            this.infos.images[htmlPageOfFoundThumbnailItem].find(image => image.page === thumbnailItemIndex)!.thumbnail_url
          ) : this.createImageTask(
            imageItemIndex,
            this.infos.images[htmlPageOfFoundImageItem].find(image => image.page === imageItemIndex)!.imgkey
          );
        } else if (thumbnailItemIndex >= this.currentReadingIndex) {
          return this.createThumbnailTask(
            thumbnailItemIndex,
            this.infos.images[htmlPageOfFoundThumbnailItem].find(image => image.page === thumbnailItemIndex)!.thumbnail_url
          );
        } else {
          return this.createImageTask(
            imageItemIndex,
            this.infos.images[htmlPageOfFoundImageItem].find(image => image.page === imageItemIndex)!.imgkey
          );
        }
      } else if (thumbnailItem) {
        const thumbnailItemIndex = thumbnailItem.index;
        return this.createThumbnailTask(
          thumbnailItemIndex,
          this.infos.images[htmlPageOfFoundThumbnailItem].find(image => image.page === thumbnailItemIndex)!.thumbnail_url
        );
      } else if (imageItem) {
        const imageItemIndex = imageItem.index;
        return this.createImageTask(
          imageItemIndex,
          this.infos.images[htmlPageOfFoundImageItem].find(image => image.page === imageItemIndex)!.imgkey
        );
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

  private createThumbnailTask(index: number, url: string, path?: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载图库缩略图: gid=${this.gid}, index=${index}`, "debug");
        this.result.thumbnails[index].started = true;
        const result = await api.downloadThumbnailWithTwoRetries(url);
        if (result.success) {
          appLog(`图库缩略图下载成功: gid=${this.gid}, index=${index}`, "debug");
          const page = this.infos.num_of_images_on_each_page ? Math.floor(index / this.infos.num_of_images_on_each_page) : 0;
          const frame = this.infos.images[page].find(image => image.page === index)!.frame;
          const dataCropped = cropImageData(result.data, frame);
          if (!path) path = thumbnailPath + `${this.gid}/${index + 1}.jpg`;
          $file.write({
            data: dataCropped,
            path
          })
          this.result.thumbnails[index].path = path;
        }
      }
    }
  }

  private createImageTask(index: number, imgkey: string) {
    return {
      index,
      handler: async () => {
        appLog(`开始下载图库图片: gid=${this.gid}, index=${index}`, "debug");
        this.result.images[index].started = true;
        const result = await api.downloadImageByPageInfoWithThreeRetries(this.gid, imgkey, index);
        if (result.success) {
          appLog(`图库图片下载成功: gid=${this.gid}, index=${index}`, "debug");
          const page = this.infos.num_of_images_on_each_page ? Math.floor(index / this.infos.num_of_images_on_each_page) : 0;
          const name = this.infos.images[page].find(image => image.page === index)!.name;
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
}

/**
 * 下载器管理器。
 * 
 * 1. 始终都只能有一个下载器在下载，其他下载器都处于暂停状态。
 */
class DownloaderManager {
  currentTabDownloader: TabThumbnailDownloader;
  currentArchiveTabDownloader: TabThumbnailDownloader;
  galleryDownloaders: Record<number, (GalleryMPVDownloader | GalleryCommonDownloader)>;
  mpv = false; // 是否使用mpv的api

  constructor() {
    this.currentTabDownloader = new TabThumbnailDownloader();
    this.currentArchiveTabDownloader = new TabThumbnailDownloader();
    this.galleryDownloaders = {};
  }

  /**
   * 添加一个图库下载器
   * @param gid 图库id
   * @param infos 图库信息
   */
  add(gid: number, infos: EHGallery) {
    this.galleryDownloaders[gid] = this.mpv ? new GalleryMPVDownloader(infos) : new GalleryCommonDownloader(infos);
  }

  /**
   * 删除一个图库下载器
   * @param gid 图库id
   */
  remove(gid: number) {
    this.galleryDownloaders[gid].pause();
    delete this.galleryDownloaders[gid];
  }

  /**
   * 获取一个图库下载器
   */
  get(gid: number) {
    return this.galleryDownloaders[gid];
  }

  /**
   * 启动某一个图库下载器，并暂停其他全部图库下载器
   */
  startOne(gid: number) {
    for (let key in this.galleryDownloaders) {
      if (parseInt(key) === gid) {
        this.galleryDownloaders[key].start();
      } else {
        this.galleryDownloaders[key].pause();
      }
    }
    this.currentTabDownloader.pause();
    this.currentArchiveTabDownloader.pause();
  }

  /**
   * 启动标签缩略图下载器，并暂停其他全部下载器
   */
  startTabDownloader() {
    this.currentTabDownloader.start();
    for (let key in this.galleryDownloaders) {
      this.galleryDownloaders[key].pause();
    }
    this.currentArchiveTabDownloader.pause();
  }

  /**
   * 启动归档标签缩略图下载器，并暂停其他全部下载器
   */
  startArchiveTabDownloader() {
    this.currentArchiveTabDownloader.start();
    for (let key in this.galleryDownloaders) {
      this.galleryDownloaders[key].pause();
    }
    this.currentTabDownloader.pause();
  }

  /**
   * 暂停所有图库下载器
   */
  pauseAll() {
    for (let key in this.galleryDownloaders) {
      this.galleryDownloaders[key].pause();
    }
    this.currentTabDownloader.pause();
    this.currentArchiveTabDownloader.pause();
  }
}

export const downloaderManager = new DownloaderManager();