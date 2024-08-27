// 去除translate变更的功能

import { Base, DynamicContextMenuView } from "jsbox-cview";
import {CompleteTagListItem } from "../types";
import { namespaceColor, tagColor, namespaceTranslations } from "../utils/glv";
import { buildSearchTerm } from "../utils/tools";
import { TagNamespace, tagNamespaceMostUsedAlternateMap } from "ehentai-parser";

const TAG_FONT_SIZE = 15;

const selectTagColor = (marked: boolean, watched: boolean, hidden: boolean) => {
  if (hidden) return tagColor.hidden;
  if (watched) return tagColor.watched;
  if (marked) return tagColor.marked;
  return $color("tertiarySurface");
}

const selectMenuIndex = (marked: boolean, watched: boolean, hidden: boolean) => {
  if (hidden) return 3;
  if (watched) return 2;
  if (marked) return 1;
  return 0;
}

const NAMESPACE_ENGLISH_WIDTH = Math.ceil($text.sizeThatFits({
  text: "cosplayer",
  width: 1000,
  font: $font(TAG_FONT_SIZE)
}).width) + 15;
const NAMESPACE_CHINESE_WIDTH = Math.ceil($text.sizeThatFits({
  text: "啊啊啊",
  width: 1000,
  font: $font(TAG_FONT_SIZE)
}).width) + 15;

/**
 * NamespaceLabel
 * 
 * 不能自行实现布局。width属性可以向外部告知自身所需的宽度，然后通过外部布局来设置自身的frame
 * 
 * 参数:
 * - namespace: Namespace
 * - translated: boolean
 * 
 * 属性:
 * - translated
 * - width
 * - frame
 */
class NamespaceLabel extends Base<UILabelView, UiTypes.LabelOptions> {
  _defineView: () => UiTypes.LabelOptions;
  private _namespace: TagNamespace;
  private _translated: boolean;
  width: number;
  constructor(namespace: TagNamespace, translated: boolean) {
    super();
    this._namespace = namespace;
    this._translated = translated;
    const text = translated ? namespaceTranslations[namespace] : namespace;
    this.width = translated ? NAMESPACE_CHINESE_WIDTH : NAMESPACE_ENGLISH_WIDTH;
    this._defineView = () => {
      return {
        type: "label",
        props: {
          id: this.id,
          text,
          bgcolor: namespaceColor[namespace],
          font: $font(TAG_FONT_SIZE),
          align: $align.center,
          cornerRadius: 10,
          smoothCorners: true,
          frame: $rect(0, 0, 0, 0),
        }
      }
    }
  }

  get translated() {
    return this._translated;
  }

  set translated(translated: boolean) {
    if (translated !== this._translated) {
      this._translated = translated;
      const text = translated ? namespaceTranslations[this._namespace] : this._namespace;
      this.width = translated ? NAMESPACE_CHINESE_WIDTH : NAMESPACE_ENGLISH_WIDTH;
      this.view.text = text;
    }
  }

  set frame(frame: JBRect) {
    this.view.frame = frame;
  }

  get frame() {
    return this.view.frame;
  }
}

/**
 * TagView
 * 
 * 不能自行实现布局。width属性可以向外部告知自身所需的宽度，然后通过外部布局来设置自身的frame  
 * 事件handleTag会返回一个新的、深拷贝的tag对象
 * 
 * props:
 * - tag: CompleteTagListItem["tags"][0]
 * - translated: boolean
 * 
 * events:
 * - tapped: (tag: CompleteTagListItem["tags"][0]) => void;
 * - tagModified: (tag: CompleteTagListItem["tags"][0]) => void;
 * - searchHandler: (tag: CompleteTagListItem["tags"][0]) => void;
 * - detailedInfoHandler: (tag: CompleteTagListItem["tags"][0]) => void;
 * 
 * 属性:
 * - translated
 */
class TagView extends DynamicContextMenuView {
  width: number;
  private _translated: boolean;
  constructor({ props, events }: {
    props: {
      tag: CompleteTagListItem["tags"][0],
      translated: boolean,
    },
    events: {
      tapped: (tag: CompleteTagListItem["tags"][0]) => void;
      tagModified: (tag: CompleteTagListItem["tags"][0]) => void;
      searchHandler: (tag: CompleteTagListItem["tags"][0]) => void;
      detailedInfoHandler: (tag: CompleteTagListItem["tags"][0]) => void;
    }
  }) {
    const text = props.translated ? props.tag.translation || props.tag.name : props.tag.name;
    super({
      classname: "DynamicContextMenuView_TagView",
      generateContextMenu: sender => {
        const info = sender.info as CompleteTagListItem["tags"][0]
        const commonMenuItems = [
          {
            title: "立即搜索",
            symbol: "magnifyingglass",
            handler: () => {
            events.searchHandler(info);
            }
          },
          {
            title: "复制",
            symbol: "doc.on.doc",
            handler: () => {
              $clipboard.text = buildSearchTerm(info.namespace, info.name);
            }
          },
          {
            title: "详细信息",
            symbol: "info.circle",
            handler: () => {
              events.detailedInfoHandler(info);
            }
          }
        ]
        const menuItemMarked = {
          title: "加入我的标签",
          symbol: "bookmark",
          handler: () => {
            info.marked = true;
            info.watched = false;
            info.hidden = false;
            sender.info = info;
            sender.bgcolor = selectTagColor(info.marked, info.watched, info.hidden);
            events.tagModified(info);
          }
        }
        const menuItemUnmarked = {
          title: "从我的标签中移除",
          symbol: "bookmark.slash",
          handler: () => {
            info.marked = false;
            info.watched = false;
            info.hidden = false;
            sender.info = info;
            sender.bgcolor = selectTagColor(info.marked, info.watched, info.hidden);
            events.tagModified(info);
          }
        }
        const menuItemWatched = {
          title: "订阅",
          symbol: "bell",
          handler: () => {
            info.marked = true;
            info.watched = true;
            info.hidden = false;
            sender.info = info;
            sender.bgcolor = selectTagColor(info.marked, info.watched, info.hidden);
            events.tagModified(info);
          }
        }
        const menuItemUnwatched = {
          title: "取消订阅",
          symbol: "bell.slash",
          handler: () => {
            info.marked = true;
            info.watched = false;
            info.hidden = false;
            sender.info = info;
            sender.bgcolor = selectTagColor(info.marked, info.watched, info.hidden);
            events.tagModified(info);
          }
        }
        const menuItemHidden = {
          title: "屏蔽",
          symbol: "square.slash",
          handler: () => {
            info.marked = true;
            info.watched = false;
            info.hidden = true;
            sender.info = info;
            sender.bgcolor = selectTagColor(info.marked, info.watched, info.hidden);
            events.tagModified(info);
          }
        }
        const menuItemUnhidden = {
          title: "取消屏蔽",
          symbol: "square",
          handler: () => {
            info.marked = true;
            info.watched = false;
            info.hidden = false;
            sender.info = info;
            sender.bgcolor = selectTagColor(info.marked, info.watched, info.hidden);
            events.tagModified(info);
          }
        }
        const menuList = [
          { // 对应 marked = false, watched = false, hidden = false
            title: tagNamespaceMostUsedAlternateMap[info.namespace] + ": " + info.name,
            items: [
              menuItemMarked,
              menuItemWatched,
              menuItemHidden,
              ...commonMenuItems
            ]
          },
          { // 对应 marked = true, watched = false, hidden = false
            title: tagNamespaceMostUsedAlternateMap[info.namespace] + ": " + info.name,
            items: [
              menuItemUnmarked,
              menuItemWatched,
              menuItemHidden,
              ...commonMenuItems
            ]
          },
          { // 对应 marked = true, watched = true, hidden = false
            title: tagNamespaceMostUsedAlternateMap[info.namespace] + ": " + info.name,
            items: [
              menuItemUnmarked,
              menuItemUnwatched,
              menuItemHidden,
              ...commonMenuItems
            ]
          },
          { // 对应 marked = true, watched = false, hidden = true
            title: tagNamespaceMostUsedAlternateMap[info.namespace] + ": " + info.name,
            items: [
              menuItemUnmarked,
              menuItemWatched,
              menuItemUnhidden,
              ...commonMenuItems
            ]
          },
        ]
        return menuList[selectMenuIndex(info.marked, info.watched, info.hidden)];
      },
      props: {
        info: { ...props.tag },
        bgcolor: selectTagColor(props.tag.marked, props.tag.watched, props.tag.hidden),
        cornerRadius: 10,
        smoothCorners: true,
      },
      layout: (make, view) => {
        make.top.inset(0);
        make.left.inset(0);
        make.height.equalTo(0);
        make.width.equalTo(0);
      },
      events: {
        tapped: sender => {
          this.view.info = { ...this.view.info, selected: !this.view.info.selected };
          (sender.get("tag") as UILabelView).textColor = this.view.info.selected ? tagColor.selected : $color("primaryText");
          events.tapped(this.view.info as CompleteTagListItem["tags"][0]);
        }
      },
      views: [{
        type: "label",
        props: {
          id: "tag",
          text: text,
          textColor: props.tag.selected ? tagColor.selected : $color("primaryText"),
          font: $font(TAG_FONT_SIZE),
          align: $align.center,
        },
        layout: (make, view) => {
          make.center.equalTo(view.super)
        }
      }]
    })
    this._translated = props.translated;
    this.width = Math.ceil($text.sizeThatFits({
      text,
      width: 1000,
      font: $font(TAG_FONT_SIZE)
    }).width) + 16;
  }

  get tag() {
    return { ...this.view.info } as CompleteTagListItem["tags"][0];
  }

  set translated(translated: boolean) {
    if (translated === this._translated) return;
    this._translated = translated;
    const text = translated ? this.view.info.translation || this.view.info.name : this.view.info.name
    this.width = Math.ceil($text.sizeThatFits({
      text,
      width: 1000,
      font: $font(TAG_FONT_SIZE)
    }).width) + 16;
    (this.view.get("tag") as UILabelView).text = text;
  }

  get translated() {
    return this._translated;
  }

  set frame(frame: JBRect) {
    this.view.updateLayout((make) => {
      make.left.inset(frame.x);
      make.top.inset(frame.y);
      make.width.equalTo(frame.width);
      make.height.equalTo(frame.height);
    })
  }
}

/**
 * TagsFlowlayout
 * 
 * **此控件的布局中必须包含高度的约束，否则无法正常改变自身高度**
 * 
 * 参数:
 * - taglist: CompleteTagListItem[]
 * - translated: boolean
 * 
 * 属性:
 * - tagViews
 */
export class TagsFlowlayout extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  _width: number;
  _translated: boolean = true;
  tagViews: { namespace: NamespaceLabel; tags: TagView[] }[];

  constructor(taglist: CompleteTagListItem[]) {
    super();
    this._width = 0;
    this.tagViews = taglist.map(({ tags, namespace }) => {
      return {
        namespace: new NamespaceLabel(namespace, this._translated),
        tags: tags.map(tag => new TagView({
          props: {tag, translated: this._translated},
          events: {
            tapped: tag => {console.log(tag)},
            tagModified: tag => {console.log(tag)},
            searchHandler: tag => {console.log(tag)},
            detailedInfoHandler: tag => {console.log(tag)}
          }
        }))
      }
    });
    const definitions: UiTypes.AllViewOptions[] = []
    this.tagViews.forEach(({ namespace, tags }) => {
      definitions.push(namespace.definition);
      tags.forEach(tag => {
        definitions.push(tag.definition);
      })
    })
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id
        },
        events: {
          layoutSubviews: sender => {
            if (this._width !== sender.frame.width) {
              this._width = sender.frame.width;
              const height = this._layoutTags();
              sender.updateLayout((make) => make.height.equalTo(height));
            }
          },
        },
        views: definitions,
        layout: $layout.fill
      }
    }
  }

  _layoutTags() {
    const totalWidth = this._width;
    const itemHeight = 30;
    const itemSpacing = 5;
    const sectionSpacing = 10;
    const namespaceWidth = this._translated ? NAMESPACE_CHINESE_WIDTH : NAMESPACE_ENGLISH_WIDTH;
    const tagsTotalWidth = totalWidth - namespaceWidth - sectionSpacing;
    let x = 0;
    let y = 0;
    this.tagViews.forEach(({ namespace, tags }) => {
      namespace.frame = $rect(0, y, namespaceWidth, itemHeight);
      x = namespaceWidth + sectionSpacing;
      let rowWidth = 0;
      tags.forEach(tag => {
        if (rowWidth + tag.width > tagsTotalWidth) {
          y += itemHeight + itemSpacing;
          x = namespaceWidth + sectionSpacing;
          rowWidth = 0;
        }
        tag.frame = $rect(x, y, Math.min(tag.width, tagsTotalWidth), itemHeight);
        x += tag.width + itemSpacing;
        rowWidth += tag.width + itemSpacing;
      })
      y += itemHeight + sectionSpacing;
      x = namespaceWidth + sectionSpacing;
    })
    return y;
  }

  heightToWidth(width: number) {
    if (width === 0) return 1
    const totalWidth = width;
    const itemHeight = 30;
    const itemSpacing = 5;
    const sectionSpacing = 10;
    const namespaceWidth = this._translated ? NAMESPACE_CHINESE_WIDTH : NAMESPACE_ENGLISH_WIDTH;
    const tagsTotalWidth = totalWidth - namespaceWidth - sectionSpacing;
    let x = 0;
    let y = 0;
    this.tagViews.forEach(({ namespace, tags }) => {
      x = namespaceWidth + sectionSpacing;
      let rowWidth = 0;
      tags.forEach(tag => {
        if (rowWidth + tag.width > tagsTotalWidth) {
          y += itemHeight + itemSpacing;
          x = namespaceWidth + sectionSpacing;
          rowWidth = 0;
        }
        x += tag.width + itemSpacing;
        rowWidth += tag.width + itemSpacing;
      })
      y += itemHeight + sectionSpacing;
      x = namespaceWidth + sectionSpacing;
    })
    return y + sectionSpacing;
  }
}
