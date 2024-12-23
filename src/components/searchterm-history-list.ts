import { Base, router, SplitViewController, TabBarController } from "jsbox-cview";
import { configManager } from "../utils/config";
import { EHSearchTerm, tagNamespaceMostUsedAlternateMap } from "ehentai-parser";
import { DBSearchHistory } from "../types";
import { namespaceColor } from "../utils/glv";
import { HomepageController } from "../controllers/homepage-controller";
import { getSearchOptions } from "../controllers/search-controller";
import { ArchiveController } from "../controllers/archive-controller";

/**
 * SearchTermHistoryList
 * 
 * 排序规则：
 * 按照今天，昨天，前天，一周内，一月内，一年内，更早排序
 * 
 * 
 */
export class SearchTermHistoryList extends Base<UIListView, UiTypes.ListOptions> {
  _defineView: () => UiTypes.ListOptions;
  private _searchHistory: DBSearchHistory = [];
  private _filterText?: string;
  constructor({ layout, emptyHandler }: {
    layout: (make: MASConstraintMaker, view: UIListView) => void;
    emptyHandler: () => void;
  }) {
    super();
    this._defineView = () => {
      return {
        type: "list",
        props: {
          id: this.id,
          style: 2,
          autoRowHeight: true,
          bgcolor: $color("clear"),
          menu: {
            items: [
              {
                title: "立即搜索",
                symbol: "magnifyingglass",
                handler: (sender, indexPath) => {
                  const id = (sender as UIListView).object(indexPath).label.info.id as number;
                  const searchTerms = this._searchHistory.find(item => item.id === id)?.searchTerms;
                  if (!searchTerms) return;
                  (router.get("splitViewController") as SplitViewController).sideBarShown = false;
                  (router.get("primaryViewController") as TabBarController).index = 0;
                  (router.get("homepageController") as HomepageController).startLoad({
                    type: "front_page",
                    options: {
                      searchTerms: searchTerms
                    }
                  })
                }
              },
              {
                title: "新建搜索",
                symbol: "plus.magnifyingglass",
                handler: async (sender, indexPath) => {
                  const id = (sender as UIListView).object(indexPath).label.info.id as number;
                  const searchTerms = this._searchHistory.find(item => item.id === id)?.searchTerms;
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
                title: "书签",
                symbol: "bookmark",
                color: $color("orange"),
                handler: (sender, indexPath) => {
                  const id = (sender as UIListView).object(indexPath).label.info.id as number;
                  const history = this._searchHistory.find(item => item.id === id);
                  if (!history) return;
                  const success = configManager.addSearchBookmark(history.sorted_fsearch, history.searchTerms);
                  if (success) {
                    $ui.success("书签已添加");
                  } else {
                    $ui.warning("书签已存在");
                  }
                }
              },
              {
                title: "删除",
                symbol: "trash",
                destructive: true,
                handler: (sender, indexPath) => {
                  const id = (sender as UIListView).object(indexPath).label.info.id as number;
                  configManager.deleteSearchHistory(id);
                  const notEmpty = this.refreshSearchHistory(configManager.searchHistory, this._filterText);
                  if (!notEmpty) emptyHandler();
                }
              }
            ]
          },
          template: {
            props: {
              bgcolor: $color("tertiarySurface")
            },
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
            const history = configManager.searchHistory
            this.refreshSearchHistory(history, this._filterText);
            sender.endRefreshing();
          },
          didSelect: (sender, indexPath) => {
            const id = (sender as UIListView).object(indexPath).label.info.id as number;
            const searchTerms = this._searchHistory.find(item => item.id === id)?.searchTerms;
            if (!searchTerms) return;
            (router.get("splitViewController") as SplitViewController).sideBarShown = false;
            (router.get("primaryViewController") as TabBarController).index = 0;
            (router.get("homepageController") as HomepageController).startLoad({
              type: "front_page",
              options: {
                searchTerms: searchTerms
              }
            })
          }
        }
      }
    }
  }

  /**
   * 
   * @param searchHistory 
   * @param filterText 
   * @returns 会返回是否有搜索历史条目，以便于判断是否显示空视图
   */
  refreshSearchHistory(searchHistory: DBSearchHistory, filterText?: string) {
    this._searchHistory = searchHistory;
    this._filterText = filterText;
    const filteredSearchHistory = searchHistory.filter(history => {
      if (!filterText) return true;
      if (history.sorted_fsearch.includes(filterText)) return true;
      if (history.searchTerms.some(item => (
        item.term.includes(filterText)
        || item.namespace
        && configManager.translate(item.namespace, item.term)?.includes(filterText)
      ))) return true;
      return false;
    });
    const todayArray: DBSearchHistory = [];
    const yesterdayArray: DBSearchHistory = [];
    const beforeYesterdayArray: DBSearchHistory = [];
    const pastWeekArray: DBSearchHistory = [];
    const pastMonthArray: DBSearchHistory = [];
    const pastYearArray: DBSearchHistory = [];
    const earlierArray: DBSearchHistory = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    filteredSearchHistory.forEach((item) => {
      const targetDate = new Date(item.last_access_time);
      targetDate.setHours(0, 0, 0, 0);
      // 将时间差转换为天数
      const differenceInTime = today.getTime() - targetDate.getTime();
      const differenceInDays = Math.round(differenceInTime / (1000 * 60 * 60 * 24));
      if (differenceInDays === 0) {
        todayArray.push(item);
      } else if (differenceInDays === 1) {
        yesterdayArray.push(item);
      } else if (differenceInDays === 2) {
        beforeYesterdayArray.push(item);
      } else if (differenceInDays < 7) {
        pastWeekArray.push(item);
      } else if (isWithinLastMonth(targetDate)) {
        pastMonthArray.push(item);
      } else if (isWithinLastYear(targetDate)) {
        pastYearArray.push(item);
      } else {
        earlierArray.push(item);
      }
    });

    const data: { title: string; rows: any[] }[] = []
    if (todayArray.length > 0) {
      data.push({
        title: "今天",
        rows: todayArray.map(item => _mapSearchTermsToRow(item.searchTerms, item.id))
      });
    }
    if (yesterdayArray.length > 0) {
      data.push({
        title: "昨天",
        rows: yesterdayArray.map(item => _mapSearchTermsToRow(item.searchTerms, item.id))
      });
    }
    if (beforeYesterdayArray.length > 0) {
      data.push({
        title: "前天",
        rows: beforeYesterdayArray.map(item => _mapSearchTermsToRow(item.searchTerms, item.id))
      });
    }
    if (pastWeekArray.length > 0) {
      data.push({
        title: "一周内",
        rows: pastWeekArray.map(item => _mapSearchTermsToRow(item.searchTerms, item.id))
      });
    }
    if (pastMonthArray.length > 0) {
      data.push({
        title: "一月内",
        rows: pastMonthArray.map(item => _mapSearchTermsToRow(item.searchTerms, item.id))
      });
    }
    if (pastYearArray.length > 0) {
      data.push({
        title: "一年内",
        rows: pastYearArray.map(item => _mapSearchTermsToRow(item.searchTerms, item.id))
      });
    }
    if (earlierArray.length > 0) {
      data.push({
        title: "更早",
        rows: earlierArray.map(item => _mapSearchTermsToRow(item.searchTerms, item.id))
      });
    }
    this.view.data = data;
    return filteredSearchHistory.length > 0;
  }
}

export function _mapSearchTermsToRow(searchTerms: EHSearchTerm[], id: number) {
  const splits = searchTerms.map((searchTerm) => {
    const { namespace, qualifier, term, dollar, subtract, tilde } = searchTerm;
    let text = "";
    let color = $color("clear");
    if (namespace) {
      const translation = configManager.translate(namespace, term);
      color = namespaceColor[namespace];
      text = translation || `${tagNamespaceMostUsedAlternateMap[namespace]}:${term}`;
    } else {
      text = term;
      color = namespaceColor["temp"];
    }
    if (qualifier) text = `${qualifier}:${text}`;
    if (dollar) text += "$";
    if (tilde) text = `~${text}`;
    if (subtract) text = `-${text}`;
    return {
      text,
      color
    }
  });
  let rangeLocation = 0;
  const styledText: UiTypes.StyledTextOptions = {
    text: splits.map(s => s.text).join("  ") + "\n",
    font: $font(14),
    styles: splits.map((split) => {
      const { text, color } = split;
      const range = $range(rangeLocation, text.length);
      rangeLocation += text.length + 2;
      return {
        range,
        bgcolor: color
      }
    })
  }
  return {
    label: {
      info: { id },
      styledText
    }
  }
}

function daysBetween(date: string) {
  // 获取今天的日期，并设置时间为零时零分零秒
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 获取目标日期，并设置时间为零时零分零秒
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  // 计算时间差（以毫秒为单位）
  const differenceInTime = targetDate.getTime() - today.getTime();

  // 将时间差转换为天数
  const differenceInDays = Math.round(differenceInTime / (1000 * 60 * 60 * 24));

  return differenceInDays;
}

function isWithinLastMonth(date: Date) {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // 设置为今天的最后一刻

  let oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate() + 1);

  // 处理月初的特殊情况
  if (oneMonthAgo.getDate() !== today.getDate() + 1) {
    oneMonthAgo = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  oneMonthAgo.setHours(0, 0, 0, 0); // 设置为当天的开始

  return date >= oneMonthAgo && date <= today;
}

function isWithinLastYear(date: Date) {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // 设置为今天的最后一刻

  // 计算去年的同一天
  let oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1);

  // 处理闰年问题
  if (oneYearAgo.getMonth() !== today.getMonth()) {
    // 如果月份不同，说明遇到了2月29日的情况
    oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), 1);
  }

  oneYearAgo.setHours(0, 0, 0, 0); // 设置为当天的开始

  return date >= oneYearAgo && date <= today;
}