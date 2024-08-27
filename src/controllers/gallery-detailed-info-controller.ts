import { EHGallery } from "ehentai-parser";
import { BaseController, CustomNavigationBar, List, textDialog } from "jsbox-cview";
import { invisibleCauseMap } from "../utils/glv";
import { toSimpleUTCTimeString } from "../utils/tools";

export class GalleryDetailedInfoController extends BaseController {
  constructor(infos: EHGallery) {
    super()
    const navBar = new CustomNavigationBar({
      props: {
        title: "详细信息",
        popButtonEnabled: true
      }
    })
    const list = new List({
      props: {
        autoRowHeight: true,
        estimatedRowHeight: 44,
        actions: [{
          title: "选择文本",
          color: $color("gray"), // default to gray
          handler: async (sender, indexPath) => {
            await textDialog({
              title: sender.object(indexPath).title.text,
              text: sender.object(indexPath).content.text,
              editable: false
            })
          }
        }],
        template: {
          views: [
            {
              type: "label",
              props: {
                id: "title",
                font: $font("bold", 14),
                align: $align.left,
              },
              layout: (make, view) => {
                make.left.equalTo(15);
                make.size.equalTo($size(65, 24));
                make.centerY.equalTo(view.super);
              }
            },
            {
              type: "label",
              props: {
                id: "content",
                lines: 0,
                font: $font(14),
                align: $align.right
              },
              layout: (make, view) => {
                const insets = $insets(10, 85, 10, 15);
                make.edges.equalTo(view.super).insets(insets);
              }
            }
          ]
        },
        data: _mapData(infos)
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom)
        make.left.right.bottom.equalTo(view.super.safeArea)
      },
      events: {
        swipeEnabled: (sender, indexPath) => {
          return ["标题（英）", "标题（日）"].includes(sender.object(indexPath).title.text)
        },
        didSelect: (sender, indexPath) => {
          $clipboard.text = sender.object(indexPath).content.text
          $ui.toast("已复制" + sender.object(indexPath).title.text)
        }
      }
    })
    this.cviews = { navBar, list }
    this.rootView.views = [navBar, list]
  }
}

function _mapData(infos: EHGallery, exhentai: boolean = true): { title: { text: string }, content: { text: string } }[] {
  const data: { title: { text: string }, content: { text: string } }[] = []
  data.push({ title: { text: "GID" }, content: { text: infos.gid.toString() } })
  data.push({ title: { text: "TOKEN" }, content: { text: infos.token } })
  data.push({ title: { text: "URL" }, content: { text: `https://e${exhentai ? "x" : "-"}hentai.org/g/${infos.gid}/${infos.token}/` } })
  data.push({ title: { text: "标题（英）" }, content: { text: infos.english_title } })
  if (infos.japanese_title) {
    data.push({ title: { text: "标题（日）" }, content: { text: infos.japanese_title } })
  }
  data.push({ title: { text: "缩略图" }, content: { text: infos.thumbnail_url } })
  data.push({ title: { text: "类别" }, content: { text: infos.category } })
  data.push({ title: { text: "上传者" }, content: { text: infos.uploader || "(已放弃)" } })
  data.push({ title: { text: "发布时间" }, content: { text: toSimpleUTCTimeString(infos.posted_time) } })
  if (infos.parent_gid && infos.parent_token) {
    data.push({ title: { text: "上一版本" }, content: { text: `https://e${exhentai ? "x" : "-"}hentai.org/g/${infos.parent_gid}/${infos.parent_token}/` } })
  }
  let visibleCauseText = ""
  if (!infos.visible && infos.invisible_cause) {
    visibleCauseText = invisibleCauseMap[infos.invisible_cause]
  }
  const visibleText = infos.visible ? "是" : "否" + (visibleCauseText ? `(${visibleCauseText})` : "")
  data.push({ title: { text: "是否可见" }, content: { text: visibleText } })
  let languageText = infos.language
  if (infos.translated) {
    languageText += ' (翻译)'
  } else if (infos.rewrited) {
    languageText += ' (改写)'
  }
  data.push({ title: { text: "语言" }, content: { text: languageText } })
  data.push({ title: { text: "大小" }, content: { text: infos.file_size } })
  data.push({ title: { text: "页数" }, content: { text: infos.length.toString() } })
  data.push({ title: { text: "平均分" }, content: { text: infos.average_rating.toString() } })
  data.push({ title: { text: "评分次数" }, content: { text: infos.rating_count.toString() } })
  data.push({ title: { text: "收藏次数" }, content: { text: infos.favorite_count.toString() } })
  return data
}