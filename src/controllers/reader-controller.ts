import { Base, BaseController, Blur, ContentView, cvid, Label, Matrix, Slider, SymbolButton } from "jsbox-cview";
import { CustomImagePager } from "../components/custom-image-pager";
import { downloaderManager } from "../utils/api";
import { statusManager } from "../utils/status";

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
  private _thumbnailItems: { path?: string, error: boolean }[];
  private _thumbnailItemsFinished: boolean = false; // 缩略图是否全部加载完成
  cviews: { thumbnailMatrix: Matrix, sliderLeftLabel: Label, slider: Slider };
  constructor(options: {
    props: {
      index: number,
      length: number,
      thumbnailItems: { path?: string, error: boolean }[]
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
    this._thumbnailItems = options.props.thumbnailItems;
    this._thumbnailItemsFinished = this._thumbnailItems.every(item => item.path);
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
                id: "error",
                symbol: "exclamationmark.triangle.fill",
                tintColor: $color("red"),
              },
              layout: (make, view) => {
                make.center.equalTo(view.super);
                make.size.equalTo($size(25, 25));
              }
            },
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
    return this._thumbnailItems.map((item, i) => ({
      error: { hidden: !item.error },
      image: { src: item.path || "", borderWidth: i === index ? 2 : 0 },
    }))
  }

  refreshThumbnailItems(thumbnailItems: { path?: string, error: boolean }[]) {
    if (this._thumbnailItemsFinished) return;
    this._thumbnailItems = thumbnailItems;
    this._thumbnailItemsFinished = this._thumbnailItems.every(item => item.path);
    this.cviews.thumbnailMatrix.view.data = this._mapData(this.index);
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
  private gid: number;
  private imagePager?: CustomImagePager;
  private _timer?: TimerTypes.Timer;
  private _autoPagerEnabled: boolean = false;
  private _autoPagerInterval: number = 1;
  private _autoPagerCountDown: number = 1;
  cviews: {
    header: Blur,
    footer: Blur,
    viewer: ContentView,
    footerThumbnailView: FooterThumbnailView
  }
  constructor({
    gid,
    title,
    index,
    length
  }: {
    gid: number,
    title: string,
    index: number,
    length: number
  }) {
    super({
      events: {
        didAppear: () => {
          this._timer = $timer.schedule({
            interval: 1,
            handler: () => {
              if (!this.imagePager) return;
              if (!this.imagePager.srcs[this.imagePager.page].path) {
                this.imagePager.srcs = downloaderManager.get(this.gid).result.images;
              }
              this.cviews.footerThumbnailView.refreshThumbnailItems(downloaderManager.get(this.gid).result.thumbnails);
              if (this._autoPagerEnabled) {
                // 自动翻页
                // 首先检测本页是否加载完成。如果没有加载完成，不翻页并且重制倒计时为翻页间隔
                // 如果加载完成，倒计时减1，如果倒计时小于等于0，翻页并重制倒计时
                // 另外，如果翻到最后一页，不再翻页
                if (
                  !this.imagePager.srcs[this.imagePager.page].path
                  || this.cviews.footerThumbnailView.index === this.imagePager.srcs.length - 1
                ) {
                  this._autoPagerCountDown = this._autoPagerInterval;
                  return;
                } else {
                  this._autoPagerCountDown -= 1;
                  if (this._autoPagerCountDown <= 0) {
                    this.handleTurnPage(this.cviews.footerThumbnailView.index + 1);
                  }
                }
              }
            }
          })
        },
        didDisappear: () => {
          console.log("there")
          statusManager.updateLastReadPage(this.gid, this.cviews.footerThumbnailView.index);
        },
        didRemove: () => {
          statusManager.updateLastReadPage(this.gid, this.cviews.footerThumbnailView.index);
          downloaderManager.get(this.gid).downloadingImages = false;
          if (this._timer) this._timer.invalidate()
          if (lastUITapGestureRecognizer) {
            $objc_release(lastUITapGestureRecognizer);
            lastUITapGestureRecognizer = undefined;
          }
        }
      }
    });
    this.gid = gid;
    const galleryDownloader = downloaderManager.get(gid);
    const footerThumbnailView = new FooterThumbnailView({
      props: {
        index,
        length,
        thumbnailItems: galleryDownloader.result.thumbnails
      },
      events: {
        changed: (index) => this.handleTurnPage(index)
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
    const startAutoPagerButton = new SymbolButton({
      props: {
        symbol: "forward",
        menu: {
          title: "自动翻页",
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "每页停留1秒",
              handler: sender => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 1;
                this._autoPagerCountDown = 1;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "1.circle";
                stopAutoPagerButton.view.hidden = false;
              }
            },
            {
              title: "每页停留3秒",
              handler: sender => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 3;
                this._autoPagerCountDown = 3;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "3.circle";
                stopAutoPagerButton.view.hidden = false;
              }
            },
            {
              title: "每页停留5秒",
              handler: sender => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 5;
                this._autoPagerCountDown = 5;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "5.circle";
                stopAutoPagerButton.view.hidden = false;
              }
            },
            {
              title: "每页停留10秒",
              handler: sender => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 10;
                this._autoPagerCountDown = 10;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "10.circle";
                stopAutoPagerButton.view.hidden = false;
              }
            },
            {
              title: "每页停留15秒",
              handler: sender => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 15;
                this._autoPagerCountDown = 15;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "15.circle";
                stopAutoPagerButton.view.hidden = false;
              }
            }
          ]
        }
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50))
        make.center.equalTo(view.super)
      }
    })
    const stopAutoPagerButton = new SymbolButton({
      props: {
        hidden: true,
        tintColor: $color("systemLink"),
        symbol: "1.circle",
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50))
        make.center.equalTo(view.super)
      },
      events: {
        tapped: (sender) => {
          this._autoPagerEnabled = false;
          startAutoPagerButton.view.hidden = false;
          stopAutoPagerButton.view.hidden = true;
        }
      }
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
                  views: [startAutoPagerButton.definition, stopAutoPagerButton.definition]
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
                    },
                    events: {
                      tapped: () => {
                        const path = downloaderManager.get(this.gid).result.images[this.cviews.footerThumbnailView.index].path;
                        if (path) {
                          $share.sheet($image(path))
                        } else {
                          $ui.error("当前图片尚未加载")
                        }
                      }
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
          lastFrameWidth = sender.frame.width;
          lastFrameHeight = sender.frame.height;
          if (sender.views.length !== 0) sender.views[0].remove();
          this.imagePager = new CustomImagePager({
            props: {
              srcs: galleryDownloader.result.images,
              page: footerThumbnailView.index,
            },
            layout: (make, view) => {
              make.left.right.inset(2);
              make.top.bottom.inset(0);
            },
            events: {
              changed: (page) => this.handleTurnPage(page)
            }
          })
          sender.add(this.imagePager.definition)
          $delay(0.3, () => {
            if (!this.imagePager) return;
            define(
              this.imagePager.view.ocValue(),
              location => {
                if (!this.imagePager) return;
                if (location.x < sender.frame.width / 3) {
                  if (footerThumbnailView.index === 0) return;
                  this.handleTurnPage(footerThumbnailView.index - 1);
                } else if (location.x > sender.frame.width / 3 * 2) {
                  if (footerThumbnailView.index === this.imagePager.srcs.length - 1) return;
                  this.handleTurnPage(footerThumbnailView.index + 1);
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
      viewer,
      footerThumbnailView
    }
    this.rootView.views = [viewer, header, footer]
  }

  refreshCurrentPage() {
    if (!this.imagePager) return;
    if (!this.imagePager.srcs[this.imagePager.page].path) {
      this.imagePager.srcs = downloaderManager.get(this.gid).result.images;
    }
  }

  handleTurnPage(page: number) {
    if (this.cviews.footerThumbnailView.index !== page) this.cviews.footerThumbnailView.index = page;
    if (this.imagePager && this.imagePager.page !== page) this.imagePager.page = page;
    this._autoPagerCountDown = this._autoPagerInterval;
    this.refreshCurrentPage();
    downloaderManager.get(this.gid).currentReadingIndex = Math.max(page - 1, 0);
  }
}
