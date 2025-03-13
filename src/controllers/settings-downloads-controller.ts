import {
  Base,
  BaseController,
  ContentView,
  CustomNavigationBar,
} from "jsbox-cview";
import { globalTimer } from "../utils/timer";
import { checkWebDAVAndCreateUploader, downloaderManager } from "../utils/api";
import { defaultButtonColor, thumbnailPath } from "../utils/glv";
import { GalleryController } from "./gallery-controller";

type DownloadingItemData = {
  type: "download";
  title: string;
  finishedCount: number;
  totalCount: number;
  errorCount: number;
  gid: number;
  token: string;
  thumbnail?: string;
  paused: boolean;
  fatalError: boolean;
  status: "finished" | "running" | "paused" | "error";
};

type UploadingItemData = {
  type: "upload";
  title: string;
  finishedCount: number;
  totalCount: number;
  errorCount: number;
  gid: number;
  token: string;
  thumbnail?: string;
  paused: boolean;
  fatalError: boolean;
  status: "finished" | "running" | "paused" | "error";
};

const colors = {
  green: $color("#34C759", "#30D158"),
  yellow: $color("#FFCC00", "#FFD60A"),
  red: $color("#FF3B30", "#FF453A"),
};

const symbols = {
  refresh: "arrow.clockwise.circle.fill",
  finished: "checkmark.circle.fill",
  pause: "pause.circle.fill",
  resume: "play.circle.fill",
};

class DownloadList extends Base<UIListView, UiTypes.ListOptions> {
  _defineView: () => UiTypes.ListOptions;
  constructor(refreshHandler: () => void) {
    super();
    this._defineView = () => {
      return {
        type: "list",
        props: {
          id: this.id,
          style: 2,
          rowHeight: 85,
          template: {
            props: {
              bgcolor: $color("tertiarySurface"),
            },
            views: [
              {
                type: "image",
                props: {
                  id: "thumbnail",
                },
                layout: (make, view) => {
                  make.left.inset(0);
                  make.top.bottom.inset(0);
                  make.width.equalTo(70);
                },
              },
              {
                type: "view",
                props: {},
                layout: (make, view) => {
                  make.left.equalTo(view.prev.right).inset(5);
                  make.right.inset(5);
                  make.top.inset(2);
                  make.bottom.inset(2);
                },
                views: [
                  {
                    type: "label",
                    props: {
                      id: "title",
                      font: $font(14),
                      lines: 3,
                    },
                    layout: (make, view) => {
                      make.left.top.right.inset(0);
                      make.height.equalTo(51);
                    },
                  },
                  {
                    type: "button",
                    props: {
                      id: "button",
                      bgcolor: $color("clear"),
                    },
                    layout: (make, view) => {
                      make.right.bottom.inset(0);
                      make.width.equalTo(35);
                      make.top.equalTo(view.prev.bottom);
                    },
                    events: {
                      tapped: (s) => {
                        const { row, section } = s.info.indexPath as {
                          row: number;
                          section: number;
                        };
                        const data = this.view.object($indexPath(section, row));
                        const info = data.info as
                          | DownloadingItemData
                          | UploadingItemData;
                        if (info.status === "finished") return;
                        if (info.type === "download") {
                          if (info.status === "paused") {
                            const d = downloaderManager.get(info.gid);
                            if (d) {
                              d.backgroundPaused = false;
                              downloaderManager.startOne(info.gid);
                            }
                          } else if (info.status === "running") {
                            downloaderManager.backgroundPause(info.gid);
                          } else if (info.status === "error") {
                            const oldInfos = downloaderManager.get(
                              info.gid
                            )!.infos;
                            downloaderManager.remove(info.gid);
                            downloaderManager.add(info.gid, oldInfos);
                            downloaderManager.startOne(info.gid);
                          }
                        } else {
                          if (info.status === "paused") {
                            const u =
                              downloaderManager.getGalleryWebDAVUploader(
                                info.gid
                              );
                            if (u) {
                              u.backgroundPaused = false;
                              downloaderManager.startGalleryWebDAVUploader(
                                info.gid
                              );
                            }
                          } else if (info.status === "running") {
                            downloaderManager.backgroundPauseGalleryWebDAVUploader(
                              info.gid
                            );
                          } else if (info.status === "error") {
                            const u =
                              downloaderManager.getGalleryWebDAVUploader(
                                info.gid
                              );
                            if (u) {
                              u.result.upload
                                .filter((item) => item.error)
                                .forEach((item) => {
                                  item.error = false;
                                  item.started = false;
                                });
                              downloaderManager.startGalleryWebDAVUploader(
                                info.gid
                              );
                            }
                          }
                        }
                        refreshHandler();
                      },
                    },
                    views: [
                      {
                        type: "image",
                        props: {
                          id: "buttonImage",
                          contentMode: 1,
                        },
                        layout: (make, view) => {
                          make.center.equalTo(view.super);
                          make.size.equalTo($size(25, 25));
                        },
                      },
                    ],
                  },
                  {
                    type: "view",
                    props: {},
                    layout: (make, view) => {
                      make.left.inset(0);
                      make.top.equalTo(view.prev);
                      make.bottom.inset(5);
                      make.right.equalTo(view.prev.left);
                    },
                    views: [
                      {
                        type: "progress",
                        props: {
                          id: "progress",
                        },
                        layout: (make, view) => {
                          make.left.right.bottom.inset(0);
                          make.height.equalTo(4);
                        },
                      },
                      {
                        type: "label",
                        props: {
                          id: "progressText",
                          font: $font(12),
                          textColor: $color("secondaryText"),
                        },
                        layout: (make, view) => {
                          make.left.right.inset(0);
                          make.bottom.equalTo(view.prev.top).inset(2);
                          make.height.equalTo(14);
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        layout: (make, view) => {
          make.top.equalTo(view.prev.bottom);
          make.left.right.bottom.equalTo(view.super);
        },
        events: {
          didSelect: (
            sender,
            indexPath,
            data: {
              info: DownloadingItemData | UploadingItemData;
            }
          ) => {
            const gid = data.info.gid;
            const token = data.info.token;
            const galleryController = new GalleryController(gid, token);
            galleryController.uipush({
              navBarHidden: true,
              statusBarStyle: 0,
            });
          },
        },
      };
    };
  }

  updateData({
    downloading,
    uploading,
  }: {
    downloading: DownloadingItemData[];
    uploading: UploadingItemData[];
  }) {
    // 下载
    const downloadingRows = downloading.map((n, i) => {
      let progressText = "";
      if (n.fatalError) {
        progressText = "致命错误，请检查网络后刷新";
      } else {
        progressText = `${n.finishedCount} / ${n.totalCount}`;
        if (n.errorCount > 0) {
          progressText += `, 错误: ${n.errorCount}`;
        }
      }
      const progressColor =
        n.status === "finished"
          ? colors.green
          : n.status === "error"
          ? colors.red
          : n.status === "paused"
          ? colors.yellow
          : colors.green;
      const buttonSymbol =
        n.status === "finished"
          ? symbols.finished
          : n.status === "error"
          ? symbols.refresh
          : n.status === "paused"
          ? symbols.resume
          : symbols.pause;
      const buttonColor =
        n.status === "finished" ? colors.green : defaultButtonColor;

      return {
        info: n,
        thumbnail: { src: n.thumbnail },
        title: { text: n.title },
        progress: {
          value: n.finishedCount / n.totalCount,
          progressColor,
        },
        progressText: { text: progressText },
        button: { info: { indexPath: { row: i, section: 0 } } },
        buttonImage: {
          symbol: buttonSymbol,
          tintColor: buttonColor,
        },
      };
    });
    // 上传
    const uploadingRows = uploading.map((n, i) => {
      let progressText = "";
      if (n.fatalError) {
        progressText = "致命错误，请检查网络后刷新";
      } else {
        progressText = `${n.finishedCount} / ${n.totalCount}`;
        if (n.errorCount > 0) {
          progressText += `, 错误: ${n.errorCount}`;
        }
      }

      const progressColor =
        n.status === "finished"
          ? colors.green
          : n.status === "error"
          ? colors.red
          : n.status === "paused"
          ? colors.yellow
          : colors.green;
      const buttonSymbol =
        n.status === "finished"
          ? symbols.finished
          : n.status === "error"
          ? symbols.refresh
          : n.status === "paused"
          ? symbols.resume
          : symbols.pause;
      const buttonColor =
        n.status === "finished" ? colors.green : defaultButtonColor;

      return {
        info: n,
        thumbnail: { src: n.thumbnail },
        title: { text: n.title },
        progress: {
          value: n.finishedCount / n.totalCount,
          progressColor,
        },
        progressText: { text: progressText },
        button: { info: { indexPath: { row: i, section: 1 } } },
        buttonImage: {
          symbol: buttonSymbol,
          tintColor: buttonColor,
        },
      };
    });
    const data = [];
    if (downloadingRows.length > 0) {
      data.push({
        title: "下载",
        rows: downloadingRows,
      });
    }
    if (uploadingRows.length > 0) {
      data.push({
        title: "上传",
        rows: uploadingRows,
      });
    }
    this.view.data = data;
  }
}

export class SettingsDownloadsController extends BaseController {
  cviews: {
    navbar: CustomNavigationBar;
    list: DownloadList;
    emptyView: ContentView;
  };
  constructor() {
    super({
      events: {
        didLoad: () => {
          this.scheduledRefresh();
        },
        didAppear: () => {
          this.scheduledRefresh();
          // 开启定时器任务，刷新下载列表和上传列表
          globalTimer.addTask({
            id: "settings-downloads-controller",
            handler: () => {
              this.scheduledRefresh();
            },
          });
        },
        didDisappear: () => {
          // 停止定时器任务
          globalTimer.removeTask("settings-downloads-controller");
        },
      },
    });
    const navbar = new CustomNavigationBar({
      props: {
        title: "下载管理",
        popButtonEnabled: true,
      },
    });
    const list = new DownloadList(() => {
      this.scheduledRefresh();
    });
    const emptyView = new ContentView({
      props: {
        hidden: true,
        bgcolor: $color("insetGroupedBackground"),
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "square.stack.3d.up.slash",
            tintColor: $color("systemPlaceholderText"),
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super);
            make.centerY.equalTo(view.super).offset(-50);
            make.size.equalTo($size(100, 100));
          },
        },
        {
          type: "label",
          props: {
            id: "emptyLabel",
            text: "暂无任务",
            textColor: $color("systemPlaceholderText"),
            font: $font(20),
            align: $align.center,
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super);
            make.top.equalTo(view.prev.bottom).inset(10);
          },
        },
      ],
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super);
        make.top.equalTo(view.prev);
      },
    });
    this.rootView.views = [navbar, list, emptyView];
    this.cviews = {
      navbar,
      list,
      emptyView,
    };
  }

  scheduledRefresh() {
    // 先从下载管理器中获取正在进行的下载和上传任务, 并提取出需要展示的数据
    const downloading = [...downloaderManager.galleryDownloaders.values()]
      .filter((n) => n.background)
      .map((n) => {
        const title = n.infos.japanese_title || n.infos.english_title;
        const finishedCount = n.finishedOfImages;
        const totalCount = n.infos.length;
        const errorCount = n.result.images.filter((n) => n.error).length;
        const gid = n.infos.gid;
        const token = n.infos.token;
        const thumbnail = n.result.topThumbnail.path;
        const paused = n.backgroundPaused;
        const fatalError =
          n.result.mpv.error || n.result.htmls.some((i) => i.error);
        let status: "finished" | "running" | "paused" | "error";
        if (finishedCount === totalCount) {
          status = "finished";
        } else if (
          (errorCount > 0 && finishedCount + errorCount === totalCount) ||
          fatalError
        ) {
          status = "error";
        } else if (paused) {
          status = "paused";
        } else {
          status = "running";
        }

        return {
          type: "download" as "download",
          title,
          finishedCount,
          totalCount,
          errorCount,
          gid,
          token,
          thumbnail,
          paused,
          fatalError,
          status,
        };
      });
    const uploading = [
      ...downloaderManager.galleryWebDAVUploaders.values(),
    ].map((n) => {
      const title = n.infos.japanese_title || n.infos.english_title;
      const finishedCount = n.finished;
      const totalCount = n.infos.length;
      const errorCount = n.result.upload.filter((n) => n.error).length;
      const gid = n.gid;
      const token = n.infos.token;
      const thumbnail = thumbnailPath + `${gid}.jpg`;
      const paused = n.backgroundPaused;
      const fatalError = n.result.mkdir.error || errorCount !== 0;
      let status: "finished" | "running" | "paused" | "error";
      if (finishedCount === totalCount) {
        status = "finished";
      } else if (
        (errorCount > 0 && finishedCount + errorCount === totalCount) ||
        fatalError
      ) {
        status = "error";
      } else if (paused) {
        status = "paused";
      } else {
        status = "running";
      }
      return {
        type: "upload" as "upload",
        title,
        finishedCount,
        totalCount,
        errorCount,
        gid,
        token,
        thumbnail,
        paused,
        fatalError,
        status,
      };
    });

    this.cviews.list.updateData({
      downloading,
      uploading,
    });

    if (downloading.length === 0 && uploading.length === 0) {
      this.cviews.emptyView.view.hidden = false;
    } else {
      this.cviews.emptyView.view.hidden = true;
    }
  }
}
