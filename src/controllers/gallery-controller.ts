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

export class GalleryController extends PageViewerController {
  private _infos?: EHGallery;
  private _gid: number;
  private _token: string;
  private _subControllers: {
    galleryInfoController: GalleryInfoController;
    galleryThumbnailController: GalleryThumbnailController;
    galleryCommentController: GalleryCommentController;
  }
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
                  items: [
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
          galleryThumbnailController.thumbnailItems = downloaderManager.get(this._infos.gid).result.thumbnails;
          sender.rootView.view.alpha = 1;

          galleryInfoController.startTimer();
          galleryThumbnailController.startTimer();
          $delay(1, () => {
            if (!this._infos) return;
            galleryCommentController.infos = this._infos
          })
        },
        didAppear: () => {
          galleryInfoController.currentReadPage = statusManager.getLastReadPage(this._gid);
          galleryInfoController.startTimer();
          galleryThumbnailController.startTimer();
        },
        didDisappear: () => {
          galleryInfoController.stopTimer();
          galleryThumbnailController.stopTimer();
        }
      }
    })
    this._gid = gid;
    this._token = token;
    this._subControllers = {
      galleryInfoController,
      galleryThumbnailController,
      galleryCommentController
    }
  }

  readGallery(index: number) {
    if (!this._infos) return;
    statusManager.storeArchiveItemOrUpdateAccessTime(this._infos, false);

    downloaderManager.get(this._infos.gid).downloadingImages = true;
    downloaderManager.get(this._infos.gid).currentReadingIndex = Math.max(index - 1, 0); // 提前一页加载
    downloaderManager.startOne(this._infos.gid)
    const readerController = new ReaderController({
      gid: this._infos.gid,
      title: this._infos.japanese_title || this._infos.english_title,
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
    // TODO：关闭当前的下载器、定时器，更新信息，重新启动下载器、定时器
    this._subControllers.galleryInfoController.stopTimer();
    this._subControllers.galleryThumbnailController.stopTimer();
    if (!isSameGallery) downloaderManager.remove(this._gid); // 删除旧的下载器
    // 重新赋值
    this._infos = infos;
    this._gid = gid;
    this._token = token;
    // 重新启动下载器
    if (!isSameGallery) {
      downloaderManager.add(this._gid, this._infos);
      downloaderManager.startOne(this._gid);
    }
    // 更新信息
    this._subControllers.galleryInfoController.gid = this._gid;
    this._subControllers.galleryThumbnailController.gid = this._gid;
    this._subControllers.galleryInfoController.infos = this._infos;
    this._subControllers.galleryInfoController.currentReadPage = statusManager.getLastReadPage(this._gid);
    this._subControllers.galleryThumbnailController.thumbnailItems = downloaderManager.get(this._gid).result.thumbnails;
    this._subControllers.galleryInfoController.startTimer();
    this._subControllers.galleryThumbnailController.startTimer();
    $ui.success("刷新成功");
    $delay(0.1, () => {
      if (!this._infos) return;
      this._subControllers.galleryCommentController.infos = this._infos
    })
  }
}