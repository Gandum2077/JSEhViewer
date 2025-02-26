import { Base } from "jsbox-cview";

const downloadButtonSymbolColors = {
  paused: $color("#ffb242"),
  downloading: $color('#34C759', '#30D158'),
  finished: $color('#34C759', '#30D158')
}

/**
 * 显示进度的圆环
 * 其构成为两个重叠的圆环，下层为灰色、完整圆环，上层为彩色、弧线+图案
 * 其中上层的弧线由蒙版来实现
 * 
 * @param progress 0-1
 * @param paused 是否暂停(只控制颜色、symbol)
 * @param size 圆环的尺寸，其中长宽必须相等，否则报错
 * @param layout 布局，其中的尺寸需要和上面的size一致
 */
class ProgressArc extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _progress: number;
  private _paused: boolean;
  private _mask: UICanvasView;
  constructor({
    hidden,
    progress,
    paused,
    size,
    layout
  }: {
    hidden: boolean,
    progress: number,
    paused: boolean,
    size: JBSize,
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
          const centerX = size.width / 2;
          const centerY = size.height / 2;
          const innerRadius = size.width / 2 - 6; // Radius of the cut-out
          const outerRadius = size.width / 2; // Radius of the full sector
          const startAngle = -Math.PI / 2;
          const endAngle = (2 * this._progress - 0.5) * Math.PI; // End angle (135 degrees)
          ctx.fillColor = $color('#FFCC00');

          // Draw outer arc
          ctx.beginPath();
          ctx.addArc(centerX, centerY, outerRadius, startAngle, endAngle, false);

          // Draw line to inner arc
          ctx.addLineToPoint(
            centerX + innerRadius * Math.cos(endAngle),
            centerY + innerRadius * Math.sin(endAngle)
          );

          // Draw inner arc (reverse direction)
          ctx.addArc(centerX, centerY, innerRadius, endAngle, startAngle, true);

          // Close the path and fill
          ctx.closePath();
          ctx.fillPath();

          ctx.beginPath();
          ctx.addRect($rect(centerX - 5, centerY - 5, 10, 10))
          ctx.closePath();
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
              tintColor: $color("#cccccc"),
              contentMode: 1
            },
            layout: $layout.fill
          },
          {
            type: "image",
            props: {
              id: this.id + "progress",
              symbol: this._paused
                ? "pause.circle"
                : "stop.circle",
              tintColor: this._paused
                ? downloadButtonSymbolColors.paused
                : downloadButtonSymbolColors.downloading,
              contentMode: 1
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

  private _refresh() {
    ($(this.id + "progress") as UIImageView).symbol = this._paused
      ? "pause.circle"
      : "stop.circle";
    ($(this.id + "progress") as UIImageView).tintColor = this._paused
      ? downloadButtonSymbolColors.paused
      : downloadButtonSymbolColors.downloading;
  }

  get progress() {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = value;
    this._mask.invoke("setNeedsDisplay");
    this._refresh()
  }

  get paused() {
    return this._paused;
  }

  set paused(value: boolean) {
    this._paused = value;
    this._refresh()
  }
}

/**
 * 
 */
export class DownloadButtonForReader extends Base<UIButtonView, UiTypes.ButtonOptions> {
  private _status: "paused" | "downloading" | "finished";
  private _progress: number;  // 0-1
  private _progressArc: ProgressArc;
  _defineView: () => UiTypes.ButtonOptions;
  constructor({
    progress,
    status,
    handler,
    layout
  }: {
    progress: number;
    status: "paused" | "downloading" | "finished";
    handler: (sender: DownloadButtonForReader, status: "paused" | "downloading") => void
    layout: (make: MASConstraintMaker, view: UIButtonView) => void;
  }) {
    super();
    this._progress = progress;
    this._status = status;
    if (this._progress === 1) this._status = "finished";
    this._progressArc = new ProgressArc({
      hidden: this._status === "finished",
      progress,
      paused: this._status === "paused",
      size: $size(25, 25),
      layout: (make, view) => {
        make.size.equalTo($size(25, 25));
        make.center.equalTo(view.super);
      }
    })
    this._defineView = () => ({
      type: "button",
      props: {
        id: this.id,
        bgcolor: $color("clear")
      },
      layout,
      views: [
        this._progressArc.definition,
        {
          type: "image",
          props: {
            id: this.id + "finished",
            symbol: "checkmark.circle",
            tintColor: downloadButtonSymbolColors.finished,
            contentMode: 1,
            hidden: this._status !== "finished"
          },
          layout: (make, view) => {
            make.size.equalTo($size(25, 25));
            make.center.equalTo(view.super);
          }
        }
      ],
      events: {
        tapped: sender => {
          if (this._status !== "finished") handler(this, this._status);
        }
      }
    })
  }

  get status() {
    return this._status;
  }

  set status(status: "paused" | "downloading" | "finished") {
    if (this._progress === 1) {
      this._status = "finished";
    } else {
      this._status = status;
    }
    this._progressArc.view.hidden = this._status === "finished";
    $(this.id + "finished").hidden = this._status !== "finished";
    this._progressArc.paused = this._status === "paused";
  }

  get progress() {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = value;
    if (this._progress === 1) this._status = "finished";
    this._progressArc.view.hidden = this._status === "finished";
    $(this.id + "finished").hidden = this._status !== "finished";
    this._progressArc.paused = this._status === "paused";
    this._progressArc.progress = this.progress;
  }
}