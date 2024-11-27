import { Base, ContentView, CustomNavigationBar, DynamicItemSizeMatrix, DynamicPreferenceListView, DynamicRowHeightList, Flowlayout, Input, Label, List, PreferenceSection, PresentedPageController, searchBarBgcolor, Sheet, SymbolButton, Tab } from "jsbox-cview";
import { catColor, favcatColor, searchableCategories, catTranslations, defaultButtonColor, namespaceTranslations, namespaceColor } from "../utils/glv";
import { configManager } from "../utils/config";
import { EHFavoriteSearchOptions, EHQualifier, EHSearchOptions, EHSearchTerm, TagNamespace } from "ehentai-parser";
import { ArchiveSearchOptions, TranslationDict } from "../types";

// 整体构造是上面一个自定义导航栏，下面是一个搜索选项列表
// 下面一共有五个List叠放在一起，分别是：
// 1. 显示最近搜索和最常搜索的搜索词
// 2. 显示搜索联想词
// 3. 显示首页和关注的搜索选项
// 4. 显示收藏的搜索选项
// 5. 显示存档的搜索选项

type MenuDisplayMode = "onlyShowHomepage" | "onlyShowArchive" | "showAllExceptArchive";

const TAG_FONT_SIZE = 15;

function mapOptionsToSections(options: EHSearchOptions, enablePageFilters: boolean): PreferenceSection[] {
  return [{
    title: "",
    rows: [
      {
        type: "boolean",
        title: "只显示已删除的图库",
        key: "browseExpungedGalleries",
        value: options.browseExpungedGalleries || false
      },
      {
        type: "boolean",
        title: "只显示有种子的图库",
        key: "requireGalleryTorrent",
        value: options.requireGalleryTorrent || false
      },
      {
        type: "boolean",
        title: "页数",
        key: "enablePageFilters",
        value: enablePageFilters || false
      },
      {
        type: "integer",
        title: "页数最小值",
        key: "minimumPages",
        placeholder: "0~2000",
        min: 0,
        max: 2000,
        value: options.minimumPages
      },
      {
        type: "integer",
        title: "页数最大值",
        key: "maximumPages",
        placeholder: "0~2000",
        min: 0,
        max: 2000,
        value: options.maximumPages
      },
      {
        type: "list",
        title: "评分",
        key: "minimumRating",
        value: options.minimumRating ? options.minimumRating - 1 : 0,
        items: ["不使用", "至少2星", "至少3星", "至少4星", "至少5星"]
      },
      {
        type: "boolean",
        title: "禁用过滤器（语言）",
        key: "disableLanguageFilters",
        value: options.disableLanguageFilters || false
      },
      {
        type: "boolean",
        title: "禁用过滤器（上传者）",
        key: "disableUploaderFilters",
        value: options.disableUploaderFilters || false
      },
      {
        type: "boolean",
        title: "禁用过滤器（标签）",
        key: "disableTagFilters",
        value: options.disableTagFilters || false
      }
    ]
  }]
}

type InnerSearchOptions = {
  browseExpungedGalleries: boolean,
  requireGalleryTorrent: boolean,
  enablePageFilters: boolean,
  minimumPages?: number,
  maximumPages?: number,
  minimumRating: number,
  disableLanguageFilters: boolean,
  disableUploaderFilters: boolean,
  disableTagFilters: boolean
}

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
        id: this.id
      },
      layout: $layout.fill,
      views: [
        {
          type: "image",
          props: {
            symbol: symbol,
            tintColor: $color("primaryText")
          },
          layout: (make, view) => {
            make.left.inset(20);
            make.centerY.equalTo(view.super);
            make.size.equalTo($size(20, 20));
          }
        },
        {
          type: "label",
          props: {
            text: title,
            font: $font("bold", 16)
          },
          layout: (make, view) => {
            make.left.inset(45);
            make.centerY.equalTo(view.super);
          }
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
  constructor(tag: {namespace?: TagNamespace, qualifier?: EHQualifier, term: string}) {
    super();
    this._text = tag.qualifier === "uploader" 
      ? "上传者:" + tag.term 
      : (tag.namespace ? configManager.translate(tag.namespace, tag.term) || tag.term : tag.term);
    this._defineView = () => ({
      type: "label",
      props: {
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
  constructor() {
    super();
    const mostAccessedTags = configManager.getTenMostAccessedTags()
    const lastAccessSearchTerms = configManager.getTenLastAccessSearchTerms()
    const sectionTitleLastAccessed = new SearchHistoryViewSectionTitle("最近访问", "clock.fill");
    const historyMatrixLastAccessed = new Flowlayout({
      props: {
        items: lastAccessSearchTerms.map(tag => new HistoryMatrixItem(tag)),
        spacing: 10,
        itemHeight: 30
      },
      layout: $layout.fill,
      events: {}
    })
    const sectionTitleMostSearched = new SearchHistoryViewSectionTitle("最常搜索", "list.number");
    const historyMatrixMostSearched = new Flowlayout({
      props: {
        items: mostAccessedTags.map(tag => new HistoryMatrixItem(tag)),
        spacing: 10,
        itemHeight: 30
      },
      layout: $layout.fill,
      events: {}
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
      },
      layout: $layout.fill,
      events: {}
    })
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id
      },
      layout: $layout.fill,
      views: [list.definition]
    })
  }

  inintial() {
    
  }
}


class HomepageOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  cviews: {
    catList: DynamicItemSizeMatrix,
    optionsList: DynamicPreferenceListView
  }
  constructor() {
    super();
    const optionsList = new SearchOptionsList({}, false);
    const catList = new DynamicItemSizeMatrix({
      props: {
        bgcolor: $color("backgroundColor"),
        minItemWidth: 100,
        fixedItemHeight: 36,
        spacing: 10,
        scrollEnabled: false,
        dynamicHeightEnabled: false,
        maxColumns: 5,
        data: searchableCategories.map(cat => ({ label: { text: catTranslations[cat], bgcolor: catColor[cat], alpha: 1 } })),
        template: {
          views: [{
            type: "label",
            props: {
              id: "label",
              align: $align.center,
              font: $font("bold", 16),
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
      events: {}
    })
    this.cviews = {
      catList,
      optionsList
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id
      },
      layout: $layout.fill,
      views: [catList.definition]
    });
  }
}

class FavoritesOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  cviews: {
    favcatList: DynamicItemSizeMatrix,
    optionsList: DynamicPreferenceListView
  }
  constructor() {
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
        data: configManager.favcatTitles.map((title, index) => {
          const i = index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
          return {
            icon: {
              tintColor: favcatColor[i]
            },
            label: {
              text: title
            }
          }
        }),
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
                font: $font(16),
                textColor: $color("primaryText"),
                lines: 2
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
      events: {}
    })
    this.cviews = {
      favcatList,
      optionsList
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id
      },
      layout: $layout.fill,
      views: [favcatList.definition]
    });
  }
}

class ArchiveOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  cviews: {
    catList: DynamicItemSizeMatrix,
    optionsList: DynamicPreferenceListView
  }
  constructor() {
    super();
    const options = {} as ArchiveSearchOptions; // TODO: ArchiveSearchOptions需要修改
    const enablePageFilters = false; // TODO: 测试用
    const optionsList = new DynamicPreferenceListView({
      sections: [{
        title: "",
        rows: [
          {
            type: "boolean",
            title: "页数",
            key: "enablePageFilters",
            value: enablePageFilters || false
          },
          {
            type: "integer",
            title: "页数最小值",
            key: "minimumPages",
            placeholder: "0~2000",
            min: 0,
            max: 2000,
            value: options.minimumPages
          },
          {
            type: "integer",
            title: "页数最大值",
            key: "maximumPages",
            placeholder: "0~2000",
            min: 0,
            max: 2000,
            value: options.maximumPages
          },
          {
            type: "list",
            title: "评分",
            key: "minimumRating",
            value: options.minimumRating ? options.minimumRating - 1 : 0,
            items: ["不使用", "至少2星", "至少3星", "至少4星", "至少5星"]
          }
        ]
      }],
      props: {
        style: 2,
        scrollEnabled: false,
        height: 44 * 4 + 35 * 2,
        rowHeight: 44,
        bgcolor: $color("backgroundColor")
      },
      layout: $layout.fill,
      events: {}
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
        data: searchableCategories.map(cat => ({ label: { text: catTranslations[cat], bgcolor: catColor[cat], alpha: 1 } })),
        template: {
          views: [{
            type: "label",
            props: {
              id: "label",
              align: $align.center,
              font: $font("bold", 16),
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
      events: {}
    })
    this.cviews = {
      catList,
      optionsList
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id
      },
      layout: $layout.fill,
      views: [catList.definition]
    });
  }
}

class SearchOptionsList extends DynamicPreferenceListView {
  private options: EHSearchOptions;
  private _enablePageFilters: boolean;
  constructor(options: EHSearchOptions, enablePageFilters: boolean) {
    super({
      sections: mapOptionsToSections(options, enablePageFilters),
      props: {
        bgcolor: $color("backgroundColor"),
        style: 2,
        scrollEnabled: false,
        height: 44 * 9 + 35 * 2,
      },
      layout: $layout.fill,
      events: {
        changed: values => {
          this.options = {
            browseExpungedGalleries: values.browseExpungedGalleries,
            requireGalleryTorrent: values.requireGalleryTorrent,
            minimumPages: values.minimumPages,
            maximumPages: values.maximumPages,
            minimumRating: values.minimumRating + 1,
            disableLanguageFilters: values.disableLanguageFilters,
            disableUploaderFilters: values.disableUploaderFilters,
            disableTagFilters: values.disableTagFilters
          }
          this._enablePageFilters = values.enablePageFilters;
        }
      }
    });
    this.options = options;
    this._enablePageFilters = enablePageFilters;
  }
}

type SearchArgs = {
  type: "homepage",
  options: EHSearchOptions
} | {
  type: "watched",
  options: EHSearchOptions
} | {
  type: "favorites",
  options: EHFavoriteSearchOptions
} | {
  type: "archive",
  options: ArchiveSearchOptions
}

class NavBar extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _filterSwitch: boolean = false;
  constructor(options: {
    menuDisplayMode: "onlyShowHomepage" | "onlyShowArchive" | "showAllExceptArchive",
    filterHandler: (on: boolean, type: "homepage" | "watched" | "favorites" | "archive") => void,
    inputChangedHandler: (text: string) => void,
    popHandler: () => void,
    searchHandler: () => void
  }) {
    super();
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

          options.filterHandler(this._filterSwitch, _getType());
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
        {
          type: "input",
          props: {
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
        }
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
        index: 0,
        items: ["首页", "关注", "收藏"]
      },
      layout: (make, view) => {
        make.left.right.inset(50);
        make.height.equalTo(30);
        make.bottom.inset(10);
      },
      events: {
        changed: sender => {
          if (this._filterSwitch) {
            options.filterHandler(true, _getType());
          }
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
    const _getType = () => {
      let type: "homepage" | "watched" | "favorites" | "archive";
      if (options.menuDisplayMode === "onlyShowHomepage") {
        type = "homepage";
      } else if (options.menuDisplayMode === "onlyShowArchive") {
        type = "archive";
      } else if (tab.view.index === 1) {
        type = "watched";
      } else if (tab.view.index === 2) {
        type = "favorites";
      } else {
        type = "homepage";
      }
      return type;
    }
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id
      },
      layout: (make, view) => {
        make.left.right.top.inset(0);
        make.bottom.equalTo(view.super.safeAreaTop).inset(options.menuDisplayMode === "showAllExceptArchive" ? -92 : -50);
      },
      views: options.menuDisplayMode === "showAllExceptArchive" ? [mainView.definition, tab.definition, seprator] : [mainView.definition, seprator]
    });
  }
}

class SearchContentView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor(
    args: SearchArgs,
    menuDisplayMode: MenuDisplayMode,
    resolveHandler: (args: SearchArgs) => void,
    rejectHandler: () => void
  ) {
    super();
    const navbar = new NavBar({
      menuDisplayMode,
      filterHandler: (on, type) => { },
      inputChangedHandler: text => { },
      popHandler: () => { },
      searchHandler: () => { }
    });
    const searchSuggestionView = new SearchSuggestionView(tag => { });
    const searchHistoryView = new SearchHistoryView();
    const homepageOptionsView = new HomepageOptionsView();
    const watchedOptionsView = new HomepageOptionsView();
    const favoritesOptionsView = new FavoritesOptionsView();
    const archiveOptionsView = new ArchiveOptionsView();

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
            homepageOptionsView.definition,
            watchedOptionsView.definition,
            favoritesOptionsView.definition,
            archiveOptionsView.definition
          ]
        }
      ]
    });
  }
}

export function search(
  args: SearchArgs,
  menuDisplayMode: MenuDisplayMode,
): Promise<SearchArgs> {
  return new Promise((resolve, reject) => {
    const contentView = new SearchContentView(
      args, 
      menuDisplayMode,
      (n) => {resolve(n)},
      () => {reject("cancel")}
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
        dealloc: () => {
          reject("cancel");
        }
      }
    });
  })
}