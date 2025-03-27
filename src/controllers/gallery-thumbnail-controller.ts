import { BaseController, DynamicItemSizeMatrix } from "jsbox-cview";
import { downloaderManager } from "../utils/api";

export class GalleryThumbnailController extends BaseController {
  gid: number;
  private _finished: boolean = false;
  cviews: { matrix: DynamicItemSizeMatrix };
  constructor(gid: number, readHandler: (index: number) => void) {
    super({
      props: { bgcolor: $color("backgroundColor") },
    });
    this.gid = gid;
    const matrix = new DynamicItemSizeMatrix({
      props: {
        bgcolor: $color("clear"),
        spacing: 5,
        minItemWidth: $device.isIpad ? 140 : 118,
        maxColumns: 10,
        template: {
          views: [
            {
              type: "label",
              props: {
                id: "label",
                align: $align.center,
                font: $font(13),
              },
              layout: (make, view) => {
                make.left.right.bottom.inset(0);
                make.height.equalTo(20);
              },
            },
            {
              type: "image",
              props: {
                id: "image",
                bgcolor: $color("secondarySurface"),
                contentMode: $contentMode.scaleAspectFit,
              },
              layout: (make, view) => {
                make.top.left.right.equalTo(0);
                make.bottom.equalTo(view.prev.top);
              },
            },
          ],
        },
        data: [],
        footer: {
          type: "view",
          props: {
            height: 20,
          },
        },
      },
      layout: (make, view) => {
        make.centerX.equalTo(view.super);
        make.width.equalTo($ui.controller.view.safeArea);
        make.top.bottom.inset(0);
      },
      events: {
        itemHeight: (width) => width * 1.414 + 20,
        didSelect: (sender, indexPath, data) => {
          readHandler(indexPath.item);
        },
        didScroll: (sender) => {
          if (this._finished) return;
          const d = downloaderManager.get(this.gid);
          if (!d) return;
          const currentReadingRow = Math.floor(sender.contentOffset.y / (matrix.itemSize.height + 5));
          const currentReadingIndex = Math.min(
            Math.max(currentReadingRow * matrix.columns, 0),
            d.result.thumbnails.length - 1
          );
          d.currentReadingIndex = currentReadingIndex;
        },
      },
    });
    this.cviews = { matrix };
    this.rootView.views = [matrix];
  }

  private _mapData(thumbnailItems: { path?: string; error: boolean }[]) {
    return thumbnailItems.map((item, i) => {
      return {
        image: { src: item.path || "" },
        label: { text: (i + 1).toString() },
      };
    });
  }

  set thumbnailItems(thumbnailItems: { path?: string; error: boolean }[]) {
    this.cviews.matrix.data = this._mapData(thumbnailItems);
    this._finished = thumbnailItems.every((item) => item.path);
  }

  scheduledRefresh() {
    if (this._finished) return;
    const d = downloaderManager.get(this.gid);
    if (!d) return;
    this.thumbnailItems = d.result.thumbnails;
  }
}
