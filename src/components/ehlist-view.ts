import {
  EHListCompactItem,
  EHListExtendedItem,
  EHListMinimalItem,
  EHListThumbnailItem,
  EHTagListItem,
} from "ehentai-parser";
import { Base, Matrix } from "jsbox-cview";
import { configManager } from "../utils/config";
import {
  catColor,
  catTranslations,
  favcatColor,
  languageAbbreviates,
  languageCustomSort,
  languageTagColor,
  namespaceTranslations,
  ratingColor,
  tagBgcolor,
  thumbnailPath,
} from "../utils/glv";
import { toSimpleUTCTimeString } from "../utils/tools";
import { ScrollState } from "../types";

type Items = EHListExtendedItem[] | EHListCompactItem[] | EHListThumbnailItem[] | EHListMinimalItem[];

function ratingToArray(rating: number): number[] {
  const result: number[] = [];
  let remain = rating;
  for (let i = 0; i < 5; i++) {
    if (remain >= 1) {
      result.push(1);
      remain -= 1;
    } else if (remain > 0) {
      result.push(remain);
      remain = 0;
    } else {
      result.push(0);
    }
  }
  return result;
}

function taglistToStyledText(taglist: EHTagListItem[]): UiTypes.StyledTextOptions {
  let text = "";
  let rangeLocation = 0;
  const styles: UiTypes.StyledTextOptions["styles"] = [];
  taglist.map(({ namespace, tags }, index) => {
    const namespaceTranslation = namespaceTranslations[namespace];
    text += namespaceTranslation + ":   ";
    rangeLocation += namespaceTranslation.length + 4;
    tags.forEach((tag, i) => {
      const translation = configManager.translate(namespace, tag) ?? tag;
      const markedTag = configManager.getMarkedTag(namespace, tag);
      if (markedTag) {
        styles.push({
          range: $range(rangeLocation, translation.length),
          bgcolor: markedTag.watched ? tagBgcolor.watched : markedTag.hidden ? tagBgcolor.hidden : tagBgcolor.marked,
        });
      }
      if (i === tags.length - 1) {
        text += translation;
        rangeLocation += translation.length;
      } else {
        text += translation + ", ";
        rangeLocation += translation.length + 2;
      }
    });
    if (index !== taglist.length - 1) {
      text += "\n";
      rangeLocation += 1;
    }
  });
  return {
    text,
    font: $font(12),
    color: $color("primaryText"),
    markdown: false,
    styles: styles,
  };
}

function _mapDataForLargeLayout(
  item: EHListExtendedItem | EHListCompactItem | EHListThumbnailItem | EHListMinimalItem
) {
  const uploaderText = item.type !== "thumbnail" ? item.uploader : "";
  const disowned = item.type !== "thumbnail" ? item.disowned : false;
  const ratingArray = ratingToArray(item.estimated_display_rating);
  return {
    minimal: { hidden: true },
    normal: { hidden: true },
    large: { hidden: false },
    title_large: {
      text: item.title,
    },
    category_large: {
      text: catTranslations[item.category],
      bgcolor: catColor[item.category],
    },
    favorite_large: {
      bgcolor: item.favcat !== undefined ? favcatColor[item.favcat] : $color("clear"),
    },
    delete_line_large: {
      hidden: item.visible,
    },
    posted_time_large: {
      text: toSimpleUTCTimeString(item.posted_time),
    },
    star1_large: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[0] > 0 ? (ratingArray[0] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    star2_large: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[1] > 0 ? (ratingArray[1] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    star3_large: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[2] > 0 ? (ratingArray[2] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    star4_large: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[3] > 0 ? (ratingArray[3] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    star5_large: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[4] > 0 ? (ratingArray[4] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    length_large: {
      text: item.length,
    },
    thumbnail_large: {
      src: thumbnailPath + `${item.gid}.jpg`,
    },
    uploader_large: {
      text: disowned ? "(已放弃)" : uploaderText,
    },
    tags_large: {
      styledText: taglistToStyledText(item.taglist as EHTagListItem[]),
    },
  };
}

function _mapDataForNormalLayout(
  item: EHListExtendedItem | EHListCompactItem | EHListThumbnailItem | EHListMinimalItem
) {
  const ratingArray = ratingToArray(item.estimated_display_rating);

  let languageAbbr: string | undefined;
  let languageBgcolor: UIColor | undefined;
  const t = item.taglist
    .find((n) => n.namespace === "language")
    ?.tags.filter((n) => n in languageAbbreviates)
    .sort((a, b) => {
      const indexA = languageCustomSort.indexOf(a);
      const indexB = languageCustomSort.indexOf(b);
      if (indexA !== -1 && indexB === -1) return -1;
      if (indexA === -1 && indexB !== -1) return 1;
      return indexA - indexB;
    });
  if (t && t.length > 0) {
    const language = t[0];
    languageAbbr = languageAbbreviates[language].toUpperCase();
    if (language === "chinese" || language === "english" || language === "korean" || language === "japanese") {
      languageBgcolor = languageTagColor[language];
    } else {
      languageBgcolor = languageTagColor.other;
    }
  }

  return {
    minimal: { hidden: true },
    normal: { hidden: false },
    large: { hidden: true },
    title_normal: {
      text: item.title,
    },
    category_normal: {
      text: catTranslations[item.category],
      bgcolor: catColor[item.category],
    },
    favorite_normal: {
      bgcolor: item.favcat !== undefined ? favcatColor[item.favcat] : $color("clear"),
    },
    delete_line_normal: {
      hidden: item.visible,
    },
    posted_time_normal: {
      text: toSimpleUTCTimeString(item.posted_time),
    },
    language_normal: { hidden: !Boolean(languageAbbr) },
    language_bgview_normal: { bgcolor: languageBgcolor },
    language_label_normal: { text: languageAbbr },
    star1_normal: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[0] > 0 ? (ratingArray[0] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    star2_normal: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[1] > 0 ? (ratingArray[1] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    star3_normal: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[2] > 0 ? (ratingArray[2] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    star4_normal: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[3] > 0 ? (ratingArray[3] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    star5_normal: {
      tintColor: item.is_my_rating ? ratingColor : $color("orange"),
      symbol: ratingArray[4] > 0 ? (ratingArray[4] === 1 ? "star.fill" : "star.leadinghalf.filled") : "star",
    },
    length_normal: {
      text: item.length,
    },
    thumbnail_normal: {
      src: thumbnailPath + `${item.gid}.jpg`,
    },
  };
}

function _mapDataForMinimalLayout(
  item: EHListExtendedItem | EHListCompactItem | EHListThumbnailItem | EHListMinimalItem
) {
  let languageAbbr: string | undefined;
  let languageBgcolor: UIColor | undefined;
  const t = item.taglist
    .find((n) => n.namespace === "language")
    ?.tags.filter((n) => n in languageAbbreviates)
    .sort((a, b) => {
      const indexA = languageCustomSort.indexOf(a);
      const indexB = languageCustomSort.indexOf(b);
      if (indexA !== -1 && indexB === -1) return -1;
      if (indexA === -1 && indexB !== -1) return 1;
      return indexA - indexB;
    });
  if (t && t.length > 0) {
    const language = t[0];
    languageAbbr = languageAbbreviates[language].toUpperCase();
    if (language === "chinese" || language === "english" || language === "korean" || language === "japanese") {
      languageBgcolor = languageTagColor[language];
    } else {
      languageBgcolor = languageTagColor.other;
    }
  }

  return {
    minimal: { hidden: false },
    normal: { hidden: true },
    large: { hidden: true },
    category_minimal: {
      text: catTranslations[item.category],
      bgcolor: catColor[item.category],
    },
    language_minimal: { hidden: !Boolean(languageAbbr) },
    language_bgview_minimal: { bgcolor: languageBgcolor },
    language_label_minimal: { text: languageAbbr },
    length_minimal: {
      text: item.length,
    },
    thumbnail_minimal: {
      src: thumbnailPath + `${item.gid}.jpg`,
    },
  };
}

function _mapData(items: Items, layout: "large" | "normal" | "minimal") {
  if (items.length === 0) {
    return [];
  } else if (layout === "large") {
    return items.map((item) => {
      item = item as EHListExtendedItem | EHListCompactItem | EHListThumbnailItem | EHListMinimalItem;
      return _mapDataForLargeLayout(item);
    });
  } else if (layout === "normal") {
    return items.map((item) => {
      item = item as EHListExtendedItem | EHListCompactItem | EHListThumbnailItem | EHListMinimalItem;
      return _mapDataForNormalLayout(item);
    });
  } else if (layout === "minimal") {
    return items.map((item) => {
      item = item as EHListExtendedItem | EHListCompactItem | EHListThumbnailItem | EHListMinimalItem;
      return _mapDataForMinimalLayout(item);
    });
  } else {
    throw new Error("Invalid layout mode");
  }
}

function _getColumnsAndItemSizeWidth(
  containerWidth: number,
  minItemWidth: number,
  maxColumns: number,
  spacing: number
) {
  // 如果最大只有一列
  // 或者如果最小宽度超过了容器宽度，只能一列
  if (maxColumns === 1 || minItemWidth > containerWidth - 2 * spacing) {
    return {
      columns: 1,
      itemSizeWidth: containerWidth - 2 * spacing,
    };
  }
  const columns = Math.max(
    Math.min(Math.floor((containerWidth - spacing) / (minItemWidth + spacing)), maxColumns),
    1 // 最少一列
  );
  const itemSizeWidth = Math.max(
    Math.floor((containerWidth - spacing * (columns + 1)) / columns),
    minItemWidth // 最小宽度
  );
  return {
    columns,
    itemSizeWidth,
  };
}

const largeLayoutProps = {
  spacing: 4,
  minItemWidth: 365,
  fixedItemHeight: 200, // 固定高度
  maxColumns: 3,
};

const normalLayoutProps = {
  spacing: 4,
  minItemWidth: 180,
  maxColumns: 8,
};

const minimalLayoutProps = {
  spacing: 4,
  minItemWidth: 119,
  maxColumns: 20,
};

// normalLayout的item高度随宽度改变
const normalLayoutItemHeight = (itemWidth: number) => {
  return Math.round(itemWidth * 1.414) + 95;
};

// minimalLayout的item高度随宽度改变
const minimalLayoutItemHeight = (itemWidth: number) => {
  return Math.round(itemWidth * 1.414);
};

export class EHlistView extends Base<UIView, UiTypes.ViewOptions> {
  private _itemSizeWidth: number = 0;
  private _itemSizeHeight: number = 0;
  private _totalWidth: number = 0;
  matrix: Matrix;

  private _items: Items = [];
  private _layoutMode: "large" | "normal" | "minimal";
  private _isPulling = false; // 是否处于下拉刷新状态
  private _isReachingBottom = false; // 是否处于到达底部后的加载状态
  private _contentOffsetChanged?: (scrollState: ScrollState) => void;
  _defineView: () => UiTypes.ViewOptions;

  constructor({
    layoutMode,
    searchBar,
    readlaterHandler,
    removeFromArchiveHandler,
    pulled,
    didSelect,
    didReachBottom,
    contentOffsetChanged,
    layout,
  }: {
    layoutMode: "large" | "normal" | "minimal";
    searchBar: Base<any, any>;
    readlaterHandler?: (item: EHListExtendedItem | EHListCompactItem) => Promise<void> | void;
    removeFromArchiveHandler?: (item: EHListExtendedItem | EHListCompactItem) => Promise<void> | void;
    pulled: () => Promise<void> | void;
    didSelect: (sender: EHlistView, indexPath: NSIndexPath, item: Items[0]) => Promise<void> | void;
    didReachBottom: () => Promise<void> | void;
    contentOffsetChanged?: (scrollState: ScrollState) => void;
    layout: (make: MASConstraintMaker, view: UIView) => void;
  }) {
    super();
    this._layoutMode = layoutMode;
    this._contentOffsetChanged = contentOffsetChanged;
    const menuItems: UiTypes.ContextMenuSubItem[] = [];
    if (readlaterHandler) {
      menuItems.push({
        title: "稍后阅读",
        symbol: "bookmark",
        handler: (sender, indexPath) => {
          const item = this._items[indexPath.item] as EHListExtendedItem | EHListCompactItem;
          readlaterHandler(item);
        },
      });
    }
    if (removeFromArchiveHandler) {
      menuItems.push({
        title: "删除该记录",
        symbol: "trash",
        handler: (sender, indexPath) => {
          const item = this._items[indexPath.item] as EHListExtendedItem | EHListCompactItem;
          removeFromArchiveHandler(item);
        },
      });
    }
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
        menu: {
          items: menuItems,
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
                id: "large",
              },
              layout: $layout.fill,
              views: [
                {
                  // 右边部分
                  type: "view",
                  props: {},
                  layout: (make, view) => {
                    make.top.right.bottom.inset(0);
                    make.width.greaterThanOrEqualTo(223).priority(1000);
                    make.width.equalTo(view.super.width).offset(-142).priority(999);
                  },
                  views: [
                    {
                      // 标题
                      type: "label",
                      props: {
                        id: "title_large",
                        font: $font(14),
                        lines: 3,
                        align: $align.left,
                      },
                      layout: (make, view) => {
                        make.top.left.right.inset(2);
                        make.height.equalTo(51);
                      },
                    },
                    {
                      // 上传者和上传时间
                      type: "view",
                      props: {},
                      layout: (make, view) => {
                        make.left.right.inset(0);
                        make.top.equalTo(view.prev.bottom);
                        make.height.equalTo(20);
                      },
                      views: [
                        {
                          // 发布时间
                          type: "view",
                          props: {
                            id: "favorite_large",
                          },
                          layout: (make, view) => {
                            make.right.inset(5);
                            make.width.equalTo(111);
                            make.height.equalTo(17);
                            make.centerY.equalTo(view.super);
                          },
                          views: [
                            {
                              type: "label",
                              props: {
                                id: "posted_time_large",
                                textColor: $color("primaryText"),
                                align: $align.center,
                                font: $font(12),
                                bgcolor: $color("primarySurface", "tertiarySurface"),
                              },
                              layout: (make, view) => {
                                make.edges.insets($insets(1, 1, 1, 1));
                                make.centerY.equalTo(view.super);
                              },
                            },
                            {
                              type: "view",
                              props: {
                                id: "delete_line_large",
                                bgcolor: $color("red"),
                                alpha: 0.8,
                              },
                              layout: (make, view) => {
                                make.left.right.inset(0);
                                make.centerY.equalTo(view.super);
                                make.height.equalTo(1);
                              },
                            },
                          ],
                        },
                        {
                          // 上传者
                          type: "label",
                          props: {
                            id: "uploader_large",
                            font: $font(12),
                            textColor: $color("secondaryText"),
                          },
                          layout: (make, view) => {
                            make.left.inset(2);
                            make.centerY.equalTo(view.super);
                            make.right.equalTo(view.prev.left);
                          },
                        },
                      ],
                    },
                    {
                      // 标签
                      type: "text",
                      props: {
                        id: "tags_large",
                        bgcolor: $color("clear"),
                        editable: false,
                        selectable: false,
                      },
                      layout: (make, view) => {
                        make.left.right.inset(0);
                        make.top.equalTo(view.prev.bottom);
                        make.bottom.inset(20);
                      },
                    },
                    {
                      // 底栏
                      type: "view",
                      props: {},
                      layout: (make, view) => {
                        make.left.right.bottom.inset(0);
                        make.height.equalTo(20);
                      },
                      views: [
                        {
                          // 分类
                          type: "label",
                          props: {
                            id: "category_large",
                            textColor: $color("white"),
                            align: $align.center,
                            font: $font("bold", 12),
                            smoothCorners: true,
                            cornerRadius: 4,
                          },
                          layout: (make, view) => {
                            make.left.inset(2);
                            make.centerY.equalTo(view.super);
                            make.height.equalTo(18);
                            make.width.equalTo(80);
                          },
                        },
                        {
                          // 星级
                          type: "view",
                          props: {},
                          layout: (make, view) => {
                            make.centerY.equalTo(view.super);
                            make.centerX.equalTo(view.super).offset(13);
                            make.width.equalTo(75);
                            make.height.equalTo(20);
                          },
                          views: [
                            {
                              type: "stack",
                              props: {
                                axis: $stackViewAxis.horizontal,
                                distribution: $stackViewDistribution.fillEqually,
                                stack: {
                                  views: [
                                    {
                                      type: "image",
                                      props: {
                                        id: "star1_large",
                                        contentMode: 1,
                                      },
                                    },
                                    {
                                      type: "image",
                                      props: {
                                        id: "star2_large",
                                        contentMode: 1,
                                      },
                                    },
                                    {
                                      type: "image",
                                      props: {
                                        id: "star3_large",
                                        contentMode: 1,
                                      },
                                    },
                                    {
                                      type: "image",
                                      props: {
                                        id: "star4_large",
                                        contentMode: 1,
                                      },
                                    },
                                    {
                                      type: "image",
                                      props: {
                                        id: "star5_large",
                                        contentMode: 1,
                                      },
                                    },
                                  ],
                                },
                              },
                              layout: (make, view) => {
                                make.size.equalTo($size(75, 15));
                                make.center.equalTo(view.super);
                              },
                            },
                          ],
                        },
                        {
                          // 页数
                          type: "view",
                          props: {},
                          layout: (make, view) => {
                            make.right.inset(4);
                            make.centerY.equalTo(view.super);
                            make.width.equalTo(51);
                            make.height.equalTo(17);
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
                                id: "length_large",
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
                      ],
                    },
                  ],
                },
                {
                  // 缩略图
                  type: "image",
                  props: {
                    id: "thumbnail_large",
                    contentMode: 1,
                  },
                  layout: (make, view) => {
                    make.top.bottom.left.inset(0);
                    make.right.equalTo(view.prev.left);
                  },
                },
              ],
            },
            {
              type: "view",
              props: {
                bgcolor: $color("primarySurface", "tertiarySurface"),
                id: "normal",
              },
              layout: $layout.fill,
              views: [
                {
                  // 顶部标题
                  type: "label",
                  props: {
                    id: "title_normal",
                    textColor: $color("primaryText"),
                    align: $align.center,
                    lines: 3,
                    font: $font(14),
                  },
                  layout: (make, view) => {
                    make.top.left.right.inset(2);
                    make.height.equalTo(51);
                  },
                },
                {
                  // 分类
                  type: "view",
                  props: {},
                  layout: (make, view) => {
                    make.left.bottom.inset(0);
                    make.width.equalTo(view.super).dividedBy(2).offset(-15);
                    make.height.equalTo(20);
                  },
                  views: [
                    {
                      type: "label",
                      props: {
                        id: "category_normal",
                        textColor: $color("white"),
                        align: $align.center,
                        font: $font("bold", 12),
                        smoothCorners: true,
                        cornerRadius: 4,
                      },
                      layout: (make, view) => {
                        make.center.equalTo(view.super);
                        make.height.equalTo(18);
                        make.width.equalTo(70);
                      },
                    },
                  ],
                },
                {
                  // 星级
                  type: "view",
                  props: {},
                  layout: (make, view) => {
                    make.bottom.inset(0);
                    make.right.inset(25);
                    make.width.equalTo(view.super).dividedBy(2).offset(-10);
                    make.height.equalTo(20);
                  },
                  views: [
                    {
                      type: "stack",
                      props: {
                        axis: $stackViewAxis.horizontal,
                        distribution: $stackViewDistribution.fillEqually,
                        stack: {
                          views: [
                            {
                              type: "image",
                              props: {
                                id: "star1_normal",
                                contentMode: 1,
                              },
                            },
                            {
                              type: "image",
                              props: {
                                id: "star2_normal",
                                contentMode: 1,
                              },
                            },
                            {
                              type: "image",
                              props: {
                                id: "star3_normal",
                                contentMode: 1,
                              },
                            },
                            {
                              type: "image",
                              props: {
                                id: "star4_normal",
                                contentMode: 1,
                              },
                            },
                            {
                              type: "image",
                              props: {
                                id: "star5_normal",
                                contentMode: 1,
                              },
                            },
                          ],
                        },
                      },
                      layout: (make, view) => {
                        make.size.equalTo($size(75, 15));
                        make.center.equalTo(view.super);
                      },
                    },
                  ],
                },
                {
                  type: "view",
                  props: {
                    id: "language_normal",
                  },
                  layout: (make, view) => {
                    make.bottom.inset(0);
                    make.width.equalTo(16);
                    make.right.inset(5);
                    make.height.equalTo(20);
                  },
                  views: [
                    {
                      type: "view",
                      props: {
                        id: "language_bgview_normal",
                        cornerRadius: 8,
                        smoothCorners: true,
                      },
                      layout: (make, view) => {
                        make.center.equalTo(view.super);
                        make.width.height.equalTo(16);
                      },
                    },
                    {
                      type: "label",
                      props: {
                        id: "language_label_normal",
                        align: $align.center,
                        textColor: $color("white"),
                        font: $font("bold", 9),
                      },
                      layout: $layout.center,
                    },
                  ],
                },
                {
                  // 发布时间
                  type: "view",
                  props: {
                    id: "favorite_normal",
                  },
                  layout: (make, view) => {
                    make.left.inset(5);
                    make.width.equalTo(111);
                    make.height.equalTo(17);
                    make.bottom.inset(21);
                  },
                  views: [
                    {
                      type: "label",
                      props: {
                        id: "posted_time_normal",
                        textColor: $color("primaryText"),
                        align: $align.center,
                        font: $font(12),
                        bgcolor: $color("primarySurface", "tertiarySurface"),
                      },
                      layout: (make, view) => {
                        make.edges.insets($insets(1, 1, 1, 1));
                        make.centerY.equalTo(view.super);
                      },
                    },
                    {
                      type: "view",
                      props: {
                        id: "delete_line_normal",
                        bgcolor: $color("red"),
                        alpha: 0.8,
                      },
                      layout: (make, view) => {
                        make.left.right.inset(0);
                        make.centerY.equalTo(view.super);
                        make.height.equalTo(1);
                      },
                    },
                  ],
                },
                {
                  // 页数
                  type: "view",
                  props: {},
                  layout: (make, view) => {
                    make.right.inset(4);
                    make.width.equalTo(51);
                    make.height.equalTo(17);
                    make.bottom.inset(21);
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
                        id: "length_normal",
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
                  type: "image",
                  props: {
                    id: "thumbnail_normal",
                    contentMode: 1,
                  },
                  layout: (make, view) => {
                    make.left.right.inset(0);
                    make.top.inset(52);
                    make.bottom.inset(40);
                  },
                },
              ],
            },
            {
              type: "view",
              props: {
                bgcolor: $color("primarySurface", "tertiarySurface"),
                id: "minimal",
              },
              layout: $layout.fill,
              views: [
                {
                  type: "image",
                  props: {
                    id: "thumbnail_minimal",
                    contentMode: 2,
                  },
                  layout: $layout.fill,
                },
                {
                  type: "label",
                  props: {
                    id: "category_minimal",
                    textColor: $color("white"),
                    align: $align.center,
                    font: $font("bold", 10),
                    smoothCorners: true,
                    cornerRadius: 4,
                  },
                  layout: (make, view) => {
                    make.left.bottom.inset(2);
                    make.height.equalTo(14);
                    make.width.equalTo(49);
                  },
                },
                {
                  type: "blur",
                  props: {
                    style: 7,
                    smoothCorners: true,
                    cornerRadius: 4,
                  },
                  layout: (make, view) => {
                    make.left.equalTo(view.prev.right).inset(4);
                    make.bottom.inset(2);
                    make.height.equalTo(14);
                    make.width.equalTo(44);
                  },
                  views: [
                    {
                      type: "image",
                      props: {
                        symbol: "photo",
                        tintColor: $color("systemLink"),
                        contentMode: 1,
                      },
                      layout: (make, view) => {
                        make.left.inset(3);
                        make.size.equalTo($size(13, 13));
                        make.centerY.equalTo(view.super);
                      },
                    },
                    {
                      type: "label",
                      props: {
                        id: "length_minimal",
                        align: $align.center,
                        font: $font(10),
                      },
                      layout: (make, view) => {
                        make.width.equalTo(26);
                        make.right.inset(2);
                        make.centerY.equalTo(view.super);
                      },
                    },
                  ],
                },
                {
                  type: "view",
                  props: {
                    id: "language_minimal",
                  },
                  layout: (make, view) => {
                    make.bottom.inset(2);
                    make.left.equalTo(view.prev.right).inset(4);
                    make.width.equalTo(14);
                    make.height.equalTo(14);
                  },
                  views: [
                    {
                      type: "view",
                      props: {
                        id: "language_bgview_minimal",
                        cornerRadius: 7,
                        smoothCorners: true,
                      },
                      layout: $layout.fill,
                    },
                    {
                      type: "label",
                      props: {
                        id: "language_label_minimal",
                        align: $align.center,
                        textColor: $color("white"),
                        font: $font("bold", 8),
                      },
                      layout: $layout.center,
                    },
                  ],
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
          // 根据 spacing, _itemSizeWidth, _itemSizeHeight, _totalWidth
          // 计算目前最左上方的是第几个item
          const columns = Math.floor((this._totalWidth + spacing) / (this._itemSizeWidth + spacing));
          const row = Math.floor(offsetY / (this._itemSizeHeight + spacing));

          const index = row * columns;
          this._contentOffsetChanged?.({
            layout: this._layoutMode,
            totalWidth: this._totalWidth,
            firstVisibleItemIndex: index,
            offsetY,
          });
        },
        itemSize: (sender, indexPath) => {
          return $size(this._itemSizeWidth, this._itemSizeHeight);
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
          await didSelect(this, indexPath, this._items[indexPath.item]);
        },
      },
    });
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
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
    if (this._layoutMode === "large") {
      const { itemSizeWidth } = _getColumnsAndItemSizeWidth(
        this._totalWidth,
        largeLayoutProps.minItemWidth,
        largeLayoutProps.maxColumns,
        largeLayoutProps.spacing
      );
      this._itemSizeWidth = itemSizeWidth;
      this._itemSizeHeight = largeLayoutProps.fixedItemHeight;
    } else if (this._layoutMode === "normal") {
      const { itemSizeWidth } = _getColumnsAndItemSizeWidth(
        this._totalWidth,
        normalLayoutProps.minItemWidth,
        normalLayoutProps.maxColumns,
        normalLayoutProps.spacing
      );
      this._itemSizeWidth = itemSizeWidth;
      this._itemSizeHeight = normalLayoutItemHeight(this._itemSizeWidth);
    } else if (this._layoutMode === "minimal") {
      const { itemSizeWidth } = _getColumnsAndItemSizeWidth(
        this._totalWidth,
        minimalLayoutProps.minItemWidth,
        minimalLayoutProps.maxColumns,
        minimalLayoutProps.spacing
      );
      this._itemSizeWidth = itemSizeWidth;
      this._itemSizeHeight = minimalLayoutItemHeight(this._itemSizeWidth);
    } 
    this.matrix.view.reload();
  }

  updateScrollState(scrollState: ScrollState) {
    if (scrollState.layout === "large") {
      if (this._layoutMode === "large" && scrollState.totalWidth === this._totalWidth) {
        this.matrix.view.contentOffset = $point(0, scrollState.offsetY);
      } else {
        this.matrix.view.scrollTo({
          indexPath: $indexPath(0, scrollState.firstVisibleItemIndex),
          animated: false,
        });
      }
    } else if (scrollState.layout === "normal") {
      if (this._layoutMode === "normal" && scrollState.totalWidth === this._totalWidth) {
        this.matrix.view.contentOffset = $point(0, scrollState.offsetY);
      } else {
        this.matrix.view.scrollTo({
          indexPath: $indexPath(0, scrollState.firstVisibleItemIndex),
          animated: false,
        });
      }
    } else if (scrollState.layout === "minimal") {
      if (this._layoutMode === "minimal" && scrollState.totalWidth === this._totalWidth) {
        this.matrix.view.contentOffset = $point(0, scrollState.offsetY);
      } else {
        this.matrix.view.scrollTo({
          indexPath: $indexPath(0, scrollState.firstVisibleItemIndex),
          animated: false,
        });
      }
    }
  }

  get layoutMode() {
    return this._layoutMode;
  }

  set layoutMode(mode: "large" | "normal" | "minimal") {
    if (mode === this._layoutMode) return;
    this._layoutMode = mode;
    this.matrix.view.data = _mapData(this._items, this._layoutMode);
    this.reload();

    const offsetY = this.matrix.view.contentOffset.y;
    const spacing = 4;
    const columns = Math.floor((this._totalWidth + spacing) / (this._itemSizeWidth + spacing));
    const row = Math.floor(offsetY / (this._itemSizeHeight + spacing));

    const index = row * columns;
    this._contentOffsetChanged?.({
      layout: this._layoutMode,
      totalWidth: this._totalWidth,
      firstVisibleItemIndex: index,
      offsetY,
    });
  }

  set items(items: Items) {
    this._items = items;
    if (this._isPulling) this.matrix.view.endRefreshing();
    if (this._isReachingBottom) this.matrix.view.endFetchingMore();
    this.matrix.view.data = _mapData(items, this._layoutMode);
  }

  get items() {
    return this._items;
  }

  set footerText(text: string) {
    ($(this.id + "matrix-footer") as UILabelView).text = text;
  }

  get footerText() {
    return ($(this.id + "matrix-footer") as UILabelView).text;
  }
}
