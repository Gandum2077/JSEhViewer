import {
  Base,
  BaseController,
  Blur,
  ContentView,
  cvid,
  DynamicPreferenceListView,
  Label,
  PreferenceSection,
  sliderMaxColor,
  SymbolButton,
} from "jsbox-cview";
import { CustomImagePager } from "../components/custom-image-pager";
import { downloaderManager } from "../utils/api";
import { statusManager } from "../utils/status";
import { AITranslationConfigPickerController } from "./settings-translation-controller";
import { AiTranslationButton } from "../components/ai-translation-button";
import { configManager } from "../utils/config";
import { globalTimer } from "../utils/timer";
import { NoscrollImagePager } from "../components/noscroll-image-pager";
import { DownloadButtonForReader } from "../components/download-button-for-reader";
import { GalleryController } from "./gallery-controller";
import { VerticalImagePager } from "../components/vertical-image-pager";
import { SpreadCustomImagePager } from "../components/spread-custom-image-pager";
import { SpreadNoscrollImagePager } from "../components/spread-noscroll-image-pager";
import { ReaderConfig } from "../types";
import { favoriteImageManager } from "../utils/favorite-image";

let lastUITapGestureRecognizer: any;

function define(view: any, handler: (location: JBPoint) => void) {
  if (lastUITapGestureRecognizer) {
    $objc_release(lastUITapGestureRecognizer);
    lastUITapGestureRecognizer = undefined;
  }
  const id = cvid.newId;
  $define({
    type: id + ": NSObject",
    events: {
      create: () => {
        const tap = $objc("UITapGestureRecognizer").$alloc().$initWithTarget_action(self, "tapped:");
        view.$addGestureRecognizer(tap);
      },
      tapped: (gesture: any) => {
        const location = gesture.$locationInView(view);
        handler(location);
      },
    },
  });
  const r = $objc(id).$new();
  $objc_retain(r);
  lastUITapGestureRecognizer = r;
  return r;
}

class ReversableSlider extends Base<UISliderView, UiTypes.SliderOptions> {
  private _reversed: boolean;
  _defineView: () => UiTypes.SliderOptions;
  constructor({
    props,
    layout,
    events,
  }: {
    props: {
      value: number;
      min: number;
      max: number;
      reversed: boolean;
    };
    layout: (make: MASConstraintMaker, view: UISliderView) => void;
    events: {
      changed: (value: number) => void;
      touchesEnded: (value: number) => void;
    };
  }) {
    super();
    this._reversed = props.reversed;
    this._defineView = () => {
      return {
        type: "slider",
        props: {
          id: this.id,
          value: this._reversed ? props.max - props.value : props.value,
          min: props.min,
          max: props.max,
          continuous: true,
          minColor: this._reversed ? sliderMaxColor : $color("systemLink"),
          maxColor: this._reversed ? $color("systemLink") : sliderMaxColor,
        },
        layout,
        events: {
          changed: (sender) => {
            const value = this._reversed ? Math.floor(props.max - sender.value) : Math.floor(sender.value);
            events.changed(value);
          },
          touchesEnded: (sender) => {
            const value = this._reversed ? Math.floor(props.max - sender.value) : Math.floor(sender.value);
            events.touchesEnded(value);
          },
        },
      };
    };
  }

  set reversed(reversed: boolean) {
    if (reversed === this._reversed) return;
    const oldValue = this._reversed ? Math.floor(this.view.max - this.view.value) : Math.floor(this.view.value);

    this._reversed = reversed;
    this.view.minColor = this._reversed ? sliderMaxColor : $color("systemLink");
    this.view.maxColor = this._reversed ? $color("systemLink") : sliderMaxColor;
    this.view.value = this._reversed ? this.view.max - oldValue : oldValue;
  }

  get value() {
    return this._reversed ? Math.floor(this.view.max - this.view.value) : Math.floor(this.view.value);
  }

  set value(value: number) {
    if (this.value === value) return;
    this.view.value = this._reversed ? this.view.max - value : value;
  }
}

class ReversableMatrix extends Base<UIMatrixView, UiTypes.MatrixOptions> {
  private _width: number = 0;
  private _index: number;
  private _length: number;
  private _thumbnailItems: { path?: string; error: boolean }[];
  private _reversed: boolean;
  _defineView: () => UiTypes.MatrixOptions;
  constructor({
    props,
    events,
  }: {
    props: {
      index: number;
      length: number;
      thumbnailItems: { path?: string; error: boolean }[];
      reversed: boolean;
    };
    events: {
      changed: (index: number) => void;
    };
  }) {
    super();
    this._reversed = props.reversed;
    this._index = props.index;
    this._length = props.length;
    this._thumbnailItems = props.thumbnailItems;

    this._defineView = () => ({
      type: "matrix",
      props: {
        id: this.id,
        bgcolor: $color("clear"),
        direction: $scrollDirection.horizontal,
        itemSize: $size(80, 80),
        spacing: 5,
        showsHorizontalIndicator: false,
        scrollEnabled: false,
        data: this._mapData(),
        template: {
          views: [
            {
              type: "image",
              props: {
                id: "error",
                symbol: "exclamationmark.triangle.fill",
                tintColor: $color("red"),
              },
              layout: (make, view) => {
                make.center.equalTo(view.super);
                make.size.equalTo($size(25, 25));
              },
            },
            {
              type: "image",
              props: {
                id: "image",
                contentMode: 2,
                bgcolor: $color("black"),
                borderWidth: 0,
                borderColor: $color("systemLink"),
                cornerRadius: 6,
                smoothCorners: true,
              },
              layout: $layout.fill,
            },
          ],
        },
      },
      layout: (make, view) => {
        make.top.left.right.inset(0);
        make.height.equalTo(80);
      },
      events: {
        didSelect: (sender, indexPath) => {
          const index = this._reversed ? this._length - 1 - indexPath.item : indexPath.item;
          if (this._index === index) return;
          events.changed(index);
        },
        ready: (sender) => {
          this._updateContentOffset();
        },
        layoutSubviews: (sender) => {
          this._updateContentOffset();
        },
      },
    });
  }

  _mapData() {
    const items = this._reversed ? this._thumbnailItems.toReversed() : this._thumbnailItems;
    return items.map((item, i) => ({
      error: { hidden: !item.error },
      image: {
        src: item.path || "",
        borderWidth: i === (this._reversed ? this._length - 1 - this._index : this._index) ? 2 : 0,
      },
    }));
  }

  set reversed(reversed: boolean) {
    this._reversed = reversed;
    this.update();
  }

  set width(width: number) {
    this._width = width;
  }

  get index() {
    return this._index;
  }

  update({ thumbnailItems, index }: { index?: number; thumbnailItems?: { path?: string; error: boolean }[] } = {}) {
    if (index !== undefined && (index < 0 || index >= this._length)) return;
    if (thumbnailItems) this._thumbnailItems = thumbnailItems;
    if (index !== undefined) this._index = index;
    this.view.data = this._mapData();
    this._updateContentOffset();
  }

  private _updateContentOffset() {
    if (this._reversed) {
      if (this._width === 0) {
        this.view.contentOffset = $point(0, 0);
      } else if (this._index === 0 || this.view.contentSize.width <= this._width) {
        this.view.contentOffset = $point(this.view.contentSize.width - this._width - 5, 0);
      } else if (this.view.contentSize.width - (this._index * 85 - 85) < this._width) {
        this.view.contentOffset = $point(0, 0);
      } else {
        this.view.contentOffset = $point(85 * (this._length - 1 - this._index + 2) - this._width, 0);
      }
    } else {
      if (this._width === 0 || this._index === 0 || this.view.contentSize.width <= this._width) {
        this.view.contentOffset = $point(0, 0);
      } else if (this.view.contentSize.width - (this._index * 85 - 85) < this._width) {
        this.view.contentOffset = $point(this.view.contentSize.width - this._width, 0);
      } else {
        this.view.contentOffset = $point(85 * this._index - 85, 0);
      }
    }
  }
}

class FooterThumbnailView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _reversed: boolean;
  private _index: number; // 滑动结束后的index，用于外部更新
  private _innerIndex: number; // 随着滑动而变化的index，用于内部更新
  private _width: number; // 整体宽度
  private _length: number;
  private _thumbnailItems: { path?: string; error: boolean }[];
  private _thumbnailItemsFinished: boolean = false; // 缩略图是否全部加载完成
  cviews: {
    thumbnailMatrix: ReversableMatrix;
    sliderLeftLabel: Label;
    sliderRightLabel: Label;
    slider: ReversableSlider;
  };
  constructor(options: {
    props: {
      index: number;
      length: number;
      thumbnailItems: { path?: string; error: boolean }[];
      reversed: boolean;
    };
    events: {
      changed: (index: number) => void;
    };
  }) {
    super();
    this._reversed = options.props.reversed;
    this._index = options.props.index;
    this._innerIndex = this._index;
    this._width = 0;
    this._length = options.props.length;
    this._thumbnailItems = options.props.thumbnailItems;
    this._thumbnailItemsFinished = this._thumbnailItems.every((item) => item.path);
    this.cviews = {} as {
      thumbnailMatrix: ReversableMatrix;
      sliderLeftLabel: Label;
      sliderRightLabel: Label;
      slider: ReversableSlider;
    };
    this.cviews.sliderLeftLabel = new Label({
      props: {
        text: this._reversed ? this._length.toString() : (this._index + 1).toString(),
        textColor: $color("primaryText"),
        font: $font(16),
        align: $align.center,
      },
      layout: (make, view) => {
        make.left.top.bottom.inset(0);
        make.width.equalTo(45);
      },
    });
    this.cviews.sliderRightLabel = new Label({
      props: {
        text: this._reversed ? (this._index + 1).toString() : this._length.toString(),
        textColor: $color("primaryText"),
        font: $font(16),
        align: $align.center,
      },
      layout: (make, view) => {
        make.right.top.bottom.inset(0);
        make.width.equalTo(45);
      },
    });
    this.cviews.slider = new ReversableSlider({
      props: {
        value: this._index,
        min: 0,
        max: this._length - 1,
        reversed: this._reversed,
      },
      layout: (make, view) => {
        make.left.equalTo(view.prev.prev.right).inset(5);
        make.right.equalTo(view.prev.left).inset(5);
        make.top.bottom.inset(0);
      },
      events: {
        changed: (value) => {
          this.innerIndex = value;
        },
        touchesEnded: (value) => {
          if (this._index !== value) {
            this.index = value;
            options.events.changed(value);
          }
        },
      },
    });
    this.cviews.thumbnailMatrix = new ReversableMatrix({
      props: {
        index: this._index,
        length: this._length,
        thumbnailItems: this._thumbnailItems,
        reversed: this._reversed,
      },
      events: {
        changed: (index) => {
          this.index = index;
          options.events.changed(index);
        },
      },
    });

    this._defineView = () => {
      return {
        type: "view",
        props: { id: this.id },
        layout: $layout.fillSafeArea,
        views: [
          this.cviews.thumbnailMatrix.definition,
          {
            type: "view",
            props: {},
            layout: (make, view) => {
              make.left.right.inset(0);
              make.top.equalTo(view.prev.bottom);
              make.height.equalTo(50);
            },
            views: [
              this.cviews.sliderLeftLabel.definition,
              this.cviews.sliderRightLabel.definition,
              this.cviews.slider.definition,
            ],
          },
        ],
        events: {
          layoutSubviews: (sender) => {
            if (sender.frame.width <= 0 || sender.frame.height <= 0) return;
            this._width = sender.frame.width;
            this.cviews.thumbnailMatrix.width = this._width;
          },
        },
      };
    };
  }

  _mapData(index: number) {
    return this._thumbnailItems.map((item, i) => ({
      error: { hidden: !item.error },
      image: { src: item.path || "", borderWidth: i === index ? 2 : 0 },
    }));
  }

  refreshThumbnailItems(thumbnailItems: { path?: string; error: boolean }[]) {
    if (this._thumbnailItemsFinished) return;
    this._thumbnailItems = thumbnailItems;
    this._thumbnailItemsFinished = this._thumbnailItems.every((item) => item.path);
    this.cviews.thumbnailMatrix.update({ thumbnailItems, index: this._index });
  }

  updateFooter(index: number, sliderOnGoing: boolean) {
    this.cviews.thumbnailMatrix.update({ index });
    this.cviews.sliderLeftLabel.view.text = this._reversed ? this._length.toString() : (index + 1).toString();
    this.cviews.sliderRightLabel.view.text = this._reversed ? (index + 1).toString() : this._length.toString();
    if (!sliderOnGoing) {
      this.cviews.slider.value = index;
    }
  }

  get index() {
    return this._index;
  }

  set index(index: number) {
    if (this._index === index) return;
    this._index = index;
    this._innerIndex = index;
    this.updateFooter(index, false);
  }

  get innerIndex() {
    return this._innerIndex;
  }

  set innerIndex(index: number) {
    if (this._innerIndex === index) return;
    this._innerIndex = index;
    this.updateFooter(index, true);
  }

  set reversed(reversed: boolean) {
    if (this._reversed === reversed) return;
    this._reversed = reversed;
    this.cviews.slider.reversed = reversed;
    this.cviews.thumbnailMatrix.reversed = reversed;
    this.cviews.sliderLeftLabel.view.text = this._reversed ? this._length.toString() : (this._index + 1).toString();
    this.cviews.sliderRightLabel.view.text = this._reversed ? (this._index + 1).toString() : this._length.toString();
  }
}

type SettingViewProps = {
  readerConfig: ReaderConfig;
  onlyForThisGallery: boolean;
  imageDownloaded: boolean;
  aiTranslated: boolean;
  shareImageHandler: () => void;
  resetImageDownloadHandler: () => void;
  resetAiTranslationHandler: () => void;
  loadOrginalHandler: () => void;
  closeHandler: (readerConfig: ReaderConfig, onlyForThisGallery: boolean) => void;
  checkVerticalAllowed: () => boolean;
};

class SettingView extends Base<UIView, UiTypes.ViewOptions> {
  cviews: { list: DynamicPreferenceListView };
  private _props: SettingViewProps;
  _defineView: () => UiTypes.ViewOptions;
  constructor(props: SettingViewProps) {
    super();
    this._props = props;
    this._props.readerConfig = { ...props.readerConfig };
    const list = new DynamicPreferenceListView({
      sections: this._getCurrentSections(),
      props: {
        style: 1,
        bgcolor: $color($rgba(242, 242, 242, 0.95), $rgba(0, 0, 0, 0.9)),
        header: {
          type: "view",
          props: {
            height: 25,
          },
        },
      },
      layout: (make, view) => {
        make.width.equalTo(230);
        make.right.equalTo(view.super.safeAreaRight);
        make.top.bottom.inset(0);
      },
      events: {
        changed: (values: {
          spreadModeEnabled?: boolean;
          skipFirstPageInSpread?: boolean;
          skipLandscapePagesInSpread?: boolean;
        }) => {
          const spreadModeEnabled = values.spreadModeEnabled ?? this._props.readerConfig.spreadModeEnabled;
          const skipFirstPageInSpread = values.skipFirstPageInSpread ?? this._props.readerConfig.skipFirstPageInSpread;
          const skipLandscapePagesInSpread =
            values.skipLandscapePagesInSpread ?? this._props.readerConfig.skipLandscapePagesInSpread;

          if (spreadModeEnabled !== this._props.readerConfig.spreadModeEnabled) {
            if (spreadModeEnabled && !this._props.checkVerticalAllowed()) {
              pagingModeNotAllowedAlert();
              this._refresh();
              return;
            }
            this._props.readerConfig.spreadModeEnabled = spreadModeEnabled;
          }
          if (skipFirstPageInSpread !== this._props.readerConfig.skipFirstPageInSpread) {
            this._props.readerConfig.skipFirstPageInSpread = skipFirstPageInSpread;
          }
          if (skipLandscapePagesInSpread !== this._props.readerConfig.skipLandscapePagesInSpread) {
            this._props.readerConfig.skipLandscapePagesInSpread = skipLandscapePagesInSpread;
          }
          this._refresh();
        },
      },
    });
    this.cviews = {
      list,
    };
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
      },
      layout: (make, view) => {
        make.left.right.bottom.inset(0);
        make.top.equalTo(view.prev.prev.bottom);
      },
      views: [
        {
          type: "view",
          props: {
            userInteractionEnabled: true,
            bgcolor: $color($rgba(242, 242, 242, 0.2), $rgba(0, 0, 0, 0.2)),
          },
          layout: $layout.fill,
          events: {
            tapped: (sender) => {
              this.close();
            },
          },
        },
        list.definition,
      ],
    });
  }

  private _getCurrentSections(): PreferenceSection[] {
    const sections: PreferenceSection[] = [
      {
        title: "",
        rows: [
          {
            type: "symbol-action",
            title: "分享本页图片",
            symbol: "square.and.arrow.up",
            value: () => {
              this._props.shareImageHandler();
            },
          },
          {
            type: "symbol-action",
            title: "加载原图",
            symbol: "arrow.down.backward.and.arrow.up.forward.square",
            value: () => {
              this.close();
              this._props.loadOrginalHandler();
            },
          },
          {
            type: "symbol-action",
            title: "AI翻译设置",
            symbol: "globe",
            value: () => {
              this.close();
              const controller = new AITranslationConfigPickerController();
              controller.uipush({
                navBarHidden: true,
                statusBarStyle: 0,
              });
            },
          },
        ],
      },
      {
        title: "下列配置生效范围",
        rows: [
          {
            type: "symbol-action",
            title: "本图库",
            symbol: this._props.onlyForThisGallery ? "checkmark" : undefined,
            titleColor: this._props.onlyForThisGallery ? $color("systemLink") : undefined,
            tintColor: this._props.onlyForThisGallery ? $color("systemLink") : undefined,
            value: () => {
              if (!this._props.onlyForThisGallery) {
                this._props.onlyForThisGallery = true;
                this._refresh();
              }
            },
          },
          {
            type: "symbol-action",
            title: "所有图库",
            symbol: !this._props.onlyForThisGallery ? "checkmark" : undefined,
            titleColor: !this._props.onlyForThisGallery ? $color("systemLink") : undefined,
            tintColor: !this._props.onlyForThisGallery ? $color("systemLink") : undefined,
            value: () => {
              if (this._props.onlyForThisGallery) {
                this._props.onlyForThisGallery = false;
                this._refresh();
              }
            },
          },
        ],
      },
      {
        title: "翻页方向",
        rows: [
          {
            type: "symbol-action",
            title: "从左往右",
            symbol: "arrow.right.square",
            titleColor: this._props.readerConfig.pageDirection === "left_to_right" ? $color("systemLink") : undefined,
            tintColor: this._props.readerConfig.pageDirection === "left_to_right" ? $color("systemLink") : undefined,
            value: () => {
              if (this._props.readerConfig.pageDirection !== "left_to_right") {
                this._props.readerConfig.pageDirection = "left_to_right";
                this._refresh();
              }
            },
          },
          {
            type: "symbol-action",
            title: "从右往左",
            symbol: "arrow.left.square",
            titleColor: this._props.readerConfig.pageDirection === "right_to_left" ? $color("systemLink") : undefined,
            tintColor: this._props.readerConfig.pageDirection === "right_to_left" ? $color("systemLink") : undefined,
            value: () => {
              if (this._props.readerConfig.pageDirection !== "right_to_left") {
                this._props.readerConfig.pageDirection = "right_to_left";
                this._refresh();
              }
            },
          },
          {
            type: "symbol-action",
            title: "纵向",
            symbol: "arrow.down.square",
            titleColor: this._props.readerConfig.pageDirection === "vertical" ? $color("systemLink") : undefined,
            tintColor: this._props.readerConfig.pageDirection === "vertical" ? $color("systemLink") : undefined,
            value: () => {
              if (this._props.readerConfig.pageDirection !== "vertical") {
                if (!this._props.checkVerticalAllowed()) {
                  pagingModeNotAllowedAlert();
                  return;
                }
                this._props.readerConfig.pageDirection = "vertical";
                this._refresh();
              }
            },
          },
        ],
      },
    ];

    if (this._props.imageDownloaded) {
      sections[0].rows.push({
        type: "symbol-action",
        title: "重新下载本页图片",
        value: () => {
          this.close();
          this._props.resetImageDownloadHandler();
        },
      });
    }

    if (this._props.aiTranslated) {
      sections[0].rows.push({
        type: "symbol-action",
        title: "重置本页的AI翻译",
        value: () => {
          this.close();
          this._props.resetAiTranslationHandler();
        },
      });
    }

    const sectionSpreadMode: PreferenceSection = {
      title: "双页模式",
      rows: [
        {
          type: "boolean",
          title: "开启",
          key: "spreadModeEnabled",
          value: this._props.readerConfig.spreadModeEnabled,
        },
      ],
    };
    if (this._props.readerConfig.spreadModeEnabled) {
      sectionSpreadMode.rows.push({
        type: "boolean",
        title: "跳过首页",
        key: "skipFirstPageInSpread",
        value: this._props.readerConfig.skipFirstPageInSpread,
      });
      sectionSpreadMode.rows.push({
        type: "boolean",
        title: "跳过横图 & 条图",
        key: "skipLandscapePagesInSpread",
        value: this._props.readerConfig.skipLandscapePagesInSpread,
      });
    }
    const sectionPagingGesture: PreferenceSection = {
      title: "翻页手势",
      rows: [
        {
          type: "symbol-action",
          title: "滑动和点击",
          symbol: this._props.readerConfig.pagingGesture === "tap_and_swipe" ? "checkmark" : undefined,
          titleColor: this._props.readerConfig.pagingGesture === "tap_and_swipe" ? $color("systemLink") : undefined,
          tintColor: this._props.readerConfig.pagingGesture === "tap_and_swipe" ? $color("systemLink") : undefined,
          value: () => {
            if (this._props.readerConfig.pagingGesture !== "tap_and_swipe") {
              this._props.readerConfig.pagingGesture = "tap_and_swipe";
              this._refresh();
            }
          },
        },
        {
          type: "symbol-action",
          title: "仅滑动",
          symbol: this._props.readerConfig.pagingGesture === "swipe" ? "checkmark" : undefined,
          titleColor: this._props.readerConfig.pagingGesture === "swipe" ? $color("systemLink") : undefined,
          tintColor: this._props.readerConfig.pagingGesture === "swipe" ? $color("systemLink") : undefined,
          value: () => {
            if (this._props.readerConfig.pagingGesture !== "swipe") {
              this._props.readerConfig.pagingGesture = "swipe";
              this._refresh();
            }
          },
        },
        {
          type: "symbol-action",
          title: "仅点击",
          symbol: this._props.readerConfig.pagingGesture === "tap" ? "checkmark" : undefined,
          titleColor: this._props.readerConfig.pagingGesture === "tap" ? $color("systemLink") : undefined,
          tintColor: this._props.readerConfig.pagingGesture === "tap" ? $color("systemLink") : undefined,
          value: () => {
            if (this._props.readerConfig.pagingGesture !== "tap") {
              this._props.readerConfig.pagingGesture = "tap";
              this._refresh();
            }
          },
        },
      ],
    };

    if (this._props.readerConfig.pageDirection !== "vertical") {
      sections.push(sectionSpreadMode);
      sections.push(sectionPagingGesture);
    }
    return sections;
  }

  close() {
    this.view.hidden = true;
    this._props.closeHandler(this._props.readerConfig, this._props.onlyForThisGallery);
    this.view.remove();
  }

  _refresh() {
    this.cviews.list.sections = this._getCurrentSections();
  }
}

export class ReaderController extends BaseController {
  private gid: number;
  private _readerConfig: ReaderConfig;
  private _onlyForThisGallery: boolean;
  private imagePager?:
    | CustomImagePager
    | NoscrollImagePager
    | VerticalImagePager
    | SpreadCustomImagePager
    | SpreadNoscrollImagePager;
  private _autoPagerEnabled: boolean = false;
  private _autoPagerInterval: number = 1;
  private _autoPagerCountDown: number = 1;
  // 增加两个Set，其中一个记录以原画质重新载入的图片，另一个记录启用AI翻译的图片
  private reloadedPageSet: Set<number> = new Set();
  private aiTranslatedPageSet: Set<number> = new Set();
  // 记录收藏图片的Set
  private _favoriteImageSet: Set<number>;
  // 使用上级的autoCacheWhenReading

  // 上级GalleryController
  private _superGalleryController: GalleryController;

  cviews: {
    titleLabel: Label;
    aiTranslationButton: AiTranslationButton;
    favoriteImageButton: SymbolButton;
    header: Blur;
    footer: Blur;
    viewer: ContentView;
    footerThumbnailView: FooterThumbnailView;
    downloadButton: DownloadButtonForReader;
    settingView?: SettingView;
  };

  constructor({
    gid,
    index,
    length,
    superGalleryController,
  }: {
    gid: number;
    index: number;
    length: number;
    superGalleryController: GalleryController;
  }) {
    super({
      events: {
        didLoad: () => {
          globalTimer.addTask({
            id: this.gid.toString() + "reader",
            interval: 1,
            paused: true,
            handler: () => {
              if (!this.imagePager) return;
              if (!galleryDownloader) return;
              this.refreshCurrentPage();
              this.cviews.titleLabel.view.text = this._generateTitle();
              this.handleAiTranslationButtonStatus(this.imagePager.page);
              this.cviews.footerThumbnailView.refreshThumbnailItems(galleryDownloader.result.thumbnails);

              this.cviews.downloadButton.progress = galleryDownloader.finishedOfImages / length;

              if (this._autoPagerEnabled) {
                // 自动翻页
                // 首先检测本页是否加载完成。如果没有加载完成，不翻页并且重制倒计时为翻页间隔
                // 如果加载完成，倒计时减1，如果倒计时小于等于0，翻页并重制倒计时
                // 另外，如果翻到最后一页，不再翻页; 或者settingView没有隐藏，也不翻页
                if (
                  !this.imagePager.isCurrentPagesAllLoaded ||
                  this.imagePager.nextPage === undefined ||
                  this.cviews.settingView
                ) {
                  this._autoPagerCountDown = this._autoPagerInterval;
                  return;
                } else {
                  this._autoPagerCountDown -= 1;
                  if (this._autoPagerCountDown <= 0) {
                    this.handleTurnPage(this.imagePager.nextPage);
                  }
                }
              }

              if (!this._superGalleryController.fatalErrorAlerted && this._superGalleryController._checkFatalError()) {
                this._superGalleryController.fatalErrorAlerted = true;
                $ui.alert({
                  title: "致命错误",
                  message: "请返回图库页面，点击右上角手动刷新",
                });
              }
            },
          });
        },
        didAppear: () => {
          globalTimer.resumeTask(this.gid.toString() + "reader");
        },
        didDisappear: () => {
          globalTimer.pauseTask(this.gid.toString() + "reader");
          statusManager.updateArchiveItem(this.gid, {
            last_read_page: this.cviews.footerThumbnailView.index,
          });
        },
        didRemove: () => {
          statusManager.updateArchiveItem(this.gid, {
            last_read_page: this.cviews.footerThumbnailView.index,
          });
          downloaderManager.get(this.gid)!.reading = false;
          globalTimer.removeTask(this.gid.toString() + "reader");
          if (lastUITapGestureRecognizer) {
            $objc_release(lastUITapGestureRecognizer);
            lastUITapGestureRecognizer = undefined;
          }
        },
      },
    });
    this._superGalleryController = superGalleryController;
    this.gid = gid;
    const readerConfig = configManager.getGalleryReaderConfig(gid);
    if (readerConfig) {
      this._readerConfig = readerConfig;
      this._onlyForThisGallery = true;
    } else {
      this._readerConfig = configManager.getCommonReaderConfig();
      this._onlyForThisGallery = false;
    }
    const galleryDownloader = downloaderManager.get(gid);
    if (!galleryDownloader) throw new Error("galleryDownloader not found");

    this._favoriteImageSet = new Set(favoriteImageManager.queryByGid(this.gid).map((n) => n.page_index));

    // 检查纵向滑动是否可用：需要所有分页都下载完
    if (
      (this._readerConfig.pageDirection === "vertical" || this._readerConfig.spreadModeEnabled) &&
      galleryDownloader.finishedOfHtmls !== galleryDownloader.infos.total_pages
    ) {
      const alertType = this._readerConfig.pageDirection === "vertical" ? "vertical" : "spread";
      this._readerConfig.pageDirection = "left_to_right";
      this._readerConfig.spreadModeEnabled = false;
      pagingModeNotAllowedAlert(alertType);
    }
    const footerThumbnailView = new FooterThumbnailView({
      props: {
        index,
        length,
        thumbnailItems: galleryDownloader.result.thumbnails,
        reversed: this._readerConfig.pageDirection === "right_to_left",
      },
      events: {
        changed: (index) => this.handleTurnPage(index),
      },
    });
    const titleLabel = new Label({
      props: {
        text: (index + 1).toString(),
        font: $font(16),
        align: $align.center,
        lines: 1,
      },
      layout: (make, view) => {
        make.left.equalTo(view.prev.prev.right).inset(0);
        make.right.equalTo(view.prev.left).inset(0);
        make.top.bottom.inset(0);
      },
    });
    const rightSymbolButton = new SymbolButton({
      props: {
        symbol: "ellipsis",
      },
      layout: (make, view) => {
        make.right.top.bottom.inset(0);
        make.width.equalTo(50);
      },
      events: {
        tapped: (sender) => {
          if (this.cviews.settingView) {
            this.cviews.settingView.close();
            return;
          }

          const index = footerThumbnailView.index;
          const galleryDownloader = downloaderManager.get(this.gid);
          if (!galleryDownloader) return;
          const image = galleryDownloader.result.images[index];
          const imageDownloaded = Boolean(image.path);
          const aiTranslation = galleryDownloader.result.aiTranslations[index];
          const aiTranslated = Boolean(aiTranslation.path);
          const settingView = new SettingView({
            readerConfig: this._readerConfig,
            onlyForThisGallery: this._onlyForThisGallery,
            imageDownloaded,
            aiTranslated,
            shareImageHandler: () => {
              const index = this.cviews.footerThumbnailView.index;
              const galleryDownloader = downloaderManager.get(this.gid);
              if (!galleryDownloader) return;
              const path = galleryDownloader.result.images[index].path;
              if (path) {
                $share.sheet($image(path));
              } else {
                $ui.error("当前图片尚未加载");
              }
            },
            resetImageDownloadHandler: () => {
              const index = footerThumbnailView.index;
              const galleryDownloader = downloaderManager.get(this.gid);
              if (!galleryDownloader) return;
              const image = galleryDownloader.result.images[index];

              const path = image.path;
              if (path) {
                $file.delete(path);
                image.path = undefined;
                image.error = false;
                image.started = false;
                this.refreshCurrentPage(true);
                downloaderManager.startOne(this.gid);
              }
            },
            resetAiTranslationHandler: () => {
              const index = footerThumbnailView.index;
              const galleryDownloader = downloaderManager.get(this.gid);
              if (!galleryDownloader) return;
              const aiTranslation = galleryDownloader.result.aiTranslations[index];
              const path = aiTranslation.path;
              if (path) {
                $file.delete(path);
                aiTranslation.path = undefined;
                aiTranslation.error = false;
                aiTranslation.started = false;
                aiTranslation.userSelected = false;
                this.aiTranslatedPageSet.delete(index);
                aiTranslationButton.status = "pending";
                this.refreshCurrentPage(true);
              }
            },
            loadOrginalHandler: () => {
              const index = this.cviews.footerThumbnailView.index;
              if (this.reloadedPageSet.has(index)) return; // 如果已经添加过，不再重复添加

              this.reloadedPageSet.add(index);
              // 查看本页面的info是否已经加载完成
              const galleryDownloader = downloaderManager.get(this.gid);
              if (!galleryDownloader) return;
              const originalImage = galleryDownloader.result.originalImages[index];
              // 如果已经下载好了，则立即刷新
              // 这种情况只存在于下载器初始化时，已经下载好了原图
              if (originalImage.path) {
                this.refreshCurrentPage();
              }
              // 如果没有下载好，则选择此图片使下载器准备下载
              originalImage.userSelected = true;
              // 重新启动下载器
              galleryDownloader.start();

              // 刷新标题
              this.cviews.titleLabel.view.text = this._generateTitle();
            },
            closeHandler: (readerConfig, onlyForThisGallery) => {
              // 与之前的readerConfig，如果有差异则重新布局
              if (
                this._readerConfig.pageDirection !== readerConfig.pageDirection ||
                this._readerConfig.spreadModeEnabled !== readerConfig.spreadModeEnabled ||
                this._readerConfig.skipFirstPageInSpread !== readerConfig.skipFirstPageInSpread ||
                this._readerConfig.skipLandscapePagesInSpread !== readerConfig.skipLandscapePagesInSpread ||
                this._readerConfig.pagingGesture !== readerConfig.pagingGesture
              ) {
                this._readerConfig = readerConfig;
                viewerLayoutSubviews(viewer.view);
              }

              // 写入数据库
              this._onlyForThisGallery = onlyForThisGallery;
              if (this._onlyForThisGallery) {
                configManager.setGalleryReaderConfig(this.gid, this._readerConfig);
              } else {
                configManager.setCommonReaderConfig(readerConfig);
                configManager.deleteGalleryReaderConfig(this.gid);
              }

              // 将settingView除名
              this.cviews.settingView = undefined;
            },
            checkVerticalAllowed: () => {
              const d = downloaderManager.get(gid);
              if (!d) throw new Error("galleryDownloader not found");
              return d.finishedOfHtmls === d.infos.total_pages;
            },
          });
          this.cviews.settingView = settingView;
          this.rootView.add(settingView);
        },
      },
    });
    const header = new Blur({
      props: {
        style: 10,
      },
      layout: (make, view) => {
        make.left.right.top.inset(0);
        make.bottom.equalTo(view.super.safeAreaTop).offset(50);
      },
      views: [
        {
          type: "view",
          props: {},
          layout: (make, view) => {
            make.left.right.equalTo(view.super.safeArea).inset(5);
            make.bottom.inset(0);
            make.height.equalTo(50);
          },
          views: [
            new SymbolButton({
              props: { symbol: "chevron.left" },
              layout: (make, view) => {
                make.left.top.bottom.inset(0);
                make.width.equalTo(50);
              },
              events: {
                tapped: () => {
                  $ui.pop();
                },
              },
            }).definition,
            rightSymbolButton.definition,
            titleLabel.definition,
          ],
        },
      ],
    });
    const progress = galleryDownloader.finishedOfImages / length;
    const downloadButton = new DownloadButtonForReader({
      progress,
      status:
        progress === 1 ? "finished" : this._superGalleryController.autoCacheWhenReading ? "downloading" : "paused",
      handler: (sender) => {
        const galleryDownloader = downloaderManager.get(gid);
        if (!galleryDownloader) throw new Error("galleryDownloader not found");
        const progress = galleryDownloader.finishedOfImages / length;
        if (progress === 1) return;
        if (sender.status === "downloading") {
          sender.status = "paused";
        } else if (sender.status === "paused") {
          sender.status = "downloading";
        }
        this._superGalleryController.autoCacheWhenReading = !this._superGalleryController.autoCacheWhenReading;
        // downloader进行转换
        galleryDownloader.autoCacheWhenReading = this._superGalleryController.autoCacheWhenReading;
        if (galleryDownloader.background) {
          // 如果启动了后台下载，需要对后台下载暂停或者继续
          if (this._superGalleryController.autoCacheWhenReading) {
            galleryDownloader.backgroundPaused = false;
            this._superGalleryController.subControllers.galleryInfoController.cviews.downloadButton.status =
              "downloading";
          } else {
            galleryDownloader.backgroundPaused = true;
            this._superGalleryController.subControllers.galleryInfoController.cviews.downloadButton.status = "paused";
          }
        }
        downloaderManager.startOne(this.gid);
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
    });
    const startAutoPagerButton = new SymbolButton({
      props: {
        symbol: "forward",
        menu: {
          title: "自动翻页",
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "每页停留1秒",
              handler: (sender) => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 1;
                this._autoPagerCountDown = 1;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "1.circle";
                stopAutoPagerButton.view.hidden = false;
              },
            },
            {
              title: "每页停留3秒",
              handler: (sender) => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 3;
                this._autoPagerCountDown = 3;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "3.circle";
                stopAutoPagerButton.view.hidden = false;
              },
            },
            {
              title: "每页停留5秒",
              handler: (sender) => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 5;
                this._autoPagerCountDown = 5;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "5.circle";
                stopAutoPagerButton.view.hidden = false;
              },
            },
            {
              title: "每页停留10秒",
              handler: (sender) => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 10;
                this._autoPagerCountDown = 10;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "10.circle";
                stopAutoPagerButton.view.hidden = false;
              },
            },
            {
              title: "每页停留15秒",
              handler: (sender) => {
                this._autoPagerEnabled = true;
                this._autoPagerInterval = 15;
                this._autoPagerCountDown = 15;
                startAutoPagerButton.view.hidden = true;
                stopAutoPagerButton.symbol = "15.circle";
                stopAutoPagerButton.view.hidden = false;
              },
            },
          ],
        },
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
    });
    const stopAutoPagerButton = new SymbolButton({
      props: {
        hidden: true,
        tintColor: $color("systemLink"),
        symbol: "1.circle",
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
      events: {
        tapped: (sender) => {
          this._autoPagerEnabled = false;
          startAutoPagerButton.view.hidden = false;
          stopAutoPagerButton.view.hidden = true;
        },
      },
    });
    const aiTranslationButton = new AiTranslationButton({
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
      events: {
        tapped: async () => {
          const index = this.cviews.footerThumbnailView.index;
          const galleryDownloader = downloaderManager.get(this.gid);
          if (!galleryDownloader) return;

          // 如果没有设置AI翻译，提示设置
          if (!configManager.selectedAiTranslationServiceName) {
            $ui.alert({
              title: "未设置AI翻译",
              message: "是否立即设置？",
              actions: [
                {
                  title: "取消",
                  handler: () => {},
                },
                {
                  title: "确定",
                  handler: () => {
                    const controller = new AITranslationConfigPickerController();
                    controller.uipush({
                      navBarHidden: true,
                      statusBarStyle: 0,
                    });
                  },
                },
              ],
            });
            return;
          }

          // 如果图片未加载，不响应
          const path = galleryDownloader.result.images[index].path;
          if (!path) {
            $ui.error("当前图片尚未加载");
            return;
          }

          // 如果处于AI翻译中，不响应
          if (aiTranslationButton.status === "loading") return;

          // 其他三种情况：pending、success、error
          // 如果是success，则返回到pending
          if (aiTranslationButton.status === "success") {
            aiTranslationButton.status = "pending";
            this.aiTranslatedPageSet.delete(index);
            this.refreshCurrentPage();
          } else {
            // 剩下两种情况
            // 添加到翻译清单
            this.aiTranslatedPageSet.add(index);
            // 查询翻译信息
            const aiTranslation = galleryDownloader.result.aiTranslations[index];
            if (aiTranslation.path) {
              // 如果已经翻译成功
              aiTranslationButton.status = "success";
              this.refreshCurrentPage();
            } else {
              if (aiTranslationButton.status === "error") {
                // 重新启动翻译
                aiTranslationButton.status = "loading";
                aiTranslation.error = false;
                aiTranslation.started = false;
              } else {
                aiTranslationButton.status = "loading";
                aiTranslation.userSelected = true;
              }
              // 重新启动下载器
              galleryDownloader.start();
            }
          }

          // 刷新标题
          this.cviews.titleLabel.view.text = this._generateTitle();
        },
      },
    });

    const favoriteImageButton = new SymbolButton({
      props: {
        symbol: this._favoriteImageSet.has(index) ? "heart.fill" : "heart",
        tintColor: this._favoriteImageSet.has(index) ? $color("orange") : $color("primaryText"),
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
      events: {
        tapped: (sender) => {
          const index = this.cviews.footerThumbnailView.index;
          if (this._favoriteImageSet.has(index)) {
            // 取消收藏
            if (favoriteImageManager.remove(this.gid, index)) {
              favoriteImageButton.symbol = "heart";
              favoriteImageButton.tintColor = $color("primaryText");
              this._favoriteImageSet.delete(index);
            } else {
              $ui.error("取消收藏失败");
            }
          } else {
            // 收藏
            const originalImage = galleryDownloader.result.originalImages[index];
            const isOriginal = this.reloadedPageSet.has(index) && Boolean(originalImage.path);
            const image = isOriginal ? originalImage : galleryDownloader.result.images[index];
            const thumbnail = galleryDownloader.result.thumbnails[index];
            if (!image.path) {
              $ui.warning("请等待当前图片加载");
              return;
            } else if (!thumbnail.path) {
              $ui.warning("请等待当前图片缩略图加载");
              return;
            } else if (favoriteImageManager.add(this.gid, index, image.path, thumbnail.path, isOriginal)) {
              favoriteImageButton.symbol = "heart.fill";
              favoriteImageButton.tintColor = $color("orange");
              this._favoriteImageSet.add(index);
            } else {
              $ui.error("收藏失败");
            }
          }
        },
      },
    });
    const footer = new Blur({
      props: {
        style: 6,
      },
      layout: (make, view) => {
        make.left.right.bottom.inset(0);
        make.top.equalTo(view.super.safeAreaBottom).offset(-200);
      },
      views: [
        {
          type: "view",
          props: {},
          layout: (make, view) => {
            make.left.right.top.inset(10);
            make.height.equalTo(130);
          },
          views: [footerThumbnailView.definition],
        },
        {
          type: "stack",
          props: {
            axis: $stackViewAxis.horizontal,
            distribution: $stackViewDistribution.fillEqually,
            stack: {
              views: [
                {
                  type: "view",
                  props: {},
                  views: [downloadButton.definition],
                },
                {
                  type: "view",
                  props: {},
                  views: [startAutoPagerButton.definition, stopAutoPagerButton.definition],
                },
                {
                  type: "view",
                  props: {},
                  views: [aiTranslationButton.definition],
                },
                {
                  type: "view",
                  props: {},
                  views: [favoriteImageButton.definition],
                },
              ],
            },
          },
          layout: (make, view) => {
            make.left.right.inset(0);
            make.top.equalTo(view.prev.bottom);
            make.height.equalTo(50);
          },
        },
      ],
    });
    let lastFrameWidth = 0;
    let lastFrameHeight = 0;
    const viewerLayoutSubviews = (sender: UIBaseView) => {
      this.cviews.footerThumbnailView.reversed = this._readerConfig.pageDirection === "right_to_left";
      lastFrameWidth = sender.frame.width;
      lastFrameHeight = sender.frame.height;
      if (sender.views.length !== 0) sender.views[0].remove();
      this.imagePager =
        this._readerConfig.pageDirection === "vertical"
          ? new VerticalImagePager({
              props: {
                srcs: this._generateSrcs(),
                page: footerThumbnailView.index,
                imageShareOnLongPressEnabled: configManager.imageShareOnLongPressEnabled,
              },
              layout: (make, view) => {
                make.left.right.equalTo(view.super.safeArea);
                make.top.bottom.inset(0);
              },
              events: {
                changed: (page) => this.handleTurnPage(page),
                reloadHandler: (page) => {
                  galleryDownloader.result.images[page].error = false;
                  galleryDownloader.result.images[page].started = false;
                  downloaderManager.startOne(this.gid);
                  this.refreshCurrentPage();
                },
                rowHeight: (page, width) => {
                  const d = downloaderManager.get(this.gid);
                  if (!d) return 0;
                  const htmlPage = d.infos.num_of_images_on_each_page
                    ? Math.floor(page / d.infos.num_of_images_on_each_page)
                    : 0;
                  if (htmlPage in d.infos.images) {
                    const frame = d.infos.images[htmlPage].find((n) => n.page === page)?.frame;
                    if (!frame) return Math.ceil(width * 1.414);
                    return Math.ceil((frame.height / frame.width) * width);
                  } else {
                    return Math.ceil(width * 1.414);
                  }
                },
              },
            })
          : this._readerConfig.spreadModeEnabled && this._readerConfig.pagingGesture === "tap"
            ? new SpreadNoscrollImagePager({
                props: {
                  srcs: this._generateSrcs(),
                  page: footerThumbnailView.index,
                  reversed: this._readerConfig.pageDirection === "right_to_left",
                  imageShareOnLongPressEnabled: configManager.imageShareOnLongPressEnabled,
                  skipFirstPage: this._readerConfig.skipFirstPageInSpread,
                  skipLandscapePages: this._readerConfig.skipLandscapePagesInSpread,
                },
                layout: $layout.fillSafeArea,
                events: {
                  changed: (page) => this.handleTurnPage(page),
                  reloadHandler: (page) => {
                    galleryDownloader.result.images[page].error = false;
                    galleryDownloader.result.images[page].started = false;
                    downloaderManager.startOne(this.gid);
                    this.refreshCurrentPage();
                  },
                  getEstimatedAspectRatio: (page) => {
                    const d = downloaderManager.get(this.gid);
                    if (!d) return 0;
                    const htmlPage = d.infos.num_of_images_on_each_page
                      ? Math.floor(page / d.infos.num_of_images_on_each_page)
                      : 0;
                    if (htmlPage in d.infos.images) {
                      const frame = d.infos.images[htmlPage].find((n) => n.page === page)?.frame;
                      if (!frame) return 0;
                      return frame.height / frame.width;
                    } else {
                      return 0;
                    }
                  },
                },
              })
            : this._readerConfig.spreadModeEnabled &&
                (this._readerConfig.pagingGesture === "swipe" || this._readerConfig.pagingGesture === "tap_and_swipe")
              ? new SpreadCustomImagePager({
                  props: {
                    srcs: this._generateSrcs(),
                    page: footerThumbnailView.index,
                    reversed: this._readerConfig.pageDirection === "right_to_left",
                    imageShareOnLongPressEnabled: configManager.imageShareOnLongPressEnabled,
                    skipFirstPage: this._readerConfig.skipFirstPageInSpread,
                    skipLandscapePages: this._readerConfig.skipLandscapePagesInSpread,
                  },
                  layout: $layout.fillSafeArea,
                  events: {
                    changed: (page) => this.handleTurnPage(page),
                    reloadHandler: (page) => {
                      galleryDownloader.result.images[page].error = false;
                      galleryDownloader.result.images[page].started = false;
                      downloaderManager.startOne(this.gid);
                      this.refreshCurrentPage();
                    },
                    getEstimatedAspectRatio: (page) => {
                      const d = downloaderManager.get(this.gid);
                      if (!d) return 0;
                      const htmlPage = d.infos.num_of_images_on_each_page
                        ? Math.floor(page / d.infos.num_of_images_on_each_page)
                        : 0;
                      if (htmlPage in d.infos.images) {
                        const frame = d.infos.images[htmlPage].find((n) => n.page === page)?.frame;
                        if (!frame) return 0;
                        return frame.height / frame.width;
                      } else {
                        return 0;
                      }
                    },
                  },
                })
              : this._readerConfig.pagingGesture === "tap"
                ? new NoscrollImagePager({
                    props: {
                      srcs: this._generateSrcs(),
                      page: footerThumbnailView.index,
                      imageShareOnLongPressEnabled: configManager.imageShareOnLongPressEnabled,
                    },
                    layout: $layout.fillSafeArea,
                    // 点击模式保持和横向滑动模式相同的方案，不过它可以改成$layout.fill，那样的话可以缩放全屏
                    events: {
                      changed: (page) => this.handleTurnPage(page),
                      reloadHandler: (page) => {
                        galleryDownloader.result.images[page].error = false;
                        galleryDownloader.result.images[page].started = false;
                        downloaderManager.startOne(this.gid);
                        this.refreshCurrentPage();
                      },
                    },
                  })
                : new CustomImagePager({
                    props: {
                      srcs: this._generateSrcs(),
                      page: footerThumbnailView.index,
                      imageShareOnLongPressEnabled: configManager.imageShareOnLongPressEnabled,
                      reversed: this._readerConfig.pageDirection === "right_to_left",
                    },
                    layout: $layout.fillSafeArea,
                    // 横向滑动模式必须限制在安全区域内，否则会出现切页时图片随机上下浮动一点点的问题（猜测和状态栏有关？）
                    events: {
                      changed: (page) => this.handleTurnPage(page),
                      reloadHandler: (page) => {
                        galleryDownloader.result.images[page].error = false;
                        galleryDownloader.result.images[page].started = false;
                        downloaderManager.startOne(this.gid);
                        this.refreshCurrentPage();
                      },
                    },
                  });
      sender.add(this.imagePager.definition);
      $delay(0.3, () => {
        if (!this.imagePager) return;
        define(this.imagePager.view.ocValue(), (location) => {
          if (!this.imagePager) return;
          if (this._readerConfig.pageDirection === "vertical" || this._readerConfig.pagingGesture === "swipe") {
            footer.view.hidden = !footer.view.hidden;
            header.view.hidden = !header.view.hidden;
            return;
          }
          const w = sender.frame.width;
          const h = sender.frame.height;
          const x = location.x;
          const y = location.y;
          if (
            y / h < 1 / 4 ||
            (this._readerConfig.pageDirection === "left_to_right" &&
              y / h >= 1 / 4 &&
              y / h <= 3 / 4 &&
              x / w < 1 / 3) ||
            (this._readerConfig.pageDirection === "right_to_left" && y / h >= 1 / 4 && y / h <= 3 / 4 && x / w > 2 / 3)
          ) {
            if (this.imagePager.prevPage === undefined) return;
            this.handleTurnPage(this.imagePager.prevPage);
          } else if (
            y / h > 3 / 4 ||
            (this._readerConfig.pageDirection === "left_to_right" &&
              y / h >= 1 / 4 &&
              y / h <= 3 / 4 &&
              x / w > 2 / 3) ||
            (this._readerConfig.pageDirection === "right_to_left" && y / h >= 1 / 4 && y / h <= 3 / 4 && x / w < 1 / 3)
          ) {
            if (this.imagePager.nextPage === undefined) return;
            this.handleTurnPage(this.imagePager.nextPage);
          } else {
            footer.view.hidden = !footer.view.hidden;
            header.view.hidden = !header.view.hidden;
          }
        }).$create();
      });
    };
    const viewer = new ContentView({
      props: { bgcolor: $color("clear") },
      layout: $layout.fill,
      views: [],
      events: {
        layoutSubviews: (sender) => {
          if (
            sender.frame.width <= 0 ||
            sender.frame.height <= 0 ||
            (sender.frame.width === lastFrameWidth && sender.frame.height === lastFrameHeight)
          )
            return;
          viewerLayoutSubviews(sender);
        },
      },
    });

    this.cviews = {
      titleLabel,
      aiTranslationButton,
      favoriteImageButton,
      header,
      footer,
      viewer,
      footerThumbnailView,
      downloadButton,
    };
    this.rootView.views = [viewer, header, footer];
  }

  refreshCurrentPage(forced: boolean = false) {
    if (!this.imagePager) return;
    const newSrcs = this._generateSrcs();
    const visiblePages = this.imagePager.visiblePages;
    let flagShouldRefresh = false;
    for (const page of visiblePages) {
      const current = this.imagePager.srcs[page];
      if (!current.path || current.type !== newSrcs[page].type) {
        flagShouldRefresh = true;
      }
    }
    if (flagShouldRefresh || forced) {
      this.imagePager.srcs = newSrcs;
    }
  }

  handleTurnPage(page: number) {
    if (this.cviews.footerThumbnailView.index !== page) this.cviews.footerThumbnailView.index = page;
    if (this.imagePager && this.imagePager.page !== page) this.imagePager.page = page;
    this._autoPagerCountDown = this._autoPagerInterval;
    this.refreshCurrentPage();
    const galleryDownloader = downloaderManager.get(this.gid);
    if (!galleryDownloader) throw new Error("galleryDownloader not found");
    galleryDownloader.currentReadingIndex = Math.max(page - 1, 0);
    if (!this._superGalleryController.autoCacheWhenReading) {
      // 检查前后三张图片是否存在 未开始 的任务
      const shouldStartDownloader = galleryDownloader.result.images
        .slice(galleryDownloader.currentReadingIndex, galleryDownloader.currentReadingIndex + 3)
        .some((n) => !n.started);
      if (shouldStartDownloader) {
        downloaderManager.startOne(this.gid);
      }
    }
    // 修改标题
    this.cviews.titleLabel.view.text = this._generateTitle();

    this.handleAiTranslationButtonStatus(page);
    this.handleFavoriteImageButtonStatus(page);

    // 修改上级GalleryController的阅读进度
    this._superGalleryController.subControllers.galleryInfoController.currentReadPage = page;
  }

  private handleAiTranslationButtonStatus(page: number) {
    const galleryDownloader = downloaderManager.get(this.gid);
    // 修改AI翻译按钮状态
    if (!this.aiTranslatedPageSet.has(page)) {
      // 如果不在翻译清单中，则为pending
      this.cviews.aiTranslationButton.status = "pending";
    } else {
      const aiTranslation = galleryDownloader!.result.aiTranslations[page];
      if (aiTranslation.path) {
        this.cviews.aiTranslationButton.status = "success";
      } else if (aiTranslation.error) {
        this.cviews.aiTranslationButton.status = "error";
      } else {
        this.cviews.aiTranslationButton.status = "loading";
      }
    }
  }

  private handleFavoriteImageButtonStatus(page: number) {
    this._favoriteImageSet.has(page);
    if (this._favoriteImageSet.has(page)) {
      this.cviews.favoriteImageButton.symbol = "heart.fill";
      this.cviews.favoriteImageButton.tintColor = $color("orange");
    } else {
      this.cviews.favoriteImageButton.symbol = "heart";
      this.cviews.favoriteImageButton.tintColor = $color("primaryText");
    }
  }

  private _generateTitle(): string {
    const index = this.cviews.footerThumbnailView.index;
    let title = `${index + 1}`;
    const galleryDownloader = downloaderManager.get(this.gid);
    if (!galleryDownloader) return title;
    // 查看是否在翻译清单
    const isInAiTranslatedPageSet = this.aiTranslatedPageSet.has(index);
    // 查看翻译状态
    let aiTranslationStatus: "pending" | "loading" | "success" | "error" = "pending";
    if (isInAiTranslatedPageSet) {
      const aiTranslation = galleryDownloader.result.aiTranslations[index];
      if (aiTranslation.error) {
        aiTranslationStatus = "error";
      } else if (aiTranslation.path) {
        aiTranslationStatus = "success";
      } else {
        aiTranslationStatus = "loading";
      }
    }
    // 查看是否在重新载入清单
    const isInReloadedPageSet = this.reloadedPageSet.has(index);
    // 查看重新载入状态
    let reloadStatus: "pending" | "loading" | "success" | "error" | "noOriginalImage" = "pending";
    if (isInReloadedPageSet) {
      const originalImage = galleryDownloader.result.originalImages[index];
      if (originalImage.noOriginalImage) {
        reloadStatus = "noOriginalImage";
      } else if (originalImage.error) {
        reloadStatus = "error";
      } else if (originalImage.path) {
        reloadStatus = "success";
      } else {
        reloadStatus = "loading";
      }
    }

    //生成标题
    if (isInReloadedPageSet || isInAiTranslatedPageSet) {
      title += " ";
    }
    if (isInReloadedPageSet) {
      if (reloadStatus === "loading") {
        title += "[原图加载中]";
      } else if (reloadStatus === "success") {
        title += "[原图]";
      } else if (reloadStatus === "error") {
        title += "[原图加载失败]";
      } else if (reloadStatus === "noOriginalImage") {
        title += "[原图不存在]";
      }
    }
    if (isInAiTranslatedPageSet) {
      if (aiTranslationStatus === "loading") {
        title += "[正在翻译]";
      } else if (aiTranslationStatus === "success") {
        title += "[翻译]";
      } else if (aiTranslationStatus === "error") {
        title += "[翻译失败]";
      }
    }
    return title;
  }

  /**
   * 综合galleryDownloader.result和reloadedPageSet、aiTranslatedPageSet，生成srcs
   */
  private _generateSrcs(): {
    path?: string;
    error: boolean;
    errorName?: string;
    type: "ai-translated" | "reloaded" | "normal";
  }[] {
    const galleryDownloader = downloaderManager.get(this.gid);
    if (!galleryDownloader) return []; // 如果没有下载器，返回空数组(不可能发生，因为下载器会在上一界面初始化)

    return galleryDownloader.result.images.map((image, i) => {
      if (this.aiTranslatedPageSet.has(i)) {
        // 如果在aiTranslatedPageSet中，查看翻译状态
        const aiTranslation = galleryDownloader.result.aiTranslations[i];
        if (aiTranslation.path) {
          return {
            path: aiTranslation.path,
            error: false,
            type: "ai-translated",
          };
        }
      }
      if (this.reloadedPageSet.has(i)) {
        const originalImage = galleryDownloader.result.originalImages[i];
        if (originalImage.path) {
          return { path: originalImage.path, error: false, type: "reloaded" };
        }
      }
      return {
        path: image.path,
        error: image.error,
        errorName: image.errorName,
        type: "normal",
      };
    });
  }
}

function pagingModeNotAllowedAlert(type: "vertical" | "spread" = "vertical") {
  $ui.alert({
    title: (type === "vertical" ? "纵向翻页" : "双页模式") + "暂不可用",
    message:
      "这需要先获取图库中的所有分页，目前还没有完成此步骤。请稍后手动切换。\n" +
      "附注：开通 Hath Perks 中的 Multi-Page Viewer（多页查看器）权限可以快速完成此步骤，开通后需要在本应用中重新登录。",
  });
}
