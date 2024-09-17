import { Base, BaseController, DynamicItemSizeMatrix, DynamicRowHeightList } from "jsbox-cview";
import { TagsFlowlayout } from "../components/tags-flowlayout";
import { EHCategory, EHGallery } from "ehentai-parser";
import { configManager } from "../utils/config";
import { catColor, defaultButtonColor, favcatColor, invisibleCauseMap, namespaceTranslations, ratingColor, thumbnailPath } from "../utils/glv";
import { CompleteTagListItem } from "../types";
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
          bgcolor: $color("clear")
        },
        layout: $layout.fill
      }
    }
  }

  heightToWidth(width: number) {
    return this._height
  }
}

/**
 * 由4部分组成：thumbnail, title, uploader, category
 */
class InfoHeaderView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor() {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("clear")
        },
        layout: $layout.fill,
        views: [{
          type: "view",
          props: {
            cornerRadius: 8,
            smoothCorners: true,
            bgcolor: $color("tertiarySurface")
          },
          layout: $layout.fill,
          views: [
            { // thumbnail
              type: "image",
              props: {
                id: "thumbnail",
                contentMode: 1,

              },
              layout: (make, view) => {
                make.left.top.bottom.inset(0)
                make.width.equalTo(view.super).dividedBy(3)
              }
            },
            { // 右边部分
              type: "view",
              props: {},
              layout: (make, view) => {
                make.right.top.bottom.inset(0)
                make.left.equalTo(view.prev.right)
              },
              views: [
                { // 类别
                  type: "label",
                  props: {
                    id: "category",
                    textColor: $color("white"),
                    font: $font("Futura-Bold", 16),
                    align: $align.center,
                    cornerRadius: 4,
                    smoothCorners: true,
                  },
                  layout: (make, view) => {
                    make.left.inset(5)
                    make.bottom.inset(10)
                    make.height.equalTo(30)
                    make.width.equalTo(100)
                  }
                },
                {
                  type: "label",
                  props: {
                    id: "title",
                    titleColor: $color("primaryText"),
                    font: $font(16),
                    align: $align.left,
                    lines: 4
                  },
                  layout: (make, view) => {
                    make.left.inset(5)
                    make.right.inset(8)
                    make.top.inset(10)
                  }
                },
                {
                  type: "button",
                  props: {
                    id: "uploader",
                    bgcolor: $color("clear"),
                    titleColor: $color("primaryText"),
                    font: $font(12),
                    menu: {
                      items: [
                        {
                          title: "立即搜索",
                          symbol: "magnifyingglass",
                          handler: (sender) => { }
                        },
                        {
                          title: "复制",
                          symbol: "doc.on.doc",
                          handler: (sender) => { }
                        }
                      ]
                    }
                  },
                  layout: (make, view) => {
                    make.left.equalTo(view.prev)
                    make.top.equalTo(view.prev.bottom).offset(5)
                  }
                }
              ]
            }
          ]
        }]
      }
    }
  }

  set thumbnail_url(url: string) {
    (this.view.get("thumbnail") as UIImageView).src = url
  }

  set title(text: string) {
    (this.view.get("title") as UILabelView).text = text
  }

  set uploader(uploader: string) {
    (this.view.get("uploader") as UIButtonView).title = uploader
  }

  set category(category: EHCategory) {
    (this.view.get("category") as UILabelView).text = category;
    (this.view.get("category") as UILabelView).bgcolor = catColor[category];
  }

  heightToWidth(width: number) {
    return Math.min(Math.max(170, Math.round(width / 3 * 1.414)), 300)
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
          bgcolor: $color("backgroundColor")
        },
        layout: $layout.fill,
        views: [{
          type: "view",
          props: {
            smoothCorners: true,
            cornerRadius: 8,
            clipsToBounds: true,
            bgcolor: $color("tertiarySurface")
          },
          layout: $layout.fill,
          views: [
            {
              type: "view",
              props: {
                id: "leftColumn",
                bgcolor: catColor.Misc
              },
              layout: (make, view) => {
                make.left.top.bottom.inset(0)
                make.width.equalTo(8)
              }
            },
            {
              type: "view",
              props: {
                id: "rightColumn",
                bgcolor: catColor.Misc
              },
              layout: (make, view) => {
                make.right.top.bottom.inset(0)
                make.width.equalTo(8)
              }
            },
            matrix.definition
          ]
        }]
      }
    }
  }

  heightToWidth(width: number) {
    return this._matrix.heightToWidth(width - 8 * 2 - 5 * 2)
  }

  set leftColumnColor(color: UIColor) {
    this.view.get("leftColumn").bgcolor = color
    this.view.get("rightColumn").bgcolor = color
  }
}

class TagsFlowlayoutWrapper extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _flowlayout?: TagsFlowlayout;
  constructor() {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("clear")
        },
        layout: $layout.fill
      }
    }
  }

  set taglist(taglist: CompleteTagListItem[]) {
    if (this._flowlayout) {
      this._flowlayout.view.remove()
    }
    this._flowlayout = new TagsFlowlayout(taglist)
    this.view.add(this._flowlayout.definition)
  }

  heightToWidth(width: number) {
    return this._flowlayout?.heightToWidth(width) || 1
  }
}

class RateButton extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _rating: number = 0;
  private _is_my_rating: boolean = false;
  private _isRequestInProgress: boolean = false;
  constructor({ handler }: {
    handler: (currentRating: number) => Promise<number>
  }) {
    super();
    const ratingWidth = this._calRatingWidth(this._rating);
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          userInteractionEnabled: true
        },
        layout: $layout.fill,
        views: [
          {
            type: "image",
            props: {
              id: "star",
              tintColor: this._is_my_rating ? ratingColor : $color("orange"),
              symbol: "star"
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super)
              make.centerY.equalTo(view.super).offset(-10)
              make.size.equalTo($size(50, 50))
            }
          },
          {
            type: "view",
            props: {
            },
            layout: (make, view) => {
              make.center.equalTo(view.prev)
              make.size.equalTo(view.prev)
            },
            views: [{
              type: "view",
              props: {
                id: "mask",
                clipsToBounds: true,
              },
              layout: (make, view) => {
                make.left.top.bottom.inset(0)
                make.width.equalTo(ratingWidth)
              },
              views: [{
                type: "image",
                props: {
                  id: "starfill",
                  tintColor: this._is_my_rating ? ratingColor : $color("orange"),
                  symbol: "star.fill"
                },
                layout: (make, view) => {
                  make.left.top.bottom.inset(0)
                  make.size.equalTo($size(50, 50))
                }
              }]
            }]
          },
          {
            type: "label",
            props: {
              text: this._rating.toFixed(2),
              font: $font(12),
              textColor: $color("primaryText"),
              align: $align.center
            },
            layout: (make, view) => {
              make.left.right.inset(10)
              make.centerX.equalTo(view.super)
              make.top.equalTo(view.prev.bottom).offset(5)
            }
          }
        ],
        events: {
          tapped: async sender => {
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
          }
        }
      }
    }
  }

  set rating(rating: number) {
    this._rating = rating;
    (this.view.get("label") as UILabelView).text = rating.toFixed(2);
    const ratingWidth = this._calRatingWidth(rating);
    (this.view.get("mask") as UIView).updateLayout((make, view) => {
      make.width.equalTo(ratingWidth)
    })
  }

  get rating() {
    return this._rating;
  }

  set is_my_rating(is_my_rating: boolean) {
    this._is_my_rating = is_my_rating;
    (this.view.get("star") as UIImageView).tintColor = is_my_rating ? ratingColor : $color("orange");
    (this.view.get("starfill") as UIImageView).tintColor = is_my_rating ? ratingColor : $color("orange");

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
    return rating < 5 ? Math.floor(30 * rating / 5) + 10 : 50;
  }
}

type FavoriteButtonActionResult = {
  success: true,
  favorited: true,
  favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  title: string
} | { success: true, favorited: false } | { success: false, dissmissed?: boolean }

class FavoriteButton extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _handler: (action: "default" | "unfavorite" | "other") => Promise<FavoriteButtonActionResult>
  private _isRequestInProgress: boolean = false;
  constructor({ handler }: {
    handler: (action: "default" | "unfavorite" | "other") => Promise<FavoriteButtonActionResult>
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
                    }
                  },
                  {
                    title: "更多选项",
                    handler: async () => {
                      await this._handleEvent("other");
                    }
                  }
                ]
              }
            },
            layout: $layout.fill,
            views: [
              {
                type: "image",
                props: {
                  id: "image_favorited",
                  tintColor: favcatColor[0],
                  symbol: "heart.fill"
                },
                layout: (make, view) => {
                  make.centerX.equalTo(view.super)
                  make.centerY.equalTo(view.super).offset(-10)
                  make.size.equalTo($size(50, 50))
                }
              },
              {
                type: "label",
                props: {
                  id: "label_favorited",
                  text: "",
                  font: $font(12),
                  textColor: $color("primaryText"),
                  align: $align.center,
                  lines: 2
                },
                layout: (make, view) => {
                  make.left.right.inset(5)
                  make.centerX.equalTo(view.super)
                  make.top.equalTo(view.prev.bottom).offset(5)
                }
              }
            ]
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
                    title: "收藏到" + configManager.favcatTitles[configManager.defaultFavcat],
                    handler: async () => {
                      await this._handleEvent("default");
                    }
                  },
                  {
                    title: "更多选项",
                    handler: async () => {
                      await this._handleEvent("other");
                    }
                  }
                ]
              }
            },
            layout: $layout.fill,
            views: [
              {
                type: "image",
                props: {
                  id: "image_unfavorited",
                  tintColor: defaultButtonColor,
                  symbol: "heart"
                },
                layout: (make, view) => {
                  make.centerX.equalTo(view.super)
                  make.centerY.equalTo(view.super).offset(-10)
                  make.size.equalTo($size(50, 50))
                }
              },
              {
                type: "label",
                props: {
                  id: "label_unfavorited",
                  text: "点击收藏",
                  font: $font(12),
                  textColor: $color("primaryText"),
                  align: $align.center,
                  lines: 2
                },
                layout: (make, view) => {
                  make.left.right.inset(5)
                  make.centerX.equalTo(view.super)
                  make.top.equalTo(view.prev.bottom).offset(5)
                }
              }
            ]
          }
        ]
      }
    }
  }

  favorite(favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, title: string) {
    (this.view.get("image_favorited") as UIImageView).tintColor = favcatColor[favcat];
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
    };
    this._isRequestInProgress = true;
    const result = await this._handler(action)
    this._isRequestInProgress = false;
    if (result.success) {
      if (result.favorited) {
        this.favorite(result.favcat, result.title)
      } else {
        this.unfavorite()
      }
    } else {
      if (!result.dissmissed) $ui.error("收藏操作失败");
    }
  }
}

class CommonButton extends Base<UIButtonView, UiTypes.ButtonOptions> {
  _defineView: () => UiTypes.ButtonOptions;
  constructor({ title, symbol, image, symbolColor, contentMode, handler }: {
    title: string;
    symbol?: string;
    image?: UIImage;
    symbolColor?: UIColor;
    contentMode?: number;
    handler: () => void;
  }) {
    super();
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
              id: "icon",
              tintColor: symbolColor ?? defaultButtonColor,
              image: image,
              symbol: symbol,
              contentMode: contentMode ?? 2
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super)
              make.centerY.equalTo(view.super).offset(-10)
              make.size.equalTo($size(50, 50))
            }
          },
          {
            type: "label",
            props: {
              id: "title",
              text: title,
              font: $font(12),
              textColor: $color("primaryText"),
              align: $align.center,
              lines: 2
            },
            layout: (make, view) => {
              make.left.right.inset(10)
              make.centerX.equalTo(view.super)
              make.top.equalTo(view.prev.bottom).offset(5)
            }
          }
        ],
        events: {
          tapped: sender => {
            handler();
          }
        }
      }
    }
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

function mapTaglist(taglist: EHGallery["taglist"]): CompleteTagListItem[] {
  return taglist.map(({ namespace, tags }) => {
    return {
      namespace,
      namespaceTranslated: namespaceTranslations[namespace],
      tags: tags.map(name => {
        const markedTag = configManager.getMarkedTag(namespace, name)
        return {
          name,
          namespace,
          translation: configManager.translate(namespace, name),
          selected: false,
          marked: Boolean(markedTag),
          watched: markedTag?.watched ?? false,
          hidden: markedTag?.hidden ?? false
        }
      })
    }
  })
}

export class GalleryInfoController extends BaseController {
  gid: number;
  private _infos?: EHGallery;
  private _timer?: TimerTypes.Timer;
  private _topThumbnailfinished: boolean = false;
  cviews: {
    infoHeaderView: InfoHeaderView;
    infoMatrix: DynamicItemSizeMatrix;
    rateButton: RateButton;
    favoriteButton: FavoriteButton;
    readButton: CommonButton;
    downloadButton: DownloadButton;
    torrentButton: CommonButton;
    hathDownloadButton: CommonButton;
    primaryButtonsWrapper: ButtonsWarpper;
    secondaryButtonsWrapper: ButtonsWarpper;
    infoMatrixWarpper: InfoMatrixWrapper;
    tagsFlowlayoutWrapper: TagsFlowlayoutWrapper;
    list: DynamicRowHeightList;
  };
  constructor(gid: number, readHandler: (index: number) => void) {
    super({
      props: { bgcolor: $color("backgroundColor") }
    });
    this.gid = gid;
    const infoHeaderView = new InfoHeaderView()
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
                tintColor: $color("systemLink")
              },
              layout: (make, view) => {
                make.left.inset(1)
                make.centerY.equalTo(view.super)
                make.width.equalTo(13)
                make.height.equalTo(13)
              }
            },
            {
              type: "label",
              props: {
                id: "label",
                textColor: $color("secondaryText"),
                font: $font(12),
                align: $align.left,
              },
              layout: (make, view) => {
                make.top.bottom.right.inset(0)
                make.left.equalTo(view.prev.right).inset(3)
              }
            },
          ]
        }
      },
      layout: (make, view) => {
        make.left.right.inset(5 + 8)
        make.top.bottom.right.inset(0)
      },
      events: {
        tapped: (sender) => {
          if (!this._infos) return;
          const galleryDetailedInfoController = new GalleryDetailedInfoController(this._infos)
          galleryDetailedInfoController.uipush({
            navBarHidden: true,
            statusBarStyle: 0
          })
        }
      }
    });
    const infoMatrixWarpper = new InfoMatrixWrapper(infoMatrix)
    const rateButton = new RateButton({
      handler: async currentRating => {
        if (!this._infos) return 0;
        let newRating: 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;
        try {
          newRating = await rateAlert({ rating: Math.max(Math.floor(currentRating * 2) / 2, 0.5) }) as 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;
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
          )
          return newRating
        } catch (e) {
          $ui.error("评分失败")
        }
        return 0;
      }
    })
    const favoriteButton = new FavoriteButton({
      handler: async (action) => {
        if (!this._infos) return { success: false }
        switch (action) {
          case "default": {
            const defaultFavcat = configManager.defaultFavcat;
            try {
              await api.addOrModifyFav(this.gid, this._infos.token, defaultFavcat)
            } catch (e) {
              return { success: false }
            }
            return { success: true, favorited: true, favcat: defaultFavcat, title: configManager.favcatTitles[defaultFavcat] };
          }
          case "unfavorite": {
            try {
              await api.deleteFav(this.gid, this._infos.token);
            } catch (e) {
              return { success: false };
            }
            return { success: true, favorited: false };
          }
          case "other": {
            try {
              const result = await galleryFavoriteDialog(this._infos)
              if (result.success) {
                await api.addOrModifyFav(this.gid, this._infos.token, result.favcat, result.favnote)
                return { success: true, favorited: true, favcat: result.favcat, title: configManager.favcatTitles[result.favcat] }
              } else {
                return { success: false, dissmissed: true }
              }
            } catch (e) {
              if (e === "cancel") {
                return { success: false, dissmissed: true }
              } else {
                return { success: false }
              }
            }
          }
          default:
            throw new Error("Invalid action")
        }

      }
    })
    const readButton = new CommonButton({
      title: "阅读",
      symbol: "book",
      handler: () => {
        const currentReadPage = statusManager.getLastReadPage(this.gid)
        readHandler(currentReadPage)
      }
    })

    const downloadButton = new DownloadButton({
      status: "pending",
      progress: 0,
      handler: () => { }
    })

    const torrentButton = new CommonButton({
      title: "种子",
      image: $image("assets/magnet-sf-svgrepo-com-128.png").alwaysTemplate,
      contentMode: 1,
      handler: () => {
        if (!this._infos) return;
        const galleryTorrentsController = new GalleryTorrentsController(this._infos)
        galleryTorrentsController.present()
      }
    })

    const hathDownloadButton = new CommonButton({
      title: "Hath下载",
      symbol: "network",
      handler: () => {
        if (!this._infos) return;
        const galleryHathController = new GalleryHathController(this._infos)
        galleryHathController.present()
      }
    })

    const webDAVButton = new CommonButton({
      title: "WebDAV",
      symbol: "externaldrive.connected.to.line.below",
      handler: () => { }
    })

    const primaryButtonsWrapper = new ButtonsWarpper([
      rateButton,
      favoriteButton,
      readButton
    ])

    const secondaryButtonsWrapper = new ButtonsWarpper([
      downloadButton,
      torrentButton,
      hathDownloadButton,
      webDAVButton
    ])

    const tagsFlowlayoutWrapper = new TagsFlowlayoutWrapper()
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
        tagsFlowlayoutWrapper,
        new BlankView(50)
      ],
      props: {
        bgcolor: $color("clear"),
        separatorHidden: true,
        showsVerticalIndicator: false
      },
      layout: (make, view) => {
        make.left.right.inset(10)
        make.top.bottom.inset(0)
      },
      events: {}
    })
    this.cviews = {
      infoHeaderView,
      infoMatrix,
      rateButton,
      favoriteButton,
      readButton,
      downloadButton,
      torrentButton,
      hathDownloadButton,
      primaryButtonsWrapper,
      secondaryButtonsWrapper,
      infoMatrixWarpper,
      tagsFlowlayoutWrapper,
      list
    }
    this.rootView.views = [list]
  }

  set infos(infos: EHGallery) {
    this._infos = infos;
    const topThumbnailPath = downloaderManager.get(this.gid).result.topThumbnail.path
    this._topThumbnailfinished = Boolean(topThumbnailPath)
    this.cviews.infoHeaderView.thumbnail_url = topThumbnailPath || "";
    this.cviews.infoHeaderView.title = infos.japanese_title || infos.english_title;
    this.cviews.infoHeaderView.uploader = infos.uploader || "";
    this.cviews.infoHeaderView.category = infos.category;
    const data: {
      label: {
        text: string;
        textColor?: UIColor;
      };
      icon: {
        symbol: string;
        tintColor?: UIColor;
      };
    }[] = [
        {
          label: {
            text: (configManager.translate("language", infos.language) || infos.language)
              + (infos.translated ? " 翻译" : "")
              + (infos.rewrited ? " 重写" : "")
          },
          icon: { symbol: "character.textbox" }
        },
        {
          label: { text: `${infos.length}页` },
          icon: { symbol: "photo.fill" }
        },
        {
          label: { text: infos.file_size },
          icon: { symbol: "doc.zipper" }
        },
        {
          label: { text: `${infos.average_rating}(共${infos.rating_count}次评分)` },
          icon: { symbol: "star.fill" }
        },

        {
          label: { text: `${infos.favorite_count}次收藏` },
          icon: { symbol: "heart.fill" }
        },
        {
          label: { text: toSimpleUTCTimeString(infos.posted_time) },
          icon: { symbol: "clock.fill" }
        }
      ]
    if (infos.visible === false) {
      data.push({
        label: {
          text: "不可见: " + (infos.invisible_cause && invisibleCauseMap[infos.invisible_cause] || ""),
          textColor: $color("red")
        },
        icon: {
          symbol: "lock.doc",
          tintColor: $color("red")
        }
      })
    }
    this.cviews.infoMatrix.data = data
    this.cviews.infoMatrixWarpper.leftColumnColor = catColor[infos.category]
    this.cviews.rateButton.rating = infos.display_rating
    this.cviews.rateButton.is_my_rating = infos.is_my_rating
    if (infos.favcat !== undefined && infos.favcat_title !== undefined) {
      this.cviews.favoriteButton.favorite(infos.favcat, infos.favcat_title)
    } else {
      this.cviews.favoriteButton.unfavorite()
    }
    this.cviews.torrentButton.title = `种子(${infos.torrent_count})`
    if (infos.torrent_count === 0) {
      this.cviews.torrentButton.view.enabled = false
    } else {
      this.cviews.torrentButton.view.enabled = true
    }
    this.cviews.tagsFlowlayoutWrapper.taglist = mapTaglist(infos.taglist)
    this.cviews.list.view.reload()
  }

  refreshThumbnail() {
    const d = downloaderManager.get(this.gid)
    if (!d) return;
    const topThumbnailPath = d.result.topThumbnail.path
    this._topThumbnailfinished = Boolean(topThumbnailPath)
    this.cviews.infoHeaderView.thumbnail_url = topThumbnailPath || "";
    if (this._topThumbnailfinished && this._timer) {
      this._timer.invalidate()
    }
  }

  startTimer() {
    if (this._topThumbnailfinished) return;
    this._timer = $timer.schedule({
      interval: 2,
      handler: () => {
        this.refreshThumbnail()
      }
    })
  }

  stopTimer() {
    if (this._timer) {
      this._timer.invalidate()
    }
  }

  set currentReadPage(page: number) {
    if (page === 0) {
      this.cviews.readButton.title = `阅读`
    } else {
      this.cviews.readButton.title = `继续阅读\n第${page + 1}页`
    }
  }
}