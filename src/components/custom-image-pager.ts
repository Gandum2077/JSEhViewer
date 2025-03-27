import { Base, Matrix } from "jsbox-cview";

/**
 * 图片浏览组件
 *
 * 与内置的Gallery组件相比，ImagePager组件可以动态刷新，适用于图片数量较多的场景，以及需要动态加载图片列表的场景
 *
 */
export class CustomImagePager extends Base<UIView, UiTypes.ViewOptions> {
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
    events = {},
  }: {
    props: {
      srcs?: {
        path?: string;
        error: boolean;
        errorName?: string;
        type: "ai-translated" | "reloaded" | "normal";
      }[];
      page?: number;
    };
    layout: (make: MASConstraintMaker, view: UIView) => void;
    events: {
      changed?: (page: number) => void;
      reloadHandler?: (page: number) => void;
    };
  }) {
    super();
    this._props = {
      srcs: [],
      page: 0,
      ...props,
    };
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
                },
              ],
            },
          ],
        },
        data: this._props.srcs.map((n) => this._mapData(n)),
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
          scroll.zoomScale = 0;
          //$delay(0.01, () => {});
        },
        willEndDragging: (sender, velocity, target) => {
          const oldPage = this.page;
          this._props.page = Math.round(target.x / sender.frame.width);
          //this.loadsrc(this.page, true);
          if (oldPage !== this.page && events.changed) events.changed(this.page);
        },
        didScroll: (sender) => {
          this.loadsrc(this.page + 1, true);
          this.loadsrc(this.page - 1, true);
        },
        didLongPress: (sender, indexPath, data) => {
          const path = this._props.srcs[indexPath.item].path;
          if (path) {
            const img = $file.read(path)?.image;
            if (img) $share.universal(img);
          }
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

  private loadsrc(page: number, forced = false) {
    if (page < 0 || page >= this._props.srcs.length) return;
    const cell = this._matrix.view.cell($indexPath(0, page));
    if (!cell) return;
    const image = cell.get("image") as UIImageView;
    if (forced || !image.image || !this._pageLoadRecorder[page]) {
      const scroll = cell.get("scroll") as UIScrollView;
      scroll.zoomScale = 0;
      this._pageLoadRecorder[page] = true;
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
    const data = srcs.map((n) => this._mapData(n));
    this._matrix.view.data = data;
  }

  private _mapData(n: { path?: string; error: boolean; errorName?: string }) {
    if (n.path) {
      return {
        image: { src: n.path },
        scroll: { hidden: false },
        error_view: { hidden: true },
        spinner: { loading: false, hidden: true },
      };
    } else if (n.error) {
      return {
        image: { src: "" },
        scroll: { hidden: true },
        error_view: { hidden: false },
        error_label: {
          text:
            n.errorName === "EHBandwidthLimitExceededError"
              ? "509错误"
              : n.errorName === "EHServerError"
              ? "服务器错误"
              : "网络似乎不太给力◉_◉",
        },
        spinner: { loading: false, hidden: true },
      };
    } else {
      return {
        image: { src: "" },
        scroll: { hidden: true },
        error_view: { hidden: true },
        spinner: { loading: true, hidden: false },
      };
    }
  }

  get page() {
    return this._props.page;
  }

  set page(page) {
    this._matrix.view.scrollTo({
      indexPath: $indexPath(0, page),
      animated: false,
    });
    this._props.page = page;
  }

  scrollToPage(page: number) {
    this._matrix.view.scrollTo({
      indexPath: $indexPath(0, page),
      animated: true,
    });
    this._props.page = page;
  }
}
