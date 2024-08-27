import { BaseController, ContentView, CustomNavigationBar, List, Tab, SymbolButton } from "jsbox-cview";
import { SearchTermHistoryList } from "../components/searchterm-history-list";
import { statusManager } from "../utils/status";

export class SidebarHistoryController extends BaseController {
  constructor() {
    super({
      props: {
        bgcolor: $color("backgroundColor", "secondarySurface")
      },
      events: {
        didAppear: () => {
          // 在此刷新数据
          const history = statusManager.searchHistory
          list.refreshSearchHistory(history);
        }
      }
    });
    const emptyView = new ContentView({
      props: {
        bgcolor: $color("backgroundColor", "secondarySurface")
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "square.stack.3d.up.slash",
            tintColor: $color("systemPlaceholderText")
          },
          layout: (make, view) => {
            make.center.equalTo(view.super)
            make.size.equalTo($size(100, 100))
          }
        },
        {
          type: "label",
          props: {
            text: "没有匹配的记录",
            textColor: $color("systemPlaceholderText"),
            font: $font(20),
            align: $align.center
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super)
            make.top.equalTo(view.prev.bottom).inset(10)
          }
        }
      ],
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super.safeArea)
        make.top.equalTo(view.prev.bottom)
      }
    })
    const filterButton = new SymbolButton({
      props: {
        symbol: "line.3.horizontal.decrease.circle"
      },
      events: {
        tapped: () => {}
      }
    })
    const navbar = new CustomNavigationBar({
      props: {
        title: "历史记录",
        style: 2,
        rightBarButtonItems: [{
          cview: filterButton
        }]
      }
    });
    const list = new SearchTermHistoryList({
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super.safeArea)
        make.top.equalTo(view.prev.bottom)
      }
    })
    this.rootView.views = [navbar, list, emptyView]
  }
}