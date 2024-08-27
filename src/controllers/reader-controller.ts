import { Base, BaseController, Blur, ContentView, cvid, Image, ImagePager, Label, Matrix, Slider, SymbolButton } from "jsbox-cview";
import { CustomImagePager } from "../components/custom-image-pager";

let lastUITapGestureRecognizer: any;

function define(view: any, handler: (location: JBPoint) => void) {
  if (lastUITapGestureRecognizer) {
    $objc_release(lastUITapGestureRecognizer);
    lastUITapGestureRecognizer = undefined;
  }
  const id = cvid.newId
  $define({
    type: id + ": NSObject",
    events: {
      create: () => {
        const tap = $objc("UITapGestureRecognizer")
          .$alloc()
          .$initWithTarget_action(self, "tapped:");
        view.$addGestureRecognizer(tap);
      },
      tapped: (gesture: any) => {
        const location = gesture.$locationInView(view);
        handler(location);
      }
    }
  });
  const r = $objc(id).$new();
  $objc_retain(r);
  lastUITapGestureRecognizer = r;
  return r;
}

class FooterThumbnailView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _index: number;  // 滑动结束后的index，用于外部更新
  private _innerIndex: number; // 随着滑动而变化的index，用于内部更新
  private _width: number; // 整体宽度
  private _length: number;
  private _thumbnailPaths: Record<number, string>;
  cviews: { thumbnailMatrix: Matrix, sliderLeftLabel: Label, slider: Slider };
  constructor(options: {
    props: {
      index: number,
      length: number,
      thumbnailPaths: Record<number, string>
    },
    events: {
      changed: (index: number) => void
    }
  }) {
    super();
    this._index = options.props.index;
    this._innerIndex = this._index;
    this._width = 0
    this._length = options.props.length;
    this._thumbnailPaths = options.props.thumbnailPaths;
    this.cviews = {} as {
      thumbnailMatrix: Matrix,
      sliderLeftLabel: Label,
      slider: Slider
    };
    this.cviews.sliderLeftLabel = new Label({
      props: {
        text: (this._index + 1).toString(),
        textColor: $color("white"),
        font: $font(16),
        align: $align.center
      },
      layout: (make, view) => {
        make.left.top.bottom.inset(0);
        make.width.equalTo(45);
      }
    })
    const sliderRightLabel = new Label({
      props: {
        text: this._length.toString(),
        textColor: $color("white"),
        font: $font(16),
        align: $align.center
      },
      layout: (make, view) => {
        make.right.top.bottom.inset(0);
        make.width.equalTo(45);
      }
    })
    this.cviews.slider = new Slider({
      props: {
        value: this._index,
        min: 0,
        max: this._length - 1,
        continuous: true
      },
      layout: (make, view) => {
        make.left.equalTo(view.prev.prev.right).inset(5);
        make.right.equalTo(view.prev.left).inset(5);
        make.top.bottom.inset(0);
      },
      events: {
        changed: (sender) => {
          this.innerIndex = Math.floor(sender.value);
        },
        touchesEnded: (sender) => {
          const i = Math.floor(sender.value);
          if (this._index !== i) {
            this.index = Math.floor(sender.value);
            options.events.changed(i);
          }
        }
      }
    })
    this.cviews.thumbnailMatrix = new Matrix({
      props: {
        bgcolor: $color("clear"),
        direction: $scrollDirection.horizontal,
        itemSize: $size(80, 80),
        spacing: 5,
        showsHorizontalIndicator: false,
        scrollEnabled: false,
        data: this._mapData(this._index),
        template: {
          views: [
            {
              type: "image",
              props: {
                id: "image",
                contentMode: 1,
                bgcolor: $color("black"),
                borderWidth: 0,
                borderColor: $color("systemLink"),
                cornerRadius: 6,
                smoothCorners: true,
              },
              layout: $layout.fill
            }
          ]
        }
      },
      layout: (make, view) => {
        make.top.left.right.inset(0);
        make.height.equalTo(80);
      },
      events: {
        didSelect: (sender, indexPath) => {
          if (indexPath.item === this.index) return;
          this.index = indexPath.item;
          options.events.changed(indexPath.item);
        },
        ready: sender => {
          this.updateFooter(this.index, false);
        }
      }
    })
    this._defineView = () => {
      return {
        type: "view",
        props: { id: this.id },
        layout: $layout.fill,
        views: [
          this.cviews.thumbnailMatrix.definition,
          {
            type: "view",
            props: {},
            layout: (make, view) => {
              make.left.right.inset(0);
              make.top.equalTo(view.prev.bottom);
              make.height.equalTo(50);
            },
            views: [
              this.cviews.sliderLeftLabel.definition,
              sliderRightLabel.definition,
              this.cviews.slider.definition
            ]
          }
        ],
        events: {
          layoutSubviews: sender => {
            if (sender.frame.width <= 0 || sender.frame.height <= 0) return;
            this._width = sender.frame.width;
          }
        }
      }
    }
  }

  _mapData(index: number) {
    return [...Array(this._length)]
      .map((_, i) => this._thumbnailPaths[i])
      .map((path, i) => ({
        image: { src: path, borderWidth: i === index ? 2 : 0 },
      }))
  }

  updateFooter(index: number, sliderOnGoing: boolean) {
    if (index < 0 || index >= this._length) return;
    if (index === 0) {
      this.cviews.thumbnailMatrix.view.contentOffset = $point(0, 0);
    } else if (this._width !== 0 && this.cviews.thumbnailMatrix.view.contentSize.width - (index * 85 - 85) < this._width) {
      this.cviews.thumbnailMatrix.view.contentOffset = $point(this.cviews.thumbnailMatrix.view.contentSize.width - this._width, 0);
    } else {
      this.cviews.thumbnailMatrix.view.contentOffset = $point(85 * index - 85, 0);
    }
    this.cviews.thumbnailMatrix.view.data = this._mapData(index);
    this.cviews.sliderLeftLabel.view.text = (index + 1).toString();
    if (!sliderOnGoing) {
      this.cviews.slider.view.value = index;
    }
  }

  get index() {
    return this._index;
  }

  set index(index: number) {
    if (this._index === index) return;
    this._index = index;
    this._innerIndex = index;
    this.updateFooter(index, false);
  }

  get innerIndex() {
    return this._innerIndex;
  }

  set innerIndex(index: number) {
    if (this._innerIndex === index) return;
    this._innerIndex = index;
    this.updateFooter(index, true);
  }
}

export class ReaderController extends BaseController {
  private _timer?: TimerTypes.Timer
  cviews: {
    header: Blur,
    footer: Blur,
    viewer: ContentView
  }
  constructor({
    title,
    index,
    length,
    thumbnailPaths,
    picturePaths
  }: {
    title: string,
    index: number,
    length: number,
    thumbnailPaths: Record<number, string>
    picturePaths: (string | {success: boolean; loading: boolean})[]
  }) {
    super({
      events: {
        didAppear: () => {
          this._timer = $timer.schedule({
            interval: 3,
            handler: () => {
              if (!imagePager) return;
              if (typeof  imagePager.srcs[imagePager.page] !== "string") { 
                imagePager.srcs = picturePaths
              }
            }
          })
        },
        didRemove: () => {
          if (this._timer) this._timer.invalidate()
          if (lastUITapGestureRecognizer) {
            $objc_release(lastUITapGestureRecognizer);
            lastUITapGestureRecognizer = undefined;
          }
        }
      }
    });
    const footerThumbnailView = new FooterThumbnailView({
      props: {
        index,
        length,
        thumbnailPaths
      },
      events: {
        changed: (index) => {
          imagePager.page = index;
          if (
            (typeof imagePager.srcs[index] !== "string") 
            || (index > 0 && typeof imagePager.srcs[index - 1] !== "string") 
            || (index < imagePager.srcs.length - 1 && typeof imagePager.srcs[index + 1] !== "string") 
          ) { 
            imagePager.srcs = picturePaths
          }
        }
      }
    })
    const header = new Blur({
      props: {
        style: 20
      },
      layout: (make, view) => {
        make.left.right.top.inset(0);
        make.bottom.equalTo(view.super.safeAreaTop).offset(50);
      },
      views: [
        {
          type: "view",
          props: {},
          layout: (make, view) => {
            make.left.right.inset(5);
            make.bottom.inset(0);
            make.height.equalTo(50);
          },
          views: [
            new SymbolButton({
              props: { symbol: "chevron.left" },
              layout: (make, view) => {
                make.left.top.bottom.inset(0)
                make.width.equalTo(50)
              },
              events: {
                tapped: () => {
                  $ui.pop()
                }
              }
            }).definition,
            new SymbolButton({
              props: {
                symbol: "ellipsis",
                menu: {
                  pullDown: true,
                  asPrimary: true,
                  items: [
                    {
                      title: "以原始分辨率重新载入",
                      symbol: "arrow.clockwise",
                      handler: sender => { }
                    },
                    {
                      title: "保存到相册",
                      symbol: "square.and.arrow.up",
                      handler: sender => { }
                    }
                  ]
                }
              },
              layout: (make, view) => {
                make.right.top.bottom.inset(0)
                make.width.equalTo(50)
              }
            }).definition,
            new Label({
              props: {
                text: title,
                font: $font(16),
                align: $align.center,
                lines: 1
              },
              layout: (make, view) => {
                make.left.equalTo(view.prev.prev.right).inset(0)
                make.right.equalTo(view.prev.left).inset(0)
                make.top.bottom.inset(0)
              }
            }).definition
          ]
        }
      ]
    })
    const footer = new Blur({
      props: {
        style: 16
      },
      layout: (make, view) => {
        make.left.right.bottom.inset(0);
        make.top.equalTo(view.super.safeAreaBottom).offset(-200);
      },
      views: [
        {
          type: "view",
          props: {},
          layout: (make, view) => {
            make.left.right.top.inset(10);
            make.height.equalTo(130);
          },
          views: [
            footerThumbnailView.definition
          ]
        },
        {
          type: "stack",
          props: {
            axis: $stackViewAxis.horizontal,
            distribution: $stackViewDistribution.fillEqually,
            stack: {
              views: [
                {
                  type: "view",
                  props: {},
                  views: [new SymbolButton({
                    props: { symbol: "play.circle" },
                    layout: (make, view) => {
                      make.size.equalTo($size(50, 50))
                      make.center.equalTo(view.super)
                    }
                  }).definition]
                },
                {
                  type: "view",
                  props: {},
                  views: [new SymbolButton({
                    props: {
                      symbol: "forward",
                      menu: {
                        title: "自动翻页",
                        pullDown: true,
                        asPrimary: true,
                        items: [
                          {
                            title: "每页1秒",
                            symbol: "1.circle",
                            handler: sender => { }
                          },
                          {
                            title: "每页2秒",
                            symbol: "2.circle",
                            handler: sender => { }
                          },
                          {
                            title: "每页4秒",
                            symbol: "4.circle",
                            handler: sender => { }
                          },
                          {
                            title: "每页8秒",
                            symbol: "8.circle",
                            handler: sender => { }
                          },
                          {
                            title: "每页16秒",
                            symbol: "16.circle",
                            handler: sender => { }
                          }
                        ]
                      }
                    },
                    layout: (make, view) => {
                      make.size.equalTo($size(50, 50))
                      make.center.equalTo(view.super)
                    }
                  }).definition]
                },
                {
                  type: "view",
                  props: {},
                  views: [new SymbolButton({
                    props: { symbol: "arrow.clockwise" },
                    layout: (make, view) => {
                      make.size.equalTo($size(50, 50))
                      make.center.equalTo(view.super)
                    }
                  }).definition]
                },
                {
                  type: "view",
                  props: {},
                  views: [new SymbolButton({
                    props: { symbol: "square.and.arrow.up" },
                    layout: (make, view) => {
                      make.size.equalTo($size(50, 50))
                      make.center.equalTo(view.super)
                    }
                  }).definition]
                }
              ]
            }
          },
          layout: (make, view) => {
            make.left.right.inset(0);
            make.top.equalTo(view.prev.bottom);
            make.height.equalTo(50);
          }
        }
      ]
    })
    let imagePager: CustomImagePager;
    let lastFrameWidth = 0;
    let lastFrameHeight = 0;
    const viewer = new ContentView({
      props: { bgcolor: $color("clear") },
      layout: $layout.fillSafeArea,
      views: [],
      events: {
        layoutSubviews: sender => {
          if (
            sender.frame.width <= 0
            || sender.frame.height <= 0
            || (sender.frame.width === lastFrameWidth && sender.frame.height === lastFrameHeight)
          ) return;
          if (sender.views.length !== 0) sender.views[0].remove();
          imagePager = new CustomImagePager({
            props: {
              srcs: [...picturePaths.slice(0, picturePaths.length - 2), { success: false, loading: true }, { success: false, loading: false }],
              page: footerThumbnailView.index,
            },
            layout: (make, view) => {
              make.left.right.inset(2);
              make.top.bottom.inset(0);
            },
            events: {
              changed: (page) => {
                footerThumbnailView.index = page;
                if (
                  (typeof imagePager.srcs[page] !== "string") 
                  || (page > 0 && typeof imagePager.srcs[page - 1] !== "string") 
                  || (page < imagePager.srcs.length - 1 && typeof imagePager.srcs[page + 1] !== "string") 
                ) { 
                  imagePager.srcs = picturePaths
                }
              }
            }
          })
          sender.add(imagePager.definition)
          $delay(0.1, () => {
            define(
              imagePager.view.ocValue(), 
              location => {
                if (location.x < sender.frame.width / 3) {
                  footerThumbnailView.index -= 1;
                  imagePager.page = footerThumbnailView.index;
                } else if (location.x > sender.frame.width / 3 * 2) {
                  footerThumbnailView.index += 1;
                  imagePager.page = footerThumbnailView.index;
                } else {
                  footer.view.hidden = !footer.view.hidden;
                  header.view.hidden = !header.view.hidden;
                } 
              }
            ).$create()
          })
        }
      }
    })

    this.cviews = {
      header,
      footer,
      viewer
    }
    this.rootView.views = [viewer, header, footer]
  }
}
