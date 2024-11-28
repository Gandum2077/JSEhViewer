import { BaseController, ContentView, CustomNavigationBar, List, Menu, router, SplitViewController, SymbolButton, TabBarController } from "jsbox-cview";
import { configManager } from "../utils/config";
import { namespaceTranslations, tagColor } from "../utils/glv";
import { MarkedTagDict } from "../types";
import { EHSearchTerm, TagNamespace, tagNamespaces } from "ehentai-parser";
import { showDetailedInfoView } from "../components/detailed-info-view";
import { HomepageController } from "./homepage-controller";

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
  translationList: { namespace: TagNamespace, name: string, translation: string }[],
  markedTagDict: MarkedTagDict,
  markedUploaders: string[],
  extraSavedTgs: { namespace: TagNamespace, name: string; }[]
) {
  const data: { title: string, rows: any[] }[] = []
  const menuItems: string[] = []
  // 添加上传者分组
  const mappedMarkedUploaders = markedUploaders
    .filter(uploader => {
      return !searchPhrase || uploader.includes(searchPhrase)
    })
    .map(uploader => {
      return {
        infoButton: { hidden: true, info: { uploader } },
        symbol: {
          symbol: "bookmark.fill",
          tintColor: tagColor.marked
        },
        tag: { text: uploader }
      }
    })
  if (mappedMarkedUploaders.length) {
    data.push({
      title: "上传者",
      rows: mappedMarkedUploaders
    })
    menuItems.push("上传者")
  }

  // 然后按照顺序添加默认分组
  for (const namespace of tagNamespaces) {
    const tags = translationList.filter(i => i.namespace === namespace)
    const extraTags = extraSavedTgs.filter(i => i.namespace === namespace)
    const markedTags = markedTagDict[namespace]

    const mappedRows = tags
      .concat(extraTags.map(n => ({ namespace: n.namespace, name: n.name, translation: "" })))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(n => ({
        namespace: n.namespace,
        name: n.name,
        translation: n.translation,
        marked: Boolean(markedTags[n.name])
      }))
      .filter(n => {
        return (!onlyShowMarkred || n.marked) && (!searchPhrase || n.name.includes(searchPhrase) || n.translation.includes(searchPhrase))
      })
      .map(n => {
        let style = TagType.unmarked
        if (n.marked) {
          const marked = markedTagDict[namespace][n.name]
          const watched = marked.watched
          const hidden = marked.hidden
          if (watched) {
            style = TagType.watched
          } else if (hidden) {
            style = TagType.hidden
          } else if (marked) {
            style = TagType.marked
          }
        }
        return {
          infoButton: { info: { namespace, name: n.name }, hidden: false },
          symbol: {
            symbol: tagSymbol[style],
            tintColor: tagSymbolColor[style]
          },
          tag: { text: n.translation ? n.translation + "  " + n.name : n.name },
        }
      })

    if (!mappedRows.length) continue

    const title = namespaceTranslations[namespace]
    data.push({
      title,
      rows: mappedRows
    })
    menuItems.push(title)
  }
  if (menuItems.length === 0) { menuItems.push("") }
  return { data, menuItems }
}

export class TagManagerController extends BaseController {
  private _sectionCumYs: number[] = [0] // 用于记录每个 section 的 Y 坐标(累加), 用于判断当前滚动到了哪个 section
  private _searchPhrase = ""
  private _uploadersShown = false // 用于判断是否显示了上传者
  private _selectedSearchTerms: EHSearchTerm[] = [] // 用于记录已经被选中的搜索词
  cviews: {
    markedButton: SymbolButton;
    filterButton: SymbolButton;
    createNewSearchButton: SymbolButton;
    navbar: CustomNavigationBar;
    menu: Menu;
    list: List;
    emptyView: ContentView;
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
    const createNewSearchButton = new SymbolButton({
      props: {
        symbol: "plus.magnifyingglass"
      },
      events: {
        tapped: async () => {
          if (this._selectedSearchTerms.length === 0) {
            $ui.toast("请长按标签以加入新建搜索")
          } else {
            // TODO: 此处应该跳转到新建搜索页面
            this.cviews.createNewSearchButton.tintColor = $color("primaryText")
          }
        }
      }
    })
    const filterButton = new SymbolButton({
      props: {
        symbol: "line.3.horizontal.decrease.circle",
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
                filterButton.symbol = "line.3.horizontal.decrease.circle"
                this._searchPhrase = ""
                navbar.title = "标签收藏"
              } else {
                filterButton.tintColor = $color("systemLink")
                filterButton.symbol = "line.3.horizontal.decrease.circle.fill"
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
          },
          {
            cview: markedButton,
            width: 50
          }
        ],
        rightBarButtonItems: [
          {
            cview: createNewSearchButton
          },
          {
            cview: filterButton
          }
        ]
      }
    })
    const menu = new Menu({
      props: {
        index: 0,
        tintColor: $color("systemLink"),
        dynamicWidth: true,
        items: [""]
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom).inset(-0.5)
        make.left.right.inset(0)
        make.height.equalTo(40.5)
      },
      events: {
        changed: sender => {
          list.view.scrollToOffset({ x: 0, y: sender.index === 0 ? 0 : this._sectionCumYs[sender.index - 1] })
        }
      }
    })
    const list = new List({
      props: {
        style: 2,
        sectionTitleHeight: 40,
        rowHeight: 44,
        menu: {
          items: [
            {
              title: "立即搜索",
              symbol: "magnifyingglass",
              handler: (sender, indexPath) => {
                const info = this.cviews.list.view
                  .data[indexPath.section].rows[indexPath.row]
                  .infoButton.info as { namespace: TagNamespace, name: string } | { uploader: string }
                const searchTerm: EHSearchTerm = ("namespace" in info)
                  ? {
                    namespace: info.namespace,
                    term: info.name,
                    dollar: true,
                    tilde: false,
                    subtract: false
                  } : {
                    qualifier: "uploader",
                    term: info.uploader,
                    dollar: true,
                    tilde: false,
                    subtract: false
                  };
                (router.get("homepageController") as HomepageController)
                  .startLoad({ type: "front_page", options: { searchTerms: [searchTerm] } });
                (router.get("primaryViewController") as TabBarController).index = 0;
              }
            },
            {
              title: "新建搜索",
              symbol: "arrow.up.left.and.down.right.magnifyingglass",
              handler: (sender, indexPath) => {
                const info = this.cviews.list.view
                  .data[indexPath.section].rows[indexPath.row]
                  .infoButton.info as { namespace: TagNamespace, name: string } | { uploader: string }
                const searchTerm: EHSearchTerm = ("namespace" in info)
                  ? {
                    namespace: info.namespace,
                    term: info.name,
                    dollar: true,
                    tilde: false,
                    subtract: false
                  } : {
                    qualifier: "uploader",
                    term: info.uploader,
                    dollar: true,
                    tilde: false,
                    subtract: false
                  };
                // TODO: 此处应该跳转到新建搜索页面
              }
            },
            {
              title: "添加到“新建搜索”",
              symbol: "plus.magnifyingglass",
              handler: async (sender, indexPath) => {
                const info = this.cviews.list.view
                  .data[indexPath.section].rows[indexPath.row]
                  .infoButton.info as { namespace: TagNamespace, name: string } | { uploader: string }
                if ("namespace" in info) {
                  if (this._selectedSearchTerms.some(i => i.namespace === info.namespace && i.term === info.name)) {
                    $ui.toast("已经添加过了")
                    return
                  }
                } else {
                  if (this._selectedSearchTerms.some(i => i.qualifier === "uploader" && i.term === info.uploader)) {
                    $ui.toast("已经添加过了")
                    return
                  }
                }
                const searchTerm: EHSearchTerm = ("namespace" in info)
                  ? {
                    namespace: info.namespace,
                    term: info.name,
                    dollar: true,
                    tilde: false,
                    subtract: false
                  } : {
                    qualifier: "uploader",
                    term: info.uploader,
                    dollar: true,
                    tilde: false,
                    subtract: false
                  };
                this._selectedSearchTerms.push(searchTerm)
                this.cviews.createNewSearchButton.tintColor = $color("systemLink")
              }
            }
          ]
        },
        actions: [
          {
            title: "删除",
            color: $color("red"),
            handler: (sender, indexPath) => {
              configManager.deleteMarkedUploader(sender.data[indexPath.section].rows[indexPath.row].infoButton.info.uploader)
              this.refresh()
            }
          }
        ],
        template: {
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
                  const { namespace, name } = sender.info as { namespace: TagNamespace, name: string }
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
          return this._uploadersShown && indexPath.section === 0;
        },
        didScroll: sender => {
          const contentOffsetY = sender.contentOffset.y
          const index = this._sectionCumYs.findIndex(y => {
            return y > contentOffsetY
          })
          if (index === -1) return
          menu.view.index = Math.max(index, 0)
        },
        didSelect: (sender, indexPath) => {
          const info = this.cviews.list.view
            .data[indexPath.section].rows[indexPath.row]
            .infoButton.info as { namespace: TagNamespace, name: string } | { uploader: string }
          const searchTerm: EHSearchTerm = ("namespace" in info)
            ? {
              namespace: info.namespace,
              term: info.name,
              dollar: true,
              tilde: false,
              subtract: false
            } : {
              qualifier: "uploader",
              term: info.uploader,
              dollar: true,
              tilde: false,
              subtract: false
            };
          (router.get("homepageController") as HomepageController)
            .startLoad({ type: "front_page", options: { searchTerms: [searchTerm] } });
          (router.get("primaryViewController") as TabBarController).index = 0;
        }
      }
    })
    const emptyView = new ContentView({
      props: {
        hidden: true,
        bgcolor: $color("insetGroupedBackground")
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "square.stack.3d.up.slash",
            tintColor: $color("systemPlaceholderText")
          },
          layout: (make, view) => {
            make.centerX.equalTo(view.super)
            make.centerY.equalTo(view.super).offset(-50)
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
        make.left.right.bottom.equalTo(view.super)
        make.top.equalTo(view.prev.prev).offset(0.5)
      }
    })
    this.cviews = {
      markedButton,
      filterButton,
      createNewSearchButton,
      navbar,
      menu,
      list,
      emptyView
    }
    this.rootView.views = [navbar, menu, list, emptyView]
  }

  refresh() {
    const { data, menuItems } = mapData(
      this._searchPhrase,
      configManager.tagManagerOnlyShowBookmarked,
      configManager.translationList,
      configManager.markedTagDict,
      configManager.markedUploaders,
      configManager.extraSavedTags
    )
    this._uploadersShown = data.length > 0 && data[0].title === "上传者"
    this.cviews.list.view.data = data
    this.cviews.menu.view.index = 0
    this.cviews.menu.view.items = menuItems
    if (data.length === 0) {
      this.cviews.emptyView.view.hidden = false
    } else {
      this.cviews.emptyView.view.hidden = true
    }
    const ys = this.cviews.list.view.data.map(i => i.rows.length * 44 + 57.375)
    // 重新计算 sectionCumYs: ys 的累加和
    this._sectionCumYs = ys.map((_, i) => ys.slice(0, i + 1).reduce((a, b) => a + b))
  }


}
