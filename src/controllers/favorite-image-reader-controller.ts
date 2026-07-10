import {
  Base,
  BaseController,
  Blur,
  ContentView,
  cvid,
  DynamicPreferenceListView,
  Label,
  PreferenceSection,
  SymbolButton,
} from "jsbox-cview";
import { CustomImagePager } from "../components/custom-image-pager";
import { NoscrollImagePager } from "../components/noscroll-image-pager";
import { FavoriteImageFile, FavoriteImageGroupWithFiles } from "../types";
import { configManager } from "../utils/config";
import { favoriteImageManager } from "../utils/favorite-image";
import { favoriteImagePath, favoriteImageTempPath } from "../utils/glv";
import { globalTimer } from "../utils/timer";
import { GalleryController } from "./gallery-controller";

type FavoriteImagePagingGesture = "tap_and_swipe" | "swipe" | "tap";
type FavoriteImageReaderFileSource = "favorite" | "temporary";

let lastFavoriteImageTapGestureRecognizer: any;

function releaseFavoriteImageTapGestureRecognizer() {
  if (!lastFavoriteImageTapGestureRecognizer) return;
  $objc_release(lastFavoriteImageTapGestureRecognizer);
  lastFavoriteImageTapGestureRecognizer = undefined;
}

function defineFavoriteImageTapGesture(view: any, handler: (location: JBPoint) => void) {
  releaseFavoriteImageTapGestureRecognizer();
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
  lastFavoriteImageTapGestureRecognizer = r;
  return r;
}

type SettingViewProps = {
  gesture: FavoriteImagePagingGesture;
  shareImageHandler: () => void;
  closeHandler: (gesture: FavoriteImagePagingGesture) => void;
};

class SettingView extends Base<UIView, UiTypes.ViewOptions> {
  cviews: { list: DynamicPreferenceListView };
  private _props: SettingViewProps;
  _defineView: () => UiTypes.ViewOptions;
  constructor(props: SettingViewProps) {
    super();
    this._props = props;
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
        ],
      },
      {
        title: "翻页手势",
        rows: [
          {
            type: "symbol-action",
            title: "滑动和点击",
            symbol: this._props.gesture === "tap_and_swipe" ? "checkmark" : undefined,
            titleColor: this._props.gesture === "tap_and_swipe" ? $color("systemLink") : undefined,
            tintColor: this._props.gesture === "tap_and_swipe" ? $color("systemLink") : undefined,
            value: () => {
              if (this._props.gesture !== "tap_and_swipe") {
                this._props.gesture = "tap_and_swipe";
                this._refresh();
              }
            },
          },
          {
            type: "symbol-action",
            title: "仅滑动",
            symbol: this._props.gesture === "swipe" ? "checkmark" : undefined,
            titleColor: this._props.gesture === "swipe" ? $color("systemLink") : undefined,
            tintColor: this._props.gesture === "swipe" ? $color("systemLink") : undefined,
            value: () => {
              if (this._props.gesture !== "swipe") {
                this._props.gesture = "swipe";
                this._refresh();
              }
            },
          },
          {
            type: "symbol-action",
            title: "仅点击",
            symbol: this._props.gesture === "tap" ? "checkmark" : undefined,
            titleColor: this._props.gesture === "tap" ? $color("systemLink") : undefined,
            tintColor: this._props.gesture === "tap" ? $color("systemLink") : undefined,
            value: () => {
              if (this._props.gesture !== "tap") {
                this._props.gesture = "tap";
                this._refresh();
              }
            },
          },
        ],
      },
    ];

    return sections;
  }

  close() {
    this.view.hidden = true;
    this._props.closeHandler(this._props.gesture);
    this.view.remove();
  }

  _refresh() {
    this.cviews.list.sections = this._getCurrentSections();
  }
}

type FavoriteImageReaderItem = {
  gid: number;
  token: string;
  length: number;
  title: string;
  pageIndex: number;
  fileName: string;
  fileSource: FavoriteImageReaderFileSource;
  isOriginal: boolean;
  isFavorite: boolean;
};

class FavoriteImageReaderTitleView extends Base<UIView, UiTypes.ViewOptions> {
  cviews: {
    titleLabel: Label;
    pageLabel: Label;
  };
  _defineView: () => UiTypes.ViewOptions;

  constructor({
    title,
    page,
    layout,
  }: {
    title: string;
    page: string;
    layout: (make: MASConstraintMaker, view: UIView) => void;
  }) {
    super();
    const titleLabel = new Label({
      props: {
        text: title,
        font: $font(12),
        align: $align.center,
        lines: 1,
      },
      layout: (make, view) => {
        make.left.right.top.inset(0);
        make.height.equalTo(25);
      },
    });
    const pageLabel = new Label({
      props: {
        text: page,
        font: $font(10),
        textColor: $color("secondaryText"),
        align: $align.center,
        lines: 1,
      },
      layout: (make, view) => {
        make.left.right.bottom.inset(0);
        make.height.equalTo(25);
      },
    });
    this.cviews = { titleLabel, pageLabel };
    this._defineView = () => ({
      type: "view",
      props: { id: this.id },
      layout,
      views: [titleLabel.definition, pageLabel.definition],
    });
  }

  update(title: string, page: string) {
    this.cviews.titleLabel.view.text = title;
    this.cviews.pageLabel.view.text = page;
  }
}

export class FavoriteImageReaderController extends BaseController {
  private _items: FavoriteImageReaderItem[];
  private _index: number;
  private _pagingGesture: FavoriteImagePagingGesture;
  private _imagePager?: CustomImagePager | NoscrollImagePager;
  private _timerId: string;
  private _autoPagerEnabled = false;
  private _autoPagerInterval = 1;
  private _autoPagerCountDown = 1;

  cviews: {
    titleView: FavoriteImageReaderTitleView;
    favoriteButton: SymbolButton;
    startAutoPagerButton: SymbolButton;
    stopAutoPagerButton: SymbolButton;
    header: Blur;
    footer: Blur;
    viewer: ContentView;
    settingView?: SettingView;
  };

  constructor({ groups, gid, pageIndex }: { groups: FavoriteImageGroupWithFiles[]; gid: number; pageIndex: number }) {
    super({
      events: {
        didLoad: () => {
          globalTimer.addTask({
            id: this._timerId,
            interval: 1,
            paused: true,
            handler: () => this._handleTimer(),
          });
          this._rebuildPager();
        },
        didAppear: () => {
          globalTimer.resumeTask(this._timerId);
          this._reconcileItems();
        },
        didDisappear: () => {
          globalTimer.pauseTask(this._timerId);
        },
        didRemove: () => {
          globalTimer.removeTask(this._timerId);
          releaseFavoriteImageTapGestureRecognizer();
          this._imagePager = undefined;
          favoriteImageManager.clearTemporaryFiles();
        },
      },
    });

    this._items = groups.flatMap((group) =>
      group.pages
        .filter((page) => page.file_name)
        .map((page) => ({
          gid: group.gid,
          token: group.token,
          length: group.length,
          title: group.title,
          pageIndex: page.page_index,
          fileName: page.file_name,
          fileSource: "favorite",
          isOriginal: page.is_original,
          isFavorite: true,
        })),
    );
    if (this._items.length === 0) throw new Error("Favorite image list is empty");
    this._index = Math.max(
      0,
      this._items.findIndex((item) => item.gid === gid && item.pageIndex === pageIndex),
    );
    this._pagingGesture = configManager.favoriteImagePagingGesture;
    this._timerId = `favorite-image-reader-${cvid.newId}`;

    const currentItem = this._items[this._index];
    const titleView = new FavoriteImageReaderTitleView({
      title: this._getTitle(currentItem),
      page: this._getPageText(currentItem),
      layout: (make, view) => {
        make.left.right.inset(50);
        make.top.bottom.inset(0);
      },
    });
    const optionsButton = new SymbolButton({
      props: { symbol: "ellipsis" },
      layout: (make, view) => {
        make.right.top.bottom.inset(0);
        make.width.equalTo(50);
      },
      events: {
        tapped: () => {
          if (this.cviews.settingView) {
            this.cviews.settingView.close();
          } else {
            this._showPagingGestureMenu();
          }
        },
      },
    });
    const header = new Blur({
      props: { style: 10 },
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
              events: { tapped: () => $ui.pop() },
            }).definition,
            optionsButton.definition,
            titleView.definition,
          ],
        },
      ],
    });

    const favoriteButton = new SymbolButton({
      props: {
        symbol: "heart.fill",
        tintColor: $color("orange"),
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
      events: { tapped: () => this._toggleFavorite() },
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
      events: { tapped: () => this._stopAutoPager() },
    });
    const startAutoPagerButton = new SymbolButton({
      props: {
        symbol: "forward",
        menu: {
          title: "自动翻页",
          pullDown: true,
          asPrimary: true,
          items: [1, 3, 5, 10, 15].map((interval) => ({
            title: `每页停留${interval}秒`,
            handler: () => this._startAutoPager(interval),
          })),
        },
      },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
    });
    const shareButton = new SymbolButton({
      props: { symbol: "square.and.arrow.up" },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
      events: { tapped: () => this._shareCurrentImage() },
    });
    const galleryButton = new SymbolButton({
      props: { symbol: "photo.on.rectangle" },
      layout: (make, view) => {
        make.size.equalTo($size(50, 50));
        make.center.equalTo(view.super);
      },
      events: { tapped: () => this._openCurrentGallery() },
    });
    const footer = new Blur({
      props: { style: 6 },
      layout: (make, view) => {
        make.left.right.bottom.inset(0);
        make.top.equalTo(view.super.safeAreaBottom).offset(-50);
      },
      views: [
        {
          type: "stack",
          props: {
            axis: $stackViewAxis.horizontal,
            distribution: $stackViewDistribution.fillEqually,
            stack: {
              views: [
                { type: "view", props: {}, views: [galleryButton.definition] },
                {
                  type: "view",
                  props: {},
                  views: [startAutoPagerButton.definition, stopAutoPagerButton.definition],
                },
                { type: "view", props: {}, views: [favoriteButton.definition] },
              ],
            },
          },
          layout: (make, view) => {
            make.left.right.equalTo(view.super.safeArea);
            make.top.inset(0);
            make.height.equalTo(50);
          },
        },
      ],
    });
    const viewer = new ContentView({
      props: { bgcolor: $color("clear") },
      layout: $layout.fill,
      views: [],
    });

    this.cviews = {
      titleView,
      favoriteButton,
      startAutoPagerButton,
      stopAutoPagerButton,
      header,
      footer,
      viewer,
    };
    this.rootView.views = [viewer, header, footer];
  }

  private _generateSrcs() {
    return this._items.map((item) => ({
      path: (item.fileSource === "favorite" ? favoriteImagePath : favoriteImageTempPath) + item.fileName,
      error: false,
      type: item.isOriginal ? ("reloaded" as const) : ("normal" as const),
    }));
  }

  private _rebuildPager() {
    releaseFavoriteImageTapGestureRecognizer();
    for (const view of this.cviews.viewer.view.views) view.remove();

    const options = {
      props: {
        srcs: this._generateSrcs(),
        page: this._index,
        imageShareOnLongPressEnabled: configManager.imageShareOnLongPressEnabled,
      },
      layout: $layout.fillSafeArea,
      events: {
        changed: (page: number) => this._turnTo(page),
      },
    };
    this._imagePager = this._pagingGesture === "tap" ? new NoscrollImagePager(options) : new CustomImagePager(options);
    this.cviews.viewer.view.add(this._imagePager.definition);

    $delay(0.3, () => {
      if (!this._imagePager) return;
      defineFavoriteImageTapGesture(this._imagePager.view.ocValue(), (location) => this._handleTap(location)).$create();
    });
  }

  private _handleTap(location: JBPoint) {
    if (!this._imagePager) return;
    if (this._pagingGesture === "swipe") {
      this._toggleBars();
      return;
    }

    const width = this._imagePager.view.frame.width;
    const height = this._imagePager.view.frame.height;
    const x = location.x / width;
    const y = location.y / height;
    const isMiddle = y >= 1 / 4 && y <= 3 / 4;
    const isPrevious = y < 1 / 4 || (isMiddle && x < 1 / 3);
    const isNext = y > 3 / 4 || (isMiddle && x > 2 / 3);
    if (isPrevious) {
      if (this._imagePager.prevPage === undefined) return;
      this._turnTo(this._imagePager.prevPage);
    } else if (isNext) {
      if (this._imagePager.nextPage === undefined) return;
      this._turnTo(this._imagePager.nextPage);
    } else {
      this._toggleBars();
    }
  }

  private _toggleBars() {
    this.cviews.header.view.hidden = !this.cviews.header.view.hidden;
    this.cviews.footer.view.hidden = !this.cviews.footer.view.hidden;
  }

  private _turnTo(index: number) {
    if (index < 0 || index >= this._items.length) return;
    this._index = index;
    if (this._imagePager && this._imagePager.page !== index) this._imagePager.page = index;
    this._autoPagerCountDown = this._autoPagerInterval;
    this._updateControls();
  }

  private _updateControls() {
    const item = this._items[this._index];
    this.cviews.titleView.update(this._getTitle(item), this._getPageText(item));
    this.cviews.favoriteButton.symbol = item.isFavorite ? "heart.fill" : "heart";
    this.cviews.favoriteButton.tintColor = item.isFavorite ? $color("orange") : $color("primaryText");
  }

  private _getTitle(item: FavoriteImageReaderItem) {
    return item.title || `GID ${item.gid}`;
  }

  private _getPageText(item: FavoriteImageReaderItem) {
    return `第 ${item.pageIndex + 1} 页`;
  }

  private _showPagingGestureMenu() {
    const settingView = new SettingView({
      gesture: this._pagingGesture,
      closeHandler: (gesture) => {
        // 将settingView除名
        this.cviews.settingView = undefined;

        if (gesture === this._pagingGesture) return;
        this._pagingGesture = gesture;
        configManager.favoriteImagePagingGesture = gesture;
        this._rebuildPager();
      },
      shareImageHandler: () => this._shareCurrentImage(),
    });
    this.cviews.settingView = settingView;
    this.rootView.add(settingView);
  }

  private _toggleFavorite() {
    const item = this._items[this._index];
    const nextIsFavorite = !item.isFavorite;
    const success = item.isFavorite
      ? favoriteImageManager.remove(item.gid, item.pageIndex)
      : favoriteImageManager.add(item.gid, item.pageIndex);
    if (!success) {
      $ui.error(item.isFavorite ? "取消收藏失败" : "重新收藏失败");
      return;
    }

    item.isFavorite = nextIsFavorite;
    this._applyLatestFile(item, nextIsFavorite ? "favorite" : "temporary");
    if (this._imagePager) this._imagePager.srcs = this._generateSrcs();
    this._updateControls();
  }

  private _reconcileItems() {
    let shouldRefreshSrcs = false;
    let shouldUpdateControls = false;

    for (const item of this._items) {
      const isFavorite = favoriteImageManager.isFavorite(item.gid, item.pageIndex);
      if (item.isFavorite !== isFavorite) {
        item.isFavorite = isFavorite;
        shouldUpdateControls = true;
      }

      if (this._applyLatestFile(item, isFavorite ? "favorite" : "temporary")) {
        shouldRefreshSrcs = true;
      }
    }

    if (shouldRefreshSrcs && this._imagePager) this._imagePager.srcs = this._generateSrcs();
    if (shouldUpdateControls || shouldRefreshSrcs) this._updateControls();
  }

  private _applyLatestFile(item: FavoriteImageReaderItem, source: FavoriteImageReaderFileSource): boolean {
    const file = favoriteImageManager.getFile(item.gid, item.pageIndex, source);
    if (!file?.file_name) return false;
    return this._applyFile(item, file, source);
  }

  private _applyFile(item: FavoriteImageReaderItem, file: FavoriteImageFile, source: FavoriteImageReaderFileSource) {
    const changed =
      item.fileName !== file.file_name || item.fileSource !== source || item.isOriginal !== file.is_original;
    item.fileName = file.file_name;
    item.fileSource = source;
    item.isOriginal = file.is_original;
    return changed;
  }

  private _startAutoPager(interval: number) {
    this._autoPagerEnabled = true;
    this._autoPagerInterval = interval;
    this._autoPagerCountDown = interval;
    this.cviews.startAutoPagerButton.view.hidden = true;
    this.cviews.stopAutoPagerButton.symbol = `${interval}.circle`;
    this.cviews.stopAutoPagerButton.view.hidden = false;
  }

  private _stopAutoPager() {
    this._autoPagerEnabled = false;
    this.cviews.startAutoPagerButton.view.hidden = false;
    this.cviews.stopAutoPagerButton.view.hidden = true;
  }

  private _handleTimer() {
    if (!this._autoPagerEnabled || !this._imagePager) return;
    if (this._imagePager.nextPage === undefined) {
      this._autoPagerCountDown = this._autoPagerInterval;
      return;
    }
    this._autoPagerCountDown -= 1;
    if (this._autoPagerCountDown <= 0) this._turnTo(this._imagePager.nextPage);
  }

  private _shareCurrentImage() {
    const data = $file.read(this._generateSrcs()[this._index].path);
    if (data?.image) {
      $share.universal(data.image);
    } else {
      $ui.error("读取收藏图片失败");
    }
  }

  private _openCurrentGallery() {
    const item = this._items[this._index];
    if (!item.token) {
      $ui.error("缺少图库访问凭据");
      return;
    }
    const controller = new GalleryController(item.gid, item.token, item.title);
    controller.uipush({
      navBarHidden: true,
      statusBarStyle: 0,
    });
  }
}
