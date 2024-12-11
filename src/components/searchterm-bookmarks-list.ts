import { Base, router, SplitViewController, TabBarController } from "jsbox-cview";
import { configManager } from "../utils/config";
import { DBSearchBookmarks } from "../types";
import { _mapSearchTermsToRow } from "./searchterm-history-list";
import { HomepageController } from "../controllers/homepage-controller";
import { getSearchOptions } from "../controllers/search-controller";
import { ArchiveController } from "../controllers/archive-controller";

export class SearchTermBookmarksList extends Base<UIListView, UiTypes.ListOptions> {
  _defineView: () => UiTypes.ListOptions;
  private _searchBookmarks: DBSearchBookmarks = [];
  private _filterText?: string;
  constructor({ layout }: {
    layout: (make: MASConstraintMaker, view: UIListView) => void;
  }) {
    super();
    this._defineView = () => {
      return {
        type: "list",
        props: {
          id: this.id,
          style: 2,
          bgcolor: $color("clear"),
          autoRowHeight: true,
          menu: {
            items: [
              {
                title: "立即搜索",
                symbol: "magnifyingglass",
                handler: (sender, indexPath) => {
                  const id = (sender as UIListView).object(indexPath).label.info.id as number;
                  const searchTerms = this._searchBookmarks.find(item => item.id === id)?.searchTerms;
                  if (!searchTerms) return;
                  (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                  (router.get("primaryViewController") as TabBarController).index = 0;
                  (router.get("homepageController") as HomepageController).startLoad({
                    type: "front_page",
                    options: {
                      searchTerms: searchTerms
                    }
                  });
                }
              },
              {
                title: "新建搜索",
                symbol: "plus.magnifyingglass",
                handler: async (sender, indexPath) => {
                  const id = (sender as UIListView).object(indexPath).label.info.id as number;
                  const searchTerms = this._searchBookmarks.find(item => item.id === id)?.searchTerms;
                  if (!searchTerms) return;
                  const options = await getSearchOptions(
                    { type: "front_page", options: { searchTerms } },
                    "showAll"
                  );
                  (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                  if (options.type === "archive") {
                    (router.get("archiveController") as ArchiveController).startLoad(options);
                    (router.get("primaryViewController") as TabBarController).index = 1;
                  } else {
                    (router.get("homepageController") as HomepageController).startLoad(options);
                    (router.get("primaryViewController") as TabBarController).index = 0;
                  }
                }
              },
              {
                title: "取消书签",
                symbol: "bookmark.slash",
                handler: (sender, indexPath) => {
                  const id = (sender as UIListView).object(indexPath).label.info.id as number;
                  configManager.deleteSearchBookmark(id);
                  const bookmarks = configManager.searchBookmarks;
                  this.refreshSearchBookmarks(bookmarks, this._filterText);
                }
              }
            ]
          },
          template: {
            views: [
              {
                type: "label",
                props: {
                  id: "label",
                  lines: 0,
                  lineSpacing: 22
                },
                layout: (make, view) => {
                  make.left.right.inset(10);
                  make.top.offset(0);
                  make.bottom.inset(-7);
                }
              }
            ]
          }
        },
        layout,
        events: {
          pulled: async (sender) => {
            sender.beginRefreshing();
            const bookmarks = configManager.searchBookmarks;
            this.refreshSearchBookmarks(bookmarks, this._filterText);
            sender.endRefreshing();
          },
          didSelect: (sender, indexPath) => {
            const id = (sender as UIListView).object(indexPath).label.info.id as number;
            const searchTerms = this._searchBookmarks.find(item => item.id === id)?.searchTerms;
            if (!searchTerms) return;
            (router.get("splitViewController") as SplitViewController).sideBarShown = false;
            (router.get("primaryViewController") as TabBarController).index = 0;
            (router.get("homepageController") as HomepageController).startLoad({
              type: "front_page",
              options: {
                searchTerms: searchTerms
              }
            });
          }
        }
      }
    }
  }

  refreshSearchBookmarks(searchBookmarks: DBSearchBookmarks, filterText?: string) {
    this._searchBookmarks = searchBookmarks;
    this._filterText = filterText;
    const data = searchBookmarks
      .filter(bookmark => {
        if (!filterText) return true;
        if (bookmark.sorted_fsearch.includes(filterText)) return true;
        if (bookmark.searchTerms.some(item => (
          item.term.includes(filterText)
          || item.namespace
          && configManager.translate(item.namespace, item.term)?.includes(filterText)
        ))) return true;
        return false;
      })
      .map(bookmark => _mapSearchTermsToRow(bookmark.searchTerms, bookmark.id));
    this.view.data = data;
    return data.length > 0;
  }
}
