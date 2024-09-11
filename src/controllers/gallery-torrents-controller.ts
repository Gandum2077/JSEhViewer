import { Base, CustomNavigationBar, Label, PresentedPageController } from "jsbox-cview";
import { EHGallery, EHGalleryTorrent } from "ehentai-parser";
import { appLog, toSimpleUTCTimeString } from "../utils/tools";
import { api } from "../utils/api";

class TorrentList extends Base<UIListView, UiTypes.ListOptions> {
  _torrents: EHGalleryTorrent[] = [];
  _defineView: () => UiTypes.ListOptions;
  constructor() {
    super();
    this._defineView = () => {
      return {
        type: "list",
        props: {
          id: this.id,
          hidden: true,
          selectable: false,
          template: {
            views: [
              { // 下间部分
                type: "view",
                props: {},
                layout: (make, view) => {
                  make.left.right.inset(5);
                  make.bottom.inset(5);
                  make.height.equalTo(50);
                },
                views: [
                  {
                    type: "label",
                    props: {
                      id: "posted_time",
                      font: $font(14),
                      textColor: $color("primaryText"),
                    },
                    layout: (make, view) => {
                      make.left.bottom.inset(0);
                      make.height.equalTo(20);
                      make.width.equalTo(150);
                    }
                  },
                  {
                    type: "label",
                    props: {
                      id: "uploader",
                      font: $font(14),
                      textColor: $color("primaryText"),
                    },
                    layout: (make, view) => {
                      make.left.inset(0);
                      make.bottom.equalTo(view.prev.top);
                      make.height.equalTo(20);
                      make.width.equalTo(150);
                    }
                  },
                  {
                    type: "button",
                    props: {
                      id: "share_button",
                      symbol: "square.and.arrow.up.fill",
                      title: "分享",
                      bgcolor: $color("primarySurface"),
                      cornerRadius: 8,
                      smoothCorners: true,
                      borderWidth: 1,
                      borderColor: $color("systemLink"),
                      tintColor: $color("systemLink"),
                      titleColor: $color("systemLink"),
                      font: $font(15)
                    },
                    layout: (make, view) => {
                      make.size.equalTo($size(80, 30));
                      make.right.bottom.inset(5);
                    },
                    events: {
                      tapped: sender => {
                        const url = sender.info.url as string;
                        $share.sheet(url);
                      }
                    }
                  },
                  {
                    type: "button",
                    props: {
                      id: "copy_button",
                      symbol: "doc.on.doc",
                      title: "复制",
                      bgcolor: $color("primarySurface"),
                      cornerRadius: 8,
                      smoothCorners: true,
                      borderWidth: 1,
                      borderColor: $color("systemLink"),
                      tintColor: $color("systemLink"),
                      titleColor: $color("systemLink"),
                      font: $font(15)
                    },
                    layout: (make, view) => {
                      make.size.equalTo($size(80, 30));
                      make.bottom.inset(5);
                      make.right.equalTo(view.prev.left).inset(10);
                    },
                    events: {
                      tapped: sender => {
                        const url = sender.info.url as string;
                        $clipboard.text = url;
                        $ui.toast("链接已复制到剪贴板");
                      }
                    }
                  }
                ]
              },
              { // 中面部分
                type: "view",
                props: {
                  
                },
                layout: (make, view) => {
                  make.left.right.inset(5);
                  make.bottom.equalTo(view.prev.top);
                  make.height.equalTo(30);
                },
                views: [
                  {
                    type: "view",
                    props: {},
                    layout: (make, view) => {
                      make.left.inset(0);
                      make.centerY.equalTo(view.super);
                      make.height.equalTo(20);
                      make.width.equalTo(70);
                    },
                    views: [
                      {
                        type: "image",
                        props: {
                          symbol: "arrow.up.circle.fill",
                          tintColor: $color("secondaryText")
                        },
                        layout: (make, view) => {
                          make.left.inset(0);
                          make.centerY.equalTo(view.super);
                          make.size.equalTo($size(20, 20));
                        }
                      },
                      {
                        type: "label",
                        props: {
                          id: "seeds",
                          font: $font(12),
                          textColor: $color("secondaryText")
                        },
                        layout: (make, view) => {
                          make.left.equalTo(view.prev.right).inset(5);
                          make.centerY.equalTo(view.super);
                        }
                      }
                    ]
                  },
                  {
                    type: "view",
                    props: {},
                    layout: (make, view) => {
                      make.left.equalTo(view.prev.right).inset(0);
                      make.centerY.equalTo(view.super);
                      make.height.equalTo(20);
                      make.width.equalTo(70);
                    },
                    views: [
                      {
                        type: "image",
                        props: {
                          symbol: "arrow.down.circle.fill",
                          tintColor: $color("secondaryText")
                        },
                        layout: (make, view) => {
                          make.left.inset(0);
                          make.centerY.equalTo(view.super);
                          make.size.equalTo($size(20, 20));
                        }
                      },
                      {
                        type: "label",
                        props: {
                          id: "peers",
                          font: $font(12),
                          textColor: $color("secondaryText")
                        },
                        layout: (make, view) => {
                          make.left.equalTo(view.prev.right).inset(5);
                          make.centerY.equalTo(view.super);
                        }
                      }
                    ]
                  },
                  {
                    type: "view",
                    props: {},
                    layout: (make, view) => {
                      make.left.equalTo(view.prev.right).inset(0);
                      make.centerY.equalTo(view.super);
                      make.height.equalTo(20);
                      make.width.equalTo(70);
                    },
                    views: [
                      {
                        type: "image",
                        props: {
                          symbol: "checkmark.circle.fill",
                          tintColor: $color("secondaryText")
                        },
                        layout: (make, view) => {
                          make.left.inset(0);
                          make.centerY.equalTo(view.super);
                          make.size.equalTo($size(20, 20));
                        }
                      },
                      {
                        type: "label",
                        props: {
                          id: "downloads",
                          font: $font(12),
                          textColor: $color("secondaryText")
                        },
                        layout: (make, view) => {
                          make.left.equalTo(view.prev.right).inset(5);
                          make.centerY.equalTo(view.super);
                        }
                      }
                    ]
                  },
                  {
                    type: "view",
                    props: {},
                    layout: (make, view) => {
                      make.left.equalTo(view.prev.right).inset(0);
                      make.centerY.equalTo(view.super);
                      make.height.equalTo(20);
                      make.right.inset(0);
                    },
                    views: [
                      {
                        type: "image",
                        props: {
                          symbol: "circle.circle.fill",
                          tintColor: $color("secondaryText")
                        },
                        layout: (make, view) => {
                          make.left.inset(0);
                          make.centerY.equalTo(view.super);
                          make.size.equalTo($size(20, 20));
                        }
                      },
                      {
                        type: "label",
                        props: {
                          id: "size",
                          font: $font(12),
                          textColor: $color("secondaryText")
                        },
                        layout: (make, view) => {
                          make.left.equalTo(view.prev.right).inset(5);
                          make.centerY.equalTo(view.super);
                        }
                      }
                    ]
                  }
                ]
              },
              { // 上面部分
                type: "label",
                props: {
                  id: "title",
                  font: $font(16),
                  lines: 0
                },
                layout: (make, view) => {
                  make.left.right.inset(5);
                  make.top.inset(10);
                  make.bottom.equalTo(view.prev.top).inset(5);
                }
              }
            ]
          },
          data: []
        },
        layout: (make, view) => {
          make.top.equalTo(view.prev.bottom);
          make.left.right.bottom.equalTo(view.super.safeArea);
        },
        events: {
          rowHeight: (sender, indexPath) => {
            const title = this._torrents[indexPath.row].title;
            const titleSize = $text.sizeThatFits({
              text: title,
              width: sender.frame.width - 10, // 10 是文字左右两边的间距
              font: $font(16)
            })
            console.log(sender.frame.width, titleSize);
            return Math.ceil(titleSize.height) + 55 + 30 + 15; // 80 是中间+下面部分的高度，10 是上下两边的间距
          }
        }
      };
    };
  }

  set torrents(torrents: EHGalleryTorrent[]) {
    this._torrents = torrents;
    this.view.data = torrents.map(torrent => ({
      title: {
        text: torrent.title
      },
      uploader: {
        text: torrent.uploader
      },
      posted_time: {
        text: toSimpleUTCTimeString(torrent.posted_time)
      },
      size: {
        text: torrent.size
      },
      seeds: {
        text: torrent.seeds.toString()
      },
      peers: {
        text: torrent.peers.toString()
      },
      downloads: {
        text: torrent.downloads.toString()
      },
      copy_button: {
        info: { url: torrent.url }
      },
      share_button: {
        info: { url: torrent.url }
      }
    }));
  }

  get torrents() {
    return this._torrents;
  }
}

export class GalleryTorrentsController extends PresentedPageController {
  private _info: EHGallery;
  cviews: {
    navbar: CustomNavigationBar,
    placeholderLabel: Label,
    list: TorrentList
  };
  constructor(info: EHGallery) {
    super({
      props: {},
      events: {
        didLoad: async () => {
          await this.getTorrents()
        }
      }
    });
    this._info = info;
    const navbar = new CustomNavigationBar({
      props: {
        style: 2,
        title: "种子",
        leftBarButtonItems: [{
          symbol: "xmark",
          handler: () => {
            this.dismiss()
          }
        }]
      }
    })

    const placeholderLabel = new Label({
      props: {
        text: "加载中...",
        font: $font(16),
        align: $align.center
      },
      layout: (make, view) => {
        make.center.equalTo(view.prev);
      }
    });
    const list = new TorrentList();
    this.cviews = { navbar, placeholderLabel, list };
    this.rootView.views = [navbar, list, placeholderLabel];
  }

  async getTorrents() {
    let torrents: EHGalleryTorrent[] | undefined;
    try {
      torrents = await api.getGalleryTorrentsInfo(this._info.gid, this._info.token)
      console.log(torrents);
    } catch (e) {
      appLog(e, "error");
      this.cviews.placeholderLabel.view.text = "加载失败!";
    }
    if (torrents) {
      this.cviews.list.torrents = torrents;
      this.cviews.list.view.hidden = false;
      this.cviews.placeholderLabel.view.hidden = true;
    }
  }
}