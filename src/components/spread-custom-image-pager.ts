import { Base, Matrix } from "jsbox-cview";

/**
 * 图片浏览组件
 *
 * 与内置的Gallery组件相比，ImagePager组件可以动态刷新，适用于图片数量较多的场景，以及需要动态加载图片列表的场景
 *
 */
export class SpreadCustomImagePager extends Base<UIView, UiTypes.ViewOptions> {
  private _props: {
    srcs: {
      path?: string;
      error: boolean;
      errorName?: string;
      type: "ai-translated" | "reloaded" | "normal";
    }[];
    page: number;
  };
  private _matrix: Matrix;
  private _pageLoadRecorder: { [key: number]: boolean };

  private _imageShareOnLongPressEnabled: boolean;
  private _reversed: boolean;
  private _resortedPages: number[][];
  private _indexInResortedPages: number;

  private _skipFirstPage: boolean;
  private _skipLandscapePages: boolean;
  private _getEstimatedAspectRatio: (page: number) => number;

  _defineView: () => UiTypes.ViewOptions;

  /**
   *
   * @param props
   * - srcs: {path?: string, errorName?: string,error: boolean}[] - 图片地址列表
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
      reversed?: boolean;
      imageShareOnLongPressEnabled?: boolean;
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
    this._indexInResortedPages = this._getIndexInResortPages(props.page ?? 0);

    this._pageLoadRecorder = {};
    this._matrix = new Matrix({
      props: {
        direction: $scrollDirection.horizontal,
        pagingEnabled: true,
        alwaysBounceVertical: false,
        showsVerticalIndicator: false,
        showsHorizontalIndicator: false,
        template: {
          views: [
            {
              type: "view",
              props: {
                id: "section",
              },
              layout: $layout.fill,
              views: [
                {
                  type: "spinner",
                  props: {
                    id: "spinner",
                    loading: true,
                  },
                  layout: $layout.center,
                },
                {
                  type: "view",
                  props: {
                    id: "error_view",
                  },
                  layout: $layout.fill,
                  views: [
                    {
                      type: "label",
                      props: {
                        id: "error_label",
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
                        id: "reload_button",
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
                            id: "error_symbol",
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
                    id: "scroll",
                    zoomEnabled: true,
                    maxZoomScale: 3,
                    doubleTapToZoom: false,
                  },
                  layout: $layout.fill,
                  views: [
                    {
                      type: "image",
                      props: {
                        id: "image",
                        contentMode: $contentMode.scaleAspectFit,
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
                },
              ],
            },
            {
              type: "view",
              props: {
                id: "section1",
              },
              layout: (make, view) => {
                make.left.top.bottom.inset(0);
                make.width.equalTo(view.super).dividedBy(2);
              },
              views: [
                {
                  type: "spinner",
                  props: {
                    id: "spinner1",
                  },
                  layout: $layout.center,
                },
                {
                  type: "view",
                  props: {
                    id: "error_view1",
                    hidden: true,
                  },
                  layout: $layout.fill,
                  views: [
                    {
                      type: "label",
                      props: {
                        id: "error_label1",
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
                    id: "image_temp1",
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
                id: "section2",
              },
              layout: (make, view) => {
                make.right.top.bottom.inset(0);
                make.width.equalTo(view.super).dividedBy(2);
              },
              views: [
                {
                  type: "spinner",
                  props: {
                    id: "spinner2",
                  },
                  layout: $layout.center,
                },
                {
                  type: "view",
                  props: {
                    id: "error_view2",
                    hidden: true,
                  },
                  layout: $layout.fill,
                  views: [
                    {
                      type: "label",
                      props: {
                        id: "error_label2",
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
                    id: "image_temp2",
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
                id: "scroll1",
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
                        id: "image1",
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
                        id: "image2",
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
        },
        data: this._mapFullData(),
      },
      layout: $layout.fill,
      events: {
        ready: (sender) => {
          // 如果没有此处的relayout，则会出现莫名其妙的bug
          sender.relayout();
          if (!this._matrix.view) return;
          this.page = this.page;
          this.loadsrc(this.page);
        },
        itemSize: (sender, indexPath) => {
          return $size(sender.frame.width, sender.frame.height);
        },
        forEachItem: (view, indexPath) => {
          const scroll = view.get("scroll") as UIScrollView;
          if (scroll) scroll.zoomScale = 0;
          const scroll1 = view.get("scroll1") as UIScrollView;
          if (scroll1) scroll1.zoomScale = 0;
          //$delay(0.01, () => {});
        },
        willEndDragging: (sender, velocity, target) => {
          const oldPage = this.page;
          const indexInMatrix = Math.round(target.x / sender.frame.width);
          this._props.page = this._indexInMatrixToPage(indexInMatrix);
          this._indexInResortedPages = this._getIndexInResortPages(this._props.page);
          //this.loadsrc(this.page, true);
          if (oldPage !== this.page && events.changed) events.changed(this.page);
        },
        didScroll: (sender) => {
          if (this.nextPage !== undefined) this.loadsrc(this.nextPage, true);
          if (this.prevPage !== undefined) this.loadsrc(this.prevPage, true);
        },
      },
    });
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout,
        views: [this._matrix.definition],
        events: {
          layoutSubviews: (sender) => {
            this._pageLoadRecorder = {};
            sender.relayout();
            if (!this._matrix.view) return;
            this._matrix.view.reload();
            this.page = this.page;
            $delay(0.1, () => this.loadsrc(this.page, true));
            $delay(0.3, () => this.loadsrc(this.page, true));
          },
        },
      };
    };
  }

  private _mapFullData() {
    return (this._reversed ? this._resortedPages.toReversed() : this._resortedPages).map((n) => {
      if (n.length === 1) {
        return this._mapData(this._props.srcs[n[0]]);
      }
      if (this._reversed) {
        return this._mapData(this._props.srcs[n[1]], this._props.srcs[n[0]]);
      } else {
        return this._mapData(this._props.srcs[n[0]], this._props.srcs[n[1]]);
      }
    });
  }

  private _mapData(
    left: { path?: string; error: boolean; errorName?: string },
    right?: { path?: string; error: boolean; errorName?: string }
  ) {
    if (right === undefined) {
      if (left.path) {
        return {
          section: { hidden: false },
          section1: { hidden: true },
          section2: { hidden: true },
          scroll1: { hidden: true },
          image: { src: left.path },
          scroll: { hidden: false },
          error_view: { hidden: true },
          spinner: { loading: false, hidden: true },
        };
      } else if (left.error) {
        return {
          section: { hidden: false },
          section1: { hidden: true },
          section2: { hidden: true },
          scroll1: { hidden: true },
          image: { src: "" },
          scroll: { hidden: true },
          error_view: { hidden: false },
          error_label: {
            text:
              left.errorName === "EHBandwidthLimitExceededError"
                ? "509错误"
                : left.errorName === "EHServerError"
                ? "服务器错误"
                : "网络似乎不太给力◉_◉",
          },
          spinner: { loading: false, hidden: true },
        };
      } else {
        return {
          section: { hidden: false },
          section1: { hidden: true },
          section2: { hidden: true },
          scroll1: { hidden: true },
          image: { src: "" },
          scroll: { hidden: true },
          error_view: { hidden: true },
          spinner: { loading: true, hidden: false },
        };
      }
    }
    if (left.path && right.path) {
      return {
        section: { hidden: true },
        section1: { hidden: true },
        section2: { hidden: true },
        scroll1: { hidden: false },
        image1: { src: left.path },
        image2: { src: right.path },
      };
    }
    const data: any = {
      section: { hidden: true },
      section1: { hidden: false },
      section2: { hidden: false },
      scroll1: { hidden: true },
    };
    if (left.path) {
      data.spinner1 = { loading: false, hidden: true };
      data.error_view1 = { hidden: true };
      data.image_temp1 = { hidden: false, src: left.path };
    } else if (left.error) {
      data.spinner1 = { loading: false, hidden: true };
      data.error_view1 = { hidden: false };
      data.error_label1 = {
        text:
          left.errorName === "EHBandwidthLimitExceededError"
            ? "509错误"
            : left.errorName === "EHServerError"
            ? "服务器错误"
            : "网络似乎不太给力◉_◉",
      };
      data.image_temp1 = { hidden: true };
    } else {
      data.spinner1 = { loading: true, hidden: false };
      data.error_view1 = { hidden: true };
      data.image_temp1 = { hidden: true };
    }
    if (right.path) {
      data.spinner2 = { loading: false, hidden: true };
      data.error_view2 = { hidden: true };
      data.image_temp2 = { hidden: false, src: right.path };
    } else if (right.error) {
      data.spinner2 = { loading: false, hidden: true };
      data.error_view2 = { hidden: false };
      data.error_label2 = {
        text:
          right.errorName === "EHBandwidthLimitExceededError"
            ? "509错误"
            : right.errorName === "EHServerError"
            ? "服务器错误"
            : "网络似乎不太给力◉_◉",
      };
      data.image_temp2 = { hidden: true };
    } else {
      data.spinner2 = { loading: true, hidden: false };
      data.error_view2 = { hidden: true };
      data.image_temp2 = { hidden: true };
    }
    return data;
  }

  private loadsrc(page: number, forced = false) {
    if (page < 0 || page >= this._props.srcs.length) return;
    const cell = this._matrix.view.cell($indexPath(0, this._pageToIndexInMatrix(page)));
    if (!cell) return;
    const image = cell.get("image") as UIImageView;
    if (forced || !image.image || !this._pageLoadRecorder[page]) {
      const scroll = cell.get("scroll") as UIScrollView;
      if (scroll) scroll.zoomScale = 0;
      const scroll1 = cell.get("scroll1") as UIScrollView;
      if (scroll1) scroll1.zoomScale = 0;
      this._pageLoadRecorder[page] = true;
    }
  }

  private _indexInMatrixToPage(index: number) {
    const postiveIndex = this._reversed ? this._resortedPages.length - 1 - index : index;
    return this._resortedPages[postiveIndex][0];
  }

  private _pageToIndexInMatrix(page: number) {
    const index = this._getIndexInResortPages(page);
    return this._reversed ? this._resortedPages.length - 1 - index : index;
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
    this._matrix.view.data = this._mapFullData();
  }

  get page() {
    return this._props.page;
  }

  set page(page) {
    this._matrix.view.scrollTo({
      indexPath: $indexPath(0, this._pageToIndexInMatrix(page)),
      animated: false,
    });
    this._props.page = page;
    this._indexInResortedPages = this._getIndexInResortPages(this._props.page);
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

  scrollToPage(page: number) {
    this._matrix.view.scrollTo({
      indexPath: $indexPath(0, this._pageToIndexInMatrix(page)),
      animated: true,
    });
    this._props.page = page;
    this._indexInResortedPages = this._getIndexInResortPages(this._props.page);
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
}
