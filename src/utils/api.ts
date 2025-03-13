import { EHAPIHandler, EHGallery, EHMPV, EHPage } from "ehentai-parser";
import { appLog, cropImageData, isNameMatchGid } from "./tools";
import {
  aiTranslationPath,
  galleryInfoPath,
  imagePath,
  originalImagePath,
  thumbnailPath,
} from "./glv";
import { aiTranslate } from "../ai-translations/ai-translate";
import { WebDAVClient } from "./webdav";
import { configManager } from "./config";

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

class RetryTooManyError extends Error {
  name = "RetryTooManyError";
  constructor(times: number) {
    super(`重试次数达到${times}次`);
  }
}

// APIHandler中补充的方法均不抛出错误，所有错误都在内部处理。
class APIHandler extends EHAPIHandler {
  constructor() {
    super((parsedCookies) => {
      console.log("here");
      configManager.cookie = JSON.stringify(parsedCookies);
    });
  }

  async getMPVInfoWithNoError(
    gid: number,
    token: string
  ): Promise<
    { success: false; error: string } | { success: true; info: EHMPV }
  > {
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
  ): Promise<
    { success: false; error: string } | { success: true; info: EHMPV }
  > {
    let result:
      | { success: false; error: string }
      | { success: true; info: EHMPV } = {
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
    page: number
  ): Promise<
    | { success: false; error: string }
    | { success: true; images: EHGallery["images"] }
  > {
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
  ): Promise<
    | { success: false; error: string }
    | { success: true; images: EHGallery["images"] }
  > {
    let info;
    let result:
      | { success: false; error: string }
      | { success: true; images: EHGallery["images"] } = {
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
    reloadKey?: string
  ): Promise<
    | { success: true; info: EHPage; data: NSData }
    | { success: false; info?: EHPage; error: string }
  > {
    let pageInfo: EHPage | undefined = undefined;
    try {
      pageInfo = await this.getPageInfo(gid, imgkey, page, reloadKey);
      const data = await this.downloadImage(pageInfo.imageUrl);
      return { success: true, info: pageInfo, data };
    } catch (error: any) {
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name, info: pageInfo };
    }
  }

  async downloadImageByShowkey(
    gid: number,
    imgkey: string,
    page: number,
    showkey: string
  ): Promise<
    | { success: true; info: EHPage; data: NSData }
    | { success: false; info?: EHPage; error: string }
  > {
    let pageInfo: EHPage | undefined = undefined;
    try {
      pageInfo = await this.fetchImageInfoByShowpage(
        gid,
        imgkey,
        showkey,
        page
      );
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
    page: number,
    showkey?: string // 第一次获取，可以通过showkey进行，速度更快
  ) {
    let result:
      | { success: true; info: EHPage; data: NSData }
      | { success: false; info?: EHPage; error: string } = {
      success: false,
      error: "RetryTooManyError",
    };
    let reloadKey: string | undefined;
    for (let i = 0; i < 3; i++) {
      if (i === 0 && showkey) {
        result = await this.downloadImageByShowkey(gid, imgkey, page, showkey);
      } else {
        result = await this.downloadImageByPageInfo(
          gid,
          imgkey,
          page,
          reloadKey
        );
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
    reloadKey?: string
  ): Promise<
    | { success: true; info: EHPage; data: NSData }
    | { success: false; info?: EHPage; error: string }
  > {
    let pageInfo;
    try {
      pageInfo = await this.fetchImageInfo(
        gid,
        imgkey,
        mpvkey,
        page,
        reloadKey
      );
      const data = await this.downloadImage(pageInfo.imageUrl);
      return { success: true, info: pageInfo, data };
    } catch (error: any) {
      appLog(`图片下载失败: gid=${gid}, page=${page}`, "error");
      return { success: false, error: error.name, info: pageInfo };
    }
  }

  async downloadImageByMpvWithThreeRetries(
    gid: number,
    imgkey: string,
    mpvkey: string,
    page: number // 注意：这里的page是从1开始的
  ) {
    let result:
      | { success: true; info: EHPage; data: NSData }
      | { success: false; info?: EHPage; error: string } = {
      success: false,
      error: "RetryTooManyError",
    };
    let reloadKey: string | undefined;
    for (let i = 0; i < 3; i++) {
      result = await this.downloadImageByMpv(
        gid,
        imgkey,
        mpvkey,
        page,
        reloadKey
      );
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
  ): Promise<
    { success: false; error: string } | { success: true; data: NSData }
  > {
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
  ): Promise<
    { success: false; error: string } | { success: true; data: NSData }
  > {
    let result:
      | { success: false; error: string }
      | { success: true; data: NSData } = {
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
    page: number
  ): Promise<
    { success: false; error: string } | { success: true; data: NSData }
  > {
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
    page: number
  ): Promise<
    { success: false; error: string } | { success: true; data: NSData }
  > {
    let result:
      | { success: false; error: string }
      | { success: true; data: NSData } = {
      success: false,
      error: "RetryTooManyError",
    };
    for (let i = 0; i < 2; i++) {
      result = await this.downloadOriginalImageByPageInfoNoError(
        gid,
        imgkey,
        page
      );
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
  private _finishHandler: () => void;

  constructor(finishHandler: () => void) {
    super();
    this._items = [];
    this._finishHandler = finishHandler;
  }

  protected _getNextTask(): Task | undefined {
    // 查找未开始的缩略图，先从currentReadingIndex开始找
    let thumbnailItem = this._items.find(
      (thumbnail) =>
        thumbnail.index >= this.currentReadingIndex && !thumbnail.started
    );
    // 如果找不到，则从头开始查找
    if (!thumbnailItem)
      thumbnailItem = this._items.find((thumbnail) => !thumbnail.started);
    if (thumbnailItem) {
      return this.createThumbnailTask(
        thumbnailItem.index,
        thumbnailItem.gid,
        thumbnailItem.url
      );
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
        if (this._paused && this.isAllFinishedDespiteError) {
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
    return (
      this._items.filter((thumbnail) => thumbnail.error || thumbnail.success)
        .length === this._items.length
    );
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
  autoCacheWhenReading = true; // 阅读的时候是否自动下载，可以从外部设置
  background = false; // 是否后台下载，可以从外部设置
  backgroundPaused = false; // 是否后台暂停，可以从外部设置
  webDAVConfig:
    | { enabled: true; client: WebDAVClient; filesOnWebDAV: string[] }
    | { enabled: false } = { enabled: false };

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
    finishHandler,
  }: {
    infos: EHGallery;
    mpvAvailable: boolean;
    finishHandler: () => void;
  }) {
    super();
    this.infos = infos;
    this.gid = infos.gid;
    this.mpvAvailable = mpvAvailable;
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
    // 查找已经存在的html信息
    for (let i of Object.keys(this.infos.images)) {
      const page = parseInt(i);
      if (isNaN(page)) continue;
      this.result.htmls[page].started = true;
      this.result.htmls[page].success = true;
    }

    if (
      this.result.htmls.every((n) => n.success) &&
      !$file.exists(galleryInfoPath + `${this.gid}.json`)
    ) {
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
    $file.list(galleryThumbnailPath).forEach((name) => {
      if (!name.endsWith(".jpg")) return;
      const page1 = parseInt(name.split(".")[0]); // 此处的page1是从1开始的
      if (isNaN(page1)) return;
      this.result.thumbnails[page1 - 1].path =
        galleryThumbnailPath + "/" + name;
      this.result.thumbnails[page1 - 1].started = true;
    });

    // 查找已经存在的图片
    const galleryImagePath = imagePath + `${this.gid}`;
    if (!$file.exists(galleryImagePath)) $file.mkdir(galleryImagePath);
    $file.list(galleryImagePath).forEach((name) => {
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
    if (!$file.exists(originalImagePathThisGallery))
      $file.mkdir(originalImagePathThisGallery);
    $file.list(originalImagePathThisGallery).forEach((name) => {
      if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return;
      const page1 = parseInt(name.split(".")[0].split("_")[0]); // 此处的page1是从1开始的
      if (isNaN(page1)) return;
      this.result.originalImages[page1 - 1].path =
        originalImagePathThisGallery + "/" + name;
      this.result.originalImages[page1 - 1].started = true;
      this.result.originalImages[page1 - 1].userSelected = true;
    });

    // 查找已经存在的AI翻译
    const aiTranslationPathThisGallery = aiTranslationPath + `${this.gid}`;
    if (!$file.exists(aiTranslationPathThisGallery))
      $file.mkdir(aiTranslationPathThisGallery);
    $file.list(aiTranslationPathThisGallery).forEach((name) => {
      if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return;
      const page1 = parseInt(name.split(".")[0].split("_")[0]); // 此处的page1是从1开始的
      if (isNaN(page1)) return;
      this.result.aiTranslations[page1 - 1].path =
        aiTranslationPathThisGallery + "/" + name;
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

    // 1.5 如果mpvAvailable=true, 那么尝试获取mpvkey
    if (this.mpvAvailable) {
      if (!this.result.mpv.started) {
        return this.createMpvTask();
      } else if (
        !this.result.mpv.success &&
        this.infos.thumbnail_size === "large" &&
        "0" in this.infos.images
      ) {
        // 此时可以并行的任务：第一页缩略图的下载任务(最多20个)
        // 前提：mpv任务还没有成功，thumbanil_size=large, infos中有第一页的数据
        const compoundThumbnailsZero: CompoundThumbnail[] = [];
        const imagesOnThisPage = this.infos.images[0].slice(0, 20);
        let compoundThumbnail: CompoundThumbnail = {
          thumbnail_url: imagesOnThisPage[0].thumbnail_url,
          startIndex: imagesOnThisPage[0].page,
          endIndex: imagesOnThisPage[0].page,
          images: [imagesOnThisPage[0]],
        };
        for (let i = 1; i < imagesOnThisPage.length; i++) {
          if (
            imagesOnThisPage[i].thumbnail_url ===
            compoundThumbnail.thumbnail_url
          ) {
            compoundThumbnail.endIndex = imagesOnThisPage[i].page;
            compoundThumbnail.images.push(imagesOnThisPage[i]);
          } else {
            compoundThumbnailsZero.push(compoundThumbnail);
            compoundThumbnail = {
              thumbnail_url: imagesOnThisPage[i].thumbnail_url,
              startIndex: imagesOnThisPage[i].page,
              endIndex: imagesOnThisPage[i].page,
              images: [imagesOnThisPage[i]],
            };
          }
        }
        compoundThumbnailsZero.push(compoundThumbnail);
        const compoundThumbnailItem = compoundThumbnailsZero.find((n) =>
          this.result.thumbnails
            .filter((i) => i.index >= n.startIndex && i.index <= n.endIndex)
            .some((i) => i.started === false)
        );
        if (compoundThumbnailItem) {
          return this.createCompoundThumbnailTask(compoundThumbnailItem);
        }
      }
      // 如果没有mpvkey，则不进行下面的任务
      if (!this.mpvkey) return;
    }

    // 2. 如果currentReadingIndex所对应的html还没有开始，则下载html
    if (this.infos.num_of_images_on_each_page) {
      // 如果没有num_of_images_on_each_page，则无需考虑html任务（因为只有1页）
      const page = Math.floor(
        this.currentReadingIndex / this.infos.num_of_images_on_each_page
      );
      if (!this.result.htmls[page].started) {
        return this.createHtmlTask(page);
      }
    }

    // 3. 在html任务中查找已开始但未完成的任务（started为true, success和error都是false）
    // 如果数量小于等于1，则查找未开始的html任务。保证有两个html任务在同时下载，优先完成html任务。
    const runningHtmlTaskNum = this.result.htmls.filter(
      (html) => html.started && !html.success && !html.error
    ).length;
    if (runningHtmlTaskNum <= 1) {
      const htmlTask = this.result.htmls.find((html) => !html.started);
      if (htmlTask) return this.createHtmlTask(htmlTask.index);
    }

    // 插入aiTranslation任务
    // 如果存在可执行但未开始的任务，则优先执行它们
    // 可执行的标准为：userSelected为true，started为false, images中对应index的path存在
    const aiTranslationItem = this.result.aiTranslations.find((task) => {
      return (
        task.userSelected &&
        !task.started &&
        this.result.images[task.index].path
      );
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
    const originalImageItem = this.result.originalImages.find(
      (originalImage) => {
        const page = this.infos.num_of_images_on_each_page
          ? Math.floor(
              originalImage.index / this.infos.num_of_images_on_each_page
            )
          : 0;
        return (
          this.result.htmls[page].success &&
          originalImage.userSelected &&
          !originalImage.started
        );
      }
    );

    if (originalImageItem) {
      const htmlPageOfFoundImageItem = this.infos.num_of_images_on_each_page
        ? Math.floor(
            originalImageItem.index / this.infos.num_of_images_on_each_page
          )
        : 0;
      return this.createOriginalImageTask(
        originalImageItem.index,
        this.infos.images[htmlPageOfFoundImageItem].find(
          (image) => image.page === originalImageItem.index
        )!.imgkey
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
        images: [imagesOnThisPage[0]],
      };
      for (let i = 1; i < imagesOnThisPage.length; i++) {
        if (
          imagesOnThisPage[i].thumbnail_url === compoundThumbnail.thumbnail_url
        ) {
          compoundThumbnail.endIndex = imagesOnThisPage[i].page;
          compoundThumbnail.images.push(imagesOnThisPage[i]);
        } else {
          compoundThumbnails.push(compoundThumbnail);
          compoundThumbnail = {
            thumbnail_url: imagesOnThisPage[i].thumbnail_url,
            startIndex: imagesOnThisPage[i].page,
            endIndex: imagesOnThisPage[i].page,
            images: [imagesOnThisPage[i]],
          };
        }
      }
      compoundThumbnails.push(compoundThumbnail);
    }
    // 4. 查找未开始的缩略图任务
    // 规则为：在对应html任务已经完成的缩略图任务中，先从currentReadingIndex开始找，如果找不到，则从头开始找
    // 2024-11-20 update: 由于ehentai图库页面改版，改为从compoundThumbnails中查找

    // 4.1 先从currentReadingIndex开始找
    let compoundThumbnailItem = compoundThumbnails.find(
      (n) =>
        n.endIndex >= this.currentReadingIndex &&
        this.result.thumbnails
          .filter((i) => i.index >= n.startIndex && i.index <= n.endIndex)
          .some((i) => i.started === false)
    );
    // 4.2 如果找不到，则从头开始找
    if (!compoundThumbnailItem)
      compoundThumbnailItem = compoundThumbnails.find((n) =>
        this.result.thumbnails
          .filter((i) => i.index >= n.startIndex && i.index <= n.endIndex)
          .some((i) => i.started === false)
      );

    // 如果background为true且backgroundPaused为false，或者reading为true，则尝试进行图片任务
    if ((this.background && !this.backgroundPaused) || this.reading) {
      // 5. 查找未开始的图片任务
      // 规则为：
      // 1. 如果reading为true，autoCacheWhenReading为false，则需要执行一个特殊的逻辑：
      //    只下载currentReadingIndex对应的、以及往后2张图片，不下载其他图片
      // 2. 在对应html任务已经完成的图片任务中，先从currentReadingIndex开始找，如果找不到，则从头开始找
      let imageItem = this.result.images.find((image) => {
        const page = this.infos.num_of_images_on_each_page
          ? Math.floor(image.index / this.infos.num_of_images_on_each_page)
          : 0;
        // 如果不处于后台下载状态，且处于阅读状态，且autoCacheWhenReading为false，
        // 则只会下载currentReadingIndex对应的、以及往后2张图片
        if (
          !(this.background && !this.backgroundPaused) &&
          this.reading &&
          !this.autoCacheWhenReading
        ) {
          return (
            this.result.htmls[page].success &&
            image.index >= this.currentReadingIndex &&
            image.index <= this.currentReadingIndex + 2 &&
            !image.started
          );
        } else {
          return (
            this.result.htmls[page].success &&
            image.index >= this.currentReadingIndex &&
            !image.started
          );
        }
      });
      if (!imageItem)
        imageItem = this.result.images.find((image) => {
          // 如果不处于后台下载状态，且处于阅读状态，且autoCacheWhenReading为false，则不下载
          if (
            !(this.background && !this.backgroundPaused) &&
            this.reading &&
            !this.autoCacheWhenReading
          )
            return false;
          const page = this.infos.num_of_images_on_each_page
            ? Math.floor(image.index / this.infos.num_of_images_on_each_page)
            : 0;
          return this.result.htmls[page].success && !image.started;
        });
      if (compoundThumbnailItem && imageItem) {
        // 如果图片对应的缩略图还没有开始，则下载缩略图，否则下载图片
        const imageItemIndex = imageItem.index;
        if (
          imageItem.index >= compoundThumbnailItem.startIndex &&
          imageItem.index <= compoundThumbnailItem.endIndex
        ) {
          return this.createCompoundThumbnailTask(compoundThumbnailItem);
        } else {
          const htmlPageOfFoundImageItem = this.infos.num_of_images_on_each_page
            ? Math.floor(
                imageItem.index / this.infos.num_of_images_on_each_page
              )
            : 0;
          return this.createImageTask(
            imageItem.index,
            this.infos.images[htmlPageOfFoundImageItem].find(
              (image) => image.page === imageItemIndex
            )!.imgkey
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
          this.infos.images[htmlPageOfFoundImageItem].find(
            (image) => image.page === imageItemIndex
          )!.imgkey
        );
      }
    } else {
      if (compoundThumbnailItem) {
        return this.createCompoundThumbnailTask(compoundThumbnailItem);
      }
    }
    return;
  }

  private createMpvTask() {
    return {
      index: 0,
      handler: async () => {
        appLog(`开始下载MPV页面: gid=${this.gid}`, "debug");
        this.result.mpv.started = true;
        const result = await api.getMPVInfoWithTwoRetries(
          this.gid,
          this.infos.token
        );
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
        appLog(`开始下载图库页面: gid=${this.gid}, index=${index}`, "debug");
        this.result.htmls[index].started = true;
        const result = await api.getGalleryImagesWithTwoRetries(
          this.gid,
          this.infos.token,
          index
        );
        if (result.success) {
          appLog(`图库页面下载成功: gid=${this.gid}, index=${index}`, "debug");
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
                return (
                  thumbnail.index >= startIndex &&
                  thumbnail.index < endIndex &&
                  !thumbnail.started
                );
              })
              .forEach((thumbnail) => {
                thumbnail.started = true;
                thumbnail.error = true;
              });
            this.result.images
              .filter((image) => {
                return (
                  image.index >= startIndex &&
                  image.index < endIndex &&
                  !image.started
                );
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

  private createCompoundThumbnailTask(
    compoundThumbnailItem: CompoundThumbnail
  ) {
    const startIndex = compoundThumbnailItem.startIndex;
    const endIndex = compoundThumbnailItem.endIndex;
    const url = compoundThumbnailItem.thumbnail_url;
    const images = compoundThumbnailItem.images;
    return {
      index: startIndex,
      handler: async () => {
        appLog(
          `开始下载图库缩略图: gid=${this.gid}, startIndex=${startIndex}, endIndex=${endIndex}`,
          "debug"
        );
        this.result.thumbnails
          .filter(
            (thumbnail) =>
              thumbnail.index >= startIndex && thumbnail.index <= endIndex
          )
          .forEach((thumbnail) => {
            thumbnail.started = true;
          });
        const result = await api.downloadThumbnailWithTwoRetries(url);
        if (result.success) {
          appLog(
            `图库缩略图下载成功: gid=${this.gid}, startIndex=${startIndex}, endIndex=${endIndex}`,
            "debug"
          );
          const data = result.data;
          const image = data.image;
          // 此处的读取image必须放在循环外面，以减少调用次数，否则会出现莫名其妙为空的情况
          const filtered = this.result.thumbnails.filter(
            (thumbnail) =>
              thumbnail.index >= startIndex && thumbnail.index <= endIndex
          );
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
            $file.write({
              data: dataCropped,
              path,
            });
            this.result.thumbnails[index].path = path;
            await $wait(0.2);
          }
        } else {
          this.result.thumbnails
            .filter(
              (thumbnail) =>
                thumbnail.index >= startIndex && thumbnail.index <= endIndex
            )
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
        appLog(
          `开始下载图库图片: gid=${this.gid}, index=${index}, webdav=${this.webDAVConfig.enabled}`,
          "debug"
        );
        this.result.images[index].started = true;
        const result:
          | { success: true; data: NSData; info?: EHPage }
          | { success: false; error: string; info?: EHPage } = this.webDAVConfig
          .enabled
          ? await this.webDAVConfig.client.downloadNoError(
              this.webDAVConfig.filesOnWebDAV[index]
            )
          : this.mpvAvailable && this.mpvkey
          ? await api.downloadImageByMpvWithThreeRetries(
              this.gid,
              imgkey,
              this.mpvkey,
              index
            )
          : await api.downloadImageByPageInfoWithThreeRetries(
              this.gid,
              imgkey,
              index,
              this.showkey
            );

        if (!this.showkey && result.info?.showkey) {
          this.showkey = result.info.showkey;
        }

        if (result.success) {
          appLog(
            `图库图片下载成功: gid=${this.gid}, index=${index}, webdav=${this.webDAVConfig.enabled}`,
            "debug"
          );
          let extname = result.data.info.mimeType.split("/")[1];
          if (extname === "jpeg") extname = "jpg";
          const path = imagePath + `${this.gid}/${index + 1}.${extname}`;
          $file.write({
            data: result.data,
            path,
          });
          this.result.images[index].path = path;
        } else {
          this.result.images[index].error = true;
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
        const result = await api.downloadOriginalImageByPageInfoWithTwoRetries(
          this.gid,
          imgkey,
          index
        );
        if (result.success) {
          appLog(`原图下载成功: gid=${this.gid}, index=${index}`, "debug");
          let extname = result.data.info.mimeType.split("/")[1];
          if (extname === "jpeg") extname = "jpg";
          const path =
            originalImagePath + `${this.gid}/${index + 1}.${extname}`;
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

  get pendingOfHtmls() {
    return this.result.htmls.filter((html) => !html.started).length;
  }

  get pendingOfThumbnails() {
    return this.result.thumbnails.filter((thumbnail) => !thumbnail.started)
      .length;
  }

  get pendingOfImages() {
    return this.result.images.filter((image) => !image.started).length;
  }

  get pending() {
    return (
      this.pendingOfHtmls +
      this.pendingOfThumbnails +
      this.pendingOfImages +
      (this.result.topThumbnail.started ? 0 : 1)
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
      (this.result.topThumbnail.path ? 1 : 0)
    );
  }

  get isAllFinished(): boolean {
    return (
      this.finished ===
      this.result.htmls.length +
        this.result.thumbnails.length +
        this.result.images.length +
        1
    );
  }

  get isAllFinishedDespiteError(): boolean {
    const topThumbnailFinishedDespiteError =
      this.result.topThumbnail.path || this.result.topThumbnail.error;
    const finishedOfHtmlsDespiteError = this.result.htmls.filter(
      (html) => html.success || html.error
    ).length;
    const finishedOfThumbnailsDespiteError = this.result.thumbnails.filter(
      (thumbnail) => thumbnail.path || thumbnail.error
    ).length;
    const finishedOfImagesDespiteError = this.result.images.filter(
      (image) => image.path || image.error
    ).length;
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
  constructor(
    infos: EHGallery,
    client: WebDAVClient,
    finishHandler: () => void
  ) {
    super();
    this.infos = infos;
    this.gid = infos.gid;
    this.finishHandler = finishHandler;
    this._client = client;
    const filesOnLocal = $file
      .list(imagePath + `${this.gid}/`)
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
          const target = files.find((file) =>
            isNameMatchGid(file.name, this.gid)
          );
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
        const dst = `${this.result.mkdir.path}/${index + 1}.${
          contentType.split("/")[1]
        }`;
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
    this.galleryWebDAVUploaders = new Map() as Map<
      number,
      GalleryWebDAVUploader
    >;
  }

  /**
   * 添加一个图库下载器
   * 不能重复添加，如果gid重复，会直接报错
   * @param gid 图库id
   * @param infos 图库信息
   */
  add(gid: number, infos: EHGallery) {
    if (this.galleryDownloaders.has(gid))
      throw new Error("Unable to add duplicate image downloader");
    const downloader = new GalleryCommonDownloader({
      infos,
      mpvAvailable: configManager.mpvAvailable,
      finishHandler: () => {
        for (const [k, v] of this.galleryWebDAVUploaders) {
          if (!v.backgroundPaused && !v.isAllFinishedDespiteError) {
            this.startOne(k);
            return;
          }
        }
        for (const [k, v] of this.galleryDownloaders) {
          if (
            k !== gid &&
            v.background &&
            !v.backgroundPaused &&
            !v.isAllFinishedDespiteError
          ) {
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
   * TODO：如果当前下载器没有可以启动的子任务，那么尝试启动别的下载器
   */
  startOne(gid: number) {
    // 先检测该下载器是否还有未完成的任务，如果没有，则不启动
    // 两种情况：
    // 1. reading为true，autoCacheWhenReading为false，只下载currentReadingIndex对应的、以及往后2张图片
    // 2. 其他情况，下载所有未开始的图片
    const d = this.galleryDownloaders.get(gid);
    if (!d) return false;
    if (
      !(d.background && !d.backgroundPaused) &&
      d.reading &&
      !d.autoCacheWhenReading
    ) {
      const hasPendingImages = d.result.images
        .slice(d.currentReadingIndex, d.currentReadingIndex + 3)
        .some((n) => !n.started);
      if (!hasPendingImages) return false;
    } else if (d.isAllFinishedDespiteError) {
      return false;
    }
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
      if (
        k !== gid &&
        v.background &&
        !v.backgroundPaused &&
        !v.isAllFinishedDespiteError
      ) {
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
      if (
        k !== gid &&
        v.background &&
        !v.backgroundPaused &&
        !v.isAllFinishedDespiteError
      ) {
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
    if (this.tabDownloaders.has(id))
      throw new Error("Unable to add duplicate tab downloader");
    const tabDownloader = new TabThumbnailDownloader(() => {
      for (const v of this.galleryWebDAVUploaders.values()) {
        if (!v.backgroundPaused && !v.isAllFinishedDespiteError) {
          this.startOne(v.gid);
          return;
        }
      }
      for (const v of this.galleryDownloaders.values()) {
        if (
          v.background &&
          !v.backgroundPaused &&
          !v.isAllFinishedDespiteError
        ) {
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
    if (this.galleryWebDAVUploaders.has(gid))
      throw new Error("Unable to add duplicate image uploader");
    const uploader = new GalleryWebDAVUploader(infos, client, () => {
      for (const [k, v] of this.galleryWebDAVUploaders) {
        if (k !== gid && !v.backgroundPaused && !v.isAllFinishedDespiteError) {
          this.startOne(k);
          return;
        }
      }
      for (const [k, v] of this.galleryDownloaders) {
        if (
          v.background &&
          !v.backgroundPaused &&
          !v.isAllFinishedDespiteError
        ) {
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
      if (
        k !== gid &&
        v.background &&
        !v.backgroundPaused &&
        !v.isAllFinishedDespiteError
      ) {
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
      appLog("WebDAV 连接失败, 无法创建上传任务", "warn");
    });
}
