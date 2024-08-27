import { EHGallery } from "ehentai-parser";
import { BaseController, DynamicItemSizeMatrix } from "jsbox-cview";
import { thumbnailPath } from "../utils/glv";

export class GalleryThumbnailController extends BaseController {
  cviews: { matrix: DynamicItemSizeMatrix };
  constructor() {
    super({
      props: { bgcolor: $color("backgroundColor") }
    });
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
                font: $font(13)
              },
              layout: (make, view) => {
                make.left.right.bottom.inset(0);
                make.height.equalTo(20);
              }
            },
            {
              type: "image",
              props: {
                id: "image",
                bgcolor: $color("secondarySurface"),
                contentMode: $contentMode.scaleAspectFit
              },
              layout: (make, view) => {
                make.top.left.right.equalTo(0);
                make.bottom.equalTo(view.prev.top);
              }
            }
          ]
        },
        data: [],
        footer: {
          type: "view",
          props: {
            height: 20
          }
        }
      },
      layout: $layout.fill,
      events: {
        itemHeight: width => width * 1.414 + 20,
        didSelect: (sender, indexPath, data) => { }
      }
    });
    this.cviews = { matrix }
    this.rootView.views = [matrix]
  }

  _mapData(thumbnailItems: { path?: string, error: boolean }[]) {
    return thumbnailItems.map((item, i) => {
      return {
        image: { src: item.path || "" },
        label: { text: (i + 1).toString() }
      }
    })
  }

  set thumbnailItems(thumbnailItems: { path?: string, error: boolean }[]) {
    this.cviews.matrix.data = this._mapData(thumbnailItems)
  }
}
