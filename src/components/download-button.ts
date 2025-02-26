import { Base } from "jsbox-cview";
import { defaultButtonColor } from "../utils/glv";

const downloadButtonSymbols = {
  pending: "arrowshape.down.circle",
  paused: "circle",
  downloading: "circle",
  finished: "checkmark.circle"
}

const downloadButtonTitles = {
  pending: "本地下载",
  paused: "已暂停",
  downloading: "下载中",
  finished: "完成"
}

const downloadButtonSymbolColors = {
  pending: defaultButtonColor,
  paused: $color("#ffb242"),
  downloading: $color('#34C759', '#30D158'),
  finished: $color('#34C759', '#30D158')
}

/**
 * 显示进度的圆环
 * 其构成为两个重叠的圆环，下层为灰色、完整圆环，上层为彩色、弧线
 * 其中上层的弧线由蒙版来实现
 * 
 * @param progress 0-1
 * @param paused 是否暂停(控制颜色)
 * @param size 圆环的尺寸，其中长宽必须相等，否则报错
 * @param hidden 是否隐藏
 * @param layout 布局，其中的尺寸需要和上面的size一致
 */
class ProgressArc extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _progress: number;
  private _paused: boolean;
  private _mask: UICanvasView;
  constructor({
    progress,
    paused,
    size,
    hidden,
    layout
  }: {
    progress: number,
    paused: boolean,
    size: JBSize,
    hidden: boolean,
    layout: (make: MASConstraintMaker, view: UIView) => void
  }) {
    super();
    this._progress = progress;
    this._paused = paused;
    this._mask = $ui.create({
      type: "canvas",
      props: {
        size,
      },
      events: {
        draw: (view, ctx) => {
          ctx.addLineToPoint(size.width / 2, 0);
          ctx.addArc(size.width / 2, size.height / 2, size.width / 2, -0.5 * Math.PI, (2 * this._progress - 0.5) * Math.PI, false);
          ctx.addLineToPoint(size.width / 2, size.height / 2);
          ctx.fillPath();
        }
      }
    });
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          userInteractionEnabled: false,
          hidden
        },
        layout,
        views: [
          {
            type: "image",
            props: {
              id: this.id + "background",
              symbol: "circle",
              tintColor: $color({
                light: "#B7BEC6",
                dark: "#303030",
                black: "#292929"
              }),
              contentMode: 2
            },
            layout: $layout.fill
          },
          {
            type: "image",
            props: {
              id: this.id + "progress",
              symbol: "circle",
              tintColor: this._paused ? downloadButtonSymbolColors.paused : downloadButtonSymbolColors.downloading,
              contentMode: 2
            },
            layout: $layout.fill,
            events: {
              ready: sender => {
                const layer = sender.ocValue().invoke("layer");
                const maskLayer = this._mask.ocValue().invoke("layer");
                layer.$setMask(maskLayer);
              }
            }
          }
        ]
      }
    }
  }

  get progress() {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = value;
    this._mask.invoke("setNeedsDisplay");
  }

  get paused() {
    return this._paused;
  }

  set paused(value: boolean) {
    this._paused = value;
    ($(this.id + "progress") as UIImageView).tintColor = this._paused ? downloadButtonSymbolColors.paused : downloadButtonSymbolColors.downloading;
  }
}


/**
 * 计算显示的进度
 * 多数情况下四舍五入，但是当四舍五入后为100%时，显示99%
 * @param progress 0-1
 * @returns 
 */
function _calDisplayProgress(progress: number) {
  if (progress === 1) return "100%";
  const roundedProgress = Math.round(progress * 100);
  return roundedProgress === 100 ? "99%" : `${roundedProgress}%`;
}

export class DownloadButton extends Base<UIButtonView, UiTypes.ButtonOptions> {
  _defineView: () => UiTypes.ButtonOptions;
  private _status: "pending" | "paused" | "downloading" | "finished";
  private _progress: number;  // 0-1
  private _progressArc: ProgressArc;
  constructor({
    status,
    progress,
    handler
  }: {
    status: "pending" | "paused" | "downloading" | "finished",
    progress: number,
    handler: (sender: DownloadButton, status: "pending" | "paused" | "downloading") => void
  }) {
    super();
    this._status = status;
    this._progress = progress;
    this._progressArc = new ProgressArc({
      progress: this._progress,
      paused: this._status === "paused",
      size: $size(40, 40),
      hidden: this._status !== "downloading" && this._status !== "paused",
      layout: $layout.fill
    });
    this._defineView = () => {
      return {
        type: "button",
        props: {
          id: this.id,
          bgcolor: $color("clear")
        },
        layout: $layout.fill,
        views: [
          {
            type: "view",
            props: {
              userInteractionEnabled: false
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super)
              make.centerY.equalTo(view.super).offset(-10)
              make.size.equalTo($size(40, 40))
            },
            views: [
              {
                type: "image",
                props: {
                  id: this.id + "icon",
                  tintColor: downloadButtonSymbolColors[this._status],
                  symbol: downloadButtonSymbols[this._status],
                  contentMode: 2,
                  hidden: this._status !== "finished" && this._status !== "pending"
                },
                layout: $layout.fill
              },
              this._progressArc.definition
            ]
          },
          {
            type: "label",
            props: {
              id: this.id + "progress",
              font: $font(10),
              textColor: $color("primaryText"),
              align: $align.center,
              hidden: this._status !== "downloading" && this._status !== "paused",
              text: _calDisplayProgress(this._progress)
            },
            layout: (make, view) => {
              make.center.equalTo(view.prev)
            }
          },
          {
            type: "label",
            props: {
              id: this.id + "title",
              font: $font(12),
              textColor: $color("primaryText"),
              align: $align.center,
              text: downloadButtonTitles[this._status]
            },
            layout: (make, view) => {
              make.left.right.inset(10)
              make.centerX.equalTo(view.super)
              make.top.equalTo(view.prev.prev.bottom).offset(5)
            }
          }
        ],
        events: {
          tapped: sender => {
            if (this._status !== "finished") handler(this, this._status);
          }
        }
      }
    }
  }

  get status() {
    return this._status;
  }

  set status(value: "pending" | "paused" | "downloading" | "finished") {
    this._status = value;
    if (value === "downloading" || value === "paused") {
      this._progressArc.view.hidden = false;
      this._progressArc.paused = value === "paused";
      $(this.id + "icon").hidden = true;
    } else {
      this._progressArc.view.hidden = true;
      $(this.id + "icon").hidden = false;
    }
    ($(this.id + "icon") as UIImageView).symbol = downloadButtonSymbols[value];
    ($(this.id + "icon") as UIImageView).tintColor = downloadButtonSymbolColors[value];
    ($(this.id + "title") as UILabelView).text = downloadButtonTitles[value];
    ($(this.id + "progress") as UILabelView).hidden = value !== "downloading" && this._status !== "paused";
    ($(this.id + "progress") as UILabelView).text = _calDisplayProgress(this._progress);
  }

  get progress() {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = value;
    ($(this.id + "progress") as UILabelView).text = _calDisplayProgress(this._progress);
    this._progressArc.progress = value;
    if (value === 1) {
      this.status = "finished";
    }
  }
}
