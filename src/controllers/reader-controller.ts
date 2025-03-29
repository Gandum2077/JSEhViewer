import { Base, BaseController, Blur, ContentView, cvid, Label, Matrix, Slider, SymbolButton } from "jsbox-cview";
import { CustomImagePager } from "../components/custom-image-pager";
import { downloaderManager } from "../utils/api";
import { statusManager } from "../utils/status";
import { setAITranslationConfig } from "./settings-translation-controller";
import { AiTranslationButton } from "../components/ai-translation-button";
import { configManager } from "../utils/config";
import { globalTimer } from "../utils/timer";
import { NoscrollImagePager } from "../components/noscroll-image-pager";
import { DownloadButtonForReader } from "../components/download-button-for-reader";
import { GalleryController } from "./gallery-controller";
import { VerticalImagePager } from "../components/vertical-image-pager";

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

class RightSymbolButtonWarpper extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor({
    loadOrginalHandler,
    reloadPagerHandler,
    checkVerticalAllowed,
  }: {
    loadOrginalHandler: () => void;
    reloadPagerHandler: () => void;
    checkVerticalAllowed: () => boolean;
  }) {
    super();
    const button1 = new SymbolButton({
      props: {
        hidden: configManager.pageTurnMethod !== "click_and_swipe",
        symbol: "ellipsis",
        menu: {
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "加载原图",
              symbol: "arrow.down.backward.and.arrow.up.forward.square",
              handler: (sender) => {
                loadOrginalHandler();
              },
            },
            {
              title: "AI翻译设置",
              symbol: "globe",
              handler: async (sender) => {
                await setAITranslationConfig();
              },
            },
            {
              title: "翻页方式",
              inline: true,
              items: [
                {
                  title: "点击和横向滑动",
                  symbol: "checkmark",
                  handler: () => {},
                },
                {
                  title: "仅点击",
                  handler: () => {
                    configManager.pageTurnMethod = "click";
                    button1.view.hidden = true;
                    button2.view.hidden = false;
                    button3.view.hidden = true;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "横向滑动",
                  handler: () => {
                    configManager.pageTurnMethod = "swipe";
                    button1.view.hidden = true;
                    button2.view.hidden = true;
                    button3.view.hidden = false;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "纵向滑动",
                  handler: () => {
                    if (!checkVerticalAllowed()) {
                      vertialNotAllowedAlert();
                      return;
                    }
                    configManager.pageTurnMethod = "vertical";
                    button1.view.hidden = true;
                    button2.view.hidden = true;
                    button3.view.hidden = true;
                    button4.view.hidden = false;
                    reloadPagerHandler();
                  },
                },
              ],
            },
          ],
        },
      },
      layout: $layout.fill,
    });
    const button2 = new SymbolButton({
      props: {
        hidden: configManager.pageTurnMethod !== "click",
        symbol: "ellipsis",
        menu: {
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "加载原图",
              symbol: "arrow.down.backward.and.arrow.up.forward.square",
              handler: (sender) => {
                loadOrginalHandler();
              },
            },
            {
              title: "AI翻译设置",
              symbol: "globe",
              handler: async (sender) => {
                await setAITranslationConfig();
              },
            },
            {
              title: "翻页方式",
              inline: true,
              items: [
                {
                  title: "点击和横向滑动",
                  handler: () => {
                    configManager.pageTurnMethod = "click_and_swipe";
                    button1.view.hidden = false;
                    button2.view.hidden = true;
                    button3.view.hidden = true;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "仅点击",
                  symbol: "checkmark",
                  handler: () => {},
                },
                {
                  title: "横向滑动",
                  handler: () => {
                    configManager.pageTurnMethod = "swipe";
                    button1.view.hidden = true;
                    button2.view.hidden = true;
                    button3.view.hidden = false;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "纵向滑动",
                  handler: () => {
                    if (!checkVerticalAllowed()) {
                      vertialNotAllowedAlert();
                      return;
                    }
                    configManager.pageTurnMethod = "vertical";
                    button1.view.hidden = true;
                    button2.view.hidden = true;
                    button3.view.hidden = true;
                    button4.view.hidden = false;
                    reloadPagerHandler();
                  },
                },
              ],
            },
          ],
        },
      },
      layout: $layout.fill,
    });
    const button3 = new SymbolButton({
      props: {
        hidden: configManager.pageTurnMethod !== "swipe",
        symbol: "ellipsis",
        menu: {
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "加载原图",
              symbol: "arrow.down.backward.and.arrow.up.forward.square",
              handler: (sender) => {
                loadOrginalHandler();
              },
            },
            {
              title: "AI翻译设置",
              symbol: "globe",
              handler: async (sender) => {
                await setAITranslationConfig();
              },
            },
            {
              title: "翻页方式",
              inline: true,
              items: [
                {
                  title: "点击和横向滑动",
                  handler: () => {
                    configManager.pageTurnMethod = "click_and_swipe";
                    button1.view.hidden = false;
                    button2.view.hidden = true;
                    button3.view.hidden = true;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "仅点击",
                  handler: () => {
                    configManager.pageTurnMethod = "click";
                    button1.view.hidden = true;
                    button2.view.hidden = false;
                    button3.view.hidden = true;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "横向滑动",
                  symbol: "checkmark",
                  handler: () => {},
                },
                {
                  title: "纵向滑动",
                  handler: () => {
                    if (!checkVerticalAllowed()) {
                      vertialNotAllowedAlert();
                      return;
                    }
                    configManager.pageTurnMethod = "vertical";
                    button1.view.hidden = true;
                    button2.view.hidden = true;
                    button3.view.hidden = true;
                    button4.view.hidden = false;
                    reloadPagerHandler();
                  },
                },
              ],
            },
          ],
        },
      },
      layout: $layout.fill,
    });
    const button4 = new SymbolButton({
      props: {
        hidden: configManager.pageTurnMethod !== "vertical",
        symbol: "ellipsis",
        menu: {
          pullDown: true,
          asPrimary: true,
          items: [
            {
              title: "加载原图",
              symbol: "arrow.down.backward.and.arrow.up.forward.square",
              handler: (sender) => {
                loadOrginalHandler();
              },
            },
            {
              title: "AI翻译设置",
              symbol: "globe",
              handler: async (sender) => {
                await setAITranslationConfig();
              },
            },
            {
              title: "翻页方式",
              inline: true,
              items: [
                {
                  title: "点击和横向滑动",
                  handler: () => {
                    configManager.pageTurnMethod = "click_and_swipe";
                    button1.view.hidden = false;
                    button2.view.hidden = true;
                    button3.view.hidden = true;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "仅点击",
                  handler: () => {
                    configManager.pageTurnMethod = "click";
                    button1.view.hidden = true;
                    button2.view.hidden = false;
                    button3.view.hidden = true;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "横向滑动",
                  handler: () => {
                    configManager.pageTurnMethod = "swipe";
                    button1.view.hidden = true;
                    button2.view.hidden = true;
                    button3.view.hidden = false;
                    button4.view.hidden = true;
                    reloadPagerHandler();
                  },
                },
                {
                  title: "纵向滑动",
                  symbol: "checkmark",
                  handler: () => {},
                },
              ],
            },
          ],
        },
      },
      layout: $layout.fill,
    });
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout: (make, view) => {
          make.right.top.bottom.inset(0);
          make.width.equalTo(50);
        },
        views: [button1.definition, button2.definition, button3.definition, button4.definition],
      };
    };
  }
}

class FooterThumbnailView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _index: number; // 滑动结束后的index，用于外部更新
  private _innerIndex: number; // 随着滑动而变化的index，用于内部更新
  private _width: number; // 整体宽度
  private _length: number;
  private _thumbnailItems: { path?: string; error: boolean }[];
  private _thumbnailItemsFinished: boolean = false; // 缩略图是否全部加载完成
  cviews: { thumbnailMatrix: Matrix; sliderLeftLabel: Label; slider: Slider };
  constructor(options: {
    props: {
      index: number;
      length: number;
      thumbnailItems: { path?: string; error: boolean }[];
    };
    events: {
      changed: (index: number) => void;
    };
  }) {
    super();
    this._index = options.props.index;
    this._innerIndex = this._index;
    this._width = 0;
    this._length = options.props.length;
    this._thumbnailItems = options.props.thumbnailItems;
    this._thumbnailItemsFinished = this._thumbnailItems.every((item) => item.path);
    this.cviews = {} as {
      thumbnailMatrix: Matrix;
      sliderLeftLabel: Label;
      slider: Slider;
    };
    this.cviews.sliderLeftLabel = new Label({
      props: {
        text: (this._index + 1).toString(),
        textColor: $color("primaryText"),
        font: $font(16),
        align: $align.center,
      },
      layout: (make, view) => {
        make.left.top.bottom.inset(0);
        make.width.equalTo(45);
      },
    });
    const sliderRightLabel = new Label({
      props: {
        text: this._length.toString(),
        textColor: $color("primaryText"),
        font: $font(16),
        align: $align.center,
      },
      layout: (make, view) => {
        make.right.top.bottom.inset(0);
        make.width.equalTo(45);
      },
    });
    this.cviews.slider = new Slider({
      props: {
        value: this._index,
        min: 0,
        max: this._length - 1,
        continuous: true,
        minColor: $color("systemLink")
      },
      layout: (make, view) => {
        make.left.equalTo(view.prev.prev.right).inset(5);
        make.right.equalTo(view.prev.left).inset(5);
        make.top.bottom.inset(0);
      },
      events: {
        changed: (sender) => {
          this.innerIndex = Math.floor(sender.value);
        },
        touchesEnded: (sender) => {
          const i = Math.floor(sender.value);
          if (this._index !== i) {
            this.index = Math.floor(sender.value);
            options.events.changed(i);
          }
        },
      },
    });
    this.cviews.thumbnailMatrix = new Matrix({
      props: {
        bgcolor: $color("clear"),
        direction: $scrollDirection.horizontal,
        itemSize: $size(80, 80),
        spacing: 5,
        showsHorizontalIndicator: false,
        scrollEnabled: false,
        data: this._mapData(this._index),
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
          if (indexPath.item === this.index) return;
          this.index = indexPath.item;
          options.events.changed(indexPath.item);
        },
        ready: (sender) => {
          this.updateFooter(this.index, false);
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
            views: [this.cviews.sliderLeftLabel.definition, sliderRightLabel.definition, this.cviews.slider.definition],
          },
        ],
        events: {
          layoutSubviews: (sender) => {
            if (sender.frame.width <= 0 || sender.frame.height <= 0) return;
            this._width = sender.frame.width;
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
    this.cviews.thumbnailMatrix.view.data = this._mapData(this.index);
  }

  updateFooter(index: number, sliderOnGoing: boolean) {
    if (index < 0 || index >= this._length) return;
    if (index === 0 || this.cviews.thumbnailMatrix.view.contentSize.width <= this._width) {
      this.cviews.thumbnailMatrix.view.contentOffset = $point(0, 0);
    } else if (
      this._width !== 0 &&
      this.cviews.thumbnailMatrix.view.contentSize.width - (index * 85 - 85) < this._width
    ) {
      this.cviews.thumbnailMatrix.view.contentOffset = $point(
        this.cviews.thumbnailMatrix.view.contentSize.width - this._width,
        0
      );
    } else {
      this.cviews.thumbnailMatrix.view.contentOffset = $point(85 * index - 85, 0);
    }
    this.cviews.thumbnailMatrix.view.data = this._mapData(index);
    this.cviews.sliderLeftLabel.view.text = (index + 1).toString();
    if (!sliderOnGoing) {
      this.cviews.slider.view.value = index;
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
}

export class ReaderController extends BaseController {
  private gid: number;
  private imagePager?: CustomImagePager | NoscrollImagePager | VerticalImagePager;
  private _autoPagerEnabled: boolean = false;
  private _autoPagerInterval: number = 1;
  private _autoPagerCountDown: number = 1;
  // 增加两个Set，其中一个记录以原画质重新载入的图片，另一个记录启用AI翻译的图片
  private reloadedPageSet: Set<number> = new Set();
  private aiTranslatedPageSet: Set<number> = new Set();
  // 使用上级的autoCacheWhenReading

  // 上级GalleryController
  private _superGalleryController: GalleryController;
  cviews: {
    titleLabel: Label;
    aiTranslationButton: AiTranslationButton;
    header: Blur;
    footer: Blur;
    viewer: ContentView;
    footerThumbnailView: FooterThumbnailView;
    downloadButton: DownloadButtonForReader;
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
                // 另外，如果翻到最后一页，不再翻页
                if (
                  !this.imagePager.srcs[this.imagePager.page].path ||
                  this.cviews.footerThumbnailView.index === this.imagePager.srcs.length - 1
                ) {
                  this._autoPagerCountDown = this._autoPagerInterval;
                  return;
                } else {
                  this._autoPagerCountDown -= 1;
                  if (this._autoPagerCountDown <= 0) {
                    this.handleTurnPage(this.cviews.footerThumbnailView.index + 1);
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
    const galleryDownloader = downloaderManager.get(gid);
    if (!galleryDownloader) throw new Error("galleryDownloader not found");

    // 检查纵向滑动是否可用：需要所有分页都下载完
    if (
      configManager.pageTurnMethod === "vertical" &&
      galleryDownloader.finishedOfHtmls !== galleryDownloader.infos.total_pages
    ) {
      configManager.pageTurnMethod = "click_and_swipe";
      vertialNotAllowedAlert();
    }
    const footerThumbnailView = new FooterThumbnailView({
      props: {
        index,
        length,
        thumbnailItems: galleryDownloader.result.thumbnails,
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
    const rightSymbolButton = new RightSymbolButtonWarpper({
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
      reloadPagerHandler: () => {
        viewerLayoutSubviews(viewer.view);
      },
      checkVerticalAllowed: () => {
        const d = downloaderManager.get(gid);
        if (!d) throw new Error("galleryDownloader not found");
        return d.finishedOfHtmls === d.infos.total_pages;
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
          if (!configManager.selectedAiTranslationService) {
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
                  handler: async () => {
                    await setAITranslationConfig();
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
                  views: [
                    new SymbolButton({
                      props: { symbol: "square.and.arrow.up" },
                      layout: (make, view) => {
                        make.size.equalTo($size(50, 50));
                        make.center.equalTo(view.super);
                      },
                      events: {
                        tapped: () => {
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
                      },
                    }).definition,
                  ],
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
      lastFrameWidth = sender.frame.width;
      lastFrameHeight = sender.frame.height;
      if (sender.views.length !== 0) sender.views[0].remove();
      this.imagePager =
        configManager.pageTurnMethod === "click"
          ? new NoscrollImagePager({
              props: {
                srcs: this._generateSrcs(),
                page: footerThumbnailView.index,
              },
              layout: (make, view) => {
                make.left.right.inset(2);
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
              },
            })
          : configManager.pageTurnMethod === "vertical"
          ? new VerticalImagePager({
              props: {
                srcs: this._generateSrcs(),
                page: footerThumbnailView.index,
              },
              layout: (make, view) => {
                make.left.right.inset(2);
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
          : new CustomImagePager({
              props: {
                srcs: this._generateSrcs(),
                page: footerThumbnailView.index,
              },
              layout: (make, view) => {
                make.left.right.inset(2);
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
              },
            });
      sender.add(this.imagePager.definition);
      $delay(0.3, () => {
        if (!this.imagePager) return;
        define(this.imagePager.view.ocValue(), (location) => {
          if (!this.imagePager) return;
          if (configManager.pageTurnMethod === "swipe" || configManager.pageTurnMethod === "vertical") {
            footer.view.hidden = !footer.view.hidden;
            header.view.hidden = !header.view.hidden;
            return;
          }
          const w = sender.frame.width;
          const h = sender.frame.height;
          const x = location.x;
          const y = location.y;
          if (y / h < 1 / 4 || (y / h >= 1 / 4 && y / h <= 3 / 4 && x / w < 1 / 3)) {
            if (footerThumbnailView.index === 0) return;
            this.handleTurnPage(footerThumbnailView.index - 1);
          } else if (y / h > 3 / 4 || (y / h >= 1 / 4 && y / h <= 3 / 4 && x / w > 2 / 3)) {
            if (footerThumbnailView.index === this.imagePager.srcs.length - 1) return;
            this.handleTurnPage(footerThumbnailView.index + 1);
          } else {
            footer.view.hidden = !footer.view.hidden;
            header.view.hidden = !header.view.hidden;
          }
        }).$create();
      });
    };
    const viewer = new ContentView({
      props: { bgcolor: $color("clear") },
      layout: $layout.fillSafeArea,
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
      header,
      footer,
      viewer,
      footerThumbnailView,
      downloadButton,
    };
    this.rootView.views = [viewer, header, footer];
  }

  refreshCurrentPage() {
    if (!this.imagePager) return;
    const newSrcs = this._generateSrcs();
    const current = this.imagePager.srcs[this.imagePager.page];
    if (!current.path || current.type !== newSrcs[this.imagePager.page].type) {
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

function vertialNotAllowedAlert() {
  $ui.alert({
    title: "纵向滑动翻页暂不可用",
    message:
      "纵向滑动翻页需要先获取图库中的所有分页，目前还没有完成此步骤。请稍后手动切换。\n" +
      "附注：开通Hath Perk中的多页查看器可以快速完成此步骤，开通后需要在本应用中重新登录。",
  });
}
