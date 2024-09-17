import { EHArchive, EHGallery } from "ehentai-parser";
import { CustomNavigationBar, DynamicItemSizeMatrix, Label, PresentedPageController } from "jsbox-cview";
import { api } from "../utils/api";
import { appLog } from "../utils/tools";

export class GalleryHathController extends PresentedPageController {
  private _infos: EHGallery;
  private _hathInfo: EHArchive | undefined;
  private _isRequestInProgress: boolean = false;
  cviews: {
    navbar: CustomNavigationBar,
    list: DynamicItemSizeMatrix,
    placeholderLabel: Label
  }
  constructor(infos: EHGallery) {
    super({
      props: {
        bgcolor: $color("backgroundColor"),
      },
      events: {
        didLoad: async () => {
          await this.getHathInfo()
        }
      }
    });
    this._infos = infos;
    const navbar = new CustomNavigationBar({
      props: {
        style: 2,
        title: "Hath下载",
        leftBarButtonItems: [{
          symbol: "xmark",
          handler: () => {
            this.dismiss()
          }
        }]
      }
    })

    const list = new DynamicItemSizeMatrix({
      props: {
        minItemWidth: 140,
        maxColumns: 3,
        spacing: 30,
        fixedItemHeight: 80,
        bgcolor: $color("clear"),
        data: [],
        template: {
          props: {
            cornerRadius: 10,
            smoothCorners: true,
            bgcolor: $color("tertiarySurface")
          },
          views: [
            {
              type: "label",
              props: {
                id: "solution",
                font: $font(20),
                align: $align.center
              },
              layout: (make, view) => {
                make.top.inset(10);
                make.left.right.inset(0);
                make.height.equalTo(30);
              }
            },
            {
              type: "label",
              props: {
                id: "size",
                font: $font(12),
                align: $align.center
              },
              layout: (make, view) => {
                make.left.right.inset(0);
                make.top.equalTo(view.prev.bottom);
                make.height.equalTo(15);
              }
            },
            {
              type: "label",
              props: {
                id: "price",
                font: $font(12),
                align: $align.center
              },
              layout: (make, view) => {
                make.left.right.inset(0);
                make.top.equalTo(view.prev.bottom);
                make.height.equalTo(15);
              }
            }
          ]
        }
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.equalTo(view.super.safeArea);
      },
      events: {
        didSelect: async (sender, indexPath) => {
          if (!this._hathInfo) return;
          if (this._isRequestInProgress) {
            $ui.warning("正在处理上一个请求，请稍后再试");
            return;
          } else {
            this._isRequestInProgress = true;
            await this.downloadHath(this._hathInfo.download_options[indexPath.row]);
          }
        }
      }
    })

    const placeholderLabel = new Label({
      props: {
        text: "加载中...",
        font: $font(16),
        align: $align.center
      },
      layout: (make, view) => {
        make.center.equalTo(view.prev);
      }
    });
    this.cviews = {navbar, list, placeholderLabel};
    this.rootView.views = [navbar, list, placeholderLabel];
  }

  private async downloadHath(option: EHArchive["download_options"][0]) {
    if (!this._hathInfo) return;
    try {
      const r = await api.startHathDownload(this._hathInfo.gid, this._hathInfo.token, this._hathInfo.or, option.solution);
      if (r === "no-hath") {
        $ui.error("您必须拥有 H@H 客户端才能使用此功能");
      } else if (r === "offline") {
        $ui.error("您的 H@H 客户端处于离线状态");
      } else {
        $ui.success("下载会在几分钟内开始");
      }
    } catch (e) {
      appLog(e, "error");
      $ui.error("错误：请求失败")
    } finally {
      this._isRequestInProgress = false;
    }
  }

  private async getHathInfo() {
    let hathInfo: EHArchive | undefined;
    try {
      hathInfo = await api.getArchiverInfo(this._infos.gid, this._infos.token, this._infos.archiver_or);
    } catch (e) {
      appLog(e, "error");
      this.cviews.placeholderLabel.view.text = "加载失败!";
    }
    if (hathInfo) {
      this._hathInfo = hathInfo;
      this.cviews.list.data = hathInfo.download_options.map((option) => {
        const solutionText = option.solution === "org" ? "原图" : option.solution + "x";
        return {
          solution: {
            text: solutionText
          },
          size: {
            text: option.size
          },
          price: {
            text: option.price
          }
        }
      })
      this.cviews.list.view.hidden = false;
      this.cviews.placeholderLabel.view.hidden = true;
    }
  }
}
