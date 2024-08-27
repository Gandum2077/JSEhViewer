import { Base, ContentView, Label, setLayer } from "jsbox-cview";
import { catColor, defaultButtonColor, invisibleCauseMap } from "../utils/glv"
import { toSimpleUTCTimeString } from "../utils/tools";
import { EHCategory } from "ehentai-parser";

class ThumbnailView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _thumbnail_local_path: string;
  constructor(thumbnail_local_path: string, layout: (make: MASConstraintMaker, view: AllUIView) => void) {
    super();
    this._thumbnail_local_path = thumbnail_local_path;
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id
        },
        layout,
        views: [
          {
            type: "spinner",
            props: {
              id: "spinner",
              hidden: Boolean(thumbnail_local_path),
              loading: !thumbnail_local_path,
            },
            layout: (make, view) => {
              make.center.equalTo(view.super)
            }
          },
          {
            type: "view",
            props: {
              id: "thumbnail_wrapper"
            },
            layout: (make, view) => {
              setLayer(view, {
                cornerRadius: 12,
                shadowRadius: 8,
                shadowOpacity: 0.6,
                shadowOffset: $size(0, 3),
                shadowColor: $color("#C7C7C7")
              })
              make.top.left.bottom.right.inset(0)
            },
            views: [{
              type: "image",
              props: {
                id: "thumbnail",
                cornerRadius: 6,
                smoothCorners: true,
                src: thumbnail_local_path || undefined,
              },
              layout: $layout.fill
            }]
          }
        ]
      }
    }
  }

  refreshThumbnail(thumbnail_local_path: string) {
    if (this._thumbnail_local_path === thumbnail_local_path) return
    this._thumbnail_local_path = thumbnail_local_path;
    const spinner = this.view.get("spinner") as UISpinnerView
    const thumbnail = this.view.get("thumbnail") as UIImageView
    spinner.hidden = Boolean(thumbnail_local_path)
    spinner.loading = !thumbnail_local_path
    thumbnail.src = thumbnail_local_path
  }
}

export class ReadingButton extends Base<UILabelView, UiTypes.LabelOptions> {
  _defineView: () => UiTypes.LabelOptions;
  private _current_reading_page: number;
  constructor(current_reading_page?: number, layout?: (make: MASConstraintMaker, view: AllUIView) => void) {
    super();
    this._current_reading_page = current_reading_page || 0
    this._defineView = () => {
      return {
        type: "label",
        props: {
          text: this._current_reading_page === 0 ? "阅读" : `阅读 ${current_reading_page}`,
          bgcolor: defaultButtonColor,
          textColor: $color("white"),
          font: $font("bold", 20),
          align: $align.center,
          cornerRadius: 10,
          smoothCorners: true,
          lines: 0
        },
        layout
      }
    }
  }

  get current_reading_page() {
    return this._current_reading_page
  }

  set current_reading_page(page: number) {
    this._current_reading_page = page
    this.view.text = page === 0 ? "开始阅读" : `继续阅读\n${page}`
  }
}

function _calFontSizeAndHeight(title: string, width: number, maxHeight: number): { fontSize: number, height: number } {
  const maxFontSize = 16
  const minFontSize = 10
  const factor = 2
  for (let i = maxFontSize * factor; i >= minFontSize * factor; i--) {
    const height = Math.ceil($text.sizeThatFits({
      text: title,
      font: $font(i / factor),
      width: width
    }).height)
    if (height <= maxHeight) {
      return { fontSize: i / factor, height }
    }
  }
  return { fontSize: minFontSize, height: maxHeight }
}

/**
 * 包含以下几个部分，以及对应的布局策略
 * - 左边部分: 占整体的1/3
 *   - 缩略图: 优先级2，除分类外剩余的部分
 *   - 分类: 优先级1，固定大小，110x40
 * - 右边部分: 占整体的2/3
 *   - 标题: 优先级1，自动调节字号，自动调节高度
 *   - 上传者+上传时间: 优先级2，固定大小，高度45，在上下两者中间，
 *   - 阅读按钮: 优先级1，固定大小，80x60
 *   - 页数
 *   - 语言
 *   - 大小
 * 
 * 此控件带有刷新机制，可以刷新缩略图或者整体刷新
 * 
 * 参数
 * 
 * 方法
 * - refreshThumbnail
 * - refresh
 */
export class GalleryInfoTitleView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor({
    jpanese_title,
    english_title,
    thumbnail_local_path,
    uploader,
    posted_time,
    category,
    length,
    language,
    visible,
    invisible_cause,
    file_size,
    current_reading_page,
    detailedInfoHandler
  }: {
    jpanese_title?: string,
    english_title: string,
    thumbnail_local_path: string,
    uploader?: string,
    posted_time: string,
    category: EHCategory,
    length: number,
    language: string,
    file_size: string,
    visible: boolean,
    invisible_cause?: "expunged" | "replaced" | "private" | "unknown",
    current_reading_page?: number
    detailedInfoHandler: () => void
  }) {
    super();
    const categoryLabel = new Label({
      props: {
        text: category,
        textColor: $color("white"),
        font: $font("Futura-Bold", 18),
        align: $align.center,
        bgcolor: catColor[category],
        cornerRadius: 4,
        smoothCorners: true,
      },
      layout: (make, view) => {
        make.bottom.left.right.inset(0)
        make.height.equalTo(30)
      }
    })
    const thumbnailView = new ThumbnailView(
      thumbnail_local_path,
      (make, view) => {
        make.left.top.right.equalTo(view.super)
        make.bottom.inset(35)
      }
    )

    const readingButton = new ReadingButton(
      current_reading_page,
      (make, view) => {
        make.height.equalTo(60)
        make.width.greaterThanOrEqualTo(110).priority(1000)
        make.width.lessThanOrEqualTo(180).priority(1000)
        make.width.equalTo(view.super).multipliedBy(0.4).priority(999)
        make.bottom.inset(0)
        make.right.inset(20)
      }
    )

    const postedTimeLabel = new Label({
      props: {
        styledText: {
          text: toSimpleUTCTimeString(posted_time) + (invisible_cause ? ` (${invisibleCauseMap[invisible_cause]})` : ""),
          color: $color("red"),
          font: $font(12),
          styles: [
            {
              range: $range(0, 16),
              color: $color("secondaryText"),
              strikethroughStyle: visible ? undefined : 2,
              strikethroughColor: $rgba(255, 0, 0, 1)
            }
          ]
        },
        align: $align.left
      },
      layout: (make, view) => {
        make.height.equalTo(20)
        make.bottom.left.right.inset(0)
      }
    })
    const uploaderLabel = uploader 
    ? new Label({
      props: {
        text: uploader,
        textColor: $color("primaryText"),
        font: $font(16),
        align: $align.left,
        userInteractionEnabled: true,
        menu: {
          items: [
            {
              title: "立即搜索",
              symbol: "magnifyingglass",
              handler: (sender) => {}
            },
            {
              title: "复制",
              symbol: "doc.on.doc",
              handler: (sender) => {}
            }
          ]
        }
      },
      layout: (make, view) => {
        make.height.equalTo(20)
        make.top.left.inset(0)
      }
    })
    : new Label({
      props: {
        text: `(已放弃)`,
        textColor: $color("secondaryText"),
        font: $font(16),
        align: $align.left
      },
      layout: (make, view) => {
        make.height.equalTo(20)
        make.top.left.inset(0)
      }
    })
      
    const lengthLabel = new ContentView({
      props: {bgcolor: $color("clear")},
      views: [
        {
          type: "view",
          props: {
            bgcolor: $color("red"),
            smoothCorners: true,
            cornerRadius: 1.5,
          },
          layout: (make, view) => {
            make.left.inset(1)
            make.centerY.equalTo(view.super)
            make.width.equalTo(3)
            make.height.equalTo(13)
          }
        },
        {
          type: "label",
          props: {
            text: `${length} 页`,
            textColor: $color("secondaryText"),
            font: $font(12),
            align: $align.left,
          },
          layout: (make, view) => {
            make.top.bottom.right.inset(0)
            make.left.equalTo(view.prev.right).inset(3)
          }
        },
      ]
    })

    const fileSizeLabel = new ContentView({
      props: {bgcolor: $color("clear")},
      views: [
        {
          type: "view",
          props: {
            bgcolor: $color("olive"),
            smoothCorners: true,
            cornerRadius: 1.5,
          },
          layout: (make, view) => {
            make.left.inset(1)
            make.centerY.equalTo(view.super)
            make.width.equalTo(3)
            make.height.equalTo(13)
          }
        },
        {
          type: "label",
          props: {
            text: file_size,
            textColor: $color("secondaryText"),
            font: $font(12),
            align: $align.left,
          },
          layout: (make, view) => {
            make.top.bottom.right.inset(0)
            make.left.equalTo(view.prev.right).inset(3)
          }
        },
      ]
    })

    const languageLabel = new ContentView({
      props: {bgcolor: $color("clear")},
      views: [
        {
          type: "view",
          props: {
            bgcolor: $color("teal"),
            smoothCorners: true,
            cornerRadius: 1.5,
          },
          layout: (make, view) => {
            make.left.inset(1)
            make.centerY.equalTo(view.super)
            make.width.equalTo(3)
            make.height.equalTo(13)
          }
        },
        {
          type: "label",
          props: {
            text: language,
            textColor: $color("secondaryText"),
            font: $font(12),
            align: $align.left,
          },
          layout: (make, view) => {
            make.top.bottom.right.inset(0)
            make.left.equalTo(view.prev.right).inset(3)
          }
        },
      ]
    })

    let titleType = jpanese_title ? "japanese_title" : "english_title"
    let title = jpanese_title || english_title
    const titleView = new Label({
      props: {
        text: title,
        textColor: $color("primaryText"),
        font: $font(16),
        align: $align.left,
        lines: 0,
        userInteractionEnabled: true
      },
      layout: (make, view) => {
        make.top.left.right.inset(0)
        make.height.equalTo(0)
      },
      events: {
        tapped: sender => {
          if (!jpanese_title || jpanese_title === english_title) return
          titleType = titleType === "english_title" ? "japanese_title" : "english_title"
          title = titleType === "english_title" ? english_title : jpanese_title
          sender.text = title
          const { width, height } = sender.super.frame
          const usedHeight = 60 + 45 + 10
          const insetHeight = 10
          const maxHeight = height - usedHeight - insetHeight
          const { fontSize, height: titleHeight } = _calFontSizeAndHeight(title, width, maxHeight)
          sender.font = $font(fontSize)
          sender.updateLayout((make, view) => {
            make.height.equalTo(titleHeight)
          })
        }
      }
    })

    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id
        },
        layout: $layout.fill,
        views: [
          { // 左边部分
            type: "view",
            props: {},
            layout: (make, view) => {
              make.left.top.bottom.equalTo(view.super)
              make.width.equalTo(view.super).dividedBy(3)
            },
            views: [
              thumbnailView.definition,
              categoryLabel.definition
            ]
          },
          { // 右边部分
            type: "view",
            props: {},
            layout: (make, view) => {
              make.right.top.bottom.equalTo(view.super)
              make.left.equalTo(view.prev.right).inset(10)
            },
            views: [
              readingButton.definition,
              {
                type: "stack",
                props: {
                  bgcolor: $color("clear"),
                  userInteractionEnabled: true,
                  stack: {
                    views: [
                      lengthLabel.definition,
                      fileSizeLabel.definition,
                      languageLabel.definition
                    ]
                  },
                  axis: $stackViewAxis.vertical,
                  distribution: $stackViewDistribution.fillEqually,
                },
                layout: (make, view) => {
                  make.left.bottom.inset(0)
                  make.top.equalTo(view.prev)
                  make.right.equalTo(view.prev.left).inset(5)
                },
                events: {
                  tapped: sender => {
                    detailedInfoHandler()
                  }
                }
              },
              titleView.definition,
              {
                type: "view",
                props: {},
                layout: (make, view) => {
                  make.left.right.inset(0)
                  make.height.equalTo(45)
                  make.top.equalTo(view.prev.bottom).offset(30).priority(998)
                  make.top.greaterThanOrEqualTo(view.prev.bottom).offset(10).priority(999)
                  make.bottom.lessThanOrEqualTo(view.prev.prev.prev.top).offset(-10).priority(1000)
                },
                views: [
                  uploaderLabel.definition,
                  postedTimeLabel.definition
                ]
              }
            ],
            events: {
              layoutSubviews: sender => {
                const { width, height } = sender.frame
                const usedHeight = 60 + 45 + 10
                const insetHeight = 10
                const maxHeight = height - usedHeight - insetHeight
                const { fontSize, height: titleHeight } = _calFontSizeAndHeight(title, width, maxHeight)
                titleView.view.font = $font(fontSize)
                titleView.view.updateLayout((make, view) => {
                  make.height.equalTo(titleHeight)
                })
              }
            }
          }
        ]
      }
    }
  }

  heightToWidth(width: number) {
    return Math.min(Math.max(210, Math.ceil(width / 3 * 1.414) + 35), 310)
  }
}