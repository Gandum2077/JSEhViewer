import { BaseController, ContentView, CustomNavigationBar, SymbolButton } from "jsbox-cview";
import { SearchTermHistoryList } from "../components/searchterm-history-list";
import { configManager } from "../utils/config";

export class SidebarHistoryController extends BaseController {
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
    const navbar = new CustomNavigationBar({
      props: {
        title: "历史记录",
        style: 2,
        rightBarButtonItems: [
          {
            cview: filterButton,
          },
        ],
      },
    });
    const list = new SearchTermHistoryList({
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super.safeArea);
        make.top.equalTo(view.prev.bottom);
      },
      emptyHandler: () => {
        refresh();
      },
    });

    const refresh = () => {
      const history = configManager.searchHistory;
      const notEmpty = list.refreshSearchHistory(history, this._searchPhrase);
      if (history.length === 0) {
        (emptyView.view.get("emptyLabel") as UILabelView).text = "暂无记录";
      } else {
        (emptyView.view.get("emptyLabel") as UILabelView).text = "没有匹配的记录";
      }
      emptyView.view.hidden = notEmpty;
    };
    this.rootView.views = [navbar, list, emptyView];
  }
}
