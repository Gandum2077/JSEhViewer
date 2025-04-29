import { Base } from "jsbox-cview";

/**
 * 图片浏览组件，纵向滑动
 * 和customImagePager拥有相同的属性和事件，但是必须实现一个额外的事件rowHeight
 *
 */
export class VerticalImagePager extends Base<UIListView, UiTypes.ListOptions> {
  private _props: {
    srcs: {
      path?: string;
      error: boolean;
      errorName?: string;
      type: "ai-translated" | "reloaded" | "normal";
    }[];
    page: number;
  };

  private _imageShareOnLongPressEnabled: boolean;

  private _heights: number[];
  private _initialLayoutFinished: boolean = false;
  private _visiblePages: number[] = [];
  _defineView: () => UiTypes.ListOptions;

  /**
   *
   * @param props
   * - srcs: {path?: string, errorName?: string, error: boolean}[] - 图片地址列表
   * - page: number - 当前页码
   * @param layout
   * @param events
   * - changed: (page: number) => void - 页码变化时触发
   * - reloadHandler: (page: number) => void - 重新加载图片的回调
   * - rowHeight: (page: number) => number - 当前页面应有的高度
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
    };
    layout: (make: MASConstraintMaker, view: UIListView) => void;
    events: {
      changed?: (page: number) => void;
      reloadHandler?: (page: number) => void;
      rowHeight: (page: number, width: number) => number;
    };
  }) {
    super();
    this._props = {
      srcs: props.srcs ?? [],
      page: props.page ?? 0,
    };

    this._imageShareOnLongPressEnabled = props.imageShareOnLongPressEnabled ?? true;
    this._heights = this._props.srcs.map(() => 0);
    this._defineView = () => {
      return {
        type: "list",
        props: {
          id: this.id,
          showsVerticalIndicator: false,
          showsHorizontalIndicator: false,
          data: this._props.srcs.map((n) => this._mapData(n)),
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
                type: "image",
                props: {
                  id: "image",
                  contentMode: $contentMode.scaleAspectFit,
                },
                layout: $layout.fill,
              },
            ],
          },
        },
        layout,
        events: {
          ready: (sender) => {
            if (sender.frame.width !== 0) {
              this._heights = this._heights.map((_, i) => {
                return events.rowHeight(i, sender.frame.width);
              });
              this.view.reload();
              this.page = this._props.page;
              this._initialLayoutFinished = true;
            } else {
              $delay(0.1, () => {
                this._heights = this._heights.map((_, i) => {
                  return events.rowHeight(i, sender.frame.width);
                });
                this.view.reload();
                this.page = this._props.page;
                this._initialLayoutFinished = true;
              });
            }
          },
          rowHeight: (sender, indexPath) => {
            return this._heights[indexPath.row] || 1000;
            // 此处不能填0或者很小的数字，否则的话所有的图片会全部挤在一起，把内存挤爆
          },
          didLongPress: (sender, indexPath, data) => {
            if (!this._imageShareOnLongPressEnabled) return;
            const path = this._props.srcs[indexPath.item].path;
            if (path) {
              const img = $file.read(path)?.image;
              if (img) $share.universal(img);
            }
          },
          didScroll: (sender) => {
            if (!this._initialLayoutFinished) return;
            const offsetY = sender.contentOffset.y;
            const frameHeight = sender.frame.height;
            let sum = 0;
            let page = 0;
            let flagAssignment = false;
            for (let i = 0; i < this._heights.length; i++) {
              sum += this._heights[i];
              if (offsetY < sum) {
                page = i;
                flagAssignment = true;
                break;
              }
            }
            // 如果offsetY已经超过了全体高度，那么说明全部页面被滑动到可视范围外，此时依然设定为最后一页
            if (!flagAssignment) page = this._heights.length - 1;
            // 从当前页面开始往后，计算有多少页可见
            this._visiblePages = [page];
            for (let i = page + 1; i < this._heights.length; i++) {
              if (sum < offsetY + frameHeight) {
                this._visiblePages.push(i);
                sum += this._heights[i];
              }
            }

            if (page !== this._props.page) {
              this._props.page = page;
              events.changed?.(page);
            }
          },
        },
      };
    };
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
    this.view.data = data;
  }

  private _mapData(n: { path?: string; error: boolean; errorName?: string }) {
    if (n.path) {
      return {
        image: { src: n.path, hidden: false },
        error_view: { hidden: true },
        spinner: { loading: false, hidden: true },
      };
    } else if (n.error) {
      return {
        image: { src: "", hidden: true },
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
        image: { src: "", hidden: true },
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
    const offsetY = this._heights.slice(0, page).reduce((prev, curr) => prev + curr, 0);
    this.view.contentOffset = $point(0, offsetY + 1);
    this._props.page = page;
    this._visiblePages = [page];
    const frameHeight = this.view.frame.height;
    let sum = offsetY + 1 + this._heights[page];
    // 从当前页面开始往后，计算有多少页可见
    for (let i = page + 1; i < this._heights.length; i++) {
      if (sum < offsetY + frameHeight) {
        this._visiblePages.push(i);
        sum += this._heights[i];
      }
    }
  }

  get prevPage() {
    if (this._props.page === 0) return;
    return this._props.page - 1;
  }

  get nextPage() {
    if (this._props.page >= this._props.srcs.length - 1) return;
    return this._props.page + 1;
  }

  get currentPages() {
    return [this._props.page];
  }

  get visiblePages() {
    if (this._visiblePages.length >= 1) {
      return this._visiblePages;
    } else {
      return this.currentPages;
    }
  }

  get isCurrentPagesAllLoaded() {
    return Boolean(this._props.srcs[this._props.page].path);
  }

  scrollToPage(page: number) {
    const offsetY = this._heights.slice(0, page).reduce((prev, curr) => prev + curr, 0);
    this.view.scrollToOffset($point(0, offsetY + 1));
    this._props.page = page;
  }
}
