import { Base } from "jsbox-cview";

/**
 * 图片浏览组件，但是不可滚动
 * 和customImagePager拥有相同的属性和事件
 *
 */
export class NoscrollImagePager extends Base<UIView, UiTypes.ViewOptions> {
  private _props: {
    srcs: {
      path?: string;
      error: boolean;
      type: "ai-translated" | "reloaded" | "normal";
    }[];
    page: number;
  };
  _defineView: () => UiTypes.ViewOptions;

  /**
   *
   * @param props
   * - srcs: {path?: string, error: boolean}[] - 图片地址列表
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
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout,
        views: [
          {
            type: "spinner",
            props: {
              id: this.id + "spinner",
              loading: !this._props.srcs[this._props.page].path && !this._props.srcs[this._props.page].error,
              hidden: Boolean(this._props.srcs[this._props.page].path || this._props.srcs[this._props.page].error),
            },
            layout: $layout.center,
          },
          {
            type: "view",
            props: {
              id: this.id + "error_view",
              hidden: !this._props.srcs[this._props.page].error,
            },
            layout: $layout.fill,
            views: [
              {
                type: "label",
                props: {
                  text: "网络似乎不太给力◉_◉",
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
                  src: this._props.srcs[this._props.page].path,
                  contentMode: 1,
                },
                layout: (make, view) => {
                  // Note: 为什么需要这样布局
                  // JSBox中的双指缩放存在一个bug，如果在根视图渲染后通过`add`方法加入双指缩放视图，
                  // 会导致其中的image控件的大小不能和scroll控件同步，所以需要这样一个布局
                  // 如果在最开始，双指缩放视图作为子视图和根视图一起渲染，那么不需要为image控件写布局，JSBox会自动处理
                  make.top.left.equalTo(0);
                  make.height.equalTo(view.super);
                  make.width.equalTo(view.super);
                },
              },
            ],
            events: {
              // Note: 为什么需要此ready事件（和上面的布局解释方案是为了解决同一个问题，所以注释掉）
              // ready: sender => {
              //   $(this.id + "image").frame = $rect(0, 0, sender.size.width, sender.size.height);
              //   sender.zoomScale = 0;
              // },
              longPressed: () => {
                const path = this._props.srcs[this._props.page].path;
                if (path) {
                  const img = $file.read(path).image;
                  if (img) $share.universal(img);
                }
              },
            },
          },
        ],
      };
    };
  }

  // 刷新当前页面
  private _refreshData(n: { path?: string; error: boolean }) {
    if (n.error) {
      $(this.id + "spinner").hidden = true;
      ($(this.id + "spinner") as UISpinnerView).loading = false;
      $(this.id + "error_view").hidden = false;
      $(this.id + "scroll").hidden = true;
    } else if (n.path) {
      $(this.id + "spinner").hidden = true;
      ($(this.id + "spinner") as UISpinnerView).loading = false;
      $(this.id + "error_view").hidden = true;
      $(this.id + "scroll").hidden = false;
      ($(this.id + "image") as UIImageView).src = n.path;
    } else {
      $(this.id + "spinner").hidden = false;
      ($(this.id + "spinner") as UISpinnerView).loading = true;
      $(this.id + "error_view").hidden = true;
      $(this.id + "scroll").hidden = true;
    }
  }

  get srcs() {
    return this._props.srcs;
  }

  set srcs(
    srcs: {
      path?: string;
      error: boolean;
      type: "ai-translated" | "reloaded" | "normal";
    }[]
  ) {
    this._props.srcs = srcs;
    this._refreshData(this._props.srcs[this._props.page]);
  }

  get page() {
    return this._props.page;
  }

  set page(page) {
    if (this._props.page !== page) {
      this._props.page = page;
      ($(this.id + "scroll") as UIScrollView).zoomScale = 0;
      this._refreshData(this._props.srcs[this._props.page]);
    }
  }
}
