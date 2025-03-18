import {
  Base,
  BaseController,
  Button,
  DynamicItemSizeMatrix,
  DynamicRowHeightList,
  layerCommonOptions,
  setLayer,
} from "jsbox-cview";
import { TagsFlowlayout } from "../components/tags-flowlayout";
import { assembleSearchTerms, EHGallery, EHSearchTerm } from "ehentai-parser";
import { configManager } from "../utils/config";
import {
  catColor,
  catTranslations,
  defaultButtonColor,
  favcatColor,
  galleryInfoPath,
  invisibleCauseMap,
  ratingColor,
  tagColor,
} from "../utils/glv";
import { GalleryDetailedInfoController } from "./gallery-detailed-info-controller";
import { toSimpleUTCTimeString } from "../utils/tools";
import { rateAlert } from "../components/rate-alert";
import { DownloadButton } from "../components/download-button";
import { ButtonsWarpper } from "../components/buttons-warpper";
import { api, downloaderManager } from "../utils/api";
import { statusManager } from "../utils/status";
import { GalleryTorrentsController } from "./gallery-torrents-controller";
import { GalleryHathController } from "./gallery-hath-controller";
import { galleryFavoriteDialog } from "../components/gallery-favorite-dialog";
import { getSearchOptions } from "./search-controller";
import { PushedSearchResultController } from "./pushed-search-result-controller";
import { WebDAVStatus, WebDAVWidget } from "../components/webdav-widget";

class BlankView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _height: number;
  constructor(height: number) {
    super();
    this._height = height;
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("clear"),
        },
        layout: $layout.fill,
      };
    };
  }

  get height() {
    return this._height;
  }

  set height(height: number) {
    this._height = height;
  }

  heightToWidth(width: number) {
    return this._height;
  }
}

class UploaderView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _uploader: string | undefined = undefined;
  private _disowned: boolean = false;
  private _selected: boolean = false;
  constructor({
    layout,
    selectedChanged,
  }: {
    layout: (make: MASConstraintMaker, view: UIView) => void;
    selectedChanged: (selected: boolean) => void;
  }) {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout,
        views: [
          {
            type: "view",
            props: {
              id: this.id + "uploader_normal_wrapper",
              cornerRadius: 10,
              smoothCorners: true,
              menu: {
                items: [
                  {
                    title: "立即搜索",
                    symbol: "magnifyingglass",
                    handler: async (sender) => {
                      this._search();
                    },
                  },
                  {
                    title: "复制",
                    symbol: "doc.on.doc",
                    handler: (sender) => {
                      if (!this._uploader) return;
                      $clipboard.text = assembleSearchTerms([
                        {
                          qualifier: "uploader",
                          term: this._uploader,
                          dollar: false,
                          subtract: false,
                          tilde: false,
                        },
                      ]);
                      $ui.toast("已复制");
                    },
                  },
                  {
                    title: "标记此上传者",
                    symbol: "bookmark",
                    handler: (sender) => {
                      this._markUploader();
                    },
                  },
                  {
                    title: "屏蔽此上传者",
                    symbol: "square.slash",
                    handler: (sender) => {
                      this._banUploader();
                    },
                  },
                ],
              },
            },
            layout: (make, view) => {
              make.left.top.bottom.inset(0);
              make.width.equalTo(0);
            },
            events: {
              tapped: (sender) => {
                this.selected = !this.selected;
                selectedChanged(this.selected);
              },
            },
            views: [
              {
                type: "label",
                props: {
                  id: this.id + "uploader_normal",
                  font: $font(14),
                  align: $align.center,
                },
                layout: $layout.center,
              },
            ],
          },
          {
            type: "view",
            props: {
              id: this.id + "uploader_marked_wrapper",
              cornerRadius: 10,
              smoothCorners: true,
              menu: {
                items: [
                  {
                    title: "立即搜索",
                    symbol: "magnifyingglass",
                    handler: (sender) => {
                      this._search();
                    },
                  },
                  {
                    title: "复制",
                    symbol: "doc.on.doc",
                    handler: (sender) => {
                      if (!this._uploader) return;
                      $clipboard.text = assembleSearchTerms([
                        {
                          qualifier: "uploader",
                          term: this._uploader,
                          dollar: false,
                          subtract: false,
                          tilde: false,
                        },
                      ]);
                      $ui.toast("已复制");
                    },
                  },
                  {
                    title: "取消标记",
                    symbol: "bookmark.slash",
                    handler: (sender) => {
                      this._unmarkUploader();
                    },
                  },
                ],
              },
            },
            layout: (make, view) => {
              make.left.top.bottom.inset(0);
              make.width.equalTo(0);
            },
            events: {
              tapped: (sender) => {
                this.selected = !this.selected;
                selectedChanged(this.selected);
              },
            },
            views: [
              {
                type: "label",
                props: {
                  id: this.id + "uploader_marked",
                  font: $font(14),
                  align: $align.center,
                },
                layout: $layout.center,
              },
            ],
          },
          {
            type: "view",
            props: {
              id: this.id + "uploader_banned_wrapper",
              cornerRadius: 10,
              smoothCorners: true,
              menu: {
                items: [
                  {
                    title: "立即搜索",
                    symbol: "magnifyingglass",
                    handler: (sender) => {
                      this._search();
                    },
                  },
                  {
                    title: "复制",
                    symbol: "doc.on.doc",
                    handler: (sender) => {
                      if (!this._uploader) return;
                      $clipboard.text = assembleSearchTerms([
                        {
                          qualifier: "uploader",
                          term: this._uploader,
                          dollar: false,
                          subtract: false,
                          tilde: false,
                        },
                      ]);
                      $ui.toast("已复制");
                    },
                  },
                  {
                    title: "取消屏蔽",
                    symbol: "square",
                    handler: (sender) => {
                      this._unbanUploader();
                    },
                  },
                ],
              },
            },
            layout: (make, view) => {
              make.left.top.bottom.inset(0);
              make.width.equalTo(0);
            },
            events: {
              tapped: (sender) => {
                this.selected = !this.selected;
                selectedChanged(this.selected);
              },
            },
            views: [
              {
                type: "label",
                props: {
                  id: this.id + "uploader_banned",
                  font: $font(14),
                  align: $align.center,
                },
                layout: $layout.center,
              },
            ],
          },
          {
            type: "label",
            props: {
              id: this.id + "uploader_disowned",
              bgcolor: $color("clear"),
              textColor: $color("secondaryText"),
              font: $font(14),
              text: "(已放弃)",
            },
            layout: (make, view) => {
              make.left.inset(8);
              make.centerY.equalTo(view.super);
            },
          },
        ],
      };
    };
  }

  private async _search() {
    if (!this._uploader) return;
    const controller = new PushedSearchResultController();
    controller.uipush({
      navBarHidden: true,
      statusBarStyle: 0,
    });
    await $wait(0.3);
    await controller.triggerLoad({
      type: "front_page",
      options: {
        searchTerms: [
          {
            qualifier: "uploader",
            term: this._uploader,
            dollar: false,
            subtract: false,
            tilde: false,
          },
        ],
      },
    });
  }

  private _markUploader() {
    if (!this._uploader) return;
    configManager.addMarkedUploader(this._uploader);
    this.refresh();
  }

  private _unmarkUploader() {
    if (!this._uploader) return;
    configManager.deleteMarkedUploader(this._uploader);
    this.refresh();
  }

  private async _banUploader() {
    if (!this._uploader) return;
    try {
      const config = await api.getConfig();
      config.xu = config.xu + "\n" + this._uploader;
      const success = await api.postConfig(config);
      if (success) {
        const bannedUploaders = config.xu.split("\n");
        configManager.updateAllBannedUploaders(bannedUploaders);
      }
    } catch (e) {
      $ui.error("错误：屏蔽失败");
    }
    this.refresh();
  }

  private async _unbanUploader() {
    if (!this._uploader) return;
    try {
      const config = await api.getConfig();
      config.xu = config.xu
        .split("\n")
        .filter((uploader) => uploader !== this._uploader)
        .join("\n");
      const success = await api.postConfig(config);
      if (success) {
        const bannedUploaders = config.xu.split("\n");
        configManager.updateAllBannedUploaders(bannedUploaders);
      }
    } catch (e) {
      $ui.error("错误：取消屏蔽失败");
    }
    this.refresh();
  }

  update({
    uploader,
    disowned,
  }: {
    uploader: string | undefined;
    disowned: boolean;
  }) {
    this._uploader = uploader;
    this._disowned = disowned;
    this._selected = false;
    this.refresh();
  }

  refresh() {
    // 刷新显示状态
    if (this._disowned) {
      $(this.id + "uploader_normal_wrapper").hidden = true;
      $(this.id + "uploader_marked_wrapper").hidden = true;
      $(this.id + "uploader_banned_wrapper").hidden = true;
      $(this.id + "uploader_disowned").hidden = false;
    } else if (this._uploader) {
      // 获取宽度
      const width =
        $text.sizeThatFits({
          text: this._uploader,
          font: $font(14),
          width: 1000,
        }).width + 16;
      // 设置宽度
      $(this.id + "uploader_normal_wrapper").updateLayout((make, view) => {
        make.width.equalTo(width);
      });
      $(this.id + "uploader_marked_wrapper").updateLayout((make, view) => {
        make.width.equalTo(width);
      });
      $(this.id + "uploader_banned_wrapper").updateLayout((make, view) => {
        make.width.equalTo(width);
      });
      const marked = configManager.markedUploaders.includes(this._uploader);
      const banned = configManager.bannedUploaders.includes(this._uploader);
      $(this.id + "uploader_normal_wrapper").hidden = marked || banned;
      $(this.id + "uploader_marked_wrapper").hidden = !marked;
      $(this.id + "uploader_banned_wrapper").hidden = !banned;
      $(this.id + "uploader_disowned").hidden = true;
    }

    // 刷新颜色
    if (this._selected) {
      ($(this.id + "uploader_normal") as UILabelView).textColor =
        tagColor.selected;
      ($(this.id + "uploader_marked") as UILabelView).textColor =
        tagColor.selected;
      ($(this.id + "uploader_banned") as UILabelView).textColor =
        tagColor.selected;
    } else {
      ($(this.id + "uploader_normal") as UILabelView).textColor =
        $color("primaryText");
      ($(this.id + "uploader_marked") as UILabelView).textColor =
        tagColor.marked;
      ($(this.id + "uploader_banned") as UILabelView).textColor =
        tagColor.hidden;
    }

    // 刷新内容
    if (this._uploader) {
      ($(this.id + "uploader_normal") as UILabelView).text = this._uploader;
      ($(this.id + "uploader_marked") as UILabelView).text = this._uploader;
      ($(this.id + "uploader_banned") as UILabelView).text = this._uploader;
    }
  }

  set selected(selected: boolean) {
    this._selected = selected;
    this.refresh();
  }

  get selected() {
    return this._selected;
  }
}

function _calFontSizeAndHeight(
  title: string,
  width: number,
  maxHeight: number
): { fontSize: number; height: number } {
  const maxFontSize = 16;
  const minFontSize = 10;
  const factor = 2;
  for (let i = maxFontSize * factor; i >= minFontSize * factor; i--) {
    const height = Math.ceil(
      $text.sizeThatFits({
        text: title,
        font: $font(i / factor),
        width: width,
      }).height
    );
    if (height <= maxHeight) {
      return { fontSize: i / factor, height };
    }
  }
  return { fontSize: minFontSize, height: maxHeight };
}

/**
 * 由4部分组成：thumbnail, title, uploader, category
 */
class InfoHeaderView extends Base<UIView, UiTypes.ViewOptions> {
  private _infos?: EHGallery;
  private _titleLanguage: "english_title" | "japanese_title" = "japanese_title";
  cviews: {
    uploaderView: UploaderView;
  };
  _defineView: () => UiTypes.ViewOptions;
  constructor(selectedChanged: (selected: boolean) => void) {
    super();
    const uploaderView = new UploaderView({
      layout: (make, view) => {
        make.left.equalTo(view.prev);
        make.right.inset(0);
        make.top.equalTo(view.prev.bottom).inset(5);
        make.height.equalTo(25);
      },
      selectedChanged: (selected) => {
        selectedChanged(selected);
      },
    });
    this.cviews = {
      uploaderView,
    };
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("clear"),
        },
        layout: $layout.fill,
        views: [
          {
            type: "view",
            props: {
              cornerRadius: 8,
              smoothCorners: true,
              bgcolor: $color("tertiarySurface"),
            },
            layout: $layout.fill,
            views: [
              {
                // thumbnail
                type: "image",
                props: {
                  id: this.id + "thumbnail",
                  contentMode: 1,
                },
                layout: (make, view) => {
                  make.left.top.bottom.inset(0);
                  make.width.equalTo(view.super).dividedBy(3);
                },
              },
              {
                // 右边部分
                type: "view",
                props: {
                  id: this.id + "rightWrapper",
                },
                layout: (make, view) => {
                  make.right.top.bottom.inset(0);
                  make.left.equalTo(view.prev.right);
                },
                views: [
                  {
                    // 类别
                    type: "label",
                    props: {
                      id: this.id + "category",
                      textColor: $color("white"),
                      font: $font("bold", 16),
                      align: $align.center,
                      cornerRadius: 4,
                      smoothCorners: true,
                    },
                    layout: (make, view) => {
                      make.left.inset(5);
                      make.bottom.inset(10);
                      make.height.equalTo(30);
                      make.width.equalTo(100);
                    },
                  },
                  {
                    type: "label",
                    props: {
                      id: this.id + "title",
                      titleColor: $color("primaryText"),
                      align: $align.left,
                      lines: 0,
                      userInteractionEnabled: true,
                    },
                    layout: (make, view) => {
                      make.left.inset(5);
                      make.right.inset(8);
                      make.top.inset(10);
                      make.height.equalTo(77);
                    },
                    events: {
                      tapped: (sender) => {
                        if (!this._infos) return;
                        if (!this._infos.japanese_title) return;
                        this._titleLanguage =
                          this._titleLanguage === "english_title"
                            ? "japanese_title"
                            : "english_title";
                        sender.text = this._infos[this._titleLanguage];
                        this._updateTitleLayout(
                          $(this.id + "rightWrapper").frame
                        );
                      },
                    },
                  },
                  uploaderView.definition,
                ],
                events: {
                  layoutSubviews: (sender) => {
                    if (!this._infos) return;
                    this._updateTitleLayout(sender.frame);
                  },
                },
              },
            ],
          },
        ],
      };
    };
  }

  _updateTitleLayout({ width, height }: { width: number; height: number }) {
    if (!this._infos) return;
    if (width <= 0 || height <= 0) return;
    const maxHeight = height - 90;
    const { fontSize, height: titleHeight } = _calFontSizeAndHeight(
      this._infos[this._titleLanguage],
      width - 13,
      maxHeight
    );
    ($(this.id + "title") as UILabelView).font = $font(fontSize);
    ($(this.id + "title") as UILabelView).updateLayout((make, view) => {
      make.height.equalTo(titleHeight);
    });
  }

  set thumbnail_url(url: string) {
    ($(this.id + "thumbnail") as UIImageView).src = url;
  }

  set infos(infos: EHGallery) {
    this._infos = infos;
    if (!infos.japanese_title) {
      this._titleLanguage = "english_title";
    }
    ($(this.id + "title") as UILabelView).text = infos[this._titleLanguage];
    ($(this.id + "category") as UILabelView).text =
      catTranslations[infos.category];
    ($(this.id + "category") as UILabelView).bgcolor = catColor[infos.category];
    this.cviews.uploaderView.update({
      uploader: infos.uploader,
      disowned: infos.disowned,
    });
    this._updateTitleLayout($(this.id + "rightWrapper").frame);
  }

  heightToWidth(width: number) {
    return Math.min(Math.max(170, Math.round((width / 3) * 1.414)), 300);
  }
}

class InfoMatrixWrapper extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _matrix: DynamicItemSizeMatrix;
  constructor(matrix: DynamicItemSizeMatrix) {
    super();
    this._matrix = matrix;
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("backgroundColor"),
        },
        layout: $layout.fill,
        views: [
          {
            type: "view",
            props: {
              smoothCorners: true,
              cornerRadius: 8,
              clipsToBounds: true,
              bgcolor: $color("tertiarySurface"),
            },
            layout: $layout.fill,
            views: [
              {
                type: "view",
                props: {
                  id: "leftColumn",
                  bgcolor: catColor.Misc,
                },
                layout: (make, view) => {
                  make.left.top.bottom.inset(0);
                  make.width.equalTo(8);
                },
              },
              {
                type: "view",
                props: {
                  id: "rightColumn",
                  bgcolor: catColor.Misc,
                },
                layout: (make, view) => {
                  make.right.top.bottom.inset(0);
                  make.width.equalTo(8);
                },
              },
              matrix.definition,
            ],
          },
        ],
      };
    };
  }

  heightToWidth(width: number) {
    return this._matrix.heightToWidth(width - 8 * 2 - 5 * 2);
  }

  set leftColumnColor(color: UIColor) {
    this.view.get("leftColumn").bgcolor = color;
    this.view.get("rightColumn").bgcolor = color;
  }
}

class TagsFlowlayoutWrapper extends Base<UIView, UiTypes.ViewOptions> {
  private _tapped: () => void;
  _defineView: () => UiTypes.ViewOptions;
  private _flowlayout?: TagsFlowlayout;
  constructor(tapped: () => void) {
    super();
    this._tapped = tapped;
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("clear"),
        },
        layout: $layout.fill,
      };
    };
  }

  set taglist(taglist: EHGallery["taglist"]) {
    if (this._flowlayout) {
      this._flowlayout.view.remove();
    }
    this._flowlayout = new TagsFlowlayout(taglist, {
      tapped: () => {
        this._tapped();
      },
    });
    this.view.add(this._flowlayout.definition);
  }

  get flowlayout() {
    return this._flowlayout;
  }

  heightToWidth(width: number) {
    return this._flowlayout?.heightToWidth(width) || 1;
  }
}

class RateButton extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _rating: number = 0;
  private _is_my_rating: boolean = false;
  private _isRequestInProgress: boolean = false;
  constructor({
    handler,
  }: {
    handler: (currentRating: number) => Promise<number>;
  }) {
    super();
    const ratingWidth = this._calRatingWidth(this._rating);
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          userInteractionEnabled: true,
        },
        layout: $layout.fill,
        views: [
          {
            type: "image",
            props: {
              id: "star",
              tintColor: this._is_my_rating ? ratingColor : $color("orange"),
              symbol: "star",
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.centerY.equalTo(view.super).offset(-10);
              make.size.equalTo($size(50, 50));
            },
          },
          {
            type: "view",
            props: {},
            layout: (make, view) => {
              make.center.equalTo(view.prev);
              make.size.equalTo(view.prev);
            },
            views: [
              {
                type: "view",
                props: {
                  id: "mask",
                  clipsToBounds: true,
                },
                layout: (make, view) => {
                  make.left.top.bottom.inset(0);
                  make.width.equalTo(ratingWidth);
                },
                views: [
                  {
                    type: "image",
                    props: {
                      id: "starfill",
                      tintColor: this._is_my_rating
                        ? ratingColor
                        : $color("orange"),
                      symbol: "star.fill",
                    },
                    layout: (make, view) => {
                      make.left.top.bottom.inset(0);
                      make.size.equalTo($size(50, 50));
                    },
                  },
                ],
              },
            ],
          },
          {
            type: "label",
            props: {
              text: this._rating.toFixed(2),
              font: $font(12),
              textColor: $color("primaryText"),
              align: $align.center,
            },
            layout: (make, view) => {
              make.left.right.inset(10);
              make.centerX.equalTo(view.super);
              make.top.equalTo(view.prev.bottom).offset(5);
            },
          },
        ],
        events: {
          tapped: async (sender) => {
            if (this._isRequestInProgress) {
              $ui.warning("正在处理上一个请求，请稍后再试");
              return;
            }
            this._isRequestInProgress = true;
            const newRating = await handler(this._rating);
            this._isRequestInProgress = false;
            if (newRating) {
              this.rate(newRating);
            }
          },
        },
      };
    };
  }

  set rating(rating: number) {
    this._rating = rating;
    (this.view.get("label") as UILabelView).text = rating.toFixed(2);
    const ratingWidth = this._calRatingWidth(rating);
    (this.view.get("mask") as UIView).updateLayout((make, view) => {
      make.width.equalTo(ratingWidth);
    });
  }

  get rating() {
    return this._rating;
  }

  set is_my_rating(is_my_rating: boolean) {
    this._is_my_rating = is_my_rating;
    (this.view.get("star") as UIImageView).tintColor = is_my_rating
      ? ratingColor
      : $color("orange");
    (this.view.get("starfill") as UIImageView).tintColor = is_my_rating
      ? ratingColor
      : $color("orange");
  }

  get is_my_rating() {
    return this._is_my_rating;
  }

  rate(rating: number) {
    this.rating = rating;
    this.is_my_rating = true;
  }

  private _calRatingWidth(rating: number) {
    if (rating === 0) return 0;
    return rating < 5 ? Math.floor((30 * rating) / 5) + 10 : 50;
  }
}

type FavoriteButtonActionResult =
  | {
      success: true;
      favorited: true;
      favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      title: string;
    }
  | { success: true; favorited: false }
  | { success: false; dissmissed?: boolean };

class FavoriteButton extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _handler: (
    action: "default" | "unfavorite" | "other"
  ) => Promise<FavoriteButtonActionResult>;
  private _isRequestInProgress: boolean = false;
  constructor({
    handler,
  }: {
    handler: (
      action: "default" | "unfavorite" | "other"
    ) => Promise<FavoriteButtonActionResult>;
  }) {
    super();
    this._handler = handler;
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout: $layout.fill,
        views: [
          {
            type: "button",
            props: {
              id: "button_favorited",
              bgcolor: $color("clear"),
              menu: {
                asPrimary: true,
                pullDown: true,
                items: [
                  {
                    title: "取消收藏",
                    handler: async () => {
                      await this._handleEvent("unfavorite");
                    },
                  },
                  {
                    title: "更多选项",
                    handler: async () => {
                      await this._handleEvent("other");
                    },
                  },
                ],
              },
            },
            layout: $layout.fill,
            views: [
              {
                type: "image",
                props: {
                  id: "image_favorited",
                  tintColor: favcatColor[0],
                  symbol: "heart.fill",
                },
                layout: (make, view) => {
                  make.centerX.equalTo(view.super);
                  make.centerY.equalTo(view.super).offset(-10);
                  make.size.equalTo($size(50, 50));
                },
              },
              {
                type: "label",
                props: {
                  id: "label_favorited",
                  text: "",
                  font: $font(12),
                  textColor: $color("primaryText"),
                  align: $align.center,
                  lines: 2,
                },
                layout: (make, view) => {
                  make.left.right.inset(5);
                  make.centerX.equalTo(view.super);
                  make.top.equalTo(view.prev.bottom).offset(5);
                },
              },
            ],
          },
          {
            type: "button",
            props: {
              id: "button_unfavorited",
              bgcolor: $color("clear"),
              menu: {
                asPrimary: true,
                pullDown: true,
                items: [
                  {
                    title:
                      "收藏到" +
                      configManager.favcatTitles[configManager.defaultFavcat],
                    handler: async () => {
                      await this._handleEvent("default");
                    },
                  },
                  {
                    title: "更多选项",
                    handler: async () => {
                      await this._handleEvent("other");
                    },
                  },
                ],
              },
            },
            layout: $layout.fill,
            views: [
              {
                type: "image",
                props: {
                  id: "image_unfavorited",
                  tintColor: defaultButtonColor,
                  symbol: "heart",
                },
                layout: (make, view) => {
                  make.centerX.equalTo(view.super);
                  make.centerY.equalTo(view.super).offset(-10);
                  make.size.equalTo($size(50, 50));
                },
              },
              {
                type: "label",
                props: {
                  id: "label_unfavorited",
                  text: "点击收藏",
                  font: $font(12),
                  textColor: $color("primaryText"),
                  align: $align.center,
                  lines: 2,
                },
                layout: (make, view) => {
                  make.left.right.inset(5);
                  make.centerX.equalTo(view.super);
                  make.top.equalTo(view.prev.bottom).offset(5);
                },
              },
            ],
          },
        ],
      };
    };
  }

  favorite(favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, title: string) {
    (this.view.get("image_favorited") as UIImageView).tintColor =
      favcatColor[favcat];
    (this.view.get("label_favorited") as UILabelView).text = title;
    (this.view.get("button_unfavorited") as UIButtonView).hidden = true;
    (this.view.get("button_favorited") as UIButtonView).hidden = false;
  }

  unfavorite() {
    (this.view.get("button_favorited") as UIButtonView).hidden = true;
    (this.view.get("button_unfavorited") as UIButtonView).hidden = false;
  }

  private async _handleEvent(action: "default" | "unfavorite" | "other") {
    if (this._isRequestInProgress) {
      $ui.warning("正在处理上一个请求，请稍后再试");
      return;
    }
    this._isRequestInProgress = true;
    const result = await this._handler(action);
    this._isRequestInProgress = false;
    if (result.success) {
      if (result.favorited) {
        this.favorite(result.favcat, result.title);
      } else {
        this.unfavorite();
      }
    } else {
      if (!result.dissmissed) $ui.error("收藏操作失败");
    }
  }
}

class CommonButton extends Base<UIButtonView, UiTypes.ButtonOptions> {
  _defineView: () => UiTypes.ButtonOptions;
  constructor({
    title,
    symbol,
    image,
    symbolColor,
    contentMode,
    symbolSize,
    handler,
  }: {
    title: string;
    symbol?: string;
    image?: UIImage;
    symbolColor?: UIColor;
    contentMode?: number;
    symbolSize?: JBSize;
    handler: () => void;
  }) {
    super();
    this._defineView = () => {
      return {
        type: "button",
        props: {
          id: this.id,
          bgcolor: $color("clear"),
        },
        layout: $layout.fill,
        views: [
          {
            type: "image",
            props: {
              id: "icon",
              tintColor: symbolColor ?? defaultButtonColor,
              image: image,
              symbol: symbol,
              contentMode: contentMode ?? 2,
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.centerY.equalTo(view.super).offset(-10);
              make.size.equalTo(symbolSize ?? $size(50, 50));
            },
          },
          {
            type: "label",
            props: {
              id: "title",
              text: title,
              font: $font(12),
              textColor: $color("primaryText"),
              align: $align.center,
              lines: 2,
            },
            layout: (make, view) => {
              make.left.right.inset(10);
              make.centerX.equalTo(view.super);
              make.top.equalTo(view.prev.bottom).offset(5);
            },
          },
        ],
        events: {
          tapped: (sender) => {
            handler();
          },
        },
      };
    };
  }

  set symbol(symbol: string) {
    (this.view.get("icon") as UIImageView).symbol = symbol;
  }

  set symbolColor(color: UIColor) {
    (this.view.get("icon") as UIImageView).tintColor = color;
  }

  set title(title: string) {
    (this.view.get("title") as UILabelView).text = title;
  }
}

export class GalleryInfoController extends BaseController {
  gid: number;
  private _infos?: EHGallery;
  private _topThumbnailFinished: boolean = false;
  private _isShowingSearchButton: boolean = false;
  cviews: {
    infoHeaderView: InfoHeaderView;
    infoMatrix: DynamicItemSizeMatrix;
    rateButton: RateButton;
    favoriteButton: FavoriteButton;
    readButton: CommonButton;
    readLaterButton: CommonButton;
    downloadButton: DownloadButton;
    torrentButton: CommonButton;
    hathDownloadButton: CommonButton;
    primaryButtonsWrapper: ButtonsWarpper;
    secondaryButtonsWrapper: ButtonsWarpper;
    infoMatrixWarpper: InfoMatrixWrapper;
    tagsFlowlayoutWrapper: TagsFlowlayoutWrapper;
    list: DynamicRowHeightList;
    createNewSearchButton: Button;
    webDAVWidget: WebDAVWidget;
  };

  onWebDAVAction?: (
    action: "retry" | "upload" | "retry-upload" | "resume-upload" | "pause"
  ) => void;
  onWebDAVConfig?: () => void;

  constructor(gid: number, readHandler: (index: number) => void) {
    super({
      props: { bgcolor: $color("backgroundColor") },
    });
    this.gid = gid;
    const infoHeaderView = new InfoHeaderView((selected) => {
      this.updateSearchButtonShowingStatus();
    });
    const infoMatrix = new DynamicItemSizeMatrix({
      props: {
        maxColumns: 3,
        spacing: 2,
        fixedItemHeight: 20,
        minItemWidth: 137,
        dynamicHeightEnabled: false,
        selectable: false,
        bgcolor: $color("clear"),
        data: [],
        template: {
          views: [
            {
              type: "image",
              props: {
                id: "icon",
              },
              layout: (make, view) => {
                make.left.inset(1);
                make.centerY.equalTo(view.super);
                make.width.equalTo(13);
                make.height.equalTo(13);
              },
            },
            {
              type: "label",
              props: {
                id: "label",
                font: $font(12),
                align: $align.left,
              },
              layout: (make, view) => {
                make.top.bottom.right.inset(0);
                make.left.equalTo(view.prev.right).inset(3);
              },
            },
          ],
        },
      },
      layout: (make, view) => {
        make.left.right.inset(5 + 8);
        make.top.bottom.right.inset(0);
      },
      events: {
        tapped: (sender) => {
          if (!this._infos) return;
          const galleryDetailedInfoController =
            new GalleryDetailedInfoController(this._infos);
          galleryDetailedInfoController.uipush({
            navBarHidden: true,
            statusBarStyle: 0,
          });
        },
      },
    });
    const infoMatrixWarpper = new InfoMatrixWrapper(infoMatrix);
    const rateButton = new RateButton({
      handler: async (currentRating) => {
        if (!this._infos) return 0;
        let newRating: 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;
        try {
          newRating = (await rateAlert({
            rating: Math.max(Math.floor(currentRating * 2) / 2, 0.5),
          })) as 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;
        } catch (e) {
          return 0;
        }
        if (!newRating) return 0;
        try {
          await api.rateGallery(
            this.gid,
            this._infos.token,
            this._infos.apikey,
            this._infos.apiuid,
            newRating
          );
          this._infos.display_rating = newRating;
          this._infos.is_my_rating = true;
          this._trySavingInfos();
          statusManager.updateArchiveItem(this.gid, {
            my_rating: newRating,
          });
          return newRating;
        } catch (e) {
          $ui.error("评分失败");
        }
        return 0;
      },
    });
    const favoriteButton = new FavoriteButton({
      handler: async (action) => {
        if (!this._infos) return { success: false };
        switch (action) {
          case "default": {
            const defaultFavcat = configManager.defaultFavcat;
            try {
              await api.addOrModifyFav(
                this.gid,
                this._infos.token,
                defaultFavcat
              );
              this._infos.favorited = true;
              this._infos.favcat = defaultFavcat;
              this._infos.favcat_title =
                configManager.favcatTitles[defaultFavcat];
              this._trySavingInfos();
              statusManager.updateArchiveItem(this.gid, {
                favorite_info: {
                  favorited: true,
                  favcat: defaultFavcat,
                },
              });
            } catch (e) {
              return { success: false };
            }
            return {
              success: true,
              favorited: true,
              favcat: defaultFavcat,
              title: configManager.favcatTitles[defaultFavcat],
            };
          }
          case "unfavorite": {
            try {
              await api.deleteFav(this.gid, this._infos.token);
              this._infos.favorited = false;
              this._infos.favcat = undefined;
              this._infos.favcat_title = undefined;
              this._trySavingInfos();
              statusManager.updateArchiveItem(this.gid, {
                favorite_info: {
                  favorited: false,
                },
              });
            } catch (e) {
              return { success: false };
            }
            return { success: true, favorited: false };
          }
          case "other": {
            try {
              const result = await galleryFavoriteDialog(this._infos);
              if (result.success) {
                await api.addOrModifyFav(
                  this.gid,
                  this._infos.token,
                  result.favcat,
                  result.favnote
                );
                this._infos.favorited = true;
                this._infos.favcat = result.favcat;
                this._infos.favcat_title =
                  configManager.favcatTitles[result.favcat];
                this._trySavingInfos();
                statusManager.updateArchiveItem(this.gid, {
                  favorite_info: {
                    favorited: true,
                    favcat: result.favcat,
                  },
                });
                return {
                  success: true,
                  favorited: true,
                  favcat: result.favcat,
                  title: configManager.favcatTitles[result.favcat],
                };
              } else {
                return { success: false, dissmissed: true };
              }
            } catch (e) {
              if (e === "cancel") {
                return { success: false, dissmissed: true };
              } else {
                return { success: false };
              }
            }
          }
          default:
            throw new Error("Invalid action");
        }
      },
    });
    const readButton = new CommonButton({
      title: "阅读",
      symbol: "book",
      handler: () => {
        const currentReadPage = statusManager.getLastReadPage(this.gid);
        readHandler(currentReadPage);
      },
    });

    const readLaterButton = new CommonButton({
      title: "稍后阅读",
      symbol: "bookmark.circle",
      symbolSize: $size(40, 40),
      handler: () => {
        const archiveItem = statusManager.getArchiveItem(this.gid);
        if (!archiveItem) return;
        if (archiveItem.readlater) {
          statusManager.updateArchiveItem(this.gid, {
            readlater: false,
          });
          readLaterButton.symbolColor = defaultButtonColor;
        } else {
          statusManager.updateArchiveItem(this.gid, {
            readlater: true,
          });
          readLaterButton.symbolColor = $color("orange");
        }
      },
    });

    const downloadButton = new DownloadButton({
      status: "pending",
      progress: 0,
      handler: (sender, status) => {
        statusManager.updateArchiveItem(this.gid, {
          downloaded: true,
        });
        const d = downloaderManager.get(this.gid);
        if (!d) return;
        if (status === "paused") {
          // 当前是暂停状态，转变为下载状态
          d.background = true;
          d.backgroundPaused = false;
          sender.status = "downloading";
        } else if (status === "downloading") {
          // 当前是下载状态，转变为暂停状态
          d.background = true;
          d.backgroundPaused = true;
          sender.status = "paused";
        } else {
          // 当前是待机状态，转变为下载状态
          d.background = true;
          d.backgroundPaused = false;
          // 查询下载进度
          const progress = d.finishedOfImages / d.result.images.length;
          sender.progress = progress;
          sender.status = progress === 1 ? "finished" : "downloading";
        }
        downloaderManager.startOne(this.gid);
      },
    });

    const torrentButton = new CommonButton({
      title: "种子",
      symbol: "link.circle",
      symbolSize: $size(40, 40),
      handler: () => {
        if (!this._infos) return;
        const galleryTorrentsController = new GalleryTorrentsController(
          this._infos
        );
        galleryTorrentsController.present();
      },
    });

    const hathDownloadButton = new CommonButton({
      title: "Hath下载",
      symbol: "at",
      symbolSize: $size(40, 40),
      handler: () => {
        if (!this._infos) return;
        const galleryHathController = new GalleryHathController(this._infos);
        galleryHathController.present();
      },
    });

    const primaryButtonsWrapper = new ButtonsWarpper([
      rateButton,
      favoriteButton,
      readButton,
    ]);

    const secondaryButtonsWrapper = new ButtonsWarpper(
      [readLaterButton, downloadButton, torrentButton, hathDownloadButton],
      90
    );

    const tagsFlowlayoutWrapper = new TagsFlowlayoutWrapper(() => {
      this.updateSearchButtonShowingStatus();
    });
    const createNewSearchButton = new Button({
      props: {
        bgcolor: $color("systemLink"),
        alpha: 0,
      },
      layout: (make, view) => {
        setLayer(view, layerCommonOptions.circleViewShadow);
        make.size.equalTo($size(50, 50));
        make.right.inset(25);
        make.bottom.inset(40);
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "magnifyingglass",
            tintColor: $color("white"),
          },
          layout: (make, view) => {
            make.center.equalTo(view.super);
            make.size.equalTo($size(25, 25));
          },
        },
      ],
      events: {
        tapped: async () => {
          const sts = [] as EHSearchTerm[];
          if (infoHeaderView.cviews.uploaderView.selected) {
            sts.push({
              qualifier: "uploader",
              term: this._infos?.uploader ?? "",
              dollar: false,
              subtract: false,
              tilde: false,
            });
          }
          tagsFlowlayoutWrapper.flowlayout?.selectedTags.forEach((tag) => {
            sts.push({
              namespace: tag.namespace,
              term: tag.name,
              dollar: true,
              subtract: false,
              tilde: false,
            });
          });
          const options = await getSearchOptions(
            {
              type: "front_page",
              options: {
                searchTerms: sts,
              },
            },
            "showAll"
          );
          const controller = new PushedSearchResultController();
          controller.uipush({
            navBarHidden: true,
            statusBarStyle: 0,
          });
          await $wait(0.3);
          await controller.triggerLoad(options);
        },
      },
    });
    const webDAVHidden = !(
      configManager.alwaysShowWebDAVWidget ||
      (!configManager.alwaysShowWebDAVWidget && configManager.webdavEnabled)
    );
    const webDAVWidget = new WebDAVWidget({
      hidden: webDAVHidden,
      mainButtonHandler: (action) => {
        this.onWebDAVAction?.(action);
      },
      configButtonHandler: () => {
        this.onWebDAVConfig?.();
      },
    });

    const list = new DynamicRowHeightList({
      rows: [
        new BlankView(10),
        infoHeaderView,
        new BlankView(10),
        primaryButtonsWrapper,
        new BlankView(10),
        infoMatrixWarpper,
        new BlankView(10),
        secondaryButtonsWrapper,
        new BlankView(10),
        webDAVWidget,
        new BlankView(webDAVHidden ? 0.1 : 10),
        tagsFlowlayoutWrapper,
        new BlankView(80),
      ],
      props: {
        bgcolor: $color("clear"),
        separatorHidden: true,
        showsVerticalIndicator: false,
      },
      layout: (make, view) => {
        make.left.right.inset(10);
        make.top.bottom.inset(0);
      },
      events: {},
    });
    this.cviews = {
      infoHeaderView,
      infoMatrix,
      rateButton,
      favoriteButton,
      readButton,
      readLaterButton,
      downloadButton,
      torrentButton,
      hathDownloadButton,
      primaryButtonsWrapper,
      secondaryButtonsWrapper,
      infoMatrixWarpper,
      tagsFlowlayoutWrapper,
      list,
      createNewSearchButton,
      webDAVWidget,
    };
    this.rootView.views = [list, createNewSearchButton];
  }

  set infos(infos: EHGallery) {
    this.gid = infos.gid;
    this._infos = infos;
    const topThumbnailPath = downloaderManager.get(this.gid)!.result
      .topThumbnail.path;
    this._topThumbnailFinished = Boolean(topThumbnailPath);
    this.cviews.infoHeaderView.thumbnail_url = topThumbnailPath || "";
    this.cviews.infoHeaderView.infos = infos;
    const data: {
      label: {
        text: string;
        textColor: UIColor;
      };
      icon: {
        symbol: string;
        tintColor: UIColor;
      };
    }[] = [
      {
        label: {
          textColor: $color("secondaryText"),
          text:
            (configManager.translate("language", infos.language) ||
              infos.language) +
            (infos.translated ? " 翻译" : "") +
            (infos.rewrited ? " 重写" : ""),
        },
        icon: { symbol: "globe", tintColor: $color("systemLink") },
      },
      {
        label: {
          text: `${infos.length}页`,
          textColor: $color("secondaryText"),
        },
        icon: { symbol: "photo.fill", tintColor: $color("systemLink") },
      },
      {
        label: { text: infos.file_size, textColor: $color("secondaryText") },
        icon: { symbol: "doc.zipper", tintColor: $color("systemLink") },
      },
      {
        label: {
          text: `${infos.average_rating}(共${infos.rating_count}次评分)`,
          textColor: $color("secondaryText"),
        },
        icon: { symbol: "star.fill", tintColor: $color("systemLink") },
      },

      {
        label: {
          text: `${infos.favorite_count}次收藏`,
          textColor: $color("secondaryText"),
        },
        icon: { symbol: "heart.fill", tintColor: $color("systemLink") },
      },
      {
        label: {
          text: toSimpleUTCTimeString(infos.posted_time),
          textColor: $color("secondaryText"),
        },
        icon: { symbol: "clock.fill", tintColor: $color("systemLink") },
      },
    ];
    if (infos.visible === false) {
      data.push({
        label: {
          text:
            "不可见: " +
            ((infos.invisible_cause &&
              invisibleCauseMap[infos.invisible_cause]) ||
              ""),
          textColor: $color("red"),
        },
        icon: {
          symbol: "lock.doc",
          tintColor: $color("red"),
        },
      });
    }
    this.cviews.infoMatrix.data = data;
    this.cviews.infoMatrixWarpper.leftColumnColor = catColor[infos.category];
    this.cviews.rateButton.rating = infos.display_rating;
    this.cviews.rateButton.is_my_rating = infos.is_my_rating;
    if (infos.favcat !== undefined && infos.favcat_title !== undefined) {
      this.cviews.favoriteButton.favorite(infos.favcat, infos.favcat_title);
    } else {
      this.cviews.favoriteButton.unfavorite();
    }
    this.cviews.torrentButton.title = `种子(${infos.torrent_count})`;
    if (infos.torrent_count === 0) {
      this.cviews.torrentButton.view.enabled = false;
    } else {
      this.cviews.torrentButton.view.enabled = true;
    }
    this.cviews.tagsFlowlayoutWrapper.taglist = infos.taglist;
    this.cviews.list.view.reload();
    // 隐藏createNewSearchButton
    this.cviews.createNewSearchButton.view.alpha = 0;
  }

  private _refreshThumbnail() {
    if (this._topThumbnailFinished) return;
    const d = downloaderManager.get(this.gid);
    if (!d) return;
    const topThumbnailPath = d.result.topThumbnail.path;
    this._topThumbnailFinished = Boolean(topThumbnailPath);
    this.cviews.infoHeaderView.thumbnail_url = topThumbnailPath || "";
  }

  private _refreshDownloadButton() {
    if (this.cviews.downloadButton.status === "finished") return;
    const d = downloaderManager.get(this.gid);
    if (!d) return;
    if (!d.background) return;
    const progress = d.finishedOfImages / d.result.images.length;
    this.cviews.downloadButton.progress = progress;
    if (progress === 1) {
      this.cviews.downloadButton.status = "finished";
    } else if (d.backgroundPaused) {
      this.cviews.downloadButton.status = "paused";
    } else {
      this.cviews.downloadButton.status = "downloading";
    }
  }

  resetDownloadButton() {
    const d = downloaderManager.get(this.gid);
    if (!d) return;
    if (!d.background) {
      this.cviews.downloadButton.status = "pending";
      return;
    }
    const progress = d.finishedOfImages / d.result.images.length;
    this.cviews.downloadButton.progress = progress;
    if (progress === 1) {
      this.cviews.downloadButton.status = "finished";
    } else if (d.backgroundPaused) {
      this.cviews.downloadButton.status = "paused";
    } else {
      this.cviews.downloadButton.status = "downloading";
    }
  }

  private _trySavingInfos() {
    // 尝试保存this._infos到本地
    // 前提是本地已经存在infos文件（否则的话，应该由下载器模块进行保存）
    if (!this._infos) return;
    const path = galleryInfoPath + `${this._infos.gid}.json`;
    if ($file.exists(path)) {
      const text = JSON.stringify(this._infos, null, 2);
      $file.write({
        data: $data({ string: text }),
        path,
      });
    }
  }

  scheduledRefresh() {
    this._refreshThumbnail();
    this._refreshDownloadButton();
  }

  set currentReadPage(page: number) {
    if (page === 0) {
      this.cviews.readButton.title = `阅读`;
    } else {
      this.cviews.readButton.title = `第${page + 1}页`;
    }
  }

  updateSearchButtonShowingStatus() {
    // 检测uploaderView和tagsFlowLayout是否有选中的tag，如果有则显示搜索按钮
    const uploaderViewSelected =
      this.cviews.infoHeaderView.cviews.uploaderView.selected;
    const tagsFlowlayoutSelected = Boolean(
      this.cviews.tagsFlowlayoutWrapper.flowlayout?.selectedTags.length
    );
    const shouldShow = uploaderViewSelected || tagsFlowlayoutSelected;
    if (this._isShowingSearchButton === shouldShow) return;
    this._isShowingSearchButton = shouldShow;
    if (shouldShow) {
      this.cviews.createNewSearchButton.view.alpha = 1;
    } else {
      this.cviews.createNewSearchButton.view.alpha = 0;
    }
  }

  updateWebDAVWidgetStatus(status: WebDAVStatus) {
    this.cviews.webDAVWidget.setStatus(status);
  }
}
