import { BaseController, ContentView, CustomNavigationBar, List, Tab, SymbolButton } from "jsbox-cview";
import { SearchTermBookmarksList } from "../components/searchterm-bookmarks-list";
import { statusManager } from "../utils/status";

export class SidebarBookmarkController extends BaseController {
  constructor() {
    super({
      props: {
        bgcolor: $color("backgroundColor", "secondarySurface")
      },
      events: {
        didAppear: () => {
          // 在此刷新数据
          list.refreshSearchBookmarks(statusManager.searchBookmarks);
        }
      }
    })
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
            text: "暂无记录",
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
      }
    })
    const navbar = new CustomNavigationBar({
      props: {
        title: "书签",
        style: 2,
        rightBarButtonItems: [{
          cview: filterButton
        }]
      }
    });
    const list = new SearchTermBookmarksList({
      layout: (make, view) => {
        make.left.right.bottom.equalTo(view.super.safeArea)
        make.top.equalTo(view.prev.bottom)
      }
    })
    this.rootView.views = [navbar, list, emptyView]
  }
}
