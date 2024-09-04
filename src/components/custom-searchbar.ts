// 有搜索框的视觉效果，但实际上是一个可滚动的matrix，用于展示搜索关键词。点击会启动搜索页。

import { Base } from "jsbox-cview";
import { EHSearchTerm } from "ehentai-parser";
import { mapSearchTermToString } from "../utils/tools";
import { namespaceColor } from "../utils/glv";

const searchBarBgcolor = $color("#DFE1E2", "tertiarySurface")

/**
 * 自定义搜索框
 * @property searchTerms - 搜索关键词 设为[]时显示placeholder
 */
export class CustomSearchBar extends Base<UIView, UiTypes.ViewOptions> {
  private _mappedData: { text: string; width: number; color: UIColor }[] = [];
  _defineView: () => UiTypes.ViewOptions;
  constructor(options: {
    props?: UiTypes.BaseViewProps;
    events?: UiTypes.BaseViewEvents;
  }) {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: searchBarBgcolor,
          cornerRadius: 8,
          smoothCorners: true,
        },
        layout: (make, view) => {
          make.left.right.inset(4)
          make.height.equalTo(36)
          make.top.inset(4.5)
        },
        events: options.events,
        views: [
          { // placeholder
            type: "view",
            props: {
              id: "placeholder"
            },
            layout: (make, view) => {
              make.width.equalTo(59)
              make.height.equalTo(20)
              make.center.equalTo(view.super)
            },
            views: [
              {
                type: "image",
                props: {
                  symbol: "magnifyingglass",
                  tintColor: $color("systemPlaceholderText")
                },
                layout: (make, view) => {
                  make.centerY.equalTo(view.super)
                  make.size.equalTo($size(20, 20))
                  make.left.inset(0)
                }
              },
              {
                type: "label",
                props: {
                  text: "搜索",
                  textColor: $color("systemPlaceholderText"),
                  font: $font(17),
                  align: $align.center
                },
                layout: (make, view) => {
                  make.centerY.equalTo(view.super)
                  make.left.equalTo(view.prev.right).inset(4)
                  make.size.equalTo($size(35, 21))
                }
              }
            ]
          },
          { // content
            type: "view",
            props: {
              id: "content",
              hidden: true
            },
            layout: $layout.fill,
            views: [
              {
                type: "image",
                props: {
                  symbol: "magnifyingglass",
                  tintColor: $color("systemPlaceholderText")
                },
                layout: (make, view) => {
                  make.centerY.equalTo(view.super)
                  make.size.equalTo($size(20, 20))
                  make.left.inset(4)
                }
              },
              {
                type: "matrix",
                props: {
                  id: "matrix",
                  spacing: 5,
                  bgcolor: $color("clear"),
                  selectable: false,
                  direction: $scrollDirection.horizontal,
                  alwaysBounceVertical: false,
                  showsVerticalIndicator: false,
                  showsHorizontalIndicator: false,
                  data: [],
                  template: {
                    props: {
                      bgcolor: $color("clear"),
                      cornerRadius: 4,
                      smoothCorners: true
                    },
                    views: [
                      {
                        type: "label",
                        props: {
                          id: "label",
                          font: $font(14),
                          align: $align.center,
                          textColor: $color("primaryText")
                        },
                        layout: $layout.fill
                      }]
                  }
                },
                layout: (make, view) => {
                  make.left.inset(28)
                  make.right.inset(4)
                  make.top.bottom.inset(0)
                },
                events: {
                  itemSize: (sender, indexPath) => {
                    return {
                      width: this._mappedData[indexPath.item].width,
                      height: 26
                    }
                  }
                }
              }
            ]
          }
        ]
      }
    }
  }

  set searchTerms(terms: EHSearchTerm[]) {
    if (terms.length === 0) {
      this.view.get("content").hidden = true
      this.view.get("placeholder").hidden = false
    } else {
      this.view.get("content").hidden = false
      this.view.get("placeholder").hidden = true
    }
    this._mappedData = terms.map(searchTerm => {
      const text = mapSearchTermToString(searchTerm);
      const width = $text.sizeThatFits({
        text,
        width: 10000,
        font: $font(14)
      }).width + 10
      const color = searchTerm.namespace ? namespaceColor[searchTerm.namespace] : namespaceColor.other
      return { text, width, color }
    });

    (this.view.get("matrix") as UIMatrixView).data = this._mappedData.map(item => ({
      label: {
        text: item.text,
        bgcolor: item.color
      }
    }))
  }
}