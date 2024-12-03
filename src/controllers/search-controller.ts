import { Base, ContentView, DynamicItemSizeMatrix, DynamicPreferenceListView, DynamicRowHeightList, Flowlayout, Input, PrefsRowBoolean, PrefsRowInteger, PrefsRowList, searchBarBgcolor, SymbolButton, Tab } from "jsbox-cview";
import { catColor, favcatColor, searchableCategories, defaultButtonColor, namespaceTranslations, namespaceColor } from "../utils/glv";
import { configManager } from "../utils/config";
import { EHSearchTerm, assembleSearchTerms, EHQualifier, EHSearchedCategory, parseFsearch, TagNamespace, EHSearchOptions } from "ehentai-parser";
import { ArchiveTabOptions, FavoritesTabOptions, FrontPageTabOptions, WatchedTabOptions } from "../types";

// 整体构造是上面一个自定义导航栏，下面是一个搜索选项列表
// 下面一共有五个List叠放在一起，分别是：
// 1. 显示最近搜索和最常搜索的搜索词
// 2. 显示搜索联想词
// 3. 显示首页和关注的搜索选项
// 4. 显示收藏的搜索选项
// 5. 显示存档的搜索选项

type MenuDisplayMode = "onlyShowFrontPage" | "onlyShowArchive" | "showAllExceptArchive" | "showAll";

const TAG_FONT_SIZE = 15;

class SearchSuggestionView extends Base<UIListView, UiTypes.ListOptions> {
  currentSuggestions: {
    namespace: TagNamespace;
    name: string;
    translation: string;
  }[] = [];
  _defineView: () => UiTypes.ListOptions;

  constructor(tagSelected: (tag: { namespace: TagNamespace; name: string; }) => void) {
    super();
    this._defineView = () => ({
      type: "list",
      props: {
        id: this.id,
        hidden: true,
        separatorInset: $insets(0, 20, 0, 0),
        template: {
          views: [{
            type: "label",
            props: {
              id: "content",
              lines: 2,
              font: $font("bold", 14)
            },
            layout: (make, view) => {
              make.left.inset(20)
              make.right.inset(10)
              make.top.bottom.inset(0)
            }
          }]
        }
      },
      layout: $layout.fill,
      events: {
        didSelect: (sender, indexPath, data) => {
          tagSelected(this.currentSuggestions[indexPath.row]);
        }
      }
    })
  }

  search(keyword: string) {
    const filtered = configManager.translationList.filter(item => item.name.includes(keyword) || item.translation.includes(keyword))
    this.currentSuggestions = filtered;
    this.view.data = this.mapData(filtered);
  }

  mapData(raw: {
    namespace: TagNamespace;
    name: string;
    translation: string;
  }[]) {
    return raw.map(item => ({
      content: {
        text: `${namespaceTranslations[item.namespace]}:${item.name} ${item.translation}`
      }
    }))
  }
}

class SearchHistoryViewSectionTitle extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor(title: string, symbol: string) {
    super();
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        bgcolor: $color("insetGroupedBackground")
      },
      layout: $layout.fill,
      views: [
        {
          type: "view",
          props: {},
          layout: (make, view) => {
            make.left.right.inset(0);
            make.bottom.inset(8);
            make.height.equalTo(20);
          },
          views: [
            {
              type: "image",
              props: {
                symbol: symbol,
                tintColor: $color("secondaryText")
              },
              layout: (make, view) => {
                make.left.inset(0);
                make.centerY.equalTo(view.super);
                make.size.equalTo($size(16, 16));
              }
            },
            {
              type: "label",
              props: {
                text: title,
                textColor: $color("secondaryText"),
                font: $font("bold", 14)
              },
              layout: (make, view) => {
                make.left.equalTo(view.prev.right).inset(3);
                make.centerY.equalTo(view.super);
              }
            }
          ]
        }
      ]
    })
  }

  heightToWidth(width: number) {
    return 44
  }
}

class HistoryMatrixItem extends Base<UILabelView, UiTypes.LabelOptions> {
  _defineView: () => UiTypes.LabelOptions;
  private _text: string;
  constructor(tag: { namespace?: TagNamespace, qualifier?: EHQualifier, term: string }) {
    super();
    this._text = tag.qualifier === "uploader"
      ? "上传者:" + tag.term
      : (tag.namespace ? configManager.translate(tag.namespace, tag.term) || tag.term : tag.term);
    this._defineView = () => ({
      type: "label",
      props: {
        id: this.id,
        text: this._text,
        lines: 1,
        font: $font(TAG_FONT_SIZE),
        bgcolor: namespaceColor[tag.namespace ?? "temp"],
        align: $align.center,
        cornerRadius: 10,
        smoothCorners: true,
      },
      layout: $layout.fill
    })
  }

  itemWidth() {
    return Math.ceil($text.sizeThatFits({
      text: this._text,
      width: 1000,
      font: $font(TAG_FONT_SIZE)
    }).width) + 16;
  }
}

class SearchHistoryView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor(
    textHandler: (text: string) => void,
    willBeginDraggingHandler: () => void // 用于滑动时隐藏键盘
  ) {
    super();
    const mostAccessedTags = configManager.getTenMostAccessedTags()
    const lastAccessSearchTerms = configManager.getTenLastAccessSearchTerms()
    const sectionTitleLastAccessed = new SearchHistoryViewSectionTitle("最近访问", "clock.fill");
    const historyMatrixLastAccessed = new Flowlayout({
      props: {
        items: lastAccessSearchTerms.map(tag => new HistoryMatrixItem(tag)),
        spacing: 8,
        itemHeight: 26,
        bgcolor: $color("insetGroupedBackground")
      },
      layout: $layout.fill,
      events: {
        didSelect(sender, index, item) {
          const tag = lastAccessSearchTerms[index];
          const fsearch = assembleSearchTerms([{
            namespace: tag.namespace,
            qualifier: tag.qualifier === "uploader" ? "uploader" : undefined,
            term: tag.term,
            dollar: true,
            subtract: false,
            tilde: false
          }])
          textHandler(fsearch)
        }
      }
    })
    const sectionTitleMostSearched = new SearchHistoryViewSectionTitle("最常搜索", "list.number");
    const historyMatrixMostSearched = new Flowlayout({
      props: {
        items: mostAccessedTags.map(tag => new HistoryMatrixItem(tag)),
        spacing: 8,
        itemHeight: 26,
        bgcolor: $color("insetGroupedBackground")
      },
      layout: $layout.fill,
      events: {
        didSelect(sender, index, item) {
          console.log(mostAccessedTags)
          const tag = mostAccessedTags[index];
          const fsearch = assembleSearchTerms([{
            namespace: tag.namespace,
            qualifier: tag.qualifier === "uploader" ? "uploader" : undefined,
            term: tag.term,
            dollar: true,
            subtract: false,
            tilde: false
          }])
          textHandler(fsearch)
        }
      }
    })
    const list = new DynamicRowHeightList({
      rows: [
        sectionTitleLastAccessed,
        historyMatrixLastAccessed,
        sectionTitleMostSearched,
        historyMatrixMostSearched
      ],
      props: {
        selectable: false,
        separatorHidden: true,
        showsVerticalIndicator: false,
        bgcolor: $color("insetGroupedBackground")
      },
      layout: (make, view) => {
        make.left.right.inset(15);
        make.top.bottom.inset(0);
      },
      events: {
        willBeginDragging: () => {
          willBeginDraggingHandler();
        }
      }
    })
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        bgcolor: $color("insetGroupedBackground")
      },
      layout: $layout.fill,
      views: [list.definition]
    })
  }
}

class FrontPageOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _excludedCategories: Set<EHSearchedCategory> = new Set();
  private _enablePageFilters: boolean = false;
  private _options: {
    browseExpungedGalleries?: boolean,
    requireGalleryTorrent?: boolean,
    minimumPages?: number,
    maximumPages?: number,
    minimumRating?: number,
    disableLanguageFilters?: boolean,
    disableUploaderFilters?: boolean,
    disableTagFilters?: boolean
  } = {};
  cviews: {
    catList: DynamicItemSizeMatrix,
    optionsList: DynamicPreferenceListView
  }
  constructor(
    willBeginDraggingHandler: () => void // 用于滑动时隐藏键盘
  ) {
    super();
    const optionsList = new DynamicPreferenceListView({
      sections: this.mapSections(),
      props: {
        style: 2,
        scrollEnabled: false,
        rowHeight: 44,
        bgcolor: $color("backgroundColor")
      },
      layout: $layout.fill,
      events: {
        changed: values => {
          const reloadFlag = this._enablePageFilters !== values.enablePageFilters;
          this._options = {
            browseExpungedGalleries: values.browseExpungedGalleries || undefined,
            requireGalleryTorrent: values.requireGalleryTorrent || undefined,
            minimumPages: values.enablePageFilters ? values.minimumPages : undefined,
            maximumPages: values.enablePageFilters ? values.maximumPages : undefined,
            minimumRating: values.minimumRating ? values.minimumRating + 1 : undefined,
            disableLanguageFilters: values.disableLanguageFilters || undefined,
            disableUploaderFilters: values.disableUploaderFilters || undefined,
            disableTagFilters: values.disableTagFilters || undefined
          }
          this._enablePageFilters = values.enablePageFilters;
          console.log(this._options)
          if (reloadFlag) {
            optionsList.sections = this.mapSections();
          }
        }
      }
    });
    const catList = new DynamicItemSizeMatrix({
      props: {
        bgcolor: $color("backgroundColor"),
        minItemWidth: 100,
        fixedItemHeight: 36,
        spacing: 10,
        scrollEnabled: false,
        dynamicHeightEnabled: false,
        maxColumns: 5,
        data: this.mapData(),
        template: {
          views: [{
            type: "label",
            props: {
              id: "label",
              align: $align.center,
              font: $font("Futura-Bold", 16),
              textColor: $color("white"),
            },
            layout: $layout.fill
          }]
        },
        footer: {
          type: "view",
          props: {
            height: 44 + 44 * 9 + 35 * 2
          },
          views: [
            {
              type: "stack",
              props: {
                bgcolor: $color("clear"),
                spacing: 10,
                distribution: $stackViewDistribution.fillEqually,
                stack: {
                  views: [
                    {
                      type: "button",
                      props: {
                        title: "全选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true
                      },
                      events: {
                        tapped: sender => {
                          this._excludedCategories = new Set();
                          catList.data = this.mapData();
                        }
                      }
                    },
                    {
                      type: "button",
                      props: {
                        title: "全不选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true
                      },
                      events: {
                        tapped: sender => {
                          this._excludedCategories = new Set(searchableCategories);
                          catList.data = this.mapData();
                        }
                      }
                    },
                    {
                      type: "button",
                      props: {
                        title: "反选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true
                      },
                      events: {
                        tapped: sender => {
                          const reversed = searchableCategories.filter(cat => !this._excludedCategories.has(cat));
                          this._excludedCategories = new Set(reversed);
                          catList.data = this.mapData();
                        }
                      }
                    }
                  ]
                }
              },
              layout: (make, view) => {
                make.top.inset(5);
                make.right.inset(16);
                make.height.equalTo(34);
                make.width.equalTo(230);
              }
            },
            {
              type: "view",
              props: {},
              layout: (make, view) => {
                make.top.equalTo(view.prev.bottom).inset(0);
                make.left.right.bottom.inset(0);
              },
              views: [optionsList.definition]
            }
          ]
        }
      },
      layout: $layout.fill,
      events: {
        willBeginDragging: () => {
          willBeginDraggingHandler();
        },
        didSelect: (sender, indexPath, data) => {
          const index = indexPath.row;
          const cat = searchableCategories[index];
          if (this._excludedCategories.has(cat)) {
            this._excludedCategories.delete(cat);
          } else {
            this._excludedCategories.add(cat);
          }
          catList.data = this.mapData();
        }
      }
    })
    this.cviews = {
      catList,
      optionsList
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        hidden: true
      },
      layout: $layout.fill,
      views: [catList.definition]
    });
  }

  mapData() {
    return searchableCategories.map(cat => ({
      label: {
        text: cat, bgcolor: catColor[cat],
        alpha: this._excludedCategories.has(cat) ? 0.4 : 1
      }
    }))
  }

  mapSections() {
    const browseExpungedGalleriesPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "只显示已删除的图库",
      key: "browseExpungedGalleries",
      value: this._options.browseExpungedGalleries || false
    }
    const requireGalleryTorrentPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "只显示有种子的图库",
      key: "requireGalleryTorrent",
      value: this._options.requireGalleryTorrent || false
    }
    const disableLanguageFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "禁用过滤器（语言）",
      key: "disableLanguageFilters",
      value: this._options.disableLanguageFilters || false
    }
    const disableUploaderFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "禁用过滤器（上传者）",
      key: "disableUploaderFilters",
      value: this._options.disableUploaderFilters || false
    }
    const disableTagFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "禁用过滤器（标签）",
      key: "disableTagFilters",
      value: this._options.disableTagFilters || false
    }
    const enablePageFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "页数",
      key: "enablePageFilters",
      value: this._enablePageFilters || false
    }
    const minimumRatingPrefsRow: PrefsRowList = {
      type: "list",
      title: "评分",
      key: "minimumRating",
      value: this._options.minimumRating ? this._options.minimumRating - 1 : 0,
      items: ["不使用", "至少2星", "至少3星", "至少4星", "至少5星"]
    }
    const minimumPagesPrefsRow: PrefsRowInteger = {
      type: "integer",
      title: "页数最小值",
      key: "minimumPages",
      placeholder: "0~2000",
      min: 0,
      max: 2000,
      value: this._options.minimumPages
    }
    const maximumPagesPrefsRow: PrefsRowInteger = {
      type: "integer",
      title: "页数最大值",
      key: "maximumPages",
      placeholder: "0~2000",
      min: 0,
      max: 2000,
      value: this._options.maximumPages
    }
    if (this._enablePageFilters) {
      return [{
        title: "",
        rows: [
          browseExpungedGalleriesPrefsRow,
          requireGalleryTorrentPrefsRow,
          enablePageFiltersPrefsRow,
          minimumPagesPrefsRow,
          maximumPagesPrefsRow,
          minimumRatingPrefsRow,
          disableLanguageFiltersPrefsRow,
          disableUploaderFiltersPrefsRow,
          disableTagFiltersPrefsRow
        ]
      }]
    } else {
      return [{
        title: "",
        rows: [
          browseExpungedGalleriesPrefsRow,
          requireGalleryTorrentPrefsRow,
          enablePageFiltersPrefsRow,
          minimumRatingPrefsRow,
          disableLanguageFiltersPrefsRow,
          disableUploaderFiltersPrefsRow,
          disableTagFiltersPrefsRow
        ]
      }]
    }
  }

  get data() {
    return {
      excludedCategories: [...this._excludedCategories],
      options: this._options
    }
  }
}

class FavoritesOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _selectedFavcat?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  cviews: {
    favcatList: DynamicItemSizeMatrix,
    optionsList: DynamicPreferenceListView
  }
  constructor(
    willBeginDraggingHandler: () => void // 用于滑动时隐藏键盘
  ) {
    super();
    const optionsList = new DynamicPreferenceListView({
      sections: [{
        title: "",
        rows: [
          {
            type: "boolean",
            title: "禁用过滤器（语言）",
            key: "disableLanguageFilters",
            value: false
          },
          {
            type: "boolean",
            title: "禁用过滤器（上传者）",
            key: "disableUploaderFilters",
            value: false
          },
          {
            type: "boolean",
            title: "禁用过滤器（标签）",
            key: "disableTagFilters",
            value: false
          }
        ]
      }],
      props: {
        style: 2,
        scrollEnabled: false,
        height: 44 * 3 + 35 * 2,
        rowHeight: 44,
        bgcolor: $color("backgroundColor")
      },
      layout: $layout.fill,
      events: {}
    });
    const favcatList = new DynamicItemSizeMatrix({
      props: {
        bgcolor: $color("backgroundColor"),
        minItemWidth: 170,
        fixedItemHeight: 36,
        spacing: 10,
        scrollEnabled: false,
        maxColumns: 2,
        data: this.mapData(),
        template: {
          props: {
            bgcolor: $color("tertiarySurface"),
            cornerRadius: 10,
            smoothCorners: true
          },
          views: [
            {
              type: "image",
              props: {
                id: "icon",
                symbol: "heart.fill",
                contentMode: 1
              },
              layout: (make, view) => {
                make.left.inset(10);
                make.centerY.equalTo(view.super);
                make.size.equalTo($size(20, 20));
              }
            },
            {
              type: "label",
              props: {
                id: "label",
                align: $align.left,
                lines: 2,
                font: $font(16)
              },
              layout: (make, view) => {
                make.left.equalTo(view.prev.right).inset(10);
                make.height.equalTo(view.super);
                make.right.inset(10);
              }
            }
          ]
        },
        footer: optionsList.definition
      },
      layout: $layout.fill,
      events: {
        willBeginDragging: () => {
          willBeginDraggingHandler();
        },
        didSelect: (sender, indexPath, data) => {
          const selectedIndex = indexPath.row as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
          if (this._selectedFavcat === selectedIndex) {
            this._selectedFavcat = undefined;
          } else {
            this._selectedFavcat = selectedIndex;
          };
          favcatList.data = this.mapData();
        }
      }
    })
    this.cviews = {
      favcatList,
      optionsList
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        hidden: true
      },
      layout: $layout.fill,
      views: [favcatList.definition]
    });
  }

  mapData() {
    return configManager.favcatTitles.map((title, index) => {
      const i = index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      return {
        icon: {
          tintColor: favcatColor[i]
        },
        label: {
          text: title,
          textColor: (this._selectedFavcat === i) ? $color("systemLink") : $color("primaryText")
        }
      }
    })
  }

  get options() {
    return this.cviews.optionsList.values as {
      disableLanguageFilters: boolean,
      disableUploaderFilters: boolean,
      disableTagFilters: boolean
    }
  }

  get data() {
    return {
      selectedFavcat: this._selectedFavcat,
      options: this.options
    }
  }
}

class ArchiveOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _excludedCategories: Set<EHSearchedCategory> = new Set();
  private _enablePageFilters: boolean = false;
  private _options: {
    minimumPages?: number,
    maximumPages?: number,
    minimumRating?: number
  } = {};
  cviews: {
    catList: DynamicItemSizeMatrix,
    optionsList: DynamicPreferenceListView
  }
  constructor(
    willBeginDraggingHandler: () => void // 用于滑动时隐藏键盘
  ) {
    super();
    const optionsList = new DynamicPreferenceListView({
      sections: this.mapSections(),
      props: {
        style: 2,
        scrollEnabled: false,
        rowHeight: 44,
        bgcolor: $color("backgroundColor")
      },
      layout: $layout.fill,
      events: {
        changed: values => {
          const reloadFlag = this._enablePageFilters !== values.enablePageFilters;
          this._options = {
            minimumPages: values.enablePageFilters ? values.minimumPages : undefined,
            maximumPages: values.enablePageFilters ? values.maximumPages : undefined,
            minimumRating: values.minimumRating ? values.minimumRating + 1 : undefined
          }
          this._enablePageFilters = values.enablePageFilters;
          console.log(this._options)
          if (reloadFlag) {
            optionsList.sections = this.mapSections();
          }
        }
      }
    });
    const catList = new DynamicItemSizeMatrix({
      props: {
        bgcolor: $color("backgroundColor"),
        minItemWidth: 100,
        fixedItemHeight: 36,
        spacing: 10,
        scrollEnabled: false,
        dynamicHeightEnabled: false,
        maxColumns: 5,
        data: this.mapData(),
        template: {
          views: [{
            type: "label",
            props: {
              id: "label",
              align: $align.center,
              font: $font("Futura-Bold", 16),
              textColor: $color("white"),
            },
            layout: $layout.fill
          }]
        },
        footer: {
          type: "view",
          props: {
            height: 44 + 44 * 4 + 35 * 2
          },
          views: [
            {
              type: "stack",
              props: {
                bgcolor: $color("clear"),
                spacing: 10,
                distribution: $stackViewDistribution.fillEqually,
                stack: {
                  views: [
                    {
                      type: "button",
                      props: {
                        title: "全选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true
                      },
                      events: {
                        tapped: sender => {
                          this._excludedCategories = new Set();
                          catList.data = this.mapData();
                        }
                      }
                    },
                    {
                      type: "button",
                      props: {
                        title: "全不选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true
                      },
                      events: {
                        tapped: sender => {
                          this._excludedCategories = new Set(searchableCategories);
                          catList.data = this.mapData();
                        }
                      }
                    },
                    {
                      type: "button",
                      props: {
                        title: "反选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true
                      },
                      events: {
                        tapped: sender => {
                          const reversed = searchableCategories.filter(cat => !this._excludedCategories.has(cat));
                          this._excludedCategories = new Set(reversed);
                          catList.data = this.mapData();
                        }
                      }
                    }
                  ]
                }
              },
              layout: (make, view) => {
                make.top.inset(5);
                make.right.inset(16);
                make.height.equalTo(34);
                make.width.equalTo(230);
              }
            },
            {
              type: "view",
              props: {},
              layout: (make, view) => {
                make.top.equalTo(view.prev.bottom).inset(0);
                make.left.right.bottom.inset(0);
              },
              views: [optionsList.definition]
            }
          ]
        }
      },
      layout: $layout.fill,
      events: {
        willBeginDragging: () => {
          willBeginDraggingHandler();
        },
        didSelect: (sender, indexPath, data) => {
          const index = indexPath.row;
          const cat = searchableCategories[index];
          if (this._excludedCategories.has(cat)) {
            this._excludedCategories.delete(cat);
          } else {
            this._excludedCategories.add(cat);
          }
          catList.data = this.mapData();
        }
      }
    })
    this.cviews = {
      catList,
      optionsList
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        hidden: true
      },
      layout: $layout.fill,
      views: [catList.definition]
    });
  }

  mapData() {
    return searchableCategories.map(cat => ({
      label: {
        text: cat, bgcolor: catColor[cat],
        alpha: this._excludedCategories.has(cat) ? 0.4 : 1
      }
    }))
  }

  mapSections() {
    const enablePageFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "页数",
      key: "enablePageFilters",
      value: this._enablePageFilters || false
    }
    const minimumRatingPrefsRow: PrefsRowList = {
      type: "list",
      title: "评分",
      key: "minimumRating",
      value: this._options.minimumRating ? this._options.minimumRating - 1 : 0,
      items: ["不使用", "至少2星", "至少3星", "至少4星", "至少5星"]
    }
    const minimumPagesPrefsRow: PrefsRowInteger = {
      type: "integer",
      title: "页数最小值",
      key: "minimumPages",
      placeholder: "0~2000",
      min: 0,
      max: 2000,
      value: this._options.minimumPages
    }
    const maximumPagesPrefsRow: PrefsRowInteger = {
      type: "integer",
      title: "页数最大值",
      key: "maximumPages",
      placeholder: "0~2000",
      min: 0,
      max: 2000,
      value: this._options.maximumPages
    }
    if (this._enablePageFilters) {
      return [{
        title: "",
        rows: [
          enablePageFiltersPrefsRow,
          minimumPagesPrefsRow,
          maximumPagesPrefsRow,
          minimumRatingPrefsRow,
        ]
      }]
    } else {
      return [{
        title: "",
        rows: [
          enablePageFiltersPrefsRow,
          minimumRatingPrefsRow,
        ]
      }]
    }
  }

  get data() {
    return {
      excludedCategories: [...this._excludedCategories],
      options: this._options
    }
  }
}

type SearchArgs = FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions | ArchiveTabOptions

class NavBar extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  cviews: {
    tab: Tab,
    input: Input
  }
  private _menuDisplayMode: MenuDisplayMode;
  private _filterSwitch: boolean = false;
  constructor(options: {
    type: "front_page" | "watched" | "favorites" | "archive",
    searchTerms?: EHSearchTerm[],
    menuDisplayMode: MenuDisplayMode,
    filterChangedHandler: () => void,
    tabChangedHandler: () => void,
    inputChangedHandler: (text: string) => void,
    popHandler: () => void,
    searchHandler: () => void
  }) {
    super();
    this._menuDisplayMode = options.menuDisplayMode;
    const popButton = new SymbolButton({
      props: {
        symbol: "chevron.left",
        tintColor: $color("primaryText"),
        insets: $insets(2.5, 2.5, 2.5, 2.5)
      },
      layout: (make, view) => {
        make.left.inset(0);
        make.centerY.equalTo(view.super);
        make.height.width.equalTo(30);
      },
      events: {
        tapped: sender => {
          options.popHandler();
        }
      }
    })
    const filterButton = new SymbolButton({
      props: {
        symbol: "slider.horizontal.3",
        tintColor: $color("primaryText"),
        insets: $insets(2.5, 2.5, 2.5, 2.5)
      },
      layout: (make, view) => {
        make.right.inset(0);
        make.centerY.equalTo(view.super);
        make.height.width.equalTo(30);
      },
      events: {
        tapped: sender => {
          if (this._filterSwitch) {
            this._filterSwitch = false;
            filterButton.tintColor = $color("primaryText");
          } else {
            this._filterSwitch = true;
            filterButton.tintColor = $color("systemLink");
          }

          options.filterChangedHandler();
        }
      }
    })
    const input = new Input({
      props: {
        text: (options.searchTerms && options.searchTerms.length) ? assembleSearchTerms(options.searchTerms) : "",
        type: $kbType.search,
        bgcolor: $color("clear"),
        textColor: $color("primaryText"),
        font: $font(16)
      },
      layout: (make, view) => {
        make.left.equalTo(view.prev.right).inset(0);
        make.right.inset(0);
        make.centerY.equalTo(view.super);
        make.height.equalTo(view.super);
      },
      events: {
        changed: sender => {
          options.inputChangedHandler(sender.text);
        },
        returned: sender => {
          options.searchHandler(); //TODO: searchHandler需要修改
        }
      }
    })
    const searchInput = new ContentView({
      props: {
        bgcolor: searchBarBgcolor,
        cornerRadius: 8,
        smoothCorners: true
      },
      layout: (make, view) => {
        make.left.inset(30);
        make.right.inset(30);
        make.centerY.equalTo(view.super);
        make.height.equalTo(36);
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "magnifyingglass",
            tintColor: $color("systemPlaceholderText")
          },
          layout: (make, view) => {
            make.left.inset(6);
            make.centerY.equalTo(view.super);
            make.size.equalTo($size(20, 20));
          }
        },
        input.definition
      ]
    })
    const mainView = new ContentView({
      props: {
        bgcolor: $color("clear")
      },
      layout: (make, view) => {
        make.top.equalTo(view.super.safeAreaTop).inset(0);
        make.left.right.inset(0);
        make.height.equalTo(50);
      },
      views: [popButton.definition, searchInput.definition, filterButton.definition]
    })
    const tab = new Tab({
      props: {
        index: {
          front_page: 0,
          watched: 1,
          favorites: 2,
          archive: 3
        }[options.type],
        items: options.menuDisplayMode === "showAllExceptArchive" ? ["首页", "订阅", "收藏"] : ["首页", "订阅", "收藏", "存档"]
      },
      layout: (make, view) => {
        make.left.right.inset(50);
        make.height.equalTo(30);
        make.bottom.inset(10);
      },
      events: {
        changed: sender => {
          options.tabChangedHandler();
        }
      }
    })
    const seprator: UiTypes.ViewOptions = {
      type: "view",
      props: {
        bgcolor: $color("separatorColor")
      },
      layout: (make, view) => {
        make.left.right.inset(0);
        make.height.equalTo(1 / $device.info.screen.scale);
        make.bottom.inset(0);
      }
    }
    this.cviews = {
      tab,
      input
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id
      },
      layout: (make, view) => {
        make.left.right.top.inset(0);
        make.bottom.equalTo(view.super.safeAreaTop).inset(
          (options.menuDisplayMode === "showAll" || options.menuDisplayMode === "showAllExceptArchive") ? -92 : -50
        );
      },
      views: (options.menuDisplayMode === "showAll" || options.menuDisplayMode === "showAllExceptArchive")
        ? [mainView.definition, tab.definition, seprator]
        : [mainView.definition, seprator]
    });
  }

  get filterOn() {
    return this._filterSwitch;
  }

  get type() {
    let type: "front_page" | "watched" | "favorites" | "archive";
    if (this._menuDisplayMode === "onlyShowFrontPage") {
      type = "front_page";
    } else if (this._menuDisplayMode === "onlyShowArchive") {
      type = "archive";
    } else if (this.cviews.tab.view.index === 1) {
      type = "watched";
    } else if (this.cviews.tab.view.index === 2) {
      type = "favorites";
    } else if (this.cviews.tab.view.index === 3) {
      type = "archive";
    } else {
      type = "front_page";
    }
    return type;
  }
}

class SearchContentView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  cviews: {
    navbar: NavBar,
    searchSuggestionView: SearchSuggestionView,
    searchHistoryView: SearchHistoryView,
    frontPageOptionsView: FrontPageOptionsView,
    watchedOptionsView: FrontPageOptionsView,
    favoritesOptionsView: FavoritesOptionsView,
    archiveOptionsView: ArchiveOptionsView
  }
  constructor(
    args: SearchArgs,
    menuDisplayMode: MenuDisplayMode,
    resolveHandler: (args: SearchArgs) => void
  ) {
    super();
    const navbar = new NavBar({
      type: args.type,
      searchTerms: args.options.searchTerms,
      menuDisplayMode,
      filterChangedHandler: () => { this.updateHiddenStatus() },
      tabChangedHandler: () => { this.updateHiddenStatus() },
      inputChangedHandler: text => { },
      popHandler: () => { $ui.pop() },
      searchHandler: () => {
        // TODO: 从navbar中获取fsearch，从tab获取type，从对应的optionsView中获取options
        const fsearch = navbar.cviews.input.view.text.trim();
        let searchTerms: EHSearchTerm[] = [];
        try {
          if (fsearch) searchTerms = parseFsearch(fsearch);
        } catch (e: any) {
          $ui.alert({
            title: "搜索词解析错误",
            message: e.message,
            actions: [
              {
                title: "查看Wiki", handler: () => {
                  $app.openURL("https://ehwiki.org/wiki/Gallery_Searching")
                }
              },
              { title: "OK" }
            ]
          });
          return;
        }
        const type = navbar.type;
        if (type === "front_page") {
          const data = this.cviews.frontPageOptionsView.data;
          resolveHandler({
            type: "front_page",
            options: {
              searchTerms,
              excludedCategories: data.excludedCategories,
              ...data.options
            }
          })
        } else if (type === "watched") {
          const data = this.cviews.watchedOptionsView.data;
          resolveHandler({
            type: "watched",
            options: {
              searchTerms,
              excludedCategories: data.excludedCategories,
              ...data.options
            }
          })
        } else if (type === "favorites") {
          const data = this.cviews.favoritesOptionsView.data;
          resolveHandler({
            type: "favorites",
            options: {
              searchTerms,
              favcat: data.selectedFavcat,
              ...data.options
            }
          })
        } else {
          const data = this.cviews.archiveOptionsView.data;
          resolveHandler({
            type: "archive",
            options: {
              page: 0,
              pageSize: 50,
              searchTerms,
              excludedCategories: data.excludedCategories,
              ...data.options
            }
          })
        }
        $ui.pop();
      }
    });
    const searchSuggestionView = new SearchSuggestionView(tag => { });
    const searchHistoryView = new SearchHistoryView(
      (text) => {
        // TODO: searchHistoryView的点击事件
        const currentText = navbar.cviews.input.view.text;
        const newText = currentText
          ? `${currentText}${currentText[currentText.length - 1] === " " ? "" : " "}${text}`
          : text;
        navbar.cviews.input.view.text = newText;
      },
      () => { navbar.cviews.input.view.blur() }
    );
    const frontPageOptionsView = new FrontPageOptionsView(() => { navbar.cviews.input.view.blur() });
    const watchedOptionsView = new FrontPageOptionsView(() => { navbar.cviews.input.view.blur() });
    const favoritesOptionsView = new FavoritesOptionsView(() => { navbar.cviews.input.view.blur() });
    const archiveOptionsView = new ArchiveOptionsView(() => { navbar.cviews.input.view.blur() });
    this.cviews = {
      navbar,
      searchSuggestionView,
      searchHistoryView,
      frontPageOptionsView,
      watchedOptionsView,
      favoritesOptionsView,
      archiveOptionsView
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id
      },
      layout: $layout.fill,
      views: [
        navbar.definition,
        {
          type: "view",
          props: {
            id: this.id,
            bgcolor: $color("backgroundColor")
          },
          layout: (make, view) => {
            make.top.equalTo(view.prev.bottom);
            make.left.right.bottom.equalTo(view.super.safeArea);
          },
          views: [
            searchSuggestionView.definition,
            searchHistoryView.definition,
            frontPageOptionsView.definition,
            watchedOptionsView.definition,
            favoritesOptionsView.definition,
            archiveOptionsView.definition
          ]
        }
      ]
    });
  }

  updateHiddenStatus() {
    const filterOn = this.cviews.navbar.filterOn;
    const type = this.cviews.navbar.type;
    if (filterOn) {
      this.cviews.searchSuggestionView.view.hidden = true;
      this.cviews.searchHistoryView.view.hidden = true;
      if (type === "front_page") {
        this.cviews.frontPageOptionsView.view.hidden = false;
        this.cviews.watchedOptionsView.view.hidden = true;
        this.cviews.favoritesOptionsView.view.hidden = true;
        this.cviews.archiveOptionsView.view.hidden = true;
      } else if (type === "watched") {
        this.cviews.frontPageOptionsView.view.hidden = true;
        this.cviews.watchedOptionsView.view.hidden = false;
        this.cviews.favoritesOptionsView.view.hidden = true;
        this.cviews.archiveOptionsView.view.hidden = true;
      } else if (type === "favorites") {
        this.cviews.frontPageOptionsView.view.hidden = true;
        this.cviews.watchedOptionsView.view.hidden = true;
        this.cviews.favoritesOptionsView.view.hidden = false;
        this.cviews.archiveOptionsView.view.hidden = true;
      } else {
        this.cviews.frontPageOptionsView.view.hidden = true;
        this.cviews.watchedOptionsView.view.hidden = true;
        this.cviews.favoritesOptionsView.view.hidden = true;
        this.cviews.archiveOptionsView.view.hidden = false;
      }
    } else {
      // TODO: searchSuggestionView的hidden状态之后再考虑
      this.cviews.searchSuggestionView.view.hidden = true;
      this.cviews.searchHistoryView.view.hidden = false;
      this.cviews.frontPageOptionsView.view.hidden = true;
      this.cviews.watchedOptionsView.view.hidden = true;
      this.cviews.favoritesOptionsView.view.hidden = true;
      this.cviews.archiveOptionsView.view.hidden = true;
    }
  }
}

export function getSearchOptions(
  args: SearchArgs,
  menuDisplayMode: MenuDisplayMode,
): Promise<SearchArgs> {
  return new Promise((resolve, reject) => {
    const contentView = new SearchContentView(
      args,
      menuDisplayMode,
      (n) => { resolve(n) }
    );
    $ui.push({
      props: {
        navBarHidden: true,
        statusBarStyle: 0
      },
      views: [
        contentView.definition
      ],
      events: {
        appeared: () => {
          contentView.cviews.navbar.cviews.input.view.focus();
        },
        dealloc: () => {
          reject("cancel");
        }
      }
    });
  })
}