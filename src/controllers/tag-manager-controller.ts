import { BaseController, CustomNavigationBar, List, Menu, router, SplitViewController, SymbolButton } from "jsbox-cview";
import { configManager } from "../utils/config";
import { namespaceTranslations, tagColor } from "../utils/glv";
import { SavedSearchKeyword, MarkedTagDict, TranslationDict } from "../types";
import { TagNamespace, tagNamespaces } from "ehentai-parser";
import { showDetailedInfoView } from "../components/detailed-info-view";

enum TagType {
  unmarked,
  marked,
  watched,
  hidden
}

const tagSymbol = {
  [TagType.unmarked]: "bookmark",
  [TagType.marked]: "bookmark.fill",
  [TagType.watched]: "bookmark.fill",
  [TagType.hidden]: "bookmark.slash"
}

const tagSymbolColor = {
  [TagType.unmarked]: $color("systemGray5"),
  [TagType.marked]: tagColor.marked,
  [TagType.watched]: tagColor.watched,
  [TagType.hidden]: tagColor.hidden
}

function mapData(
  searchPhrase: string,
  onlyShowMarkred: boolean,
  customPhrases: SavedSearchKeyword[],
  translationDict: TranslationDict,
  markedTagDict: MarkedTagDict,
  markedUploaders: string[]
) {
  const data: { title: string, rows: any[] }[] = [
    {
      title: "",
      rows: [{
        addCustomPhrase: { hidden: false },
        customPhraseView: { hidden: true },
        tagView: { hidden: true }
      }]
    }
  ]
  const menuItems: string[] = ["短语"]
  // 先添加自定义分组
  if (customPhrases.length) {
    data.push({
      title: "自定义短语",
      rows: []
    })
    for (const customPhrase of customPhrases) {
      const styledText: UiTypes.StyledTextOptions = customPhrase.name ? {
        text: customPhrase.name + "  " + customPhrase.content,
        styles:[
          {
            range: $range(0, customPhrase.name.length),
            font: $font("bold", 14),
            color: $color("primaryText")
          },
          {
            range: $range(customPhrase.name.length + 2, customPhrase.content.length),
            font: $font(14),
            color: $color("secondaryText")
          }
        ]
      } : {
        text: customPhrase.content,
        styles: [
          {
            range: $range(0, customPhrase.content.length),
            font: $font(14),
            color: $color("secondaryText")
          }
        ]
      }
      data[1].rows.push({
        addCustomPhrase: { hidden: true },
        customPhraseView: { hidden: false },
        tagView: { hidden: true },
        content: { styledText },
      })
    }
  }
  // 添加上传者分组
  if (markedUploaders.length) {
    data.push({
      title: "上传者",
      rows: markedUploaders.map(uploader => {
        return {
          addCustomPhrase: { hidden: true },
          customPhraseView: { hidden: true },
          tagView: { hidden: false },
          infoButton: { hidden: true },
          symbol: { 
            symbol: "bookmark.fill",
            tintColor: tagColor.marked
          },
          tag: { text: uploader }
        }
      })
    })
    menuItems.push("上传者")
  }

  // 然后按照顺序添加默认分组
  for (const namespace of tagNamespaces) {
    const tags = translationDict[namespace]
    const markedTags = markedTagDict[namespace]
    // 找出标记的标签中有而翻译表中没有的标签
    const diff = Object.keys(markedTags).filter(name => !tags[name])
    let rows = Object.entries(tags)
    if (diff.length) {
      rows = rows.concat(diff.map(name => ([name, ""])))
      rows.sort()
    }
    if (searchPhrase) {
      rows = rows.filter(([name, translation]) => {
        return name.includes(searchPhrase) || translation.includes(searchPhrase)
      })
    }
    if (onlyShowMarkred) {
      rows = rows.filter(([name]) => markedTagDict[namespace][name])
    }
    if (!rows.length) continue

    const mappedRows = rows
      .map(([name, translation]) => {
        let style = TagType.unmarked
        const marked = markedTagDict[namespace][name]
        const watched = marked?.watched
        const hidden = marked?.hidden
        if (watched) {
          style = TagType.watched
        } else if (hidden) {
          style = TagType.hidden
        } else if (marked) {
          style = TagType.marked
        }
        return {
          addCustomPhrase: { hidden: true },
          customPhraseView: { hidden: true },
          tagView: { hidden: false },
          infoButton: { info: { namespace, name } },
          symbol: { 
            hidden: false,
            symbol: tagSymbol[style],
            tintColor: tagSymbolColor[style] 
          },
          tag: { text: translation ? translation + "  " + name : name },
        }
      })
    const title = namespaceTranslations[namespace]
    data.push({
      title,
      rows: mappedRows
    })
    menuItems.push(title)
  }
  return { data, menuItems }
}

export class TagManagerController extends BaseController {
  private _sectionCumYs: number[] = [84] // 用于记录每个 section 的 Y 坐标(累加), 用于判断当前滚动到了哪个 section
  private _searchPhrase = ""
  cviews: {
    markedButton: SymbolButton;
    filterButton: SymbolButton;
    navbar: CustomNavigationBar;
    menu: Menu;
    list: List;
  }

  constructor() {
    super({
      props: {
        id: "tagManagerController"
      }, 
      events: {
        didLoad: () => {
          $delay(0.5, () => this.refresh())
        }
      }
    });

  const markedButton = new SymbolButton({
    props: {
      symbol: configManager.tagManagerOnlyShowBookmarked ? "bookmark.fill" : "bookmark",
      tintColor: configManager.tagManagerOnlyShowBookmarked ? $color("orange") : $color("primaryText")
    },
    layout: $layout.fill,
    events: {
      tapped: sender => {
        configManager.tagManagerOnlyShowBookmarked = !configManager.tagManagerOnlyShowBookmarked
        markedButton.symbol = configManager.tagManagerOnlyShowBookmarked ? "bookmark.fill" : "bookmark"
        markedButton.tintColor = configManager.tagManagerOnlyShowBookmarked ? $color("orange") : $color("primaryText")
        this.refresh()
      }
    }
  })
  const filterButton = new SymbolButton({
    props: {
      symbol: "magnifyingglass",
    },
    events: {
      tapped: (sender) => {
        $input.text({
          text: this._searchPhrase,
          type: $kbType.search,
          placeholder: "搜索标签",
          handler: text => {
            if (text === this._searchPhrase) return
            if (!text) {
              filterButton.tintColor = $color("primaryText")
              this._searchPhrase = ""
              navbar.title = "标签收藏"
            } else {
              filterButton.tintColor = $color("systemLink")
              this._searchPhrase = text
              navbar.title = text
            }
            this.refresh()
          }
        })
      }
    }
  })
  const navbar = new CustomNavigationBar({
    props: {
      title: "标签",
      style: 2,
      leftBarButtonItems: [
        {
          symbol: "sidebar.left",
          handler: () => {
            (router.get("splitViewController") as SplitViewController).sideBarShown = true
          }
        }
      ],
      rightBarButtonItems: [
        {
          cview: filterButton
        },
        {
          cview: markedButton,
          width: 50
        }
      ]
    }
  })
  const menu = new Menu({
    props: {
      index: 0,
      tintColor: $color("systemLink"),
      dynamicWidth: true,
      items: ["短语"]
    },
    layout: (make, view) => {
      make.top.equalTo(view.prev.bottom).inset(-0.5)
      make.left.right.inset(10)
      make.height.equalTo(40.5)
    },
    events: {
      changed: sender => {
        list.view.scrollToOffset({ x: 0, y: this._sectionCumYs[sender.index] + 1 })
      }
    }
  })
  const list = new List({
    props: {
      style: 2,
      sectionTitleHeight: 40,
      rowHeight: 44,
      reorder: true,
      crossSections: false,
      actions: [
        {
          title: "删除",
          color: $color("red"),
          handler: (sender, indexPath) => {
          }
        },
        {
          title: "修改",
          color: $color("orange"),
          handler: (sender, indexPath) => {
          }
        }
      ],
      template: {
        views: [
          {
            type: "label",
            props: {
              id: "addCustomPhrase",
              align: $align.center,
              text: "+ 添加自定义短语",
              textColor: $color("systemLink")
            },
            layout: $layout.fill
          },
          {
            type: "view",
            props: {
              id: "customPhraseView",
            },
            layout: (make, view) => {
              make.left.inset(15)
              make.right.inset(5)
              make.top.bottom.inset(0)
            },
            views: [
              {
                type: "label",
                props: {
                  id: "content",
                  lines: 2,
                  font: $font(14)
                },
                layout: (make, view) => {
                  make.top.bottom.inset(5)
                  make.left.right.inset(10)
                }
              }
            ]
          },
          {
            type: "view",
            props: {
              id: "tagView",
            },
            layout: $layout.fill,
            views: [
              {
                type: "button",
                props: {
                  id: "infoButton",
                  bgcolor: $color("clear")
                },
                layout: (make, view) => {
                  make.width.equalTo(45)
                  make.top.bottom.right.inset(0)
                },
                events: {
                  tapped: async sender => {
                    const {namespace, name} = sender.info as { namespace: TagNamespace, name: string }
                    const translationData = configManager.getTranslationDetailedInfo(namespace, name)
                    const markedTag = configManager.getMarkedTag(namespace, name)
                    await showDetailedInfoView(namespace, name, translationData, markedTag);
                  }
                },
                views: [{
                  type: "image",
                  props: {
                    symbol: "info.circle",
                    tintColor: $color("primaryText"),
                    contentMode: 1
                  },
                  layout: (make, view) => {
                    make.center.equalTo(view.super);
                    make.size.equalTo($size(24, 24));
                  }
                }]
              },
              {
                type: "view",
                props: {},
                layout: (make, view) => {
                  make.left.top.bottom.inset(0);
                  make.width.equalTo(45);
                },
                views: [
                  {
                    type: "image",
                    props: {
                      id: "symbol",
                      tintColor: $color("systemGray5"),
                    },
                    layout: (make, view) => {
                      make.left.inset(15)
                      make.centerY.equalTo(view.super);
                      make.size.equalTo($size(20, 20));
                    }
                  }
                ]
              },
              {
                type: "label",
                props: {
                  id: "tag",
                  lines: 2,
                  font: $font("bold", 14)
                },
                layout: (make, view) => {
                  make.right.equalTo(view.prev.prev.left)
                  make.top.bottom.inset(0)
                  make.left.equalTo(view.prev.right)
                }
              }
            ]
          }
        ]
      }
    },
    layout: (make, view) => {
      make.top.equalTo(view.prev.bottom)
      make.left.right.inset(0)
      make.bottom.equalTo(view.super.safeAreaBottom).inset(50)
    },
    events: {
      pulled: async sender => {
        sender.beginRefreshing()
        this.refresh()
        sender.endRefreshing()
      },
      swipeEnabled: (sender, indexPath) => {
        return indexPath.section === 1;
      },
      canMoveItem: (sender, indexPath) => {
        return indexPath.section === 1;
      },
      didScroll: sender => {
        const contentOffsetY = sender.contentOffset.y
        const index = this._sectionCumYs.findIndex((y, i) => {
          return y > contentOffsetY
        })
        if (index === -1) return
        menu.view.index = Math.max(index - 1, 0)
      },
      didSelect: async (sender, indexPath, data) => {
        console.log(indexPath)
      },
      didLongPress: async (sender, indexPath, data) => {
        console.log(indexPath)
        const { namespace, name } = data.infoButton.info as { namespace: TagNamespace, name: string };
        const translationData = configManager.getTranslationDetailedInfo(namespace, name)
        const markedTag = configManager.getMarkedTag(namespace, name)
        await showDetailedInfoView(namespace, name, translationData, markedTag);
      }
    }
  })
  this.cviews = {
    markedButton,
    filterButton,
    navbar,
    menu,
    list
  }
  this.rootView.views = [navbar, menu, list]
}

  refresh() {
    const { data, menuItems } = mapData(
      this._searchPhrase,
      configManager.tagManagerOnlyShowBookmarked,
      configManager.savedSearchKeywords,
      configManager.translationDict,
      configManager.markedTagDict,
      configManager.markedUploaders
    )
    this.cviews.list.view.data = data
    this.cviews.menu.view.index = 0
    this.cviews.menu.view.items = menuItems
    const ys = [84].concat(this.cviews.list.view.data.slice(1).map(i => i.rows.length * 44 + 57.375))
    // 重新计算 sectionCumYs: ys 的累加和
    this._sectionCumYs = ys.map((_, i) => ys.slice(0, i + 1).reduce((a, b) => a + b))
  }
  

}
