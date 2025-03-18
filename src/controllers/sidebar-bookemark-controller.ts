import { BaseController, ContentView, CustomNavigationBar, DialogSheet, List, SymbolButton } from "jsbox-cview";
import { SearchTermBookmarksList } from "../components/searchterm-bookmarks-list";
import { configManager } from "../utils/config";
import { _mapSearchTermsToRow } from "../components/searchterm-history-list";

function getReorderIds() {
  const bookmarks = configManager.searchBookmarks;
  const data = bookmarks.map((bookmark) => _mapSearchTermsToRow(bookmark.searchTerms, bookmark.id));
  const list = new List({
    props: {
      style: 2,
      reorder: true,
      data,
      template: {
        views: [
          {
            type: "label",
            props: {
              id: "label",
              lines: 1,
            },
            layout: (make, view) => {
              make.left.right.inset(10);
              make.top.bottom.inset(0);
            },
          },
        ],
      },
    },
    layout: $layout.fill,
    events: {
      reorderFinished: (data) => {},
    },
  });
  return new Promise<number[]>((resolve, reject) => {
    const sheet = new DialogSheet({
      title: "重新排序",
      cview: list,
      doneHandler: () => {
        return list.view.data.map((item) => item.label.info.id);
      },
    });
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}

export class SidebarBookmarkController extends BaseController {
  private _searchPhrase: string = "";
  constructor() {
    super({
      props: {
        bgcolor: $color("backgroundColor", "secondarySurface"),
      },
      events: {
        didAppear: () => {
          // 在此刷新数据
          refresh();
        },
      },
    });
    const emptyView = new ContentView({
      props: {
        bgcolor: $color("backgroundColor", "secondarySurface"),
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "square.stack.3d.up.slash",
            tintColor: $color("systemPlaceholderText"),
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super);
            make.centerY.equalTo(view.super).offset(-50);
            make.size.equalTo($size(100, 100));
          },
        },
        {
          type: "label",
          props: {
            id: "emptyLabel",
            text: "暂无记录",
            textColor: $color("systemPlaceholderText"),
            font: $font(20),
            align: $align.center,
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super);
            make.top.equalTo(view.prev.bottom).inset(10);
          },
        },
      ],
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super);
        make.top.equalTo(view.prev);
      },
    });
    const filterButton = new SymbolButton({
      props: {
        symbol: "line.3.horizontal.decrease.circle",
      },
      events: {
        tapped: (sender) => {
          $input.text({
            text: this._searchPhrase,
            type: $kbType.search,
            placeholder: "搜索历史记录",
            handler: (text) => {
              if (text === this._searchPhrase) return;
              if (!text) {
                filterButton.tintColor = $color("primaryText");
                filterButton.symbol = "line.3.horizontal.decrease.circle";
                this._searchPhrase = "";
                navbar.title = "历史记录";
              } else {
                filterButton.tintColor = $color("systemLink");
                filterButton.symbol = "line.3.horizontal.decrease.circle.fill";
                this._searchPhrase = text;
                navbar.title = text;
              }
              refresh();
            },
          });
        },
      },
    });

    const reorderButton = new SymbolButton({
      props: {
        symbol: "arrow.up.and.down.text.horizontal",
      },
      events: {
        tapped: async (sender) => {
          const ids = await getReorderIds();
          configManager.reorderSearchBookmarks(ids);
          refresh();
        },
      },
    });
    const navbar = new CustomNavigationBar({
      props: {
        title: "书签",
        style: 2,
        leftBarButtonItems: [
          {
            cview: reorderButton,
          },
        ],
        rightBarButtonItems: [
          {
            cview: filterButton,
          },
        ],
      },
    });
    const list = new SearchTermBookmarksList({
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super.safeArea);
        make.top.equalTo(view.prev.bottom);
      },
    });
    const refresh = () => {
      const bookmarks = configManager.searchBookmarks;
      const notEmpty = list.refreshSearchBookmarks(bookmarks, this._searchPhrase);
      if (bookmarks.length === 0) {
        (emptyView.view.get("emptyLabel") as UILabelView).text = "暂无记录";
      } else {
        (emptyView.view.get("emptyLabel") as UILabelView).text = "没有匹配的记录";
      }
      emptyView.view.hidden = notEmpty;
    };
    this.rootView.views = [navbar, list, emptyView];
  }
}
