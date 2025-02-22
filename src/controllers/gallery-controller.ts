import { PageViewerController, RefreshButton } from "jsbox-cview";
import { GalleryInfoController } from "./gallery-info-controller";
import { GalleryThumbnailController } from "./gallery-thumbnail-controller";
import { GalleryCommentController } from "./gallery-comment-controller";
import { EHGallery, EHNetworkError, EHServiceUnavailableError, EHTimeoutError } from "ehentai-parser";
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

// TODO: 定时器功能从GalleryInfoController和GalleryThumbnailController中移除，并移入GalleryController中

export class GalleryController extends PageViewerController {
  private _infos?: EHGallery;
  private _gid: number;
  private _token: string;
  private refreshButton: RefreshButton;
  private _webDAVClient?: WebDAVClient;
  private _webDAVInfo: {
    status: "loading" | "connected" | "error";
    filesOnServer: string[];
    errorMessage?: string;
  } = {
      status: "loading",
      filesOnServer: []
    };

  subControllers: {
    galleryInfoController: GalleryInfoController;
    galleryThumbnailController: GalleryThumbnailController;
    galleryCommentController: GalleryCommentController;
  }

  timer?: TimerTypes.Timer;

  constructor(gid: number, token: string) {
    const galleryInfoController = new GalleryInfoController(
      gid,
      (index) => this.readGallery(index)
    );
    const galleryThumbnailController = new GalleryThumbnailController(
      gid,
      (index) => this.readGallery(index)
    );
    const galleryCommentController = new GalleryCommentController();
    const refreshButton = new RefreshButton({
      layout: $layout.fill,
      events: {
        tapped: async () => {
          refreshButton.loading = true;
          await this.refresh(this._gid, this._token);
          refreshButton.loading = false;
        }
      }
    })
    super({
      props: {
        //bgcolor: $color("primarySurface"),
        items: [
          { title: "详情", controller: galleryInfoController },
          { title: "预览", controller: galleryThumbnailController },
          { title: "评论", controller: galleryCommentController }
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
                  width: 180,
                  items: this.generatePopoverItems()
                })
              }
            },
            {
              width: 50,
              cview: refreshButton
            }
          ],
          popButtonEnabled: true
        }
      },
      events: {
        didLoad: async (sender) => {
          sender.rootView.view.alpha = 0
          sender.rootView.view.super.add({
            type: "label",
            props: {
              id: "loadingLabel",
              text: "加载中...",
              textColor: $color("primaryText"),
              align: $align.center
            },
            layout: $layout.center
          })
          try {
            const infos = await api.getGalleryInfo(this._gid, this._token, true)
            appLog(infos, "debug")
            this._infos = infos
          } catch (e: any) {
            appLog(e, "error")
            if (e instanceof EHServiceUnavailableError) {
              (sender.rootView.view.super.get("loadingLabel") as UILabelView).text = `加载失败：服务不可用(${e.statusCode})`
            } else if (e instanceof EHNetworkError && e.statusCode === 404) {
              (sender.rootView.view.super.get("loadingLabel") as UILabelView).text = `加载失败：图库不存在(${e.statusCode})`
            } else if (e instanceof EHTimeoutError) {
              (sender.rootView.view.super.get("loadingLabel") as UILabelView).text = "加载失败: 超时"
            } else {
              (sender.rootView.view.super.get("loadingLabel") as UILabelView).text = "加载失败: 未知原因" + (e.statusCode ? `(${e.statusCode})` : "")
            }
          }
          if (!this._infos) return;
          downloaderManager.add(this._infos.gid, this._infos)
          downloaderManager.startOne(this._infos.gid)
          sender.rootView.view.super.get("loadingLabel").remove()

          galleryInfoController.infos = this._infos;
          galleryInfoController.currentReadPage = statusManager.getLastReadPage(this._gid);
          galleryThumbnailController.thumbnailItems = downloaderManager.get(this._infos.gid)!.result.thumbnails;
          sender.rootView.view.alpha = 1;

          globalTimer.addTask({
            id: this._gid.toString(),
            interval: 1,
            handler: () => {
              galleryInfoController.scheduledRefresh();
              galleryThumbnailController.scheduledRefresh();
            }
          })
          galleryInfoController.onWebDAVAction = (action) => {
            if (action === "upload") {
              // 上传功能
              if (!this._webDAVClient) return;
              if (!this._infos) return;
              downloaderManager.addGalleryWebDAVUploader(this._infos, this._webDAVClient);
              downloaderManager.startGalleryWebDAVUploader(this._gid);
            } else if (action === "retry") {
              // 重连
              this.resetWebDAV();
            }
          }

          galleryInfoController.onWebDAVConfig = async () => {
            const values = await setWebDAVConfig();
            configManager.webdavEnabled = values.enabled;
            configManager.webdavAutoUpload = values.autoUpload;
            configManager.updateAllWebDAVServices(values.services);
            // 重新初始化webdav客户端
            this.resetWebDAV();
          }

          this.resetWebDAV();

          $delay(1, () => {
            if (!this._infos) return;
            galleryCommentController.infos = this._infos
          })
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
        }
        // 注: 不需要在销毁时关闭下载器，因为回到上一级的列表页时，列表页的下载器会打开，从而附带关闭此下载器
      }
    })
    this._gid = gid;
    this._token = token;
    this.subControllers = {
      galleryInfoController,
      galleryThumbnailController,
      galleryCommentController
    }
    this.refreshButton = refreshButton;
  }

  readGallery(index: number) {
    if (!this._infos) return;
    statusManager.storeArchiveItemOrUpdateAccessTime(this._infos, false);

    downloaderManager.get(this._infos.gid)!.reading = true;
    downloaderManager.get(this._infos.gid)!.currentReadingIndex = Math.max(index - 1, 0); // 提前一页加载
    downloaderManager.startOne(this._infos.gid)
    const readerController = new ReaderController({
      gid: this._infos.gid,
      index,
      length: this._infos.length
    })
    readerController.uipush({
      theme: "dark",
      navBarHidden: true,
      statusBarStyle: 0
    })
  }

  async refresh(gid: number, token: string) {
    // 首先判断gid是否和当前一致。如果一致，后续无需重启下载器
    const isSameGallery = this._gid === gid;

    let infos: EHGallery | undefined;
    try {
      infos = await api.getGalleryInfo(gid, token, true);
      appLog(infos, "debug");
    } catch (e: any) {
      appLog(e, "error");
      if (e instanceof EHServiceUnavailableError) {
        $ui.error(`刷新失败：服务不可用(${e.statusCode})`);
      } else if (e instanceof EHNetworkError && e.statusCode === 404) {
        $ui.error(`刷新失败：图库不存在(${e.statusCode})`);
      } else if (e instanceof EHTimeoutError) {
        $ui.error("刷新失败: 超时");
      } else {
        $ui.error("刷新失败: 未知原因" + (e.statusCode ? `(${e.statusCode})` : ""));
      }
    }
    if (!infos) return;
    // 关闭当前的下载器、定时器，更新信息，重新启动下载器、定时器
    globalTimer.removeTask(this._gid.toString());
    if (!isSameGallery) {
      downloaderManager.remove(this._gid); // 删除旧的下载器
    }
    // 重新赋值
    this._infos = infos;
    this._gid = gid;
    this._token = token;
    // 重新启动下载器
    if (!isSameGallery) {
      downloaderManager.add(this._gid, this._infos);
      downloaderManager.startOne(this._gid);
      // 重新初始化webdav客户端
      this.resetWebDAV();
    }
    // 更新信息
    this.subControllers.galleryInfoController.gid = this._gid;
    this.subControllers.galleryThumbnailController.gid = this._gid;
    this.subControllers.galleryInfoController.infos = this._infos;
    this.subControllers.galleryInfoController.currentReadPage = statusManager.getLastReadPage(this._gid);
    this.subControllers.galleryThumbnailController.thumbnailItems = downloaderManager.get(this._gid)!.result.thumbnails;
    globalTimer.addTask({
      id: this._gid.toString(),
      interval: 1,
      handler: () => {
        this.subControllers.galleryInfoController.scheduledRefresh();
        this.subControllers.galleryThumbnailController.scheduledRefresh();
      }
    })
    $ui.success("刷新成功");
    $delay(0.3, () => {
      if (!this._infos) return;
      this.subControllers.galleryCommentController.infos = this._infos
    })
  }

  resetWebDAV() {
    this._webDAVClient = undefined;
    this._webDAVInfo = {
      status: "loading",
      filesOnServer: []
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
        if (
          this._webDAVInfo.status === "connected"
          && this._webDAVInfo.filesOnServer.length === this._infos.length
        ) {
          downloaderManager.get(this._infos.gid)!.webDAVConfig = {
            enabled: true,
            client: this._webDAVClient,
            filesOnWebDAV: this._webDAVInfo.filesOnServer
          }
        } else {
          downloaderManager.get(this._gid)!.webDAVConfig = { enabled: false };
        }
      });
    }
  }

  async updateWebDAVInfo() {
    // 更新_webDAVInfo
    // 此方法适用于1. 初始化时，2. 刷新时，3. 用户主动重新选择WebDAV服务
    // 其功能为从webdav服务器获取文件列表，并更新_webDAVInfo
    // 如果获取失败，则更新_webDAVInfo为error状态
    // 如果获取成功，则更新_webDAVInfo为connected状态
    if (!this._webDAVClient) return;
    const result = await this._webDAVClient.listImageFilesByGidNoError(this._gid)
    if (result.success) {
      this._webDAVInfo.filesOnServer = result.data;
      this._webDAVInfo.status = "connected";
    } else {
      this._webDAVInfo.status = "error";
      this._webDAVInfo.errorMessage = result.error;
    }

  }

  updateWebDAVWidget() {
    // 综合configManager和_webDAVInfo，更新webdav小部件
    // 单方面操作，不涉及更新信息
    if (!this._infos) return;
    const service = configManager.currentWebDAVService;
    if (service) {
      if (this._webDAVInfo.status === "error") {
        this.subControllers.galleryInfoController.updateWebDAVWidgetStatus({
          on: true,
          type: "error",
          serverName: service.name,
          message: this._webDAVInfo.errorMessage || "未知原因"
        })
      } else if (this._webDAVInfo.status === "loading") {
        this.subControllers.galleryInfoController.updateWebDAVWidgetStatus({
          on: true,
          type: "loading",
          serverName: service.name,
        })
      } else {
        const isFileOnServerComplete = this._webDAVInfo.filesOnServer.length === this._infos.length;
        const isFileOnLocalComplete = downloaderManager.get(this._gid)!.result.images.filter(image => image.path).length === this._infos.length;
        this.subControllers.galleryInfoController.updateWebDAVWidgetStatus({
          on: true,
          type: "connected",
          serverName: service.name,
          galleryStatusOnServer: isFileOnServerComplete ? "complete" : this._webDAVInfo.filesOnServer.length === 0 ? "none" : "incomplete",
          galleryStatusOnLocal: isFileOnLocalComplete ? "complete" : "incomplete"
        })
      }
    } else {
      this.subControllers.galleryInfoController.updateWebDAVWidgetStatus({
        on: false,
        message: !configManager.webdavEnabled ? "WebDAV未启用" : "未选择服务器"
      })
    }
  }

  generatePopoverItems() {
    if (!this._infos) return [];
    const fixed = [
      {
        symbol: "info.circle",
        title: "详细信息",
        handler: () => {
          if (!this._infos) return;
          const controller = new GalleryDetailedInfoController(this._infos)
          controller.uipush({
            navBarHidden: true,
            statusBarStyle: 0
          })
        }
      },
      {
        symbol: "safari",
        title: "用浏览器打开",
        handler: () => {
          if (!this._infos) return;
          $app.openURL(`https://e${configManager.exhentai ? "x" : "-"}hentai.org/g/${this._infos.gid}/${this._infos.token}/`)
        }
      },
      {
        symbol: "square.and.arrow.up",
        title: "分享链接",
        autoDismiss: false,
        handler: () => {
          if (!this._infos) return;
          $share.sheet(`https://e${configManager.exhentai ? "x" : "-"}hentai.org/g/${this._infos.gid}/${this._infos.token}/`)
        }
      },
      {
        symbol: "square.and.arrow.down",
        title: "下载管理",
        handler: () => {
          $ui.alert("下载管理")
        }
      }
    ]
    const rollback = {
      symbol: "arrow.backward.circle",
      title: "回滚到上一版本",
      handler: async () => {
        if (!this._infos) return;
        if (!this._infos.parent_gid || !this._infos.parent_token) return;
        if (this.refreshButton.loading) return;
        this.refreshButton.loading = true;
        await this.refresh(this._infos.parent_gid, this._infos.parent_token)
        this.refreshButton.loading = false;
      }
    }
    const update = {
      symbol: "arrow.forward.circle",
      title: "更新到最新版本",
      handler: async () => {
        if (!this._infos) return;
        if (!this._infos.newer_versions.length) return;
        if (this.refreshButton.loading) return;
        const newerVersion = this._infos.newer_versions[this._infos.newer_versions.length - 1];
        this.refreshButton.loading = true;
        await this.refresh(newerVersion.gid, newerVersion.token)
        this.refreshButton.loading = false
      }
    }
    // 判断是否有旧版本
    const hasOldVersion = Boolean(this._infos.parent_gid)
    // 判断是否有新版本
    const hasNewVersion = Boolean(this._infos.newer_versions.length)
    if (hasOldVersion && hasNewVersion) {
      return [update, rollback, ...fixed]
    } else if (hasOldVersion) {
      return [rollback, ...fixed]
    } else if (hasNewVersion) {
      return [update, ...fixed]
    } else {
      return fixed
    }
  }


}