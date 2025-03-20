import { EHListUploadItem, EHUploadList } from "ehentai-parser";
import { Base, Matrix } from "jsbox-cview";
import { catColor, catTranslations } from "../utils/glv";
import { toSimpleUTCTimeString } from "../utils/tools";
import { ScrollState } from "../types";

function _mapDataForMinimalLayout(item: EHListUploadItem) {
  return {
    minimal: { hidden: false },
    minimalFolder: { hidden: true },
    title_minimal: {
      text: item.title,
    },
    category_minimal: {
      text: catTranslations[item.public_category],
      bgcolor: catColor[item.public_category],
    },
    length_minimal: {
      text: item.length,
    },
    posted_time_minimal: {
      text: toSimpleUTCTimeString(item.added_time),
    },
  };
}

function _mapDataForMinimalFolderLayout(folder: { name: string; fid: number; count: number; collapsed: boolean }) {
  return {
    minimal: { hidden: true },
    minimalFolder: { hidden: false },
    minimalFolder_label: {
      text: `（${folder.count}）` + folder.name,
    },
    minimalFolder_icon: {
      symbol: folder.collapsed ? "chevron.down" : "chevron.up",
    },
  };
}

function _mapdataUpload(folders: EHUploadList["folders"]) {
  const mapped = [];
  for (const folder of folders) {
    mapped.push(_mapDataForMinimalFolderLayout(folder));
    if (!folder.collapsed) {
      for (const item of folder.items) {
        mapped.push(_mapDataForMinimalLayout(item));
      }
    }
  }
  return mapped;
}

// minimalLayout
const minimalLayoutProps = {
  spacing: 4,
  maxColumns: 1,
};

// minimalLayout的item高度随标题长度而改变
const minimalLayoutItemHeight = (itemWidth: number, title: string) => {
  return (
    Math.ceil(
      $text.sizeThatFits({
        text: title,
        width: itemWidth - 10,
        font: $font(14),
      }).height
    ) + 30
  );
};

// minimalFolderLayout
const minimalFolderLayoutProps = {
  spacing: 4,
  maxColumns: 1,
  fixedItemHeight: 36, // 固定高度
};

export class EHlistUploadView extends Base<UIView, UiTypes.ViewOptions> {
  private _itemSizeWidth: number = 0;
  private _totalWidth: number = 0;
  matrix: Matrix;

  private _uploadFolders: EHUploadList["folders"] = [];
  private _isPulling = false; // 是否处于下拉刷新状态
  private _isReachingBottom = false; // 是否处于到达底部后的加载状态
  private _contentOffsetChanged?: (scrollState: ScrollState) => void;
  _defineView: () => UiTypes.ViewOptions;

  constructor({
    searchBar,
    pulled,
    didSelect,
    didLongPress,
    didReachBottom,
    contentOffsetChanged,
    layout,
  }: {
    searchBar: Base<any, any>;
    pulled: () => Promise<void> | void;
    didSelect: (sender: EHlistUploadView, indexPath: NSIndexPath, item: EHListUploadItem) => Promise<void> | void;
    didLongPress: (sender: EHlistUploadView, indexPath: NSIndexPath, item: EHListUploadItem) => void;
    didReachBottom: () => Promise<void> | void;
    contentOffsetChanged?: (scrollState: ScrollState) => void;
    layout: (make: MASConstraintMaker, view: UIView) => void;
  }) {
    super();
    this._contentOffsetChanged = contentOffsetChanged;
    this.matrix = new Matrix({
      props: {
        bgcolor: $color("clear"),
        data: [],
        spacing: 4,
        header: {
          type: "view",
          props: {
            height: 41,
          },
          views: [searchBar.definition],
        },
        footer: {
          type: "label",
          props: {
            id: this.id + "matrix-footer",
            height: 25,
            text: "",
            align: $align.center,
            font: $font(12),
            lines: 2,
          },
        },
        template: {
          props: {
            cornerRadius: 5,
            smoothCorners: true,
          },
          views: [
            {
              type: "view",
              props: {
                bgcolor: $color("primarySurface", "tertiarySurface"),
                id: "minimal",
              },
              layout: $layout.fill,
              views: [
                {
                  // 底下部分
                  type: "view",
                  props: {},
                  layout: (make, view) => {
                    make.left.bottom.right.inset(0);
                    make.height.equalTo(20);
                  },
                  views: [
                    {
                      // 分类
                      type: "view",
                      props: {},
                      layout: (make, view) => {
                        make.left.top.bottom.inset(0);
                        make.width.equalTo(100);
                      },
                      views: [
                        {
                          type: "label",
                          props: {
                            id: "category_minimal",
                            textColor: $color("white"),
                            align: $align.center,
                            font: $font("bold", 12),
                            smoothCorners: true,
                            cornerRadius: 4,
                          },
                          layout: (make, view) => {
                            make.center.equalTo(view.super);
                            make.height.equalTo(18);
                            make.width.equalTo(80);
                          },
                        },
                      ],
                    },
                    {
                      // 页数
                      type: "view",
                      props: {},
                      layout: (make, view) => {
                        make.left.equalTo(view.prev.right);
                        make.width.equalTo(51);
                        make.top.bottom.inset(0);
                      },
                      views: [
                        {
                          type: "image",
                          props: {
                            symbol: "photo",
                            tintColor: $color("systemLink"),
                          },
                          layout: (make, view) => {
                            make.left.inset(0);
                            make.size.equalTo($size(16, 16));
                            make.centerY.equalTo(view.super);
                          },
                        },
                        {
                          type: "label",
                          props: {
                            id: "length_minimal",
                            align: $align.left,
                            font: $font(12),
                            smoothCorners: true,
                            cornerRadius: 4,
                          },
                          layout: (make, view) => {
                            make.width.equalTo(30);
                            make.right.inset(0);
                            make.centerY.equalTo(view.super);
                          },
                        },
                      ],
                    },
                    {
                      // 发布时间
                      type: "label",
                      props: {
                        id: "posted_time_minimal",
                        textColor: $color("primaryText"),
                        align: $align.center,
                        font: $font(12),
                      },
                      layout: (make, view) => {
                        make.left.equalTo(view.prev.right).inset(10);
                        make.width.equalTo(109);
                        make.height.equalTo(15);
                        make.centerY.equalTo(view.super);
                      },
                    },
                  ],
                },
                {
                  // 顶部标题
                  type: "label",
                  props: {
                    id: "title_minimal",
                    textColor: $color("primaryText"),
                    align: $align.left,
                    lines: 0,
                    font: $font(14),
                  },
                  layout: (make, view) => {
                    make.top.left.right.inset(5);
                    make.bottom.equalTo(view.prev.top).inset(5);
                  },
                },
              ],
            },
            {
              type: "view",
              props: {
                bgcolor: $color("clear"),
                id: "minimalFolder",
              },
              layout: $layout.fill,
              views: [
                {
                  type: "image",
                  props: {
                    id: "minimalFolder_icon",
                    tintColor: $color("systemLink"),
                    contentMode: 1,
                  },
                  layout: (make, view) => {
                    make.left.inset(3);
                    make.centerY.equalTo(view.super);
                    make.width.height.equalTo(18);
                  },
                },
                {
                  type: "label",
                  props: {
                    id: "minimalFolder_label",
                    font: $font("bold", 14),
                  },
                  layout: (make, view) => {
                    make.left.inset(24);
                    make.centerY.equalTo(view.super);
                    make.height.equalTo(view.super);
                    make.right.equalTo(view.super);
                  },
                },
              ],
            },
          ],
        },
      },
      layout: $layout.fill,
      events: {
        didScroll: (sender) => {
          const offsetY = sender.contentOffset.y;
          const spacing = 4;

          this._contentOffsetChanged?.({
            layout: "minimal",
            totalWidth: this._totalWidth,
            firstVisibleItemIndex: 0,
            offsetY,
          });
        },
        itemSize: (sender, indexPath) => {
          const r = this._findUploadFolders(indexPath.item);
          // 两种情况
          if (r.type === "folder") {
            // 1. folder标题行，内部处理
            return $size(this._itemSizeWidth, minimalFolderLayoutProps.fixedItemHeight);
          } else {
            // 2. item行
            const title = r.item.title;
            const itemSizeHeight = minimalLayoutItemHeight(this._itemSizeWidth, title);
            return $size(this._itemSizeWidth, itemSizeHeight);
          }
        },
        pulled: async (sender) => {
          if (this._isPulling || this._isReachingBottom) return;
          sender.beginRefreshing();
          this._isPulling = true;
          await pulled();
          if (this._isPulling) {
            sender.endRefreshing();
            this._isPulling = false;
          }
        },
        didReachBottom: async (sender) => {
          if (this._isReachingBottom || this._isPulling) {
            sender.endFetchingMore();
            return;
          }
          this._isReachingBottom = true;
          await didReachBottom();
          if (this._isReachingBottom) {
            sender.endFetchingMore();
            this._isReachingBottom = false;
          }
        },
        didSelect: async (sender, indexPath, data) => {
          const r = this._findUploadFolders(indexPath.item);
          // 两种情况
          if (r.type === "folder") {
            // 1. 点了folder标题行，内部处理
            const folder = this._uploadFolders.find((n) => n.fid === r.fid);
            if (!folder) return;
            folder.collapsed = !folder.collapsed;
            this.matrix.view.data = _mapdataUpload(this._uploadFolders);
          } else {
            // 2. 点了item行
            await didSelect(this, indexPath, r.item);
          }
        },
        didLongPress: async (sender, indexPath, data) => {
          const r = this._findUploadFolders(indexPath.item);
          // 两种情况
          if (r.type === "folder") {
            // 1. 点了folder标题行
            return;
          } else {
            // 2. 点了item行
            await didLongPress(this, indexPath, r.item);
          }
        },
      },
    });
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          hidden: true,
        },
        layout,
        events: {
          layoutSubviews: (sender) => {
            sender.relayout();
            if (sender.frame.width === this._totalWidth) return;
            this._totalWidth = sender.frame.width;
            this.reload();
          },
        },
        views: [this.matrix.definition],
      };
    };
  }

  reload() {
    this._itemSizeWidth = this._totalWidth - 8;
    this.matrix.view.reload();
  }

  updateScrollState(scrollState: ScrollState) {
    if (scrollState.layout === "minimal") {
      if (scrollState.totalWidth === this._totalWidth) {
        this.matrix.view.contentOffset = $point(0, scrollState.offsetY);
      } else {
        this.matrix.view.contentOffset = $point(0, 0);
      }
    }
  }

  set uploadFolders(folders: EHUploadList["folders"]) {
    this._uploadFolders = folders;
    if (this._isPulling) this.matrix.view.endRefreshing();
    if (this._isReachingBottom) this.matrix.view.endFetchingMore();
    this.matrix.view.data = _mapdataUpload(folders);
  }

  get uploadFolders() {
    return this._uploadFolders;
  }

  private _findUploadFolders(
    index: number
  ): { type: "folder"; fid: number } | { type: "item"; item: EHListUploadItem } {
    let i = 0;
    for (const folder of this._uploadFolders) {
      if (i === index)
        return {
          type: "folder",
          fid: folder.fid,
        };
      i += 1;
      if (!folder.collapsed) {
        for (const item of folder.items) {
          if (i === index)
            return {
              type: "item",
              item,
            };
          i += 1;
        }
      }
    }
    throw Error("findUploadFolders error: out of range");
  }

  set footerText(text: string) {
    ($(this.id + "matrix-footer") as UILabelView).text = text;
  }

  get footerText() {
    return ($(this.id + "matrix-footer") as UILabelView).text;
  }
}
