import { Base, DynamicPreferenceListView, Label, Matrix } from "jsbox-cview";

const POPOVER_WIDTH = 250;

type FrontPagePopoverOptions = {
  type: "front_page";
  filterOptions: {
    disableLanguageFilters: boolean;
    disableUploaderFilters: boolean;
    disableTagFilters: boolean;
  };
  count: {
    loaded: number;
    all: number;
    filtered: number;
  };
};

type WatchedPopoverOptions = {
  type: "watched";
  filterOptions: {
    disableLanguageFilters: boolean;
    disableUploaderFilters: boolean;
    disableTagFilters: boolean;
  };
  count: {
    loaded: number;
    filtered: number;
  };
};

type PopularPopoverOptions = {
  type: "popular";
  filterOptions: {
    disableLanguageFilters: boolean;
    disableUploaderFilters: boolean;
    disableTagFilters: boolean;
  };
  count: {
    loaded: number;
    filtered: number;
  };
};

type FavoritesPopoverOptions = {
  type: "favorites";
  favoritesOrderMethod: "published_time" | "favorited_time";
  count: {
    loaded: number;
  };
};

type ToplistPopoverOptions = {
  type: "toplist";
  count: {
    loaded: number;
  };
};

type UploadPopoverOptions = {
  type: "upload";
  count: {
    loaded: number;
  };
};

type ArchivePopoverOptions = {
  type: "archive";
  archiveType: "readlater" | "downloaded" | "all";
  archiveManagerOrderMethod: "first_access_time" | "last_access_time" | "posted_time";
  count: {
    loaded: number;
    all: number;
  };
};

export type PopoverOptions =
  | FrontPagePopoverOptions
  | WatchedPopoverOptions
  | PopularPopoverOptions
  | FavoritesPopoverOptions
  | ToplistPopoverOptions
  | UploadPopoverOptions
  | ArchivePopoverOptions;

// 定义类型映射
type PopoverOptionsToResult<T extends PopoverOptions> = T extends FrontPagePopoverOptions
  ? Omit<FrontPagePopoverOptions, "count">
  : T extends WatchedPopoverOptions
  ? Omit<WatchedPopoverOptions, "count">
  : T extends PopularPopoverOptions
  ? Omit<PopularPopoverOptions, "count">
  : T extends FavoritesPopoverOptions
  ? Omit<FavoritesPopoverOptions, "count">
  : T extends ToplistPopoverOptions
  ? Omit<ToplistPopoverOptions, "count">
  : T extends UploadPopoverOptions
  ? Omit<UploadPopoverOptions, "count">
  : T extends ArchivePopoverOptions
  ? Omit<ArchivePopoverOptions, "count">
  : never;

class PopoverViewForTitleView<T extends PopoverOptions> extends Base<UIView, UiTypes.ViewOptions> {
  private readonly _options: T;
  private _archiveType?: "readlater" | "downloaded" | "all";
  _defineView: () => UiTypes.ViewOptions;
  cviews: {
    filtersList?: DynamicPreferenceListView;
    favoritesOrderMethodList?: DynamicPreferenceListView;
    archiveManagerOrderMethodList?: DynamicPreferenceListView;
    archiveMatrix?: Matrix;
  } = {};
  constructor(options: T) {
    super();
    this._options = options;

    let text = "";
    if ("all" in options.count) {
      text += `已加载: ${options.count.loaded} / ${options.count.all}\n`;
    } else {
      text += `已加载: ${options.count.loaded}\n`;
    }
    if ("filtered" in options.count) {
      text += `已过滤: ${options.count.filtered}\n`;
    }
    const countLabel = new Label({
      props: {
        text,
        font: $font(14),
        lines: 4,
        lineSpacing: 25,
      },
      layout: (make, view) => {
        make.bottom.equalTo(view.super).offset(8);
        make.centerX.equalTo(view.super);
      },
    });
    const views: UiTypes.AllViewOptions[] = [];
    if (options.type === "front_page" || options.type === "watched" || options.type === "popular") {
      views.push({
        type: "label",
        props: {
          text: "启用的过滤器",
          font: $font(12),
          textColor: $color("secondaryText"),
        },
        layout: (make, view) => {
          make.top.inset(10);
          make.height.equalTo(20);
          make.left.inset(15);
        },
      });
      this.cviews.filtersList = new DynamicPreferenceListView({
        sections: [
          {
            title: "",
            rows: [
              {
                type: "boolean",
                title: "语言",
                key: "enableLanguageFilters",
                value: !options.filterOptions.disableLanguageFilters,
              },
              {
                type: "boolean",
                title: "上传者",
                key: "enableUploaderFilters",
                value: !options.filterOptions.disableUploaderFilters,
              },
              {
                type: "boolean",
                title: "标签",
                key: "enableTagFilters",
                value: !options.filterOptions.disableTagFilters,
              },
            ],
          },
        ],
        props: {
          style: 1,
          scrollEnabled: false,
          bgcolor: $color("clear"),
        },
        layout: (make, view) => {
          make.top.inset(35);
          make.left.right.inset(0);
          make.height.equalTo(44 * 3);
        },
      });
      views.push(this.cviews.filtersList.definition);
      views.push(countLabel.definition);
    } else if (options.type === "favorites") {
      this.cviews.favoritesOrderMethodList = new DynamicPreferenceListView({
        sections: [
          {
            title: "",
            rows: [
              {
                type: "list",
                title: "排序方式",
                items: ["发布时间", "收藏时间"],
                key: "sort",
                value: options.favoritesOrderMethod === "published_time" ? 0 : 1,
              },
            ],
          },
        ],
        props: {
          style: 1,
          scrollEnabled: false,
          bgcolor: $color("clear"),
        },
        layout: (make, view) => {
          make.top.inset(10);
          make.left.right.inset(0);
          make.height.equalTo(44);
        },
      });
      views.push(this.cviews.favoritesOrderMethodList.definition);
      views.push(countLabel.definition);
    } else if (options.type === "toplist" || options.type === "upload") {
      views.push(countLabel.definition);
    } else {
      this._archiveType = options.archiveType;
      this.cviews.archiveMatrix = new Matrix({
        props: {
          itemSize: $size(POPOVER_WIDTH - 16, 44),
          spacing: 5,
          bgcolor: $color("clear"),
          scrollEnabled: false,
          template: {
            props: {
              smoothCorners: true,
              cornerRadius: 8,
            },
            views: [
              {
                type: "label",
                props: {
                  id: "title",
                  align: $align.center,
                  font: $font("bold", 17),
                },
                layout: $layout.fill,
              },
            ],
          },
          data: this._mapArchiveMatrixData(this._archiveType),
        },
        layout: (make, view) => {
          make.left.right.inset(3);
          make.top.inset(3);
          make.height.equalTo(44 * 3 + 5 * 4);
        },
        events: {
          didSelect: (sender, indexPath, data) => {
            this._archiveType = (["readlater", "downloaded", "all"] as ("readlater" | "downloaded" | "all")[])[
              indexPath.row
            ];
            sender.data = this._mapArchiveMatrixData(this._archiveType);
          },
        },
      });
      this.cviews.archiveManagerOrderMethodList = new DynamicPreferenceListView({
        sections: [
          {
            title: "",
            rows: [
              {
                type: "list",
                title: "排序方式",
                items: ["最近阅读时间", "首次阅读时间", "发布时间"],
                key: "sort",
                value:
                  options.archiveManagerOrderMethod === "last_access_time"
                    ? 0
                    : options.archiveManagerOrderMethod === "first_access_time"
                    ? 1
                    : 2,
              },
            ],
          },
        ],
        props: {
          style: 1,
          scrollEnabled: false,
          stringLeftInset: 100,
          bgcolor: $color("clear"),
        },
        layout: (make, view) => {
          make.top.equalTo(view.prev.bottom).inset(3);
          make.left.right.inset(0);
          make.height.equalTo(44);
        },
      });
      views.push(this.cviews.archiveMatrix.definition);
      views.push(this.cviews.archiveManagerOrderMethodList.definition);
      views.push(countLabel.definition);
    }

    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout: (make, view) => {
          // popover视图会默认挡住最上方的高度12的视图，因此需要用这种固定高度的布局
          make.height.equalTo(this.height);
          make.left.right.bottom.inset(0);
        },
        views,
      };
    };
  }

  private _mapArchiveMatrixData(archiveType: "readlater" | "downloaded" | "all") {
    if (!archiveType) throw new Error("invalid archiveType");
    const translations = {
      readlater: "稍后阅读",
      downloaded: "下载内容",
      all: "全部记录",
    };
    return (["readlater", "downloaded", "all"] as ("readlater" | "downloaded" | "all")[]).map((n) => ({
      title: {
        text: translations[n],
        textColor: n === archiveType ? $color("white") : $color("secondaryText"),
        bgcolor: n === archiveType ? $color("systemLink") : $color("systemSecondaryBackground"),
      },
    }));
  }

  get values(): PopoverOptionsToResult<T> {
    if (this._options.type === "front_page" || this._options.type === "watched" || this._options.type === "popular") {
      const values = this.cviews.filtersList!.values as {
        enableLanguageFilters: boolean;
        enableUploaderFilters: boolean;
        enableTagFilters: boolean;
      };
      return {
        type: this._options.type,
        filterOptions: {
          disableLanguageFilters: !values.enableLanguageFilters,
          disableUploaderFilters: !values.enableUploaderFilters,
          disableTagFilters: !values.enableTagFilters,
        },
      } as PopoverOptionsToResult<T>;
    } else if (this._options.type === "favorites") {
      const values = this.cviews.favoritesOrderMethodList!.values as {
        sort: 0 | 1;
      };
      return {
        type: this._options.type,
        favoritesOrderMethod: values.sort === 0 ? "published_time" : "favorited_time",
      } as PopoverOptionsToResult<T>;
    } else if (this._options.type === "toplist" || this._options.type === "upload") {
      return {
        type: this._options.type,
      } as PopoverOptionsToResult<T>;
    } else {
      if (!this._archiveType) throw new Error();
      const values = this.cviews.archiveManagerOrderMethodList!.values as {
        sort: 0 | 1 | 2;
      };
      return {
        type: this._options.type,
        archiveType: this._archiveType,
        archiveManagerOrderMethod:
          values.sort === 0 ? "last_access_time" : values.sort === 1 ? "first_access_time" : "posted_time",
      } as PopoverOptionsToResult<T>;
    }
  }

  get height() {
    switch (this._options.type) {
      case "front_page": {
        return 35 + 44 * 3 + 25 * 2 + 8;
      }
      case "watched": {
        return 35 + 44 * 3 + 25 * 2 + 8;
      }
      case "popular": {
        return 35 + 44 * 3 + 25 * 2 + 8;
      }
      case "favorites": {
        return 10 + 44 + 25 + 8;
      }
      case "toplist": {
        return 25 * 1 + 8;
      }
      case "upload": {
        return 25 * 1 + 8;
      }
      case "archive": {
        return 3 + 44 * 3 + 5 * 4 + 3 + 44 + 25 * 1 + 8;
      }
      default:
        throw new Error("invalid type");
    }
  }
}

/**
 *
 * @param param0
 * @param param0.sourceView
 * @param param0.sourceRect
 * @param param0.popoverOptions PopoverOptions
 * @returns 省略count参数后的PopoverOptions，但与传入的PopoverOptions是不同的对象，两者可以用于比较
 */
export function popoverForTitleView<T extends PopoverOptions>({
  sourceView,
  sourceRect,
  popoverOptions,
}: {
  sourceView: AllUIView;
  sourceRect: JBRect;
  popoverOptions: T;
}) {
  const popoverView = new PopoverViewForTitleView(popoverOptions);
  return new Promise<PopoverOptionsToResult<T>>((resolve, reject) => {
    $ui.popover({
      sourceView,
      sourceRect,
      directions: $popoverDirection.up,
      size: $size(POPOVER_WIDTH, popoverView.height),
      views: [popoverView.definition],
      dismissed: () => {
        resolve(popoverView.values);
      },
    });
  });
}
