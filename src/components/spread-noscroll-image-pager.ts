import { Base } from "jsbox-cview";

/**
 * 图片浏览组件，但是不可滚动
 * 和customImagePager拥有相同的属性和事件
 *
 */
export class SpreadNoscrollImagePager extends Base<UIView, UiTypes.ViewOptions> {
  private _props: {
    srcs: {
      path?: string;
      error: boolean;
      errorName?: string;
      type: "ai-translated" | "reloaded" | "normal";
    }[];
    page: number;
  };
  private _resortedPages: number[][];
  private _indexInResortedPages: number;

  private _imageShareOnLongPressEnabled: boolean;
  private _reversed: boolean;
  private _skipFirstPage: boolean;
  private _skipLandscapePages: boolean;
  private _getEstimatedAspectRatio: (page: number) => number;
  _defineView: () => UiTypes.ViewOptions;

  /**
   *
   * @param props
   * - srcs: {path?: string, errorName?: string, error: boolean}[] - 图片地址列表
   * - page: number - 当前页码
   * @param layout
   * @param events
   * - changed: (page: number) => void - 页码变化时触发
   * - reloadHandler: (page: number) => void - 重新加载图片的回调
   */
  constructor({
    props,
    layout,
    events,
  }: {
    props: {
      srcs?: {
        path?: string;
        error: boolean;
        errorName?: string;
        type: "ai-translated" | "reloaded" | "normal";
      }[];
      page?: number;
      imageShareOnLongPressEnabled?: boolean;
      reversed?: boolean;
      skipFirstPage: boolean;
      skipLandscapePages: boolean;
    };
    layout: (make: MASConstraintMaker, view: UIView) => void;
    events: {
      changed?: (page: number) => void;
      reloadHandler?: (page: number) => void;
      getEstimatedAspectRatio: (page: number) => number;
    };
  }) {
    super();
    this._props = {
      srcs: props.srcs ?? [],
      page: props.page ?? 0,
    };

    this._imageShareOnLongPressEnabled = props.imageShareOnLongPressEnabled ?? true;
    this._reversed = props.reversed ?? false;
    this._skipFirstPage = props.skipFirstPage;
    this._skipLandscapePages = props.skipLandscapePages;
    this._getEstimatedAspectRatio = events.getEstimatedAspectRatio;
    this._resortedPages = this._resortPages();
    this._indexInResortedPages = this._getIndexInResortPages(this._props.page);

    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout,
        views: [
          {
            type: "view",
            props: {
              id: this.id + "section",
            },
            layout: $layout.fill,
            views: [
              {
                type: "spinner",
                props: {
                  id: this.id + "spinner",
                  loading: false,
                  hidden: true,
                },
                layout: $layout.center,
              },
              {
                type: "view",
                props: {
                  id: this.id + "error_view",
                  hidden: true,
                },
                layout: $layout.fill,
                views: [
                  {
                    type: "label",
                    props: {
                      id: this.id + "error_label",
                      textColor: $color("primaryText"),
                      align: $align.center,
                    },
                    layout: (make, view) => {
                      make.center.equalTo(view.super);
                    },
                  },
                  {
                    type: "button",
                    props: {
                      bgcolor: $color("clear"),
                    },
                    layout: (make, view) => {
                      make.centerX.equalTo(view.super);
                      make.bottom.equalTo(view.prev.top).inset(10);
                      make.size.equalTo($size(50, 50));
                    },
                    events: {
                      tapped: () => {
                        events.reloadHandler && events.reloadHandler(this.page);
                      },
                    },
                    views: [
                      {
                        type: "image",
                        props: {
                          symbol: "arrow.clockwise",
                          contentMode: $contentMode.scaleAspectFit,
                          tintColor: $color("systemLink"),
                        },
                        layout: (make, view) => {
                          make.center.equalTo(view.super);
                          make.size.equalTo($size(30, 30));
                        },
                      },
                    ],
                  },
                ],
              },
              {
                type: "scroll",
                props: {
                  id: this.id + "scroll",
                  zoomEnabled: true,
                  maxZoomScale: 3,
                  doubleTapToZoom: false,
                },
                layout: $layout.fill,
                views: [
                  {
                    type: "image",
                    props: {
                      id: this.id + "image",
                      contentMode: 1,
                    },
                    layout: (make, view) => {
                      // Note: 为什么需要这样布局
                      // JSBox中的双指缩放存在一个bug，如果在根视图渲染后通过`add`方法加入双指缩放视图，
                      // 会导致其中的image控件的大小不能和scroll控件同步，所以需要这样一个布局
                      // 如果在最开始，双指缩放视图作为子视图和根视图一起渲染，那么不需要为image控件写布局，JSBox会自动处理
                      make.center.equalTo(view.super);
                      make.height.equalTo(view.super.safeArea);
                      make.width.equalTo(view.super.safeArea);
                    },
                    events: {
                      longPressed: (sender) => {
                        if (!this._imageShareOnLongPressEnabled) return;
                        const page = this.currentPages[0];
                        const path = this._props.srcs[page].path;
                        if (path) {
                          const img = $file.read(path)?.image;
                          if (img) $share.universal(img);
                        }
                      },
                    },
                  },
                ],
                events: {
                  // Note: 为什么需要此ready事件（和上面的布局解释方案是为了解决同一个问题，所以注释掉）
                  // ready: sender => {
                  //   $(this.id + "image").frame = $rect(0, 0, sender.size.width, sender.size.height);
                  //   sender.zoomScale = 0;
                  // },
                },
              },
            ],
          },
          {
            type: "view",
            props: {
              id: this.id + "section1",
            },
            layout: (make, view) => {
              make.left.top.bottom.inset(0);
              make.width.equalTo(view.super).dividedBy(2);
            },
            views: [
              {
                type: "spinner",
                props: {
                  id: this.id + "spinner1",
                  loading: false,
                  hidden: true,
                },
                layout: $layout.center,
              },
              {
                type: "view",
                props: {
                  id: this.id + "error_view1",
                  hidden: true,
                },
                layout: $layout.fill,
                views: [
                  {
                    type: "label",
                    props: {
                      id: this.id + "error_label1",
                      textColor: $color("primaryText"),
                      align: $align.center,
                    },
                    layout: (make, view) => {
                      make.center.equalTo(view.super);
                    },
                  },
                  {
                    type: "button",
                    props: {
                      bgcolor: $color("clear"),
                    },
                    layout: (make, view) => {
                      make.centerX.equalTo(view.super);
                      make.bottom.equalTo(view.prev.top).inset(10);
                      make.size.equalTo($size(50, 50));
                    },
                    events: {
                      tapped: () => {
                        events.reloadHandler && events.reloadHandler(this.page);
                      },
                    },
                    views: [
                      {
                        type: "image",
                        props: {
                          symbol: "arrow.clockwise",
                          contentMode: $contentMode.scaleAspectFit,
                          tintColor: $color("systemLink"),
                        },
                        layout: (make, view) => {
                          make.center.equalTo(view.super);
                          make.size.equalTo($size(30, 30));
                        },
                      },
                    ],
                  },
                ],
              },
              {
                type: "image",
                props: {
                  id: this.id + "image_temp1",
                  contentMode: 1,
                },
                layout: (make, view) => {
                  make.right.inset(0);
                  make.top.bottom.inset(0);
                  make.width.lessThanOrEqualTo(view.super).priority(1000);
                  make.width
                    .equalTo(view.height)
                    .multipliedBy(1 / 1.4142)
                    .priority(999);
                },
                events: {
                  longPressed: (sender) => {
                    if (!this._imageShareOnLongPressEnabled) return;
                    const page = this.currentPages[this._reversed ? 1 : 0];
                    const path = this._props.srcs[page].path;
                    if (path) {
                      const img = $file.read(path)?.image;
                      if (img) $share.universal(img);
                    }
                  },
                },
              },
            ],
          },
          {
            type: "view",
            props: {
              id: this.id + "section2",
            },
            layout: (make, view) => {
              make.right.top.bottom.inset(0);
              make.width.equalTo(view.super).dividedBy(2);
            },
            views: [
              {
                type: "spinner",
                props: {
                  id: this.id + "spinner2",
                  loading: false,
                  hidden: true,
                },
                layout: $layout.center,
              },
              {
                type: "view",
                props: {
                  id: this.id + "error_view2",
                  hidden: true,
                },
                layout: $layout.fill,
                views: [
                  {
                    type: "label",
                    props: {
                      id: this.id + "error_label2",
                      textColor: $color("primaryText"),
                      align: $align.center,
                    },
                    layout: (make, view) => {
                      make.center.equalTo(view.super);
                    },
                  },
                  {
                    type: "button",
                    props: {
                      bgcolor: $color("clear"),
                    },
                    layout: (make, view) => {
                      make.centerX.equalTo(view.super);
                      make.bottom.equalTo(view.prev.top).inset(10);
                      make.size.equalTo($size(50, 50));
                    },
                    events: {
                      tapped: () => {
                        events.reloadHandler && events.reloadHandler(this.page);
                      },
                    },
                    views: [
                      {
                        type: "image",
                        props: {
                          symbol: "arrow.clockwise",
                          contentMode: $contentMode.scaleAspectFit,
                          tintColor: $color("systemLink"),
                        },
                        layout: (make, view) => {
                          make.center.equalTo(view.super);
                          make.size.equalTo($size(30, 30));
                        },
                      },
                    ],
                  },
                ],
              },
              {
                type: "image",
                props: {
                  id: this.id + "image_temp2",
                  contentMode: 1,
                },
                layout: (make, view) => {
                  make.left.inset(0);
                  make.top.bottom.inset(0);
                  make.width.lessThanOrEqualTo(view.super).priority(1000);
                  make.width
                    .equalTo(view.height)
                    .multipliedBy(1 / 1.4142)
                    .priority(999);
                },
                events: {
                  longPressed: (sender) => {
                    if (!this._imageShareOnLongPressEnabled) return;
                    const page = this.currentPages[this._reversed ? 0 : 1];
                    const path = this._props.srcs[page].path;
                    if (path) {
                      const img = $file.read(path)?.image;
                      if (img) $share.universal(img);
                    }
                  },
                },
              },
            ],
          },
          {
            type: "scroll",
            props: {
              id: this.id + "scroll1",
              zoomEnabled: true,
              maxZoomScale: 2,
              doubleTapToZoom: false,
            },
            layout: $layout.fill,
            views: [
              {
                type: "view",
                props: {},
                layout: (make, view) => {
                  make.left.inset(0);
                  make.centerY.equalTo(view.super);
                  make.width.equalTo(view.super);
                  make.height.equalTo(view.super);
                },
                views: [
                  {
                    type: "image",
                    props: {
                      id: this.id + "image1",
                      contentMode: 1,
                    },
                    layout: (make, view) => {
                      make.right.equalTo(view.super.centerX);
                      make.top.bottom.inset(0);
                      make.width.lessThanOrEqualTo(view.super).dividedBy(2).priority(1000);
                      make.width
                        .equalTo(view.height)
                        .multipliedBy(1 / 1.4142)
                        .priority(999);
                    },
                    events: {
                      longPressed: (sender) => {
                        if (!this._imageShareOnLongPressEnabled) return;
                        const page = this.currentPages[this._reversed ? 1 : 0];
                        const path = this._props.srcs[page].path;
                        if (path) {
                          const img = $file.read(path)?.image;
                          if (img) $share.universal(img);
                        }
                      },
                    },
                  },
                  {
                    type: "image",
                    props: {
                      id: this.id + "image2",
                      contentMode: 1,
                    },
                    layout: (make, view) => {
                      make.left.equalTo(view.super.centerX);
                      make.top.bottom.inset(0);
                      make.width.lessThanOrEqualTo(view.super).dividedBy(2).priority(1000);
                      make.width
                        .equalTo(view.height)
                        .multipliedBy(1 / 1.4142)
                        .priority(999);
                    },
                    events: {
                      longPressed: (sender) => {
                        if (!this._imageShareOnLongPressEnabled) return;
                        const page = this.currentPages[this._reversed ? 0 : 1];
                        const path = this._props.srcs[page].path;
                        if (path) {
                          const img = $file.read(path)?.image;
                          if (img) $share.universal(img);
                        }
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
        events: {
          layoutSubviews: (sender) => {
            if (sender.frame.width <= 0 || sender.frame.height <= 0) return;
          },
          ready: (sender) => {
            this._refresh();
          },
        },
      };
    };
  }

  // 刷新当前页面
  private _refreshData(
    left: { path?: string; error: boolean; errorName?: string },
    right?: { path?: string; error: boolean; errorName?: string }
  ) {
    if (right === undefined) {
      $(this.id + "section").hidden = false;
      $(this.id + "section1").hidden = true;
      $(this.id + "section2").hidden = true;
      $(this.id + "scroll1").hidden = true;
      if (left.path) {
        $(this.id + "spinner").hidden = true;
        ($(this.id + "spinner") as UISpinnerView).loading = false;
        $(this.id + "error_view").hidden = true;
        $(this.id + "scroll").hidden = false;
        ($(this.id + "image") as UIImageView).src = left.path;
        ($(this.id + "scroll") as UIScrollView).zoomScale = 0;
      } else if (left.error) {
        $(this.id + "spinner").hidden = true;
        ($(this.id + "spinner") as UISpinnerView).loading = false;
        $(this.id + "error_view").hidden = false;
        $(this.id + "scroll").hidden = true;

        ($(this.id + "error_label") as UILabelView).text =
          left.errorName === "EHBandwidthLimitExceededError"
            ? "509错误"
            : left.errorName === "EHServerError"
            ? "服务器错误"
            : "网络似乎不太给力◉_◉";
      } else {
        $(this.id + "spinner").hidden = false;
        ($(this.id + "spinner") as UISpinnerView).loading = true;
        $(this.id + "error_view").hidden = true;
        $(this.id + "scroll").hidden = true;
      }
      return;
    }
    if (left.path && right.path) {
      $(this.id + "section").hidden = true;
      $(this.id + "section1").hidden = true;
      $(this.id + "section2").hidden = true;
      $(this.id + "scroll1").hidden = false;
      ($(this.id + "image1") as UIImageView).src = left.path;
      ($(this.id + "image2") as UIImageView).src = right.path;
      ($(this.id + "scroll1") as UIScrollView).zoomScale = 0;
      return;
    } else {
      $(this.id + "section").hidden = true;
      $(this.id + "section1").hidden = false;
      $(this.id + "section2").hidden = false;
      $(this.id + "scroll1").hidden = true;
    }
    if (left.path) {
      $(this.id + "spinner1").hidden = true;
      ($(this.id + "spinner1") as UISpinnerView).loading = false;
      $(this.id + "error_view1").hidden = true;
      $(this.id + "image_temp1").hidden = false;
      ($(this.id + "image_temp1") as UIImageView).src = left.path;
    } else if (left.error) {
      $(this.id + "spinner1").hidden = true;
      ($(this.id + "spinner1") as UISpinnerView).loading = false;
      $(this.id + "error_view1").hidden = false;
      $(this.id + "image_temp1").hidden = true;
      ($(this.id + "error_label1") as UILabelView).text =
        left.errorName === "EHBandwidthLimitExceededError"
          ? "509错误"
          : left.errorName === "EHServerError"
          ? "服务器错误"
          : "网络似乎不太给力◉_◉";
    } else {
      $(this.id + "spinner1").hidden = false;
      ($(this.id + "spinner1") as UISpinnerView).loading = true;
      $(this.id + "error_view1").hidden = true;
      $(this.id + "scroll1").hidden = true;
      $(this.id + "image_temp1").hidden = true;
    }

    if (right.path) {
      $(this.id + "spinner2").hidden = true;
      ($(this.id + "spinner2") as UISpinnerView).loading = false;
      $(this.id + "error_view2").hidden = true;
      $(this.id + "image_temp2").hidden = false;
      ($(this.id + "image_temp2") as UIImageView).src = right.path;
    } else if (right.error) {
      $(this.id + "spinner2").hidden = true;
      ($(this.id + "spinner2") as UISpinnerView).loading = false;
      $(this.id + "error_view2").hidden = false;
      $(this.id + "image_temp2").hidden = true;
      ($(this.id + "error_label2") as UILabelView).text =
        right.errorName === "EHBandwidthLimitExceededError"
          ? "509错误"
          : right.errorName === "EHServerError"
          ? "服务器错误"
          : "网络似乎不太给力◉_◉";
    } else {
      $(this.id + "spinner2").hidden = false;
      ($(this.id + "spinner2") as UISpinnerView).loading = true;
      $(this.id + "error_view2").hidden = true;
      $(this.id + "scroll2").hidden = true;
      $(this.id + "image_temp2").hidden = true;
    }
  }

  get srcs() {
    return this._props.srcs;
  }

  set srcs(
    srcs: {
      path?: string;
      error: boolean;
      errorName?: string;
      type: "ai-translated" | "reloaded" | "normal";
    }[]
  ) {
    this._props.srcs = srcs;
    this._resortedPages = this._resortPages();
    this._indexInResortedPages = this._getIndexInResortPages(this._props.page);
    this._refresh();
  }

  get page() {
    return this._props.page;
  }

  set page(page) {
    if (this._props.page !== page) {
      this._props.page = page;
      this._indexInResortedPages = this._getIndexInResortPages(this._props.page);
      this._refresh();
    }
  }

  get prevPage() {
    if (this._indexInResortedPages === 0) return;
    return this._resortedPages[this._indexInResortedPages - 1][0];
  }

  get nextPage() {
    if (this._indexInResortedPages >= this._resortedPages.length - 1) return;
    return this._resortedPages[this._indexInResortedPages + 1][0];
  }

  get currentPages() {
    return this._resortedPages[this._indexInResortedPages];
  }

  get visiblePages() {
    // 获取当前可见的页面（为兼容vertical-image-pager而保留）
    return this.currentPages;
  }

  get isCurrentPagesAllLoaded() {
    return this._resortedPages[this._indexInResortedPages].map((num) => this._props.srcs[num]).every((n) => n.path);
  }

  private _resortPages() {
    const result: number[][] = [];
    let current: number[] = [];
    this._props.srcs.forEach((src, i) => {
      // 检测当前图片的长宽比是否合格
      const isInvalidAspectRatio =
        this._skipLandscapePages && (this._getEstimatedAspectRatio(i) > 1.7 || this._getEstimatedAspectRatio(i) < 1.2);
      if (current.length === 1 && isInvalidAspectRatio) {
        result.push(current);
        current = [];
      }
      current.push(i);
      if ((this._skipFirstPage && i === 0) || isInvalidAspectRatio || current.length === 2) {
        result.push(current);
        current = [];
      }
    });
    if (current.length > 0) {
      result.push(current);
    }
    return result;
  }

  private _getIndexInResortPages(page: number) {
    const index = this._resortedPages.findIndex((ns) => ns.includes(page));
    if (index === -1) throw new Error("invalid page");
    return index;
  }

  private _refresh() {
    const t = this._resortedPages[this._indexInResortedPages];
    if (t.length === 1) {
      this._refreshData(this._props.srcs[t[0]]);
    } else if (this._reversed) {
      this._refreshData(this._props.srcs[t[1]], this._props.srcs[t[0]]);
    } else {
      this._refreshData(this._props.srcs[t[0]], this._props.srcs[t[1]]);
    }
  }
}
