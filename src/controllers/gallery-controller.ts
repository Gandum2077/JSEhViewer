import { PageViewerController } from "jsbox-cview";
import { GalleryInfoController } from "./gallery-info-controller";
import { GalleryThumbnailController } from "./gallery-thumbnail-controller";
import { GalleryCommentController } from "./gallery-comment-controller";
import { EHGallery } from "ehentai-parser";
import { popoverWithSymbol } from "../components/popover-with-symbol";
import { GalleryDetailedInfoController } from "./gallery-detailed-info-controller";
import { configManager } from "../utils/config";
import { api, downloaderManager } from "../utils/api";

export class GalleryController extends PageViewerController {
  private _infos?: EHGallery;
  private _gid: number;
  private _token: string;
  constructor(gid: number, token: string) {
    const galleryInfoController = new GalleryInfoController(gid);
    const galleryThumbnailController = new GalleryThumbnailController(gid);
    const galleryCommentController = new GalleryCommentController();
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
          leftBarButtonItems: [],
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
              symbol: "arrow.clockwise"
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
          const infos = await api.getGalleryInfo(this._gid, this._token, true)
          this._infos = infos
          downloaderManager.add(infos.gid, infos)
          downloaderManager.startOne(infos.gid)
          sender.rootView.view.super.get("loadingLabel").remove()
          sender.rootView.view.alpha = 1

          galleryInfoController.infos = infos
          galleryThumbnailController.thumbnailItems = downloaderManager.get(infos.gid).result.thumbnails
          galleryInfoController.startTimer()
          galleryThumbnailController.startTimer()
          $delay(1, () => {
            galleryCommentController.infos = infos
          })
        },
        didAppear: () => {
          galleryInfoController.startTimer();
          galleryThumbnailController.startTimer();
        },
        didDisappear: () => {
          galleryInfoController.stopTimer();
          galleryThumbnailController.startTimer();
        }
      }
    })
    this._gid = gid;
    this._token = token;
  }


}