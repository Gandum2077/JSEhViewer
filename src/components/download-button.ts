import { Image, Base, Canvas, Label } from "jsbox-cview";
import { defaultButtonColor } from "../utils/glv";

const pauseColor = $color("#ffb242")
const downloadColor = $color("#8fce00")

/**
 * 这是用于显示下载进度的圆弧，可以设置进度和暂停状态
 * 
 * 为了让显示效果更加明显，所以需要设置一个displayProgress，让进度到最后的时候还能看出来没有完成
 */
class DownloadArc extends Base<UICanvasView, UiTypes.CanvasOptions> {
  _defineView: () => UiTypes.CanvasOptions;
  private _progress: number;
  private _pause: boolean;
  private _tintColor: UIColor;
  private _displayProgress: number;
  constructor(progress: number, pause = true) {
    super();
    this._progress = progress;
    this._displayProgress = this._calDisplayProgress(progress);
    this._pause = pause;
    this._tintColor = this._pause ? pauseColor : downloadColor;
    this._defineView = () => {
      return {
        type: "canvas",
        props: {
          id: this.id,
        },
        layout: (make, view) => {
          make.size.equalTo($size(50, 50))
          make.center.equalTo(view.super)
        },
        events: {
          draw: (view, ctx) => {
            ctx.strokeColor = this._tintColor;
            const radius = Math.min(view.frame.width, view.frame.height);
            ctx.setLineWidth(4);
            ctx.setLineCap(0);
            ctx.setLineJoin(1);
            ctx.addArc(
              radius / 2,
              radius / 2,
              radius / 2 - 5,
              - Math.PI * 0.5,
              Math.PI * (2 * this._displayProgress - 0.5),
              false
            );
            ctx.strokePath();
          }
        }
      }
    }
  }

  redraw() {
    this.view.ocValue().invoke("setNeedsDisplay");
  }

  get progress() {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = value;
    this._displayProgress = this._calDisplayProgress(value);
    this.redraw();
  }

  get pause() {
    return this._pause;
  }

  set pause(value: boolean) {
    this._pause = value;
    this._tintColor = this._pause ? pauseColor : downloadColor;
    this.redraw();
  }

  private _calDisplayProgress(value: number) {
    if (value === 1 || value === 0) return value;
    return value * 0.99;
  }
}

class DownloadSymbol extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _progress: number;
  private _status: "pending" | "pause" | "downloading" | "finished";
  private cviews: {
    bgcirclePending: Canvas;
    bgcircleDownloading: Canvas;
    arc: DownloadArc;
    pendingSymbol: Image;
    downloadingLabel: Label;
    pauseSymbol: Image;
    finishedSymbol: Canvas;
  }
  constructor(progress: number, status: "pending" | "pause" | "downloading" | "finished") {
    super();
    this._status = status;
    this._progress = progress;
    this.cviews = {} as {
      bgcirclePending: Canvas;
      bgcircleDownloading: Canvas;
      arc: DownloadArc;
      pendingSymbol: Image;
      downloadingLabel: Label;
      pauseSymbol: Image;
      finishedSymbol: Canvas;
    }
    this.cviews.arc = new DownloadArc(progress, status === "pause");
    this.cviews.bgcirclePending = new Canvas({
      props: {
        hidden: status !== "pending",
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50))
        make.center.equalTo(view.super)
      },
      events: {
        draw: (view, ctx) => {
          ctx.strokeColor = defaultButtonColor;
          const radius = Math.min(view.frame.width, view.frame.height);
          ctx.setLineWidth(4);
          ctx.setLineCap(0);
          ctx.setLineJoin(1);
          ctx.addArc(
            radius / 2,
            radius / 2,
            radius / 2 - 5,
            - Math.PI * 0.5,
            Math.PI * 1.5,
            false
          );
          ctx.strokePath();
        }
      }
    })
    this.cviews.bgcircleDownloading = new Canvas({
      props: {
        hidden: status === "pending"
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50))
        make.center.equalTo(view.super)
      },
      events: {
        draw: (view, ctx) => {
          ctx.strokeColor = $color("#systemGray5");
          const radius = Math.min(view.frame.width, view.frame.height);
          ctx.setLineWidth(4);
          ctx.setLineCap(1);
          ctx.setLineJoin(1);
          ctx.addArc(
            radius / 2,
            radius / 2,
            radius / 2 - 5,
            - Math.PI * 0.5,
            Math.PI * 1.5,
            false
          );
          ctx.strokePath();
        }
      }
    })
    this.cviews.pendingSymbol = new Image({
      props: {
        hidden: status !== "pending",
        tintColor: defaultButtonColor,
        symbol: "arrowshape.down.fill"
      },
      layout: (make, view) => {
        make.size.equalTo($size(22.5, 22.5))
        make.center.equalTo(view.super)
      }
    })
    this.cviews.pauseSymbol = new Image({
      props: {
        hidden: status !== "pause",
        tintColor: pauseColor,
        symbol: "pause.fill"
      },
      layout: (make, view) => {
        make.size.equalTo($size(20, 20))
        make.center.equalTo(view.super)
      }
    })
    this.cviews.finishedSymbol = new Canvas({
      props: {
        hidden: status !== "finished"
      },
      layout: (make, view) => {
        make.size.equalTo($size(20, 20))
        make.center.equalTo(view.super)
      },
      events: {
        draw: (view, ctx) => {
          ctx.strokeColor = downloadColor;
          ctx.setLineWidth(5);
          ctx.setLineCap(1);
          ctx.setLineJoin(1);
          ctx.beginPath();
          ctx.moveToPoint(12 / 5, 53 / 5);
          ctx.addLineToPoint(40 / 5, 89 / 5);
          ctx.addLineToPoint(88 / 5, 13 / 5);
          ctx.strokePath();
        }
      }
    })
    this.cviews.downloadingLabel = new Label({
      props: {
        hidden: status !== "downloading",
        text: `${Math.floor(progress * 100)}%`,
        font: $font("bold", 12),
        textColor: $color("primaryText"),
        align: $align.center
      },
      layout: (make, view) => {
        make.center.equalTo(view.super)
      }
    })
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout: (make, view) => {
          make.centerX.equalTo(view.super)
          make.centerY.equalTo(view.super).offset(-10)
          make.size.equalTo($size(50, 50))
        },
        views: [
          this.cviews.bgcirclePending.definition,
          this.cviews.bgcircleDownloading.definition,
          this.cviews.arc.definition,
          this.cviews.pendingSymbol.definition,
          this.cviews.pauseSymbol.definition,
          this.cviews.finishedSymbol.definition,
          this.cviews.downloadingLabel.definition
        ]
      }
    }
  }

  get status() {
    return this._status;
  }

  set status(value: "pending" | "pause" | "downloading" | "finished") {
    this._status = value;
    this.cviews.bgcirclePending.view.hidden = value !== "pending";
    this.cviews.bgcircleDownloading.view.hidden = value === "pending";
    this.cviews.arc.pause = value === "pause";
    this.cviews.pendingSymbol.view.hidden = value !== "pending";
    this.cviews.pauseSymbol.view.hidden = value !== "pause";
    this.cviews.finishedSymbol.view.hidden = value !== "finished";
    this.cviews.downloadingLabel.view.hidden = value !== "downloading";
  }

  get progress() {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = value;
    this.cviews.arc.progress = value;
    this.cviews.downloadingLabel.view.text = `${Math.floor(value * 100)}%`;
  }
}

export class DownloadButton extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private cviews: {
    symbol: DownloadSymbol;
    label: Label;
  }
  private _status: "pending" | "pause" | "downloading" | "finished";
  private _progress: number;
  constructor({
    status,
    progress,
    handler
  }: {
    status: "pending" | "pause" | "downloading" | "finished",
    progress: number,
    handler: (sender: DownloadButton, status: "pending" | "pause" | "downloading" | "finished") => void
  }) {
    super();
    this._status = status;
    this._progress = progress;
    this.cviews = {
      symbol: new DownloadSymbol(progress, status),
      label: new Label({
        props: {
          text: this._mapStatusToText(status),
          font: $font(12),
          textColor: $color("primaryText"),
          align: $align.center
        },
        layout: (make, view) => {
          make.left.right.inset(10)
          make.centerX.equalTo(view.super)
          make.top.equalTo(view.prev.bottom).offset(5)
        }
      })
    }

    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          userInteractionEnabled: true
        },
        layout: $layout.fill,
        views: [
          this.cviews.symbol.definition,
          this.cviews.label.definition
        ],
        events: {
          tapped: sender => {
            handler(this, this._status);
          }
        }
      }
    }
  }

  private _mapStatusToText(status: "pending" | "pause" | "downloading" | "finished") {
    switch (status) {
      case "pending":
        return "本地下载";
      case "pause":
        return "已暂停";
      case "downloading":
        return "下载中";
      case "finished":
        return "完成";
    }
  }

  get status() {
    return this._status;
  }

  set status(value: "pending" | "pause" | "downloading" | "finished") {
    this._status = value;
    this.cviews.symbol.status = value;
    this.cviews.label.view.text = this._mapStatusToText(value);
  }

  get progress() {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = value;
    this.cviews.symbol.progress = value;
    if (value === 1) {
      this.status = "finished";
    }
  }
}
