import { Base, BaseController, ContentView, CustomNavigationBar } from "jsbox-cview";
import { globalTimer } from "../utils/timer";
import { downloaderManager } from "../utils/api";
import { thumbnailPath } from "../utils/glv";

class DownloadList extends Base<UIListView, UiTypes.ListOptions> {
  _defineView: () => UiTypes.ListOptions;
  constructor() {
    super();
    this._defineView = () => {
      return {
        type: "list",
        props: {
          id: this.id,
          style: 2,
          rowHeight: 80,
          template: {
            props: {
              bgcolor: $color("tertiarySurface")
            },
            views: [
              {
                type: "image",
                props: {
                  id: "thumbnail",
                },
                layout: (make, view) => {
                  make.left.inset(0);
                  make.top.bottom.inset(2);
                  make.width.equalTo(70);
                }
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
                      lines: 3
                    },
                    layout: (make, view) => {
                      make.left.top.right.inset(0);
                      make.height.equalTo(51);
                    }
                  },
                  {
                    type: "progress",
                    props: {
                      id: "progress",
                    },
                    layout: (make, view) => {
                      make.left.right.bottom.inset(0);
                      make.height.equalTo(4);
                    }
                  },
                  {
                    type: "label",
                    props: {
                      id: "progressText",
                      font: $font(12),
                      textColor: $color("secondaryText")
                    },
                    layout: (make, view) => {
                      make.left.right.inset(0);
                      make.bottom.equalTo(view.prev.top).inset(2);
                      make.height.equalTo(14);
                    }
                  }
                ]
              }
            ]
          }
        },
        layout: (make, view) => {
          make.top.equalTo(view.prev.bottom);
          make.left.right.bottom.equalTo(view.super);
        }
      }
    }
  }

  updateData({ downloading, uploading }: {
    downloading: {
      title: string;
      finishedCount: number;
      totalCount: number;
      errorCount: number;
      gid: number;
      thumbnail?: string;
      paused: boolean;
    }[];
    uploading: {
      title: string;
      finishedCount: number;
      totalCount: number;
      errorCount: number;
      gid: number;
      thumbnail?: string;
      paused: boolean;
    }[];
  }) {
    // 下载
    const downloadingRows = downloading.map(n => {
      let progressText = '';
      if (n.finishedCount + n.errorCount === n.totalCount) {
        progressText += `已完成: ${n.finishedCount} / ${n.totalCount}`;
      } else if (n.paused) {
        progressText += `已暂停: ${n.finishedCount} / ${n.totalCount}`;
      } else {
        progressText += `下载中: ${n.finishedCount} / ${n.totalCount}`;
      }
      if (n.errorCount > 0) {
        progressText += `, 错误: ${n.errorCount}`;
      }

      const progressColor = (n.finishedCount + n.errorCount === n.totalCount) || !n.paused 
        ? $color('#34C759', '#30D158') // green
        : $color('#FFCC00', '#FFD60A'); // yellow
      return {
        thumbnail: { src: n.thumbnail },
        title: { text: n.title },
        progress: { 
          value: n.finishedCount / n.totalCount,
          progressColor
        },
        progressText: { text: progressText }
      }
    });
    // 上传
    const uploadingRows = uploading.map(n => {
      let progressText = '';
      if (n.finishedCount + n.errorCount === n.totalCount) {
        progressText += `已完成: ${n.finishedCount} / ${n.totalCount}`;
      } else if (n.paused) {
        progressText += `已暂停: ${n.finishedCount} / ${n.totalCount}`;
      } else {
        progressText += `上传中: ${n.finishedCount} / ${n.totalCount}`;
      }
      if (n.errorCount > 0) {
        progressText += `, 错误: ${n.errorCount}`;
      }

      const progressColor = (n.finishedCount + n.errorCount === n.totalCount) || !n.paused 
        ? $color('#34C759', '#30D158') // green
        : $color('#FFCC00', '#FFD60A'); // yellow
      return {
        thumbnail: { src: n.thumbnail },
        title: { text: n.title },
        progress: { 
          value: n.finishedCount / n.totalCount,
          progressColor
        },
        progressText: { text: progressText }
      }
    });
    const data = [];
    if (downloadingRows.length > 0) {
      data.push({
        title: "下载",
        rows: downloadingRows
      });
    }
    if (uploadingRows.length > 0) {
      data.push({
        title: "上传",
        rows: uploadingRows
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
          // 开启定时器任务，刷新下载列表和上传列表
          globalTimer.addTask({
            id: "settings-downloads-controller",
            handler: () => {
              this.scheduledRefresh();
            }
          })
        },
        didDisappear: () => {
          // 停止定时器任务
          globalTimer.removeTask("settings-downloads-controller");
        },
      }
    });
    const navbar = new CustomNavigationBar({
      props: {
        title: "下载管理",
        popButtonEnabled: true,
      },
    });
    const list = new DownloadList();
    const emptyView = new ContentView({
      props: {
        hidden: true,
        bgcolor: $color("insetGroupedBackground")
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "square.stack.3d.up.slash",
            tintColor: $color("systemPlaceholderText")
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super)
            make.centerY.equalTo(view.super).offset(-50)
            make.size.equalTo($size(100, 100))
          }
        },
        {
          type: "label",
          props: {
            id: "emptyLabel",
            text: "暂无任务",
            textColor: $color("systemPlaceholderText"),
            font: $font(20),
            align: $align.center
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super)
            make.top.equalTo(view.prev.bottom).inset(10)
          }
        }
      ],
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super)
        make.top.equalTo(view.prev)
      }
    })
    this.rootView.views = [navbar, list, emptyView]
    this.cviews = {
      navbar,
      list,
      emptyView
    }
  }

  scheduledRefresh() {
    // 先从下载管理器中获取正在进行的下载和上传任务, 并提取出需要展示的数据
    const downloading = [...downloaderManager.galleryDownloaders.values()]
      .filter(n => n.background)
      .map(n => {
        const title = n.infos.japanese_title || n.infos.english_title;
        const finishedCount = n.finishedOfImages;
        const totalCount = n.infos.length;
        const errorCount = n.result.images.filter(n => n.error).length;
        const gid = n.infos.gid;
        const thumbnail = n.result.topThumbnail.path;
        const paused = n.backgroundPaused;
        return {
          title,
          finishedCount,
          totalCount,
          errorCount,
          gid,
          thumbnail,
          paused
        }
      });
    const uploading = [...downloaderManager.galleryWebDAVUploaders.values()]
      .map(n => {
        const title = n.infos.japanese_title || n.infos.english_title;
        const finishedCount = n.finished;
        const totalCount = n.infos.length;
        const errorCount = n.result.upload.filter(n => n.error).length;
        const gid = n.gid;
        const thumbnail = thumbnailPath + `${gid}.jpg`;
        const paused = n.backgroundPaused;
        return {
          title,
          finishedCount,
          totalCount,
          errorCount,
          gid,
          thumbnail,
          paused
        }
      })

    this.cviews.list.updateData({
      downloading,
      uploading
    })

    if (downloading.length === 0 && uploading.length === 0) {
      this.cviews.emptyView.view.hidden = false;
    } else {
      this.cviews.emptyView.view.hidden = true;
    }
  }
}