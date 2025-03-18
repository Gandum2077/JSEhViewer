import { Base } from "jsbox-cview";

const statusColor = {
  error: $color("#FF3B30", "#FF453A"), // red
  warning: $color("#FFCC00", "#FFD60A"), // yellow
  loading: $color("#FFCC00", "#FFD60A"), // yellow
  connected: $color("#34C759", "#30D158"), // green
};

const statusSymbol = {
  error: "xmark.circle.fill",
  warning: "exclamationmark.circle.fill",
  connected: "checkmark.circle.fill",
  loading: "ellipsis.circle.fill",
};

type WebDAVStatusOff = {
  // 是否开启
  // 如果开启了但是没有选择服务器，同样适用于没有开启
  on: false;
  message: "WebDAV未启用" | "未选择服务器";
  // 此种情况下serverStatus为warning
  // 此种情况下mainButton为隐藏
};

type WebDAVStatusError = {
  on: true;
  type: "error";
  serverName: string;
  message: string;
  // 此种情况下buttonTitle为重试
  //
};

type WebDAVStatusLoading = {
  on: true;
  type: "loading";
  serverName: string;
  // message: "连接中...";
  // 此种情况下mainButton为隐藏
};

type WebDAVStatusConnected = {
  on: true;
  type: "connected";
  serverName: string;
  // 接下来有三种情况:
  // 1. 服务器有完整图库，此时mainButton为隐藏，message为"查找到对应图库，将使用WebDAV的图库资源"
  // 2. 服务器没有完整的图库，且本地图库已经下载完成，此时mainButton为上传
  // 3. 服务器没有完整的图库，且本地图库没有下载完成，此时mainButton隐藏
  galleryStatusOnServer: "complete" | "none" | "incomplete";
  galleryStatusOnLocal: "complete" | "incomplete";
  uploadStatus?: "uploading" | "paused" | "failed" | "success";
};

export type WebDAVStatus = WebDAVStatusOff | WebDAVStatusError | WebDAVStatusLoading | WebDAVStatusConnected;

export class WebDAVWidget extends Base<UIView, UiTypes.ViewOptions> {
  private _hidden: boolean;
  private _mainButtonActionType: "upload" | "retry" | "retry-upload" | "resume-upload" | "pause" | undefined =
    undefined;
  _defineView: () => UiTypes.ViewOptions;
  constructor({
    mainButtonHandler,
    configButtonHandler,
    hidden,
  }: {
    mainButtonHandler: (action: "upload" | "retry" | "retry-upload" | "resume-upload" | "pause") => void;
    configButtonHandler: () => void;
    hidden: boolean;
  }) {
    super();
    this._hidden = hidden;
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        hidden,
        bgcolor: $color("clear"),
      },
      layout: $layout.fill,
      views: [
        {
          type: "view",
          props: {
            bgcolor: $color("tertiarySurface"),
            smoothCorners: true,
            cornerRadius: 8,
          },
          layout: $layout.fill,
          views: [
            {
              // 上半区域
              type: "view",
              props: {},
              layout: (make, view) => {
                make.top.inset(5);
                make.left.right.inset(0);
                make.height.equalTo(30);
              },
              views: [
                {
                  // 标题
                  type: "label",
                  props: {
                    text: "WebDAV",
                    textColor: $color("primaryText"),
                    font: $font("bold", 17),
                    align: $align.left,
                  },
                  layout: (make, view) => {
                    make.left.inset(15);
                    make.centerY.equalTo(view.super.centerY);
                    make.width.equalTo(80);
                  },
                },
                {
                  // 可点击区域: config_button
                  type: "button",
                  props: {
                    id: this.id + "configButton",
                    bgcolor: $color("clear"),
                  },
                  layout: (make, view) => {
                    make.right.inset(10);
                    make.top.bottom.inset(0);
                    make.width.equalTo(180);
                  },
                  events: {
                    tapped: (sender) => {
                      configButtonHandler();
                    },
                  },
                  views: [
                    {
                      type: "image",
                      props: {
                        symbol: "chevron.right",
                        tintColor: $color("lightGray", "darkGray"),
                        contentMode: 1,
                      },
                      layout: (make, view) => {
                        make.centerY.equalTo(view.super.centerY);
                        make.right.inset(0);
                        make.width.height.equalTo(17);
                      },
                    },
                    {
                      type: "label",
                      props: {
                        id: this.id + "serverName",
                        // text: "服务器名称", // 服务器名称, 点此进行设置
                        font: $font(14),
                        textColor: $color("secondaryText"),
                        //align: $align.right
                      },
                      layout: (make, view) => {
                        make.centerY.equalTo(view.super.centerY);
                        make.right.inset(18);
                        make.width.lessThanOrEqualTo(140);
                      },
                    },
                    {
                      type: "image",
                      props: {
                        id: this.id + "serverStatusSymbol",
                        // symbol: "xmark.circle.fill",  // ellipsis.circle.fill, checkmark.circle.fill, exclamationmark.circle.fill
                        contentMode: 1,
                        // tintColor: $color("#FF3B30")
                      },
                      layout: (make, view) => {
                        make.centerY.equalTo(view.super.centerY);
                        make.right.equalTo(view.prev.left).inset(3);
                        make.width.height.equalTo(15);
                      },
                    },
                  ],
                },
                {
                  // 分割线
                  type: "view",
                  props: {
                    bgcolor: $color("separator"),
                  },
                  layout: (make, view) => {
                    make.left.inset(10);
                    make.right.inset(10);
                    make.height.equalTo(1 / $device.info.screen.scale);
                    make.bottom.equalTo(view.super.bottom);
                  },
                },
              ],
            },
            {
              // 下半区域
              type: "view",
              props: {},
              layout: (make, view) => {
                make.left.right.bottom.inset(0);
                make.top.equalTo(view.prev.bottom);
              },
              views: [
                {
                  type: "label",
                  props: {
                    id: this.id + "content",
                    // text: "错误: 400 Bad Request",
                    textColor: $color("primaryText"),
                    font: $font(14),
                    lines: 2,
                  },
                  layout: (make, view) => {
                    make.left.inset(15);
                    make.right.inset(95);
                    make.height.equalTo(34);
                    make.centerY.equalTo(view.super);
                  },
                },
                {
                  type: "button",
                  props: {
                    id: this.id + "mainButton",
                    // title: "设置",
                    bgcolor: $color("primarySurface"),
                    cornerRadius: 8,
                    smoothCorners: true,
                    borderWidth: 1,
                    borderColor: $color("systemLink"),
                    tintColor: $color("systemLink"),
                    titleColor: $color("systemLink"),
                    font: $font("bold", 15),
                  },
                  layout: (make, view) => {
                    make.size.equalTo($size(70, 30));
                    make.right.inset(15);
                    make.centerY.equalTo(view.super);
                  },
                  events: {
                    tapped: (sender) => {
                      if (this._mainButtonActionType) {
                        mainButtonHandler(this._mainButtonActionType);
                      }
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  }

  setStatus(status: WebDAVStatus) {
    if (!status.on) {
      this._setProps({
        serverName: "点此设置服务器",
        serverStatus: "warning",
        content: status.message,
        mainButtonHidden: true,
      });
      this._mainButtonActionType = undefined;
    } else if (status.type === "error") {
      this._setProps({
        serverName: status.serverName,
        serverStatus: "error",
        content: "错误: " + status.message,
        mainButtonTitle: "重试",
        mainButtonHidden: false,
      });
      this._mainButtonActionType = "retry";
    } else if (status.type === "loading") {
      this._setProps({
        serverName: status.serverName,
        serverStatus: "loading",
        content: "连接中...",
        mainButtonHidden: true,
      });
      this._mainButtonActionType = undefined;
    } else {
      if (status.galleryStatusOnServer === "complete") {
        this._setProps({
          serverName: status.serverName,
          serverStatus: "connected",
          content: status.galleryStatusOnLocal === "complete" ? "已与服务器同步" : "服务器上已找到此图库",
          mainButtonHidden: true,
        });
        this._mainButtonActionType = undefined;
      } else {
        // 服务器上没有完整的图库
        let content = status.galleryStatusOnServer === "none" ? "服务器上未找到此图库" : "服务器上此图库不完整";
        if (status.galleryStatusOnLocal === "incomplete") {
          // 本地图库不完整
          this._setProps({
            serverName: status.serverName,
            serverStatus: "connected",
            content,
            mainButtonTitle: undefined,
            mainButtonHidden: true,
          });
          this._mainButtonActionType = undefined;
        } else {
          // 服务器上没有完整的图库，本地图库已经下载完成
          if (status.uploadStatus === "uploading") {
            this._setProps({
              serverName: status.serverName,
              serverStatus: "connected",
              content: "正在上传...",
              mainButtonTitle: "暂停",
              mainButtonHidden: false,
            });
            this._mainButtonActionType = "pause";
          } else if (status.uploadStatus === "failed") {
            this._setProps({
              serverName: status.serverName,
              serverStatus: "connected",
              content: "❌上传失败",
              mainButtonTitle: "重试",
              mainButtonHidden: false,
            });
            this._mainButtonActionType = "retry-upload";
          } else if (status.uploadStatus === "paused") {
            this._setProps({
              serverName: status.serverName,
              serverStatus: "connected",
              content: "上传暂停中",
              mainButtonTitle: "继续",
              mainButtonHidden: false,
            });
            this._mainButtonActionType = "resume-upload";
          } else if (status.uploadStatus === "success") {
            this._setProps({
              serverName: status.serverName,
              serverStatus: "connected",
              content: "已与服务器同步",
              mainButtonHidden: true,
            });
            this._mainButtonActionType = undefined;
          } else {
            this._setProps({
              serverName: status.serverName,
              serverStatus: "connected",
              content,
              mainButtonTitle: "上传",
              mainButtonHidden: false,
            });
            this._mainButtonActionType = "upload";
          }
        }
      }
    }
  }

  private _setProps({
    serverName,
    serverStatus,
    content,
    mainButtonTitle,
    mainButtonHidden,
  }: {
    serverName?: string;
    serverStatus: "connected" | "loading" | "error" | "warning";
    content: string;
    mainButtonTitle?: "上传" | "重试" | "继续" | "暂停";
    mainButtonHidden?: boolean;
  }) {
    ($(this.id + "serverName") as UILabelView).text = serverName || "点此设置服务器";
    ($(this.id + "serverStatusSymbol") as UIImageView).symbol = statusSymbol[serverStatus];
    ($(this.id + "serverStatusSymbol") as UIImageView).tintColor = statusColor[serverStatus];
    ($(this.id + "content") as UILabelView).text = content;
    ($(this.id + "mainButton") as UIButtonView).title = mainButtonTitle || "";
    ($(this.id + "mainButton") as UIButtonView).hidden = mainButtonHidden ?? false;
  }

  heightToWidth(width: number) {
    return this._hidden ? 0.1 : 90;
  }
}
