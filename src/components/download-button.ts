import { Base } from "jsbox-cview";
import { defaultButtonColor } from "../utils/glv";

const downloadButtonSymbols = {
  pending: "arrowshape.down.circle",
  pause: "circle",
  downloading: "circle",
  finished: "checkmark.circle"
}

const downloadButtonTitles = {
  pending: "本地下载",
  pause: "已暂停",
  downloading: "下载中",
  finished: "完成"
}

const downloadButtonSymbolColors = {
  pending: defaultButtonColor,
  pause: $color("#ffb242"),
  downloading: $color("#ffb242"),
  finished: $color('#34C759', '#30D158')
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
  private _status: "pending" | "pause" | "downloading" | "finished";
  private _progress: number;  // 0-1
  constructor({
    status,
    progress,
    handler
  }: {
    status: "pending" | "pause" | "downloading" | "finished",
    progress: number,
    handler: (sender: DownloadButton, status: "pending" | "pause" | "downloading") => void
  }) {
    super();
    this._status = status;
    this._progress = progress;

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
            type: "image",
            props: {
              id: this.id + "icon",
              tintColor: downloadButtonSymbolColors[this._status],
              symbol: downloadButtonSymbols[this._status],
              contentMode: 2
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super)
              make.centerY.equalTo(view.super).offset(-10)
              make.size.equalTo($size(40, 40))
            }
          },
          {
            type: "label",
            props: {
              id: this.id + "progress",
              font: $font(10),
              textColor: $color("primaryText"),
              align: $align.center,
              hidden: this._status !== "downloading" && this._status !== "pause",
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

  set status(value: "pending" | "pause" | "downloading" | "finished") {
    this._status = value;
    ($(this.id + "icon") as UIImageView).symbol = downloadButtonSymbols[value];
    ($(this.id + "icon") as UIImageView).tintColor = downloadButtonSymbolColors[value];
    ($(this.id + "title") as UILabelView).text = downloadButtonTitles[value];
    ($(this.id + "progress") as UILabelView).hidden = value !== "downloading" && this._status !== "pause";
    ($(this.id + "progress") as UILabelView).text = _calDisplayProgress(this._progress);
  }

  get progress() {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = value;
    ($(this.id + "progress") as UILabelView).text = _calDisplayProgress(this._progress);
    if (value === 1) {
      this.status = "finished";
    }
  }
}
