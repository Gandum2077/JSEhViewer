import { BaseController, Web, Button, setLayer, layerCommonOptions } from "jsbox-cview";
import { EHGallery } from "ehentai-parser";

export class GalleryCommentController extends BaseController {
  private _infos?: EHGallery
  private _sortType: "time" | "score" = "time"
  constructor() {
    super({
      props: { bgcolor: $color("primarySurface") }
    })
    const addCommentButton = new Button({
      props: {
        bgcolor: $color("systemLink")
      },
      layout: (make, view) => {
        setLayer(view, layerCommonOptions.circleViewShadow)
        make.size.equalTo($size(50, 50))
        make.right.inset(25)
        make.bottom.inset(40)
      },
      views: [{
        type: "image",
        props: {
          symbol: "plus",
          tintColor: $color("white")
        },
        layout: (make, view) => {
          make.center.equalTo(view.super)
          make.size.equalTo($size(25, 25))
        }
      }],
      events: {
        tapped: () => {
          if (!this._infos) return;
          $ui.alert("addCommentButton")
        }
      }
    })
    const webview = new Web({
      props: {
        html: $file.read("assets/gallery-comment.html").string,
        allowsLinkPreview: false,
        allowsNavigation: false,
        showsProgress: false,
        inlineMedia: false,
        transparent: true,
        script: `document.documentElement.setAttribute('data-theme', '${$device.isDarkMode ? "dark" : "light"}');`
      },
      layout: $layout.fill,
      events: {
        themeChanged: (sender, isDarkMode) => {
          sender.notify({
            event: "toggleTheme",
            message: { isDarkMode }
          })
        },
        decideNavigation: (sender, action) => {
          // TODO 阻止不合规的请求
          if (action.type === 0 && action.requestURL === "https://exhentai.org/") {
            return false
          } else if (action.type === 0 && action.requestURL !== "https://exhentai.org/") {
            $ui.alert({
              title: "跳转至默认浏览器",
              message: action.requestURL,
              actions: [
                {
                  title: "取消"
                },
                {
                  title: "打开",
                  handler: () => {
                    $app.openURL(action.requestURL)
                  }
                }
              ]
            })
            return false
          }
          return true
        },
        handleApi: (message: {
          action: "showVoteDetails" | "postEditComment" | "voteComment" | "sortByScore" | "sortByTime",
          info: any
        }) => {
          if (!this._infos) return;
          switch (message.action) {
            case "showVoteDetails":
              const { comment_id } = message.info as { comment_id: string }
              const comment = this._infos.comments.find(comment => comment.comment_id === parseInt(comment_id))
              if (comment && comment.votes) {
                const base = comment.votes.base
                const baseStr = base === 0 ? "0" : base > 0 ? `+${base}` : `${base}`
                const votersStr = comment.votes.voters.map(voter => {
                  const score = voter.score
                  const scoreStr = score === 0 ? "0" : score > 0 ? `+${score}` : `${score}`
                  return `${voter.voter} ${scoreStr}`
                }).join("\n")
                const otherVoters = comment.votes.remaining_voter_count ? `\n还有另外${comment.votes.remaining_voter_count}人投票` : ""
                $ui.alert({
                  title: "分数详情",
                  message: "Base " + baseStr + (votersStr && "\n") + votersStr + otherVoters
                })
              }
              break
            case "postEditComment":
              $ui.alert("postEditComment")
              break
            case "voteComment":
              $ui.alert("voteComment")
              break
            case "sortByTime":
              this._sortType = "time"
              this._refreshComments()
              break
            case "sortByScore":
              this._sortType = "score"
              this._refreshComments()
              break
            default:
              break
          }
        }
      }
    })
    this.cviews = {
      webview,
      addCommentButton
    }
    this.rootView.views = [webview, addCommentButton]
  }

  private _refreshComments() {
    if (!this._infos) return;
    if (this._sortType === "time") {
      this.cviews.webview.view.notify({
        event: "displayComments",
        message: { comments: this._infos.comments }
      })
    } else {
      const sortedComments = [...this._infos.comments]
      sortedComments.sort((a, b) => {
        if (a.is_uploader || a.score === undefined) {
          return -1
        } else if (b.is_uploader || b.score === undefined) {
          return 1
        } else {
          return b.score - a.score
        }
      })
      this.cviews.webview.view.notify({
        event: "displayComments",
        message: { comments: sortedComments }
      })
    }
  }

  set infos(infos: EHGallery) {
    this._infos = infos
    this._refreshComments()
  }
}
