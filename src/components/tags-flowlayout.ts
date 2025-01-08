import { Base } from "jsbox-cview";
import { namespaceColor, tagColor, namespaceTranslations } from "../utils/glv";
import { EHGallery, EHNetworkError, EHServiceUnavailableError, EHTimeoutError, TagNamespace, tagNamespaceMostUsedAlternateMap } from "ehentai-parser";
import { configManager } from "../utils/config";
import { showDetailedInfoView } from "./detailed-info-view";
import { api } from "../utils/api";
import { appLog, buildSearchTerm } from "../utils/tools";

const TAG_FONT_SIZE = 15;

const selectTagColor = (marked: boolean, watched: boolean, hidden: boolean) => {
  if (hidden) return tagColor.hidden;
  if (watched) return tagColor.watched;
  if (marked) return tagColor.marked;
  return $color("tertiarySurface");
}

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
 * 
 * 属性:
 * - width
 * - frame
 */
class NamespaceLabel extends Base<UILabelView, UiTypes.LabelOptions> {
  _defineView: () => UiTypes.LabelOptions;
  width: number;
  constructor(namespace: TagNamespace) {
    super();
    const text = namespaceTranslations[namespace];
    this.width = NAMESPACE_CHINESE_WIDTH;
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
 * 
 * props:
 * - namespace: TagNamespace;
 * - name: string;
 * 
 * events:
 * - tapped: () => void;
 * 
 */
class TagView extends Base<UIView, UiTypes.ViewOptions> {
  private _namespace: TagNamespace;
  private _name: string;
  private _selected: boolean = false;
  private _isHandlingMytags: boolean = false; // 用于判断是否正在处理 mytags
  width: number;
  _defineView: () => UiTypes.ViewOptions;
  constructor({ props, events }: {
    props: {
      namespace: TagNamespace;
      name: string;
    },
    events: {
      tapped: () => void;
    }
  }) {
    super()
    this._namespace = props.namespace;
    this._name = props.name;
    const translation = configManager.translate(this._namespace, this._name)
    const markedTag = configManager.getMarkedTag(this._namespace, this._name)
    const marked = Boolean(markedTag)
    const watched = markedTag?.watched ?? false
    const hidden = markedTag?.hidden ?? false

    const text = translation || this._name;
    this.width = Math.ceil($text.sizeThatFits({
      text,
      width: 1000,
      font: $font(TAG_FONT_SIZE)
    }).width) + 16;
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        bgcolor: selectTagColor(marked, watched, hidden),
        cornerRadius: 10,
        smoothCorners: true,
        userInteractionEnabled: true,
        menu: {
          title: tagNamespaceMostUsedAlternateMap[props.namespace] + ": " + props.name,
          items: [
            {
              title: "立即搜索",
              symbol: "magnifyingglass",
              handler: (sender) => {
                // TODO
              }
            },
            {
              title: "复制",
              symbol: "doc.on.doc",
              handler: (sender) => {
                $clipboard.text = buildSearchTerm(this._namespace, this._name);
                $ui.toast("已复制")
              }
            },
            {
              title: "详细信息",
              symbol: "info.circle",
              handler: async (sender) => {
                if (configManager.syncMyTags) {
                  await this.updateTagDetailsWithSync(this._namespace, this._name)
                } else {
                  await this.updateTagDetailsOnLocal(this._namespace, this._name)
                }
              }
            }
          ]
        }
      },
      layout: (make, view) => {
        make.top.inset(0);
        make.left.inset(0);
        make.height.equalTo(0);
        make.width.equalTo(0);
      },
      events: {
        tapped: sender => {
          this._selected = !this._selected;
          ($(this.id + "tag") as UILabelView).textColor = this._selected ? tagColor.selected : $color("primaryText");
          events.tapped();
        }
      },
      views: [{
        type: "label",
        props: {
          id: this.id + "tag",
          text,
          textColor: this._selected ? tagColor.selected : $color("primaryText"),
          font: $font(TAG_FONT_SIZE),
          align: $align.center,
        },
        layout: (make, view) => {
          make.center.equalTo(view.super)
        }
      }]
    })
  }

  /**
    * 更新标签详情，并同步到服务器
    * @param namespace 
    * @param name 
    * @returns 
    */
  async updateTagDetailsWithSync(namespace: TagNamespace, name: string) {
    if (!configManager.mytagsApiuid || !configManager.mytagsApikey) {
      $ui.error("错误：没有MyTags API Key")
      return;
    }
    if (this._isHandlingMytags) {
      $ui.warning("正在处理上一个请求，请稍后再试")
      return;
    }
    const translationData = configManager.getTranslationDetailedInfo(namespace, name);
    const markedTag = configManager.getMarkedTag(namespace, name);
    const params = await showDetailedInfoView(namespace, name, translationData, markedTag);
    // 对比原来的数据, 查看是否有变化
    const { marked, watched, hidden, weight } = params;
    if ( // 没有变化的两种情况
      (!marked && !markedTag)
      || (marked && markedTag && markedTag.weight === weight && markedTag.watched === watched && markedTag.hidden === hidden)
    ) {
      return;
    } else {
      try {
        this._isHandlingMytags = true;
        if (marked && !markedTag) { // 新增
          const mytags = await api.addTag({
            namespace,
            name,
            weight,
            watched,
            hidden
          });
          configManager.updateAllMarkedTags(mytags.tags);
        } else if (!marked && markedTag) { // 删除
          const mytags = await api.deleteTag({
            tagid: markedTag.tagid
          });
          configManager.updateAllMarkedTags(mytags.tags);
        } else if (marked && markedTag) { // 修改
          await api.updateTag({
            apiuid: configManager.mytagsApiuid,
            apikey: configManager.mytagsApikey,
            tagid: markedTag.tagid,
            weight,
            watched,
            hidden,
          });
          configManager.updateMarkedTag({
            tagid: markedTag.tagid,
            namespace,
            name,
            weight,
            watched,
            hidden
          });
        }
        this._isHandlingMytags = false;
        this.refresh();
      } catch (e: any) {
        appLog(e, "error");
        this._isHandlingMytags = false;
        if (e instanceof EHServiceUnavailableError) {
          $ui.error("操作失败：服务不可用");
        } else if (e instanceof EHTimeoutError) {
          $ui.error(`操作失败：请求超时`);
        } else if (e instanceof EHNetworkError) {
          $ui.error(`操作失败：网络错误`);
        } else {
          $ui.error(`操作失败：未知原因`);
        }
      }
    }
  }

  /**
   * 仅在本地更新标签详情
   * @param namespace 
   * @param name 
   */
  async updateTagDetailsOnLocal(namespace: TagNamespace, name: string) {
    const translationData = configManager.getTranslationDetailedInfo(namespace, name);
    const markedTag = configManager.getMarkedTag(namespace, name);
    const params = await showDetailedInfoView(namespace, name, translationData, markedTag);
    // 对比原来的数据, 查看是否有变化
    const { marked, watched, hidden, weight } = params;
    if ( // 没有变化的两种情况
      (!marked && !markedTag)
      || (marked && markedTag && markedTag.weight === weight && markedTag.watched === watched && markedTag.hidden === hidden)
    ) {
      return;
    } else {
      if (marked && !markedTag) { // 新增
        configManager.addMarkedTag({
          tagid: 0,
          namespace,
          name,
          weight,
          watched,
          hidden
        });
      } else if (!marked && markedTag) { // 删除
        configManager.deleteMarkedTag(namespace, name);
      } else if (marked && markedTag) { // 修改
        configManager.updateMarkedTag({
          tagid: markedTag.tagid,
          namespace,
          name,
          weight,
          watched,
          hidden
        });
      }
      this.refresh();
    }
  }

  refresh() {
    const markedTag = configManager.getMarkedTag(this._namespace, this._name);
    const marked = Boolean(markedTag);
    const watched = markedTag?.watched ?? false;
    const hidden = markedTag?.hidden ?? false;
    this.view.bgcolor = selectTagColor(marked, watched, hidden);
    ($(this.id + "tag") as UILabelView).textColor = this._selected ? tagColor.selected : $color("primaryText");
  }

  get namespace() {
    return this._namespace;
  }

  get name() {
    return this._name;
  }

  get selected() {
    return this._selected;
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
 * - taglist: EHGallery["taglist"]
 * 
 * 属性:
 * - tagViews
 */
export class TagsFlowlayout extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  _width: number;
  tagViews: { namespace: NamespaceLabel; tags: TagView[] }[];

  constructor(taglist: EHGallery["taglist"], handlers: {
    tapped: () => void;
  }) {
    super();
    this._width = 0;
    this.tagViews = taglist.map(({ tags, namespace }) => {
      return {
        namespace: new NamespaceLabel(namespace),
        tags: tags.map(name => new TagView({
          props: { namespace, name },
          events: {
            tapped: () => { handlers.tapped() }
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

  get selectedTags() {
    return this.tagViews.reduce((acc, { tags }) => {
      tags.forEach(tag => {
        if (tag.selected) {
          acc.push({
            namespace: tag.namespace,
            name: tag.name
          });
        }
      })
      return acc;
    }, [] as { namespace: TagNamespace, name: string }[])
  }

  _layoutTags() {
    const totalWidth = this._width;
    const itemHeight = 30;
    const itemSpacing = 5;
    const sectionSpacing = 10;
    const namespaceWidth = NAMESPACE_CHINESE_WIDTH;
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
    const namespaceWidth = NAMESPACE_CHINESE_WIDTH;
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
