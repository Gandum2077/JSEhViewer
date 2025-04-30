import { PageViewerController, RefreshButton, router } from "jsbox-cview";
import { GalleryInfoController } from "./gallery-info-controller";
import { GalleryThumbnailController } from "./gallery-thumbnail-controller";
import { GalleryCommentController } from "./gallery-comment-controller";
import {
  EHGallery,
  EHNetworkError,
  EHServerError,
  EHCopyrightError,
  EHTimeoutError,
  EHIgneousExpiredError,
  EHIPBannedError,
} from "ehentai-parser";
import { popoverWithSymbol } from "../components/popover-with-symbol";
import { GalleryDetailedInfoController } from "./gallery-detailed-info-controller";
import { configManager } from "../utils/config";
import { api, downloaderManager } from "../utils/api";
import { ReaderController } from "./reader-controller";
import { statusManager } from "../utils/status";
import { appLog } from "../utils/tools";
import { WebDAVClient } from "../utils/webdav";
import { setWebDAVConfig } from "./settings-webdav-controller";
import { globalTimer } from "../utils/timer";
import { defaultButtonColor, galleryInfoPath, imagePath, tempPath, tempZipPath } from "../utils/glv";
import { FatalError } from "../utils/error";
import { ArchiveController } from "./archive-controller";

export class GalleryController extends PageViewerController {
  private _infos?: EHGallery;
  private _gid: number;
  private _token: string;
  private refreshButton: RefreshButton;
  autoCacheWhenReading: boolean;
  fatalErrorAlerted: boolean = false;
  private _webDAVClient?: WebDAVClient;
  private _webDAVInfo: {
    status: "loading" | "connected" | "error";
    filesOnServer: string[];
    errorMessage?: string;
  } = {
    status: "loading",
    filesOnServer: [],
  };

  subControllers: {
    galleryInfoController: GalleryInfoController;
    galleryThumbnailController: GalleryThumbnailController;
    galleryCommentController: GalleryCommentController;
  };

  timer?: TimerTypes.Timer;

  constructor(gid: number, token: string) {
    const galleryInfoController = new GalleryInfoController(gid, (index) => this.readGallery(index));
    const galleryThumbnailController = new GalleryThumbnailController(gid, (index) => this.readGallery(index));
    const galleryCommentController = new GalleryCommentController((index) => this.readGallery(index));
    const refreshButton = new RefreshButton({
      layout: $layout.fill,
      events: {
        tapped: async () => {
          refreshButton.loading = true;
          await this.refresh(this._gid, this._token);
          refreshButton.loading = false;
        },
      },
    });
    super({
      props: {
        //bgcolor: $color("primarySurface"),
        items: [
          { title: "详情", controller: galleryInfoController },
          { title: "预览", controller: galleryThumbnailController },
          { title: "评论", controller: galleryCommentController },
        ],
        navBarProps: {
          style: 2,
          tintColor: $color("primaryText"),
          rightBarButtonItems: [
            {
              symbol: "ellipsis",
              handler: async (sender) => {
                if (!this._infos) return;
                popoverWithSymbol({
                  sourceView: sender,
                  sourceRect: sender.bounds,
                  directions: $popoverDirection.up,
                  width: 200,
                  items: this.generatePopoverItems(),
                });
              },
            },
            {
              width: 50,
              cview: refreshButton,
            },
          ],
          popButtonEnabled: true,
        },
      },
      events: {
        didLoad: async (sender) => {
          sender.rootView.view.alpha = 0;
          sender.rootView.view.super.add({
            type: "label",
            props: {
              id: "loadingLabel",
              text: "加载中...",
              textColor: $color("primaryText"),
              align: $align.center,
            },
            layout: $layout.center,
          });
          try {
            // 两种获取infos的方式：本地获取/在线获取
            const infos = $file.exists(galleryInfoPath + `${this._gid}.json`)
              ? (JSON.parse($file.read(galleryInfoPath + `${this._gid}.json`).string || "") as EHGallery)
              : await api.getGalleryInfo(this._gid, this._token, true);
            appLog(infos, "debug");
            if (infos.thumbnail_size === "normal") {
              throw new FatalError("参数错误: thumbnail_size不应为normal");
            }
            this._infos = infos;
          } catch (e: any) {
            appLog(e, "error");
            if (e instanceof EHIgneousExpiredError) {
              throw new FatalError("里站Cookie已过期，且无法自动刷新");
            }
            if (e instanceof EHIPBannedError) {
              throw new FatalError("你的IP地址可能被封禁");
            }
            if (e instanceof EHCopyrightError) {
              (sender.rootView.view.super.get("loadingLabel") as UILabelView).text = `加载失败：版权问题`;
            } else if (e instanceof EHServerError) {
              (
                sender.rootView.view.super.get("loadingLabel") as UILabelView
              ).text = `加载失败：服务不可用(${e.statusCode})`;
            } else if (e instanceof EHNetworkError && e.statusCode === 404) {
              (
                sender.rootView.view.super.get("loadingLabel") as UILabelView
              ).text = `加载失败：图库不存在(${e.statusCode})`;
            } else if (e instanceof EHTimeoutError) {
              (sender.rootView.view.super.get("loadingLabel") as UILabelView).text = "加载失败: 超时";
            } else {
              (sender.rootView.view.super.get("loadingLabel") as UILabelView).text =
                "加载失败: 未知原因" + (e.statusCode ? `(${e.statusCode})` : "");
            }
            return;
          }
          if (!this._infos) return;
          const path = galleryInfoPath + `${this._infos.gid}.json`;
          if (!$file.exists(path)) {
            const text = JSON.stringify(this._infos, null, 2);
            $file.write({
              data: $data({ string: text }),
              path,
            });
          }
          if (!downloaderManager.get(this._gid)) {
            downloaderManager.add(this._gid, this._infos);
            // 检查是否应该开启后台下载
            const downloaded = statusManager.getArchiveItem(this._gid)?.downloaded ?? false;
            const isFinishedOfImages = downloaderManager.get(this._gid)?.finishedOfImages === this._infos.length;
            if (downloaded && !isFinishedOfImages) {
              downloaderManager.get(this._gid)!.background = true;
            }
          }
          downloaderManager.startOne(this._gid);
          statusManager.updateArchiveItem(this._gid, {
            infos: this._infos,
            updateLastAccessTime: true,
            readlater: false,
          });
          (router.get("archiveController") as ArchiveController).silentRefresh();

          sender.rootView.view.super.get("loadingLabel").remove();

          galleryInfoController.infos = this._infos;
          galleryInfoController.currentReadPage = statusManager.getLastReadPage(this._gid);
          galleryThumbnailController.thumbnailItems = downloaderManager.get(this._gid)!.result.thumbnails;

          // 重置DownloadButton
          const downloaded = statusManager.getArchiveItem(this._gid)?.downloaded ?? false;
          const isFinishedOfImages = downloaderManager.get(this._gid)?.finishedOfImages === this._infos.length;
          galleryInfoController.resetDownloadButton({
            fininshed: downloaded && isFinishedOfImages,
          });

          sender.rootView.view.alpha = 1;

          globalTimer.addTask({
            id: this._gid.toString(),
            interval: 1,
            handler: () => {
              galleryInfoController.scheduledRefresh();
              galleryThumbnailController.scheduledRefresh();
              this.updateWebDAVWidget();
              if (!this.fatalErrorAlerted && this._checkFatalError()) {
                this.fatalErrorAlerted = true;
                $ui.alert({
                  title: "致命错误",
                  message: "请点击右上角手动刷新",
                });
              }
            },
          });
          galleryInfoController.onWebDAVAction = (action) => {
            if (action === "upload") {
              // 上传功能
              if (!this._webDAVClient) return;
              if (!this._infos) return;
              if (!downloaderManager.getGalleryWebDAVUploader(this._gid)) {
                downloaderManager.addGalleryWebDAVUploader(this._infos, this._webDAVClient);
              }
              downloaderManager.startGalleryWebDAVUploader(this._gid);
            } else if (action === "retry") {
              // 重连
              this.resetWebDAV();
            } else if (action === "resume-upload") {
              const u = downloaderManager.getGalleryWebDAVUploader(this._gid);
              if (u) {
                u.backgroundPaused = false;
                downloaderManager.startGalleryWebDAVUploader(this._gid);
                this.updateWebDAVWidget();
              }
            } else if (action === "retry-upload") {
              const u = downloaderManager.getGalleryWebDAVUploader(this._gid);
              if (u) {
                u.result.upload
                  .filter((item) => item.error)
                  .forEach((item) => {
                    item.error = false;
                    item.started = false;
                  });
                downloaderManager.startGalleryWebDAVUploader(this._gid);
                this.updateWebDAVWidget();
              }
            } else if (action === "pause") {
              const u = downloaderManager.getGalleryWebDAVUploader(this._gid);
              if (u) {
                downloaderManager.backgroundPauseGalleryWebDAVUploader(this._gid);
                this.updateWebDAVWidget();
              }
            }
          };

          galleryInfoController.onWebDAVConfig = async () => {
            const values = await setWebDAVConfig();
            configManager.webdavEnabled = values.enabled;
            configManager.webdavAutoUpload = values.autoUpload;
            configManager.updateAllWebDAVServices(values.services);
            // 重新初始化webdav客户端
            this.resetWebDAV();
          };

          this.resetWebDAV();

          $delay(1, () => {
            if (!this._infos) return;
            galleryCommentController.infos = this._infos;
          });
        },
        didAppear: () => {
          galleryInfoController.currentReadPage = statusManager.getLastReadPage(this._gid);
          globalTimer.resumeTask(this._gid.toString());
        },
        didDisappear: () => {
          globalTimer.pauseTask(this._gid.toString());
        },
        didRemove: () => {
          globalTimer.removeTask(this._gid.toString());
        },
        // 注: 不需要在销毁时关闭下载器，因为回到上一级的列表页时，列表页的下载器会打开，从而附带关闭此下载器
      },
    });
    this._gid = gid;
    this._token = token;
    this.autoCacheWhenReading = configManager.autoCacheWhenReading;
    this.subControllers = {
      galleryInfoController,
      galleryThumbnailController,
      galleryCommentController,
    };
    this.refreshButton = refreshButton;
  }

  readGallery(index: number) {
    if (!this._infos) return;
    const d = downloaderManager.get(this._infos.gid);
    if (!d) return;
    d.reading = true;
    d.currentReadingIndex = Math.max(index - 1, 0); // 提前一页加载
    // 在阅读前检查autoCacheWhenReading：如果后台下载被开启，那么自动开启缓存，否则保持不变
    this.autoCacheWhenReading = (d.background && !d.backgroundPaused) || this.autoCacheWhenReading;
    d.autoCacheWhenReading = this.autoCacheWhenReading;
    downloaderManager.startOne(this._infos.gid);
    const readerController = new ReaderController({
      gid: this._infos.gid,
      index,
      length: this._infos.length,
      superGalleryController: this,
    });
    readerController.uipush({
      theme: "dark",
      navBarHidden: true,
      statusBarStyle: 0,
    });
  }

  async refresh(gid: number, token: string) {
    // 首先判断gid是否和当前一致。如果一致，后续要继承下载器的background, backgroundPaused
    const isSameGallery = this._gid === gid;
    // 刷新之前获取三个信息：readlater, background, backgroundPaused
    const readlater_old = statusManager.getArchiveItem(gid)?.readlater ?? false;
    const background_old = downloaderManager.get(gid)?.background ?? false;
    const backgroundPaused_old = downloaderManager.get(gid)?.backgroundPaused ?? false;

    let infos: EHGallery | undefined;
    try {
      infos = await api.getGalleryInfo(gid, token, true);
      appLog(infos, "debug");
      if (infos.thumbnail_size === "normal") {
        throw new FatalError("参数错误: thumbnail_size不应为normal");
      }
    } catch (e: any) {
      appLog(e, "error");
      if (e instanceof EHIgneousExpiredError) {
        throw new FatalError("里站Cookie已过期，且无法自动刷新");
      }
      if (e instanceof EHIPBannedError) {
        throw new FatalError("你的IP地址可能被封禁");
      }
      if (e instanceof EHCopyrightError) {
        $ui.error(`加载失败：版权问题`);
      } else if (e instanceof EHServerError) {
        $ui.error(`刷新失败：服务不可用(${e.statusCode})`);
      } else if (e instanceof EHNetworkError && e.statusCode === 404) {
        $ui.error(`刷新失败：图库不存在(${e.statusCode})`);
      } else if (e instanceof EHTimeoutError) {
        $ui.error("刷新失败: 超时");
      } else {
        $ui.error("刷新失败: 未知原因" + (e.statusCode ? `(${e.statusCode})` : ""));
      }
      return;
    }
    if (!infos) return;

    // 关闭致命错误警告
    this.fatalErrorAlerted = false;

    // 关闭当前的定时器，更新信息，重新启动下载器、定时器
    globalTimer.removeTask(this._gid.toString());
    // 如果不是同一个gid且没有后台下载，则暂停旧的下载器
    if (!isSameGallery) {
      const oldDownloader = downloaderManager.get(this._gid);
      if (oldDownloader && !oldDownloader.background) {
        downloaderManager.pause(this._gid);
      }
    }

    // 重新赋值
    this._gid = gid;
    this._token = token;
    this._infos = infos;

    // 重新启动下载器
    // 首先删除现有的的本地文件
    const path = galleryInfoPath + `${this._gid}.json`;
    if ($file.exists(path)) {
      $file.delete(path);
    }
    const text = JSON.stringify(this._infos, null, 2);
    $file.write({
      data: $data({ string: text }),
      path,
    });
    if (downloaderManager.get(this._gid)) {
      downloaderManager.remove(this._gid);
    }

    downloaderManager.add(this._gid, this._infos);
    // 检查是否应该开启后台下载
    const downloaded = statusManager.getArchiveItem(this._gid)?.downloaded ?? false;
    const isFinishedOfImages = downloaderManager.get(this._gid)?.finishedOfImages === this._infos.length;

    downloaderManager.get(this._gid)!.background =
      (downloaded && !isFinishedOfImages) || (isSameGallery && background_old);
    downloaderManager.get(this._gid)!.backgroundPaused = isSameGallery && backgroundPaused_old;

    downloaderManager.startOne(this._gid);

    statusManager.updateArchiveItem(this._gid, {
      infos: this._infos,
      updateLastAccessTime: true,
      readlater: isSameGallery ? readlater_old : false,
    });
    (router.get("archiveController") as ArchiveController).silentRefresh();

    // 重新初始化webdav客户端
    this.resetWebDAV();

    // 更新信息
    this.subControllers.galleryInfoController.gid = this._gid;
    this.subControllers.galleryThumbnailController.gid = this._gid;
    this.subControllers.galleryInfoController.infos = this._infos;
    this.subControllers.galleryInfoController.currentReadPage = statusManager.getLastReadPage(this._gid);
    this.subControllers.galleryThumbnailController.thumbnailItems = downloaderManager.get(this._gid)!.result.thumbnails;

    // readlater和download按钮
    this.subControllers.galleryInfoController.cviews.readLaterButton.symbolColor =
      isSameGallery && readlater_old ? $color("orange") : defaultButtonColor;

    this.subControllers.galleryInfoController.resetDownloadButton({
      fininshed: downloaded && isFinishedOfImages,
    });

    globalTimer.addTask({
      id: this._gid.toString(),
      interval: 1,
      handler: () => {
        this.subControllers.galleryInfoController.scheduledRefresh();
        this.subControllers.galleryThumbnailController.scheduledRefresh();
        this.updateWebDAVWidget();
        if (!this.fatalErrorAlerted && this._checkFatalError()) {
          this.fatalErrorAlerted = true;
          $ui.alert({
            title: "致命错误",
            message: "请点击右上角手动刷新",
          });
        }
      },
    });
    $ui.success("刷新成功");
    $delay(0.3, () => {
      if (!this._infos) return;
      this.subControllers.galleryCommentController.infos = this._infos;
    });
  }

  resetWebDAV() {
    this._webDAVClient = undefined;
    this._webDAVInfo = {
      status: "loading",
      filesOnServer: [],
    };
    this.updateWebDAVWidget();
    // 如果存在webdav服务，则初始化webdav客户端
    downloaderManager.get(this._gid)!.webDAVConfig = { enabled: false };
    if (configManager.currentWebDAVService) {
      this._webDAVClient = new WebDAVClient(configManager.currentWebDAVService);
      this.updateWebDAVInfo().then(() => {
        if (!this._infos) return;
        if (!this._webDAVClient) return;
        this.updateWebDAVWidget();
        if (this._webDAVInfo.status === "connected" && this._webDAVInfo.filesOnServer.length === this._infos.length) {
          downloaderManager.get(this._infos.gid)!.webDAVConfig = {
            enabled: true,
            client: this._webDAVClient,
            filesOnWebDAV: this._webDAVInfo.filesOnServer,
          };
        } else {
          downloaderManager.get(this._gid)!.webDAVConfig = { enabled: false };
        }
      });
    }
  }

  _checkFatalError() {
    const d = downloaderManager.get(this._gid);
    if (!d) return false;
    return d.result.mpv.error || d.result.htmls.some((n) => n.error);
  }

  async updateWebDAVInfo() {
    // 更新_webDAVInfo
    // 此方法适用于1. 初始化时，2. 刷新时，3. 用户主动重新选择WebDAV服务
    // 其功能为从webdav服务器获取文件列表，并更新_webDAVInfo
    // 如果获取失败，则更新_webDAVInfo为error状态
    // 如果获取成功，则更新_webDAVInfo为connected状态
    if (!this._webDAVClient) return;
    const result = await this._webDAVClient.listImageFilesByGidNoError(this._gid);
    if (result.success) {
      this._webDAVInfo.filesOnServer = result.data;
      this._webDAVInfo.status = "connected";
    } else {
      this._webDAVInfo.status = "error";
      this._webDAVInfo.errorMessage = result.error;
    }
  }

  updateWebDAVWidget() {
    // 综合configManager, _webDAVInfo, webDAVUploader三方面的信息，更新webdav小部件
    // 单方面操作，不涉及更新信息
    if (!this._infos) return;
    const service = configManager.currentWebDAVService;
    if (service) {
      if (this._webDAVInfo.status === "error") {
        this.subControllers.galleryInfoController.updateWebDAVWidgetStatus({
          on: true,
          type: "error",
          serverName: service.name,
          message: this._webDAVInfo.errorMessage || "未知原因",
        });
      } else if (this._webDAVInfo.status === "loading") {
        this.subControllers.galleryInfoController.updateWebDAVWidgetStatus({
          on: true,
          type: "loading",
          serverName: service.name,
        });
      } else {
        const isFileOnServerComplete = this._webDAVInfo.filesOnServer.length === this._infos.length;
        const isFileOnLocalComplete =
          downloaderManager.get(this._gid)!.result.images.filter((image) => image.path).length === this._infos.length;
        const webDAVUploader = downloaderManager.getGalleryWebDAVUploader(this._gid);
        let uploadStatus: "uploading" | "success" | "failed" | "paused" | undefined = undefined;
        if (webDAVUploader) {
          const finishedCount = webDAVUploader.result.upload.filter((item) => item.success).length;
          const failedCount = webDAVUploader.result.upload.filter((item) => item.error).length;
          if (finishedCount + failedCount === this._infos.length) {
            if (failedCount === 0) {
              uploadStatus = "success";
            } else {
              uploadStatus = "failed";
            }
          } else if (webDAVUploader.backgroundPaused) {
            uploadStatus = "paused";
          } else {
            uploadStatus = "uploading";
          }
        }
        this.subControllers.galleryInfoController.updateWebDAVWidgetStatus({
          on: true,
          type: "connected",
          serverName: service.name,
          galleryStatusOnServer: isFileOnServerComplete
            ? "complete"
            : this._webDAVInfo.filesOnServer.length === 0
            ? "none"
            : "incomplete",
          galleryStatusOnLocal: isFileOnLocalComplete ? "complete" : "incomplete",
          uploadStatus: uploadStatus,
        });
      }
    } else {
      this.subControllers.galleryInfoController.updateWebDAVWidgetStatus({
        on: false,
        message: !configManager.webdavEnabled ? "WebDAV未启用" : "未选择服务器",
      });
    }
  }

  generatePopoverItems() {
    if (!this._infos) return [];
    const fixed = [
      {
        symbol: "square.and.arrow.down",
        title: "导入压缩包",
        handler: async () => {
          if (!this._infos) return;
          if (this.refreshButton.loading) return;

          if (!configManager.importingArchiverIntroductionRead) {
            const r1 = await $ui.alert({
              title: "注意事项",
              message:
                "1. 压缩包内的图片需要使用正确的字典排序" +
                "（例如01、02……10， 而非1、2……10）。" +
                "E站归档下载会自动整理，其他来源请先整理好，否则图片顺序会错乱\n" +
                "2. 如果导入的压缩包过大，" +
                "可能会消耗数十秒时间并在此期间造成严重卡顿，请耐心等待",
              actions: [{ title: "不再提示" }, { title: "好的" }],
            });
            if (r1.index === 0) {
              configManager.importingArchiverIntroductionRead = true;
            }
          }

          await $wait(1); // 必须等待至少0.7秒，否则文件选择器会弹不出来

          const data = await $drive.open({ types: ["public.zip-archive"] });
          const r2 = await $ui.alert({
            title: "导入确认",
            message: data.fileName,
            actions: [{ title: "取消" }, { title: "确认" }],
          });
          if (r2.index === 0) return;

          if ($file.exists(tempPath)) $file.delete(tempPath);
          $file.mkdir(tempPath);
          $file.write({ data, path: tempZipPath }); // 此举是为了节约内存

          const success = await $archiver.unzip({
            path: tempZipPath,
            dest: tempPath,
          });

          if (!success) {
            $file.delete(tempPath);
            $file.delete(tempZipPath);
            $ui.error("解压缩失败");
            return;
          }
          // 首先在第一层文件夹中寻找合格图片
          let imageFiles = $file
            .list(tempPath)!
            .filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name) && !name.startsWith("."))
            .sort((a, b) => a.localeCompare(b))
            .map((n) => ({ path: tempPath + n, name: n }));
          // 如果第一层文件夹中没有足够数量的合格图片，并且只存在一个文件夹
          // 那么去第二层文件夹中寻找
          if (imageFiles.length !== this._infos.length) {
            const secondaryDirs = $file
              .list(tempPath)!
              .map((n) => tempPath + n)
              .filter((n) => $file.isDirectory(n));
            if (secondaryDirs.length !== 1) {
              $file.delete(tempZipPath);
              $file.delete(tempPath);
              $ui.error("失败：压缩包内图片数量不符");
              return;
            }
            const secondaryDir = secondaryDirs[0];
            imageFiles = $file
              .list(secondaryDir)!
              .filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name) && !name.startsWith("."))
              .sort((a, b) => a.localeCompare(b))
              .map((n) => ({
                path: secondaryDir + "/" + n,
                name: n,
              }));
            if (imageFiles.length !== this._infos.length) {
              $file.delete(tempZipPath);
              $file.delete(tempPath);
              $ui.error("失败：压缩包内图片数量不符");
              return;
            }
          }
          const d = downloaderManager.get(this._gid);
          d!.completeStopped = true;
          downloaderManager.remove(this._gid);
          $file.delete(imagePath + `${this._gid}`);
          $file.mkdir(imagePath + `${this._gid}`);
          // 遍历并搬运
          imageFiles.forEach((n, i) => {
            const extname = n.name.split(".").at(-1)?.toLowerCase() || "jpg";
            $file.move({
              src: n.path,
              dst: imagePath + `${this._gid}/${i + 1}.${extname}`,
            });
          });
          downloaderManager.add(this._gid, this._infos);
          downloaderManager.startOne(this._gid);
          $ui.success("导入成功");
          $file.delete(tempPath);
          $file.delete(tempZipPath);
        },
      },
      {
        symbol: "info.circle",
        title: "详细信息",
        handler: () => {
          if (!this._infos) return;
          const controller = new GalleryDetailedInfoController(this._infos);
          controller.uipush({
            navBarHidden: true,
            statusBarStyle: 0,
          });
        },
      },
      {
        symbol: "safari",
        title: "用浏览器打开",
        handler: () => {
          if (!this._infos) return;
          $app.openURL(
            `https://e${configManager.exhentai ? "x" : "-"}hentai.org/g/` + `${this._infos.gid}/${this._infos.token}/`
          );
        },
      },
      {
        symbol: "square.and.arrow.up",
        title: "分享链接",
        autoDismiss: false,
        handler: () => {
          if (!this._infos) return;
          $share.sheet(
            `https://e${configManager.exhentai ? "x" : "-"}hentai.org/g/` + `${this._infos.gid}/${this._infos.token}/`
          );
        },
      },
    ];
    const rollback = {
      symbol: "arrow.backward.circle",
      title: "回滚到上一版本",
      handler: async () => {
        if (!this._infos) return;
        if (!this._infos.parent_gid || !this._infos.parent_token) return;
        if (this.refreshButton.loading) return;
        this.refreshButton.loading = true;
        await this.refresh(this._infos.parent_gid, this._infos.parent_token);
        this.refreshButton.loading = false;
      },
    };
    const update = {
      symbol: "arrow.forward.circle",
      title: "更新到最新版本",
      handler: async () => {
        if (!this._infos) return;
        if (!this._infos.newer_versions.length) return;
        if (this.refreshButton.loading) return;
        const newerVersion = this._infos.newer_versions[this._infos.newer_versions.length - 1];
        this.refreshButton.loading = true;
        await this.refresh(newerVersion.gid, newerVersion.token);
        this.refreshButton.loading = false;
      },
    };
    // 判断是否有旧版本
    const hasOldVersion = Boolean(this._infos.parent_gid);
    // 判断是否有新版本
    const hasNewVersion = Boolean(this._infos.newer_versions.length);
    if (hasOldVersion && hasNewVersion) {
      return [update, rollback, ...fixed];
    } else if (hasOldVersion) {
      return [rollback, ...fixed];
    } else if (hasNewVersion) {
      return [update, ...fixed];
    } else {
      return fixed;
    }
  }
}
