import {
  Base,
  BaseController,
  CustomNavigationBar,
  DynamicItemSizeMatrix,
  DynamicItemSizeSectionMatrix,
  DynamicItemSizeSectionMatrixSection,
  DynamicPreferenceListView,
  PreferenceSection,
} from "jsbox-cview";
import { FavoriteImageSort, FavoriteImageQueryOrder } from "../types";
import { configManager } from "../utils/config";
import { favoriteImageManager } from "../utils/favorite-image";
import { favoriteImagePath } from "../utils/glv";

const POPOVER_WIDTH = 250;

type SortPopoverOptions = {
  sort: FavoriteImageSort;
  order: FavoriteImageQueryOrder;
  showTitle: boolean;
};

class SortPopover extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  cviews: {
    list1: DynamicPreferenceListView;
    list2: DynamicPreferenceListView;
  };
  private _sort: FavoriteImageSort;
  constructor(options: SortPopoverOptions) {
    super();
    this._sort = options.sort;
    const sectionTitle: UiTypes.LabelOptions = {
      type: "label",
      props: {
        text: "排序方式",
        font: $font(12),
        textColor: $color("secondaryText"),
      },
      layout: (make, view) => {
        make.top.inset(10);
        make.height.equalTo(20);
        make.left.inset(15);
      },
    };
    const list1 = new DynamicPreferenceListView({
      sections: this._getList1Sections(),
      props: {
        style: 1,
        scrollEnabled: false,
        bgcolor: $color("clear"),
      },
      layout: (make, view) => {
        make.top.inset(35);
        make.left.right.inset(0);
        make.height.equalTo(44 * 2);
      },
    });

    const list2 = new DynamicPreferenceListView({
      sections: [
        {
          title: "",
          rows: [
            {
              type: "boolean",
              title: "倒序",
              key: "ascOrder",
              value: options.order === "asc",
            },
            {
              type: "boolean",
              title: "显示图库标题",
              key: "showTitle",
              value: options.showTitle,
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
        make.top.equalTo(view.prev.bottom).offset(-1 / $device.info.screen.scale);
        make.left.right.inset(0);
        make.height.equalTo(44 * 2);
      },
    });
    this.cviews = { list1, list2 };
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
        views: [sectionTitle, list1.definition, list2.definition],
      };
    };
  }

  private _getList1Sections(): PreferenceSection[] {
    return [
      {
        title: "",
        rows: [
          {
            type: "symbol-action",
            title: "按收藏时间排序",
            symbol: this._sort === "favorited_at" ? "checkmark" : undefined,
            titleColor: this._sort === "favorited_at" ? $color("systemLink") : undefined,
            tintColor: this._sort === "favorited_at" ? $color("systemLink") : undefined,
            value: () => {
              if (this._sort === "gid") {
                this._sort = "favorited_at";
                this.cviews.list1.sections = this._getList1Sections();
              }
            },
          },
          {
            type: "symbol-action",
            title: "按发布时间排序",
            symbol: this._sort === "gid" ? "checkmark" : undefined,
            titleColor: this._sort === "gid" ? $color("systemLink") : undefined,
            tintColor: this._sort === "gid" ? $color("systemLink") : undefined,
            value: () => {
              if (this._sort === "favorited_at") {
                this._sort = "gid";
                this.cviews.list1.sections = this._getList1Sections();
              }
            },
          },
        ],
      },
    ];
  }

  get height(): number {
    return 35 + 44 * 4 + 8;
  }

  get values(): SortPopoverOptions {
    const list2Values = this.cviews.list2.values as { ascOrder: boolean; showTitle: boolean };
    return {
      sort: this._sort,
      order: list2Values.ascOrder ? "asc" : "desc",
      showTitle: list2Values.showTitle,
    };
  }
}

function popover({
  sourceView,
  sourceRect,
  options,
}: {
  sourceView: AllUIView;
  sourceRect: JBRect;
  options: SortPopoverOptions;
}) {
  const popoverView = new SortPopover(options);
  return new Promise<SortPopoverOptions>((resolve, reject) => {
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

export class FavoriteImageController extends BaseController {
  cviews: {
    navbar: CustomNavigationBar;
    matrixWithTitle: DynamicItemSizeSectionMatrix;
    matrixNoTitle: DynamicItemSizeMatrix;
  };
  sortOptions: SortPopoverOptions;
  constructor() {
    super({
      props: { bgcolor: $color("backgroundColor") },
      events: {
        didLoad: () => {
          this.fullRefresh();
        },
      },
    });

    this.sortOptions = {
      sort: configManager.favoriteImageSort,
      order: configManager.favoriteImageQueryOrder,
      showTitle: configManager.favoriteImageShowTitle,
    };

    const navbar = new CustomNavigationBar({
      props: {
        title: "图片收藏",
        popButtonEnabled: true,
        rightBarButtonItems: [
          {
            symbol: "arrow.up.and.down.text.horizontal",
            handler: async (sender) => {
              const options = await popover({
                sourceView: sender,
                sourceRect: sender.bounds,
                options: this.sortOptions,
              });
              this.sortOptions = options;
              configManager.favoriteImageSort = options.sort;
              configManager.favoriteImageQueryOrder = options.order;
              configManager.favoriteImageShowTitle = options.showTitle;
              this.fullRefresh();
            },
          },
        ],
      },
    });

    const template: UiTypes.MatrixProps["template"] = {
      props: {},
      views: [
        {
          type: "image",
          props: {
            id: "image",
            bgcolor: $color("secondarySurface"),
            contentMode: $contentMode.scaleAspectFill,
          },
          layout: $layout.fill,
        },
      ],
    };

    const matrixNoTitle = new DynamicItemSizeMatrix({
      props: {
        spacing: 8,
        minItemWidth: $device.isIpad ? 182 : 148,
        maxColumns: 10,
        bgcolor: $color("clear"),
        data: [],
        template,
      },
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super);
        make.top.equalTo(view.prev.bottom);
      },
      events: {
        itemHeight: (width) => width * 1.2,
        didSelect: (sender, indexPath, data) => {
          const info = data.info as { gid: number; index: number };
          console.log(info);
          // TODO
        },
      },
    });

    const matrixWithTitle = new DynamicItemSizeSectionMatrix<DynamicItemSizeSectionMatrixSection>({
      props: {
        spacing: 8,
        minItemWidth: $device.isIpad ? 182 : 148,
        maxColumns: 10,
        bgcolor: $color("clear"),
        data: [],
        template,
      },
      layout: (make, view) => {
        make.top.left.right.bottom.equalTo(view.prev);
      },
      events: {
        itemHeight: (width) => width * 1.2,
        didSelect: (sender, indexPath, data) => {
          const info = data.info as { gid: number; index: number };
          console.log(info);
          // TODO
        },
      },
    });

    this.cviews = { navbar, matrixWithTitle, matrixNoTitle };
    this.rootView.views = [navbar, matrixNoTitle, matrixWithTitle];
  }

  fullRefresh() {
    const groups = favoriteImageManager.queryGroupWithFileNames({
      sort: this.sortOptions.sort,
      order: this.sortOptions.order,
    });

    if (this.sortOptions.showTitle) {
      this.cviews.matrixWithTitle.view.hidden = false;
      this.cviews.matrixNoTitle.view.hidden = true;
      this.cviews.matrixWithTitle.data = groups.map((group) => {
        return {
          title: group.title,
          items: group.pages.map((page) => ({
            image: { src: page.file_name ? favoriteImagePath + page.file_name : "" },
            info: { gid: group.gid, index: page.page_index },
          })),
        };
      });
      this.cviews.matrixNoTitle.data = [];
    } else {
      this.cviews.matrixWithTitle.view.hidden = true;
      this.cviews.matrixNoTitle.view.hidden = false;
      this.cviews.matrixWithTitle.data = [];
      this.cviews.matrixNoTitle.data = groups
        .map((group) =>
          group.pages.map((page) => ({
            image: { src: page.file_name ? favoriteImagePath + page.file_name : "" },
            info: { gid: group.gid, index: page.page_index },
          })),
        )
        .flat();
    }
  }
}
