import {
  Base,
  ContentView,
  DynamicItemSizeMatrix,
  DynamicPreferenceListView,
  DynamicRowHeightList,
  Flowlayout,
  Input,
  PrefsRowBoolean,
  PrefsRowInteger,
  PrefsRowList,
  SymbolButton,
  Tab,
} from "jsbox-cview";
import {
  catColor,
  favcatColor,
  searchableCategories,
  defaultButtonColor,
  namespaceTranslations,
  namespaceColor,
  namespaceOrderList,
  catTranslations,
} from "../utils/glv";
import { configManager } from "../utils/config";
import {
  EHSearchTerm,
  assembleSearchTerms,
  EHQualifier,
  EHSearchedCategory,
  parseFsearch,
  TagNamespace,
  tagNamespaces,
  tagNamespaceAlternates,
  TagNamespaceAlternate,
  tagNamespaceAlternateMap,
  EHSearchOptions,
  EHFavoriteSearchOptions,
  EHImageLookupOptions,
  EHImageLookupList,
} from "ehentai-parser";
import {
  ArchiveSearchOptions,
  ArchiveTabOptions,
  FavoritesTabOptions,
  FrontPageTabOptions,
  ImageLookupTabOptions,
  WatchedTabOptions,
} from "../types";
import { api } from "../utils/api";

// 整体构造是上面一个自定义导航栏，下面是一个搜索选项列表
// 下面一共有五个List叠放在一起，分别是：
// 1. 显示最近搜索和最常搜索的搜索词
// 2. 显示搜索联想词
// 3. 显示首页和关注的搜索选项
// 4. 显示收藏的搜索选项
// 5. 显示存档的搜索选项

type MenuDisplayMode =
  | "onlyShowFrontPage"
  | "onlyShowArchive"
  | "showAllExceptArchive"
  | "showAllExceptArchiveWithImageLookup"
  | "showAll";

const TAG_FONT_SIZE = 15;

class SearchSuggestionView extends Base<UIListView, UiTypes.ListOptions> {
  private currentSuggestions: {
    namespace: TagNamespace;
    name: string;
    translation: string;
    remaining: string;
  }[] = [];
  _defineView: () => UiTypes.ListOptions;

  constructor(tagSelected: (text: string) => void) {
    super();
    this._defineView = () => ({
      type: "list",
      props: {
        id: this.id,
        hidden: true,
        separatorInset: $insets(0, 20, 0, 0),
        footer: {
          type: "view",
          props: {
            height: 265,
          },
        },
        template: {
          views: [
            {
              type: "label",
              props: {
                id: "content",
                lines: 2,
                font: $font("bold", 14),
              },
              layout: (make, view) => {
                make.left.inset(20);
                make.right.inset(10);
                make.top.bottom.inset(0);
              },
            },
          ],
        },
      },
      layout: (make, view) => {
        make.top.equalTo(view.super);
        make.left.right.equalTo(view.super);
        make.bottom.equalTo(view.super);
      },
      events: {
        didSelect: (sender, indexPath, data) => {
          const suggestion = this.currentSuggestions[indexPath.row];
          const fsearch = assembleSearchTerms([
            {
              namespace: suggestion.namespace,
              term: suggestion.name,
              dollar: true,
              subtract: false,
              tilde: false,
            },
          ]);
          tagSelected(suggestion.remaining ? suggestion.remaining + " " + fsearch + " " : fsearch + " ");
        },
      },
    });
  }

  set suggestions(
    suggestions: {
      namespace: TagNamespace;
      name: string;
      translation: string;
      remaining: string;
    }[]
  ) {
    this.currentSuggestions = suggestions;
    this.view.data = this.mapData(suggestions);
  }

  mapData(
    raw: {
      namespace: TagNamespace;
      name: string;
      translation: string;
    }[]
  ) {
    return raw.map((item) => ({
      content: {
        text: `${namespaceTranslations[item.namespace]}:${item.translation}   ${item.name}`,
      },
    }));
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
        bgcolor: $color("insetGroupedBackground"),
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
                tintColor: $color("secondaryText"),
              },
              layout: (make, view) => {
                make.left.inset(0);
                make.centerY.equalTo(view.super);
                make.size.equalTo($size(16, 16));
              },
            },
            {
              type: "label",
              props: {
                text: title,
                textColor: $color("secondaryText"),
                font: $font("bold", 14),
              },
              layout: (make, view) => {
                make.left.equalTo(view.prev.right).inset(3);
                make.centerY.equalTo(view.super);
              },
            },
          ],
        },
      ],
    });
  }

  heightToWidth(width: number) {
    return 44;
  }
}

class HistoryMatrixItem extends Base<UILabelView, UiTypes.LabelOptions> {
  _defineView: () => UiTypes.LabelOptions;
  private _text: string;
  constructor(tag: { namespace?: TagNamespace; qualifier?: EHQualifier; term: string }) {
    super();
    this._text = tag.namespace ? configManager.translate(tag.namespace, tag.term) || tag.term : tag.term;
    if (tag.qualifier === "uploader") {
      this._text = "上传者:" + tag.term;
    } else if (tag.qualifier) {
      this._text = tag.qualifier + ":" + this._text;
    }
    this._defineView = () => ({
      type: "label",
      props: {
        id: this.id,
        text: this._text,
        lines: 1,
        font: $font(TAG_FONT_SIZE),
        bgcolor: namespaceColor[tag.namespace || "temp"],
        align: $align.center,
        cornerRadius: 10,
        smoothCorners: true,
      },
      layout: $layout.fill,
    });
  }

  itemWidth() {
    return (
      Math.ceil(
        $text.sizeThatFits({
          text: this._text,
          width: 1000,
          font: $font(TAG_FONT_SIZE),
        }).width
      ) + 16
    );
  }
}

class SearchHistoryView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor(textHandler: (text: string) => void) {
    super();
    const mostAccessedTags = configManager.getTenMostAccessedTags();
    const lastAccessSearchTerms = configManager.getSomeLastAccessSearchTerms();
    const sectionTitleMostSearched = new SearchHistoryViewSectionTitle("最常搜索", "list.number");
    const historyMatrixMostSearched = new Flowlayout({
      props: {
        items: mostAccessedTags.map((tag) => new HistoryMatrixItem(tag)),
        spacing: 8,
        itemHeight: 26,
        bgcolor: $color("insetGroupedBackground"),
      },
      layout: $layout.fill,
      events: {
        didSelect(sender, index, item) {
          const tag = mostAccessedTags[index];
          const fsearch = assembleSearchTerms([
            {
              namespace: tag.namespace,
              qualifier: tag.qualifier,
              term: tag.term,
              dollar: Boolean(tag.namespace),
              subtract: false,
              tilde: false,
            },
          ]);
          textHandler(fsearch);
        },
      },
    });
    const sectionTitleLastAccessed = new SearchHistoryViewSectionTitle("最近访问", "clock.fill");
    const historyMatrixLastAccessed = new Flowlayout({
      props: {
        items: lastAccessSearchTerms.map((tag) => new HistoryMatrixItem(tag)),
        spacing: 8,
        itemHeight: 26,
        bgcolor: $color("insetGroupedBackground"),
      },
      layout: $layout.fill,
      events: {
        didSelect(sender, index, item) {
          const tag = lastAccessSearchTerms[index];
          const fsearch = assembleSearchTerms([
            {
              namespace: tag.namespace,
              qualifier: tag.qualifier,
              term: tag.term,
              dollar: Boolean(tag.namespace),
              subtract: false,
              tilde: false,
            },
          ]);
          textHandler(fsearch);
        },
      },
    });
    const list = new DynamicRowHeightList({
      rows: [sectionTitleMostSearched, historyMatrixMostSearched, sectionTitleLastAccessed, historyMatrixLastAccessed],
      props: {
        selectable: false,
        separatorHidden: true,
        showsVerticalIndicator: false,
        bgcolor: $color("insetGroupedBackground"),
        keyboardDismissMode: 1,
      },
      layout: (make, view) => {
        make.left.right.inset(15);
        make.top.bottom.inset(0);
      },
      events: {},
    });
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        bgcolor: $color("insetGroupedBackground"),
      },
      layout: (make, view) => {
        make.top.equalTo(view.super);
        make.left.right.equalTo(view.super.safeArea);
        make.bottom.equalTo(view.super);
      },
      views: [list.definition],
    });
  }
}

class FrontPageOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _excludedCategories: Set<EHSearchedCategory>;
  private _enablePageFilters: boolean = false;
  private _options: {
    browseExpungedGalleries?: boolean;
    requireGalleryTorrent?: boolean;
    minimumPages?: number;
    maximumPages?: number;
    minimumRating?: number;
    disableLanguageFilters?: boolean;
    disableUploaderFilters?: boolean;
    disableTagFilters?: boolean;
  };
  cviews: {
    catList: DynamicItemSizeMatrix;
    optionsList: DynamicPreferenceListView;
  };
  constructor(options?: EHSearchOptions) {
    super();
    this._excludedCategories = new Set(options?.excludedCategories || []);
    this._options = {
      browseExpungedGalleries: options?.browseExpungedGalleries || undefined,
      requireGalleryTorrent: options?.requireGalleryTorrent || undefined,
      minimumPages: options?.minimumPages,
      maximumPages: options?.maximumPages,
      minimumRating: options?.minimumRating,
      disableLanguageFilters: options?.disableLanguageFilters || undefined,
      disableUploaderFilters: options?.disableUploaderFilters || undefined,
      disableTagFilters: options?.disableTagFilters || undefined,
    };
    if (this._options.minimumPages !== undefined || this._options.maximumPages !== undefined) {
      this._enablePageFilters = true;
    }
    const optionsList = new DynamicPreferenceListView({
      sections: this.mapSections(),
      props: {
        style: 2,
        scrollEnabled: false,
        rowHeight: 44,
        bgcolor: $color("insetGroupedBackground"),
      },
      layout: $layout.fill,
      events: {
        changed: (values) => {
          const reloadFlag = this._enablePageFilters !== values.enablePageFilters;
          this._options = {
            browseExpungedGalleries: values.browseExpungedGalleries || undefined,
            requireGalleryTorrent: values.requireGalleryTorrent || undefined,
            minimumPages: values.enablePageFilters ? values.minimumPages : undefined,
            maximumPages: values.enablePageFilters ? values.maximumPages : undefined,
            minimumRating: values.minimumRating ? values.minimumRating + 1 : undefined,
            disableLanguageFilters: values.disableLanguageFilters || undefined,
            disableUploaderFilters: values.disableUploaderFilters || undefined,
            disableTagFilters: values.disableTagFilters || undefined,
          };
          this._enablePageFilters = values.enablePageFilters;
          if (reloadFlag) {
            optionsList.sections = this.mapSections();
          }
        },
      },
    });
    const catList = new DynamicItemSizeMatrix({
      props: {
        bgcolor: $color("insetGroupedBackground"),
        minItemWidth: 100,
        fixedItemHeight: 36,
        spacing: 10,
        scrollEnabled: false,
        dynamicHeightEnabled: false,
        maxColumns: 5,
        data: this.mapData(),
        template: {
          views: [
            {
              type: "label",
              props: {
                id: "label",
                align: $align.center,
                font: $font("bold", 16),
                textColor: $color("white"),
              },
              layout: $layout.fill,
            },
          ],
        },
        footer: {
          type: "view",
          props: {
            height: 44 + 44 * 9 + 35 * 2,
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
                        smoothCorners: true,
                      },
                      events: {
                        tapped: (sender) => {
                          this._excludedCategories = new Set();
                          catList.data = this.mapData();
                        },
                      },
                    },
                    {
                      type: "button",
                      props: {
                        title: "全不选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true,
                      },
                      events: {
                        tapped: (sender) => {
                          this._excludedCategories = new Set(searchableCategories);
                          catList.data = this.mapData();
                        },
                      },
                    },
                    {
                      type: "button",
                      props: {
                        title: "反选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true,
                      },
                      events: {
                        tapped: (sender) => {
                          const reversed = searchableCategories.filter((cat) => !this._excludedCategories.has(cat));
                          this._excludedCategories = new Set(reversed);
                          catList.data = this.mapData();
                        },
                      },
                    },
                  ],
                },
              },
              layout: (make, view) => {
                make.top.inset(5);
                make.right.inset(16);
                make.height.equalTo(34);
                make.width.equalTo(230);
              },
            },
            {
              type: "view",
              props: {},
              layout: (make, view) => {
                make.top.equalTo(view.prev.bottom).inset(0);
                make.left.right.bottom.inset(0);
              },
              views: [optionsList.definition],
            },
          ],
        },
        keyboardDismissMode: 1,
      },
      layout: $layout.fill,
      events: {
        didSelect: (sender, indexPath, data) => {
          const index = indexPath.row;
          const cat = searchableCategories[index];
          if (this._excludedCategories.has(cat)) {
            this._excludedCategories.delete(cat);
          } else {
            this._excludedCategories.add(cat);
          }
          catList.data = this.mapData();
        },
      },
    });
    this.cviews = {
      catList,
      optionsList,
    };
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        hidden: true,
      },
      layout: (make, view) => {
        make.top.equalTo(view.super);
        make.left.right.equalTo(view.super.safeArea);
        make.bottom.equalTo(view.super);
      },
      views: [catList.definition],
    });
  }

  mapData() {
    return searchableCategories.map((cat) => ({
      label: {
        text: catTranslations[cat],
        bgcolor: catColor[cat],
        alpha: this._excludedCategories.has(cat) ? 0.4 : 1,
      },
    }));
  }

  mapSections() {
    const browseExpungedGalleriesPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "只显示已删除的图库",
      key: "browseExpungedGalleries",
      value: this._options.browseExpungedGalleries || false,
    };
    const requireGalleryTorrentPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "只显示有种子的图库",
      key: "requireGalleryTorrent",
      value: this._options.requireGalleryTorrent || false,
    };
    const disableLanguageFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "禁用过滤器（语言）",
      key: "disableLanguageFilters",
      value: this._options.disableLanguageFilters || false,
    };
    const disableUploaderFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "禁用过滤器（上传者）",
      key: "disableUploaderFilters",
      value: this._options.disableUploaderFilters || false,
    };
    const disableTagFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "禁用过滤器（标签）",
      key: "disableTagFilters",
      value: this._options.disableTagFilters || false,
    };
    const enablePageFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "页数",
      key: "enablePageFilters",
      value: this._enablePageFilters || false,
    };
    const minimumRatingPrefsRow: PrefsRowList = {
      type: "list",
      title: "评分",
      key: "minimumRating",
      value: this._options.minimumRating ? this._options.minimumRating - 1 : 0,
      items: ["不使用", "至少2星", "至少3星", "至少4星", "至少5星"],
    };
    const minimumPagesPrefsRow: PrefsRowInteger = {
      type: "integer",
      title: "页数最小值",
      key: "minimumPages",
      placeholder: "0~2000",
      min: 0,
      max: 2000,
      value: this._options.minimumPages,
    };
    const maximumPagesPrefsRow: PrefsRowInteger = {
      type: "integer",
      title: "页数最大值",
      key: "maximumPages",
      placeholder: "0~2000",
      min: 0,
      max: 2000,
      value: this._options.maximumPages,
    };
    if (this._enablePageFilters) {
      return [
        {
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
            disableTagFiltersPrefsRow,
          ],
        },
      ];
    } else {
      return [
        {
          title: "",
          rows: [
            browseExpungedGalleriesPrefsRow,
            requireGalleryTorrentPrefsRow,
            enablePageFiltersPrefsRow,
            minimumRatingPrefsRow,
            disableLanguageFiltersPrefsRow,
            disableUploaderFiltersPrefsRow,
            disableTagFiltersPrefsRow,
          ],
        },
      ];
    }
  }

  get data() {
    return {
      excludedCategories: [...this._excludedCategories],
      options: this._options,
    };
  }
}

class FavoritesOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _selectedFavcat?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  cviews: {
    favcatList: DynamicItemSizeMatrix;
  };
  constructor(options?: EHFavoriteSearchOptions) {
    super();
    this._selectedFavcat = options?.favcat;
    const favcatList = new DynamicItemSizeMatrix({
      props: {
        bgcolor: $color("insetGroupedBackground"),
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
            smoothCorners: true,
          },
          views: [
            {
              type: "view",
              props: {
                id: "bgview",
                bgcolor: $color("clear"),
                borderWidth: 1,
                borderColor: $color("systemLink"),
                cornerRadius: 10,
                smoothCorners: true,
              },
              layout: $layout.fill,
            },
            {
              type: "image",
              props: {
                id: "icon",
                symbol: "heart.fill",
                contentMode: 1,
              },
              layout: (make, view) => {
                make.left.inset(10);
                make.centerY.equalTo(view.super);
                make.size.equalTo($size(20, 20));
              },
            },
            {
              type: "label",
              props: {
                id: "label",
                align: $align.left,
                lines: 2,
                font: $font(16),
              },
              layout: (make, view) => {
                make.left.equalTo(view.prev.right).inset(10);
                make.height.equalTo(view.super);
                make.right.inset(10);
              },
            },
          ],
        },
        keyboardDismissMode: 1,
      },
      layout: $layout.fill,
      events: {
        didSelect: (sender, indexPath, data) => {
          const selectedIndex = indexPath.row as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
          if (this._selectedFavcat === selectedIndex) {
            this._selectedFavcat = undefined;
          } else {
            this._selectedFavcat = selectedIndex;
          }
          favcatList.data = this.mapData();
        },
      },
    });
    this.cviews = {
      favcatList,
    };
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        hidden: true,
      },
      layout: (make, view) => {
        make.top.equalTo(view.super);
        make.left.right.equalTo(view.super.safeArea);
        make.bottom.equalTo(view.super);
      },
      views: [favcatList.definition],
    });
  }

  mapData() {
    return configManager.favcatTitles.map((title, index) => {
      const i = index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      return {
        bgview: {
          hidden: this._selectedFavcat === i ? false : true,
        },
        icon: {
          tintColor: favcatColor[i],
        },
        label: {
          text: title,
          textColor: this._selectedFavcat === i ? $color("systemLink") : $color("primaryText"),
        },
      };
    });
  }

  get data() {
    return {
      selectedFavcat: this._selectedFavcat,
    };
  }
}

class ArchiveOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _excludedCategories: Set<EHSearchedCategory>;
  private _enablePageFilters: boolean = false;
  private _options: {
    type: "readlater" | "downloaded" | "all";
    minimumPages?: number;
    maximumPages?: number;
    minimumRating?: number;
  };
  cviews: {
    catList: DynamicItemSizeMatrix;
    optionsList: DynamicPreferenceListView;
  };
  constructor(options?: ArchiveSearchOptions) {
    super();
    this._excludedCategories = new Set(options?.excludedCategories || []);
    this._options = {
      type: options?.type || "all",
      minimumPages: options?.minimumPages,
      maximumPages: options?.maximumPages,
      minimumRating: options?.minimumRating,
    };
    if (this._options.minimumPages !== undefined || this._options.maximumPages !== undefined) {
      this._enablePageFilters = true;
    }
    const optionsList = new DynamicPreferenceListView({
      sections: this.mapSections(),
      props: {
        style: 2,
        scrollEnabled: false,
        rowHeight: 44,
        bgcolor: $color("insetGroupedBackground"),
      },
      layout: $layout.fill,
      events: {
        changed: (values) => {
          const reloadFlag = this._enablePageFilters !== values.enablePageFilters;

          this._options = {
            type: ["readlater", "downloaded", "all"][values.type] as "readlater" | "downloaded" | "all",
            minimumPages: values.enablePageFilters ? values.minimumPages : undefined,
            maximumPages: values.enablePageFilters ? values.maximumPages : undefined,
            minimumRating: values.minimumRating ? values.minimumRating + 1 : undefined,
          };
          this._enablePageFilters = values.enablePageFilters;
          if (reloadFlag) {
            optionsList.sections = this.mapSections();
          }
        },
      },
    });
    const catList = new DynamicItemSizeMatrix({
      props: {
        bgcolor: $color("insetGroupedBackground"),
        minItemWidth: 100,
        fixedItemHeight: 36,
        spacing: 10,
        scrollEnabled: false,
        dynamicHeightEnabled: false,
        maxColumns: 5,
        data: this.mapData(),
        template: {
          views: [
            {
              type: "label",
              props: {
                id: "label",
                align: $align.center,
                font: $font("bold", 16),
                textColor: $color("white"),
              },
              layout: $layout.fill,
            },
          ],
        },
        footer: {
          type: "view",
          props: {
            height: 44 + 44 * 4 + 35 * 2,
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
                        smoothCorners: true,
                      },
                      events: {
                        tapped: (sender) => {
                          this._excludedCategories = new Set();
                          catList.data = this.mapData();
                        },
                      },
                    },
                    {
                      type: "button",
                      props: {
                        title: "全不选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true,
                      },
                      events: {
                        tapped: (sender) => {
                          this._excludedCategories = new Set(searchableCategories);
                          catList.data = this.mapData();
                        },
                      },
                    },
                    {
                      type: "button",
                      props: {
                        title: "反选",
                        font: $font(16),
                        bgcolor: defaultButtonColor,
                        cornerRadius: 5,
                        smoothCorners: true,
                      },
                      events: {
                        tapped: (sender) => {
                          const reversed = searchableCategories.filter((cat) => !this._excludedCategories.has(cat));
                          this._excludedCategories = new Set(reversed);
                          catList.data = this.mapData();
                        },
                      },
                    },
                  ],
                },
              },
              layout: (make, view) => {
                make.top.inset(5);
                make.right.inset(16);
                make.height.equalTo(34);
                make.width.equalTo(230);
              },
            },
            {
              type: "view",
              props: {},
              layout: (make, view) => {
                make.top.equalTo(view.prev.bottom).inset(0);
                make.left.right.bottom.inset(0);
              },
              views: [optionsList.definition],
            },
          ],
        },
        keyboardDismissMode: 1,
      },
      layout: $layout.fill,
      events: {
        didSelect: (sender, indexPath, data) => {
          const index = indexPath.row;
          const cat = searchableCategories[index];
          if (this._excludedCategories.has(cat)) {
            this._excludedCategories.delete(cat);
          } else {
            this._excludedCategories.add(cat);
          }
          catList.data = this.mapData();
        },
      },
    });
    this.cviews = {
      catList,
      optionsList,
    };
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        hidden: true,
      },
      layout: (make, view) => {
        make.top.equalTo(view.super);
        make.left.right.equalTo(view.super.safeArea);
        make.bottom.equalTo(view.super);
      },
      views: [catList.definition],
    });
  }

  mapData() {
    return searchableCategories.map((cat) => ({
      label: {
        text: catTranslations[cat],
        bgcolor: catColor[cat],
        alpha: this._excludedCategories.has(cat) ? 0.4 : 1,
      },
    }));
  }

  mapSections() {
    const typePrefsRow: PrefsRowList = {
      type: "list",
      title: "类型",
      key: "type",
      value: ["readlater", "downloaded", "all"].indexOf(this._options.type),
      items: ["稍后阅读", "下载内容", "全部记录"],
    };
    const enablePageFiltersPrefsRow: PrefsRowBoolean = {
      type: "boolean",
      title: "页数",
      key: "enablePageFilters",
      value: this._enablePageFilters || false,
    };
    const minimumRatingPrefsRow: PrefsRowList = {
      type: "list",
      title: "评分",
      key: "minimumRating",
      value: this._options.minimumRating ? this._options.minimumRating - 1 : 0,
      items: ["不使用", "至少2星", "至少3星", "至少4星", "至少5星"],
    };
    const minimumPagesPrefsRow: PrefsRowInteger = {
      type: "integer",
      title: "页数最小值",
      key: "minimumPages",
      placeholder: "0~2000",
      min: 0,
      max: 2000,
      value: this._options.minimumPages,
    };
    const maximumPagesPrefsRow: PrefsRowInteger = {
      type: "integer",
      title: "页数最大值",
      key: "maximumPages",
      placeholder: "0~2000",
      min: 0,
      max: 2000,
      value: this._options.maximumPages,
    };
    if (this._enablePageFilters) {
      return [
        {
          title: "",
          rows: [
            typePrefsRow,
            enablePageFiltersPrefsRow,
            minimumPagesPrefsRow,
            maximumPagesPrefsRow,
            minimumRatingPrefsRow,
          ],
        },
      ];
    } else {
      return [
        {
          title: "",
          rows: [typePrefsRow, enablePageFiltersPrefsRow, minimumRatingPrefsRow],
        },
      ];
    }
  }

  get data() {
    return {
      excludedCategories: [...this._excludedCategories],
      options: this._options,
    };
  }
}

class ImageLookupView extends Base<UIListView, UiTypes.ListOptions> {
  private _status: "pending" | "prepared" | "uploading" | "failed" = "pending";
  private _similaritySwitch: boolean = true;
  private _coverSwitch: boolean = true;
  private _imageData?: NSData;
  _defineView: () => UiTypes.ListOptions;
  constructor({
    uploadedHandler,
    uploadingHandler,
  }: {
    uploadedHandler: (data: ImageLookupTabOptions) => void;
    uploadingHandler: (uploading: boolean) => void;
  }) {
    super();
    const similaritySwitchView = new ContentView({
      props: {
        bgcolor: $color("secondarySurface"),
      },
      layout: $layout.fill,
      views: [
        {
          type: "label",
          props: {
            text: "使用相似性查询",
            textColor: $color("primaryText"),
            font: $font(17),
            align: $align.left,
          },
          layout: (make, view) => {
            make.top.bottom.right.inset(0);
            make.left.inset(15);
          },
        },
        {
          type: "switch",
          props: {
            on: true,
            onColor: $color("#34C85A"),
          },
          layout: (make, view) => {
            make.centerY.equalTo(view.super);
            make.right.inset(15);
          },
          events: {
            changed: (sender) => {
              this._similaritySwitch = sender.on;
            },
          },
        },
      ],
    });
    const coverSwitchView = new ContentView({
      props: {
        bgcolor: $color("secondarySurface"),
      },
      layout: $layout.fill,
      views: [
        {
          type: "label",
          props: {
            text: "仅搜索封面",
            textColor: $color("primaryText"),
            font: $font(17),
            align: $align.left,
          },
          layout: (make, view) => {
            make.top.bottom.right.inset(0);
            make.left.inset(15);
          },
        },
        {
          type: "switch",
          props: {
            on: true,
            onColor: $color("#34C85A"),
          },
          layout: (make, view) => {
            make.centerY.equalTo(view.super);
            make.right.inset(15);
          },
          events: {
            changed: (sender) => {
              this._coverSwitch = sender.on;
            },
          },
        },
      ],
    });
    this._defineView = () => ({
      type: "list",
      props: {
        id: this.id,
        style: 2,
        hidden: true,
        data: [
          {
            title: "",
            rows: [
              {
                type: "view",
                props: {
                  bgcolor: $color("secondarySurface"),
                },
                layout: $layout.fill,
                views: [
                  {
                    type: "button",
                    props: {
                      id: this.id + "imageAddButton",
                      bgcolor: $color("clear"),
                      menu: {
                        asPrimary: true,
                        pullDown: true,
                        items: [
                          {
                            title: "照片",
                            symbol: "photo",
                            handler: (sender: AllUIView) => {
                              $photo.pick({
                                format: "data",
                                handler: (resp) => {
                                  if (!resp || !resp.data || !resp.data.image) return;
                                  this._imageData = resp.data;
                                  this._status = "prepared";
                                  this._updateStatus();
                                },
                              });
                            },
                          },
                          {
                            title: "文件",
                            symbol: "folder",
                            handler: (sender: AllUIView) => {
                              $drive.open({
                                types: ["public.image"],
                                handler: (data) => {
                                  if (!data || !data.image) return;
                                  this._imageData = data;
                                  this._status = "prepared";
                                  this._updateStatus();
                                },
                              });
                            },
                          },
                        ],
                      },
                    },
                    layout: $layout.fill,
                    views: [
                      {
                        type: "label",
                        props: {
                          text: "选择图片",
                          textColor: $color("systemLink"),
                          font: $font(17),
                          align: $align.left,
                        },
                        layout: (make: MASConstraintMaker, view: UILabelView) => {
                          make.top.bottom.right.inset(0);
                          make.left.inset(15);
                        },
                      },
                    ],
                  },
                  {
                    type: "button",
                    props: {
                      id: this.id + "imageSearchButton",
                      bgcolor: $color("clear"),
                      hidden: true,
                    },
                    layout: $layout.fill,
                    views: [
                      {
                        type: "label",
                        props: {
                          text: "上传并搜索",
                          textColor: $color("systemLink"),
                          font: $font(17),
                          align: $align.left,
                        },
                        layout: (make: MASConstraintMaker, view: UILabelView) => {
                          make.top.bottom.right.inset(0);
                          make.left.inset(15);
                        },
                      },
                    ],
                    events: {
                      tapped: async (sender: UIButtonView) => {
                        if (this._status !== "prepared") return;
                        if (!this._imageData) return;
                        this._status = "uploading";
                        this._updateStatus();
                        uploadingHandler(true);
                        try {
                          const data = await api.uploadImageAndLookup({
                            data: this._imageData,
                            fs_similar: this._similaritySwitch,
                            fs_covers: this._coverSwitch,
                            progressHandler: (progress) => {
                              const percentage = Math.floor(progress * 100);
                              if (percentage === 100) {
                                ($(this.id + "imageUploadProgressLabel") as UILabelView).text = "等待结果返回……";
                              } else {
                                ($(this.id + "imageUploadProgressLabel") as UILabelView).text =
                                  "正在上传……" + percentage + "%";
                              }
                            },
                          });
                          uploadedHandler({
                            type: "image_lookup",
                            options: data.options,
                          });
                        } catch (error: any) {
                          this._status = "failed";
                          this._updateStatus();
                          uploadingHandler(false);
                          $ui.alert({
                            title: "上传失败",
                            message: error?.message || error?.detail || "未知错误",
                            actions: [
                              {
                                title: "确定",
                                handler: () => {
                                  this._status = "prepared";
                                  this._updateStatus();
                                },
                              },
                            ],
                          });
                        }
                      },
                    },
                  },
                  {
                    type: "label",
                    props: {
                      id: this.id + "imageUploadProgressLabel",
                      text: "正在上传……0%",
                      textColor: $color("systemLink"),
                      font: $font(17),
                      hidden: true,
                    },
                    layout: (make: MASConstraintMaker, view: UILabelView) => {
                      make.top.bottom.right.inset(0);
                      make.left.inset(15);
                    },
                  },
                ],
              },
            ],
          },
          {
            title: "",
            rows: [similaritySwitchView.definition, coverSwitchView.definition],
          },
          {
            title: "",
            rows: [
              {
                type: "button",
                props: {
                  id: this.id + "imagePreviewView",
                  bgcolor: $color("secondarySurface"),
                  menu: {
                    asPrimary: true,
                    pullDown: true,
                    items: [
                      {
                        title: "照片",
                        symbol: "photo",
                        handler: (sender: AllUIView) => {
                          $photo.pick({
                            format: "data",
                            handler: (resp) => {
                              if (!resp || !resp.data || !resp.data.image) return;
                              this._imageData = resp.data;
                              this._status = "prepared";
                              this._updateStatus();
                            },
                          });
                        },
                      },
                      {
                        title: "文件",
                        symbol: "folder",
                        handler: (sender: AllUIView) => {
                          $drive.open({
                            types: ["public.image"],
                            handler: (data) => {
                              if (!data || !data.image) return;
                              this._imageData = data;
                              this._status = "prepared";
                              this._updateStatus();
                            },
                          });
                        },
                      },
                    ],
                  },
                },
                layout: $layout.fill,
                views: [
                  {
                    type: "view",
                    props: {
                      id: this.id + "imagePreviewViewPlaceholder",
                    },
                    layout: $layout.fill,
                    views: [
                      {
                        type: "image",
                        props: {
                          symbol: "photo.on.rectangle",
                          tintColor: $color("lightGray"),
                          contentMode: 1,
                        },
                        layout: (make: MASConstraintMaker, view: UIImageView) => {
                          make.centerY.equalTo(view.super).offset(-20);
                          make.centerX.equalTo(view.super);
                          make.size.equalTo($size(150, 150));
                        },
                      },
                      {
                        type: "label",
                        props: {
                          text: "点击选择图片",
                          textColor: $color("lightGray"),
                          font: $font(14),
                          align: $align.center,
                        },
                        layout: (make: MASConstraintMaker, view: UILabelView) => {
                          make.top.equalTo(view.prev.bottom).inset(10);
                          make.centerX.equalTo(view.super);
                        },
                      },
                    ],
                  },
                  {
                    type: "image",
                    props: {
                      id: this.id + "imagePreviewViewImage",
                      hidden: true,
                      contentMode: 1,
                    },
                    layout: $layout.fill,
                  },
                ],
              },
            ],
          },
        ],
      },
      layout: $layout.fill,
      events: {
        rowHeight: (sender, indexPath) => {
          if (indexPath.section === 2) {
            return 300;
          } else {
            return 44;
          }
        },
      },
    });
  }

  private _updateStatus() {
    if (this._status === "pending") {
      $(this.id + "imageAddButton").hidden = false;
      $(this.id + "imageSearchButton").hidden = true;
      $(this.id + "imageUploadProgressLabel").hidden = true;
      $(this.id + "imagePreviewViewImage").hidden = true;
      $(this.id + "imagePreviewViewPlaceholder").hidden = false;
      ($(this.id + "imagePreviewView") as UIButtonView).enabled = true;
    } else if (this._status === "prepared") {
      $(this.id + "imageAddButton").hidden = true;
      $(this.id + "imageSearchButton").hidden = false;
      $(this.id + "imageUploadProgressLabel").hidden = true;
      $(this.id + "imagePreviewViewImage").hidden = false;
      $(this.id + "imagePreviewViewPlaceholder").hidden = true;
      ($(this.id + "imagePreviewView") as UIButtonView).enabled = true;
      if (this._imageData?.image) {
        ($(this.id + "imagePreviewViewImage") as UIImageView).image = this._imageData.image;
      }
      ($(this.id + "imageUploadProgressLabel") as UILabelView).text = "正在上传……0%";
    } else if (this._status === "uploading") {
      $(this.id + "imageAddButton").hidden = true;
      $(this.id + "imageSearchButton").hidden = true;
      $(this.id + "imageUploadProgressLabel").hidden = false;
      ($(this.id + "imageUploadProgressLabel") as UILabelView).textColor = $color("systemLink");
      $(this.id + "imagePreviewViewImage").hidden = false;
      $(this.id + "imagePreviewViewPlaceholder").hidden = true;
      ($(this.id + "imagePreviewView") as UIButtonView).enabled = false;
    } else if (this._status === "failed") {
      $(this.id + "imageAddButton").hidden = true;
      $(this.id + "imageSearchButton").hidden = true;
      $(this.id + "imageUploadProgressLabel").hidden = false;
      ($(this.id + "imageUploadProgressLabel") as UILabelView).textColor = $color("red");
      $(this.id + "imagePreviewViewImage").hidden = false;
      $(this.id + "imagePreviewViewPlaceholder").hidden = true;
      ($(this.id + "imagePreviewView") as UIButtonView).enabled = true;
      ($(this.id + "imageUploadProgressLabel") as UILabelView).text = "上传失败";
    }
  }
}

class NavBar extends Base<UIBlurView, UiTypes.BlurOptions> {
  _defineView: () => UiTypes.BlurOptions;
  cviews: {
    tab: Tab;
    input: Input;
    filterButton: SymbolButton;
  };
  private _menuDisplayMode: MenuDisplayMode;
  private _filterSwitch: boolean = false;
  constructor(options: {
    type: "front_page" | "watched" | "favorites" | "archive";
    searchTerms?: EHSearchTerm[];
    menuDisplayMode: MenuDisplayMode;
    filterChangedHandler: () => void;
    tabChangedHandler: () => void;
    inputChangedHandler: (text: string) => void;
    popHandler: () => void;
    searchHandler: () => void;
  }) {
    super();
    this._menuDisplayMode = options.menuDisplayMode;
    const popButton = new SymbolButton({
      props: {
        symbol: "chevron.left",
        tintColor: $color("primaryText"),
        insets: $insets(2.5, 2.5, 2.5, 2.5),
      },
      layout: (make, view) => {
        make.left.inset(0);
        make.centerY.equalTo(view.super);
        make.height.width.equalTo(30);
      },
      events: {
        tapped: (sender) => {
          options.popHandler();
        },
      },
    });
    const filterButton = new SymbolButton({
      props: {
        symbol: "slider.horizontal.3",
        tintColor: $color("primaryText"),
        insets: $insets(2.5, 2.5, 2.5, 2.5),
      },
      layout: (make, view) => {
        make.right.inset(0);
        make.centerY.equalTo(view.super);
        make.height.width.equalTo(30);
      },
      events: {
        tapped: (sender) => {
          if (this._filterSwitch) {
            this._filterSwitch = false;
          } else {
            this._filterSwitch = true;
          }

          options.filterChangedHandler();
        },
      },
    });
    const input = new Input({
      props: {
        text: options.searchTerms && options.searchTerms.length ? assembleSearchTerms(options.searchTerms) + " " : "",
        type: $kbType.search,
        bgcolor: $color("clear"),
        textColor: $color("primaryText"),
        font: $font(16),
      },
      layout: (make, view) => {
        make.left.equalTo(view.prev.right).inset(0);
        make.right.inset(0);
        make.centerY.equalTo(view.super);
        make.height.equalTo(view.super);
      },
      events: {
        changed: (sender) => {
          options.inputChangedHandler(sender.text);
        },
        returned: (sender) => {
          options.searchHandler();
        },
      },
    });
    const searchInput = new ContentView({
      props: {
        bgcolor: $color("#DFE1E2", "tertiarySurface"),
        cornerRadius: 8,
        smoothCorners: true,
      },
      layout: (make, view) => {
        make.left.inset(35);
        make.right.inset(35);
        make.centerY.equalTo(view.super);
        make.height.equalTo(36);
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "magnifyingglass",
            tintColor: $color("systemPlaceholderText"),
          },
          layout: (make, view) => {
            make.left.inset(6);
            make.centerY.equalTo(view.super);
            make.size.equalTo($size(20, 20));
          },
        },
        input.definition,
      ],
    });
    const mainView = new ContentView({
      props: {
        bgcolor: $color("clear"),
      },
      layout: (make, view) => {
        make.top.equalTo(view.super.safeAreaTop).inset(0);
        make.left.right.equalTo(view.super.safeArea).inset(5);
        make.height.equalTo(50);
      },
      views: [popButton.definition, searchInput.definition, filterButton.definition],
    });
    const tab = new Tab({
      props: {
        index: {
          front_page: 0,
          watched: 1,
          favorites: 2,
          archive: 3,
        }[options.type],
        items:
          options.menuDisplayMode === "showAllExceptArchive"
            ? ["首页", "订阅", "收藏"]
            : options.menuDisplayMode === "showAllExceptArchiveWithImageLookup"
            ? ["首页", "订阅", "收藏", "搜图"]
            : ["首页", "订阅", "收藏", "存档"],
      },
      layout: (make, view) => {
        make.left.right.equalTo(view.super.safeArea).inset(50);
        make.height.equalTo(30);
        make.bottom.inset(10);
      },
      events: {
        changed: (sender) => {
          if (options.menuDisplayMode === "showAllExceptArchiveWithImageLookup") {
            if (sender.index === 3) {
              this.cviews.input.view.blur();
              this.cviews.input.view.enabled = false;
            } else {
              this.cviews.input.view.enabled = true;
            }
          }
          options.tabChangedHandler();
        },
      },
    });
    const seprator: UiTypes.ViewOptions = {
      type: "view",
      props: {
        bgcolor: $color("separatorColor"),
      },
      layout: (make, view) => {
        make.left.right.inset(0);
        make.height.equalTo(1 / $device.info.screen.scale);
        make.bottom.inset(0);
      },
    };
    this.cviews = {
      tab,
      input,
      filterButton,
    };
    this._defineView = () => ({
      type: "blur",
      props: {
        style: 10,
        id: this.id,
      },
      layout: (make, view) => {
        make.left.right.top.inset(0);
        make.bottom
          .equalTo(view.super.safeAreaTop)
          .inset(
            options.menuDisplayMode === "showAll" ||
              options.menuDisplayMode === "showAllExceptArchive" ||
              options.menuDisplayMode === "showAllExceptArchiveWithImageLookup"
              ? -92
              : -50
          );
      },
      views:
        options.menuDisplayMode === "showAll" ||
        options.menuDisplayMode === "showAllExceptArchive" ||
        options.menuDisplayMode === "showAllExceptArchiveWithImageLookup"
          ? [mainView.definition, tab.definition, seprator]
          : [mainView.definition, seprator],
    });
  }

  get filterOn() {
    return this._filterSwitch;
  }

  get type() {
    let type: "front_page" | "watched" | "favorites" | "archive" | "image_lookup";
    if (this._menuDisplayMode === "onlyShowFrontPage") {
      type = "front_page";
    } else if (this._menuDisplayMode === "onlyShowArchive") {
      type = "archive";
    } else if (this.cviews.tab.view.index === 1) {
      type = "watched";
    } else if (this.cviews.tab.view.index === 2) {
      type = "favorites";
    } else if (this.cviews.tab.view.index === 3 && this._menuDisplayMode === "showAll") {
      type = "archive";
    } else if (this.cviews.tab.view.index === 3 && this._menuDisplayMode === "showAllExceptArchiveWithImageLookup") {
      type = "image_lookup";
    } else {
      type = "front_page";
    }
    return type;
  }
}

function _countCharacter(str: string, char: string) {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) {
      count++;
    }
  }
  return count;
}

function _disassembleFsearch(fsearch: string) {
  // 双引号包裹的字符串视为一个整体，不会被分割。除此之外，空格分割。
  // 方法：首先有一个状态标记inQuote，初始为false。
  // 然后逐字遍历，第一次遇到双引号则inQuote=true，第二次则inQuote=false，以此类推。
  // 如果inQuote为true，则直到下一个双引号之前的空格都不会被分割。
  // 如果inQuote为false，则遇到空格就分割。

  let inQuote = false;
  let result: string[] = [];
  let current = "";
  for (let i = 0; i < fsearch.length; i++) {
    let c = fsearch[i];
    if (c === '"') inQuote = !inQuote;
    if (c === " " && !inQuote) {
      if (current) result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  if (current) result.push(current);
  return result;
}

function _getSearchTermsForSuggestion(
  fsearch: string
): { namespace?: TagNamespace; term: string; remaining: string }[] {
  // 1. 拆分fsearch
  const parts = _disassembleFsearch(fsearch);
  if (parts.length === 0) return [];

  const lastPart = parts[parts.length - 1];
  // 2. 如果最后一个部分是一个“完整”的部分，则不需要搜索建议。
  // 判断方法为：如果包含至少两个双引号，或者包含$符号，则认为是一个完整的部分。
  if (_countCharacter(lastPart, '"') >= 2 || lastPart.includes("$")) return [];

  // 3. 如果最后一个部分包含冒号，则判断是否包含合法的命名空间，如果包含，则需要搜索建议；否则不需要。
  if (lastPart.includes(":")) {
    const index = lastPart.lastIndexOf(":");
    const namespace = lastPart.substring(0, index).toLowerCase();
    let term = lastPart.substring(index + 1).toLowerCase();
    // 如果term中包含双引号，则必须在开头，否则不合法。
    if (term.includes('"') && term.indexOf('"') !== 0) return [];
    if (term[0] === '"') term = term.substring(1);
    if (tagNamespaces.includes(namespace as TagNamespace)) {
      return [
        {
          namespace: namespace as TagNamespace,
          term,
          remaining: parts.slice(0, parts.length - 1).join(" "),
        },
      ];
    } else if (tagNamespaceAlternates.includes(namespace as TagNamespaceAlternate)) {
      return [
        {
          namespace: tagNamespaceAlternateMap[namespace as TagNamespaceAlternate],
          term,
          remaining: parts.slice(0, parts.length - 1).join(" "),
        },
      ];
    } else {
      return [];
    }
  }

  // 4. 如果最后一个部分只包含一个双引号且在开头，则需要搜索建议；否则不需要。
  if (lastPart.includes('"') && lastPart.indexOf('"') === 0) {
    return [
      {
        term: lastPart.substring(1).toLowerCase(),
        remaining: parts.slice(0, parts.length - 1).join(" "),
      },
    ];
  } else if (lastPart.includes('"') && lastPart.indexOf('"') !== 0) {
    return [];
  }

  // 5. 从后往前查找不包含任何双引号、冒号、美元符号的部分
  const cleanParts = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (!part.includes('"') && !part.includes(":") && !part.includes("$")) {
      cleanParts.push(part.toLowerCase());
    } else {
      break;
    }
  }
  // 倒转数组
  cleanParts.reverse();
  // 将数组中的部分依次拼接起来，每次拼接的结果都作为一个搜索词
  const result = [];
  for (let i = 0; i < cleanParts.length; i++) {
    const term = cleanParts.slice(i).join(" ");
    result.push({
      term,
      remaining: parts.slice(0, parts.length - cleanParts.length + i).join(" "),
    });
  }
  return result;
}

function _getScoreByMatchingDegree(
  text: string,
  tag: {
    namespace: TagNamespace;
    name: string;
    translation: string;
  }
) {
  if (text === tag.name || text === tag.translation) {
    return 0;
  } else if (tag.name.toLowerCase().startsWith(text) || tag.translation.toLowerCase().startsWith(text)) {
    return 1;
  } else if (tag.name.toLowerCase().includes(text) || tag.translation.toLowerCase().includes(text)) {
    return 2;
  } else {
    return 3;
  }
}

function _getScoreByNamespace(namespace: TagNamespace) {
  return namespaceOrderList.indexOf(namespace);
}

function _getScoreByTermOrder(str: string, terms: { namespace?: TagNamespace; term: string; remaining: string }[]) {
  // 遍历优先级列表，找到第一个匹配的优先级并返回该索引
  // 索引越小，优先级越高，因此返回该索引即可
  // 如果一个字符串同时满足多个（比如"ABC"也包含"AB"和"A"），
  // 由于我们从高优先级往下匹配，所以会先返回"ABC"对应的0分（最高级）

  for (let i = 0; i < terms.length; i++) {
    if (str.includes(terms[i].term)) {
      // 包含当前优先级的串则返回当前优先级的索引作为分数
      return i;
    }
  }
  // 如果都不包含，则返回一个较大的分值
  return terms.length;
}
function getSuggestions(
  terms: {
    namespace?: TagNamespace;
    term: string;
    remaining: string;
  }[]
): {
  namespace: TagNamespace;
  name: string;
  translation: string;
  remaining: string;
}[] {
  if (terms.length === 0) {
    return [];
  } else if (terms.length === 1) {
    const term = terms[0];
    return configManager.translationList
      .filter(
        (n) =>
          (!term.namespace || n.namespace === term.namespace) &&
          (n.name.toLowerCase().includes(term.term) || n.translation.toLowerCase().includes(term.term))
      )
      .sort((a, b) => {
        const primaryScoreA = _getScoreByMatchingDegree(term.term, a);
        const primaryScoreB = _getScoreByMatchingDegree(term.term, b);
        if (primaryScoreA !== primaryScoreB) {
          return primaryScoreA - primaryScoreB;
        } else {
          const secondaryScoreA = _getScoreByNamespace(a.namespace);
          const secondaryScoreB = _getScoreByNamespace(b.namespace);
          return secondaryScoreA - secondaryScoreB;
        }
      })
      .map((n) => ({
        namespace: n.namespace,
        name: n.name,
        translation: n.translation,
        remaining: term.remaining,
      }));
  } else {
    // 对最后一个term进行搜索，然后根据分数排序
    const term = terms[terms.length - 1];
    return configManager.translationList
      .filter((n) => n.name.toLowerCase().includes(term.term) || n.translation.toLowerCase().includes(term.term))
      .sort((a, b) => {
        const primaryScoreA = _getScoreByTermOrder(a.name, terms);
        const primaryScoreB = _getScoreByTermOrder(b.name, terms);
        if (primaryScoreA !== primaryScoreB) {
          return primaryScoreA - primaryScoreB;
        } else {
          const secondaryScoreA = _getScoreByMatchingDegree(term.term, a);
          const secondaryScoreB = _getScoreByMatchingDegree(term.term, b);
          if (secondaryScoreA !== secondaryScoreB) {
            return secondaryScoreA - secondaryScoreB;
          } else {
            const tertiaryScoreA = _getScoreByNamespace(a.namespace);
            const tertiaryScoreB = _getScoreByNamespace(b.namespace);
            return tertiaryScoreA - tertiaryScoreB;
          }
        }
      })
      .map((n) => {
        // 对terms从前往后遍历，找到第一个匹配的term，remaining就是该term的remaining
        const remaining =
          terms.find((t) => n.name.toLowerCase().includes(t.term) || n.translation.toLowerCase().includes(t.term))
            ?.remaining || "";
        return {
          namespace: n.namespace,
          name: n.name,
          translation: n.translation,
          remaining,
        };
      });
  }
}

class SearchContentView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  cviews: {
    navbar: NavBar;
    searchSuggestionView: SearchSuggestionView;
    searchHistoryView: SearchHistoryView;
    frontPageOptionsView: FrontPageOptionsView;
    watchedOptionsView: FrontPageOptionsView;
    favoritesOptionsView: FavoritesOptionsView;
    archiveOptionsView: ArchiveOptionsView;
    imageLookupView: ImageLookupView;
  };
  constructor(
    args: FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions | ArchiveTabOptions,
    menuDisplayMode: MenuDisplayMode,
    resolveHandler: (
      args: FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions | ArchiveTabOptions | ImageLookupTabOptions
    ) => void
  ) {
    super();
    const navbar = new NavBar({
      type: args.type,
      searchTerms: args.options.searchTerms,
      menuDisplayMode,
      filterChangedHandler: () => {
        this.updateHiddenStatus();
      },
      tabChangedHandler: () => {
        this.updateHiddenStatus();
      },
      inputChangedHandler: (text) => {
        const searchTermsForSuggestion = _getSearchTermsForSuggestion(text);
        if (searchTermsForSuggestion.length === 0) {
          this.cviews.searchSuggestionView.view.hidden = true;
        } else {
          this.cviews.searchSuggestionView.view.hidden = false;
        }
        const suggestions = getSuggestions(searchTermsForSuggestion);
        this.cviews.searchSuggestionView.suggestions = suggestions;
      },
      popHandler: () => {
        $ui.pop();
      },
      searchHandler: () => {
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
                title: "查看Wiki",
                handler: () => {
                  $app.openURL("https://ehwiki.org/wiki/Gallery_Searching");
                },
              },
              { title: "好的" },
            ],
          });
          return;
        }
        if (searchTerms.some((st) => st.qualifier && st.tilde && st.qualifier !== "tag" && st.qualifier !== "weak")) {
          $ui.alert({
            title: "无意义的符号",
            message: "~符号只能用于标签，其他修饰词均不支持~符号",
            actions: [{ title: "好的" }],
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
              ...data.options,
            },
          });
        } else if (type === "watched") {
          const data = this.cviews.watchedOptionsView.data;
          resolveHandler({
            type: "watched",
            options: {
              searchTerms,
              excludedCategories: data.excludedCategories,
              ...data.options,
            },
          });
        } else if (type === "favorites") {
          const data = this.cviews.favoritesOptionsView.data;
          resolveHandler({
            type: "favorites",
            options: {
              searchTerms,
              favcat: data.selectedFavcat,
            },
          });
        } else {
          if (searchTerms.some((st) => st.qualifier && ["weak", "favnote", "uploaduid"].includes(st.qualifier))) {
            $ui.alert({
              title: "不支持的修饰词",
              message: "存档搜索不支持修饰词weak, uploaduid, favnote",
              actions: [{ title: "OK" }],
            });
            return;
          }
          const data = this.cviews.archiveOptionsView.data;
          resolveHandler({
            type: "archive",
            options: {
              fromPage: 0,
              toPage: 0,
              searchTerms,
              excludedCategories: data.excludedCategories,
              sort: configManager.archiveManagerOrderMethod,
              ...data.options,
            },
          });
        }
        $ui.pop();
      },
    });
    const searchSuggestionView = new SearchSuggestionView((text) => {
      navbar.cviews.input.view.text = text;
      this.cviews.searchSuggestionView.view.hidden = true;
    });
    const searchHistoryView = new SearchHistoryView((text) => {
      const currentText = navbar.cviews.input.view.text;
      const newText = currentText
        ? `${currentText}${currentText[currentText.length - 1] === " " ? "" : " "}${text} `
        : text + " ";
      navbar.cviews.input.view.text = newText;
    });
    const frontPageOptionsView = new FrontPageOptionsView(args.type === "front_page" ? args.options : undefined);
    const watchedOptionsView = new FrontPageOptionsView(args.type === "watched" ? args.options : undefined);
    const favoritesOptionsView = new FavoritesOptionsView(args.type === "favorites" ? args.options : undefined);
    const archiveOptionsView = new ArchiveOptionsView(args.type === "archive" ? args.options : undefined);
    const imageLookupView = new ImageLookupView({
      uploadingHandler: (uploading) => {
        if (uploading) {
          this.cviews.navbar.cviews.tab.view.userInteractionEnabled = false;
        } else {
          this.cviews.navbar.cviews.tab.view.userInteractionEnabled = true;
        }
      },
      uploadedHandler: (result) => {
        resolveHandler(result);
        $ui.pop();
      },
    });
    this.cviews = {
      navbar,
      searchSuggestionView,
      searchHistoryView,
      frontPageOptionsView,
      watchedOptionsView,
      favoritesOptionsView,
      archiveOptionsView,
      imageLookupView,
    };
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
      },
      layout: $layout.fill,
      views: [
        navbar.definition,
        {
          type: "view",
          props: {
            bgcolor: $color("insetGroupedBackground"),
          },
          layout: (make, view) => {
            make.top.equalTo(view.prev.bottom);
            make.left.right.bottom.equalTo(view.super);
          },
          views: [
            searchHistoryView.definition,
            searchSuggestionView.definition,
            frontPageOptionsView.definition,
            watchedOptionsView.definition,
            favoritesOptionsView.definition,
            archiveOptionsView.definition,
            imageLookupView.definition,
          ],
        },
      ],
      events: {
        ready: (sender) => {
          this.updateHiddenStatus();
        },
      },
    });
  }

  _isCurrentOptionsNotEmpty() {
    const type = this.cviews.navbar.type;
    switch (type) {
      case "image_lookup": {
        return false;
      }
      case "front_page": {
        const data = this.cviews.frontPageOptionsView.data;
        if (data.excludedCategories.length || Object.values(data.options).some((n) => n !== undefined)) {
          return true;
        } else {
          return false;
        }
      }
      case "watched": {
        const data = this.cviews.watchedOptionsView.data;
        if (data.excludedCategories.length || Object.values(data.options).some((n) => n !== undefined)) {
          return true;
        } else {
          return false;
        }
      }
      case "favorites": {
        const data = this.cviews.favoritesOptionsView.data;
        if (data.selectedFavcat !== undefined) {
          return true;
        } else {
          return false;
        }
      }
      case "archive": {
        const data = this.cviews.archiveOptionsView.data;
        if (
          data.excludedCategories.length ||
          data.options.minimumPages !== undefined ||
          data.options.maximumPages !== undefined ||
          data.options.minimumRating !== undefined
        ) {
          return true;
        } else {
          return false;
        }
      }
      default:
        break;
    }
  }

  updateHiddenStatus() {
    const filterOn = this.cviews.navbar.filterOn;
    const type = this.cviews.navbar.type;
    if (type === "image_lookup") {
      this.cviews.navbar.cviews.filterButton.tintColor = $color("primaryText");
      this.cviews.searchSuggestionView.view.hidden = true;
      this.cviews.searchHistoryView.view.hidden = true;
      this.cviews.frontPageOptionsView.view.hidden = true;
      this.cviews.watchedOptionsView.view.hidden = true;
      this.cviews.favoritesOptionsView.view.hidden = true;
      this.cviews.archiveOptionsView.view.hidden = true;
      this.cviews.imageLookupView.view.hidden = false;
      return;
    }
    if (filterOn) {
      this.cviews.navbar.cviews.filterButton.tintColor = $color("systemLink");
      this.cviews.searchSuggestionView.view.hidden = true;
      this.cviews.searchHistoryView.view.hidden = true;
      this.cviews.imageLookupView.view.hidden = true;
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
      this.cviews.navbar.cviews.filterButton.tintColor = this._isCurrentOptionsNotEmpty()
        ? $color("orange")
        : $color("primaryText");
      this.cviews.searchSuggestionView.view.hidden = true;
      this.cviews.searchHistoryView.view.hidden = false;
      this.cviews.frontPageOptionsView.view.hidden = true;
      this.cviews.watchedOptionsView.view.hidden = true;
      this.cviews.favoritesOptionsView.view.hidden = true;
      this.cviews.archiveOptionsView.view.hidden = true;
      this.cviews.imageLookupView.view.hidden = true;
    }
  }
}

// 1. 只有首页
export function getSearchOptions(
  args: FrontPageTabOptions,
  menuDisplayMode: "onlyShowFrontPage"
): Promise<FrontPageTabOptions>;

// 2. 只有归档
export function getSearchOptions(
  args: ArchiveTabOptions,
  menuDisplayMode: "onlyShowArchive"
): Promise<ArchiveTabOptions>;

// 3. 除了归档以外都显示
export function getSearchOptions(
  args: FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions,
  menuDisplayMode: "showAllExceptArchive"
): Promise<FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions>;

// 4. 除了归档以外 + 图片检索
export function getSearchOptions(
  args: FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions,
  menuDisplayMode: "showAllExceptArchiveWithImageLookup"
): Promise<FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions | ImageLookupTabOptions>;

// 5. 全部都显示
export function getSearchOptions(
  args: FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions | ArchiveTabOptions,
  menuDisplayMode: "showAll"
): Promise<FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions | ArchiveTabOptions>;

export function getSearchOptions(
  args: FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions | ArchiveTabOptions,
  menuDisplayMode: MenuDisplayMode
): Promise<FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions | ArchiveTabOptions | ImageLookupTabOptions> {
  return new Promise((resolve, reject) => {
    const contentView = new SearchContentView(args, menuDisplayMode, (n) => {
      resolve(n);
    });
    $ui.push({
      props: {
        navBarHidden: true,
        statusBarStyle: 0,
      },
      views: [contentView.definition],
      events: {
        appeared: () => {
          contentView.cviews.navbar.cviews.input.view.focus();
        },
        dealloc: () => {
          reject("cancel");
        },
      },
    });
  });
}
