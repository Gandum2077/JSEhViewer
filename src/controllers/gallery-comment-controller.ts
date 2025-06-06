import { BaseController, Web, Button, setLayer, layerCommonOptions, textDialog } from "jsbox-cview";
import { EHGallery, EHSearchTerm } from "ehentai-parser";
import { GalleryController } from "./gallery-controller";
import { api } from "../utils/api";
import { getUtf8Length, safeParseFsearch } from "../utils/tools";
import { galleryInfoPath } from "../utils/glv";
import Url from "url-parse";
import { PushedSearchResultController } from "./pushed-search-result-controller";
import { FavoritesTabOptions, FrontPageTabOptions, WatchedTabOptions } from "../types";
import { getSearchOptions } from "./search-controller";

export class GalleryCommentController extends BaseController {
  private _infos?: EHGallery;
  private _sortType: "time" | "score" = "time";
  private _isRequestInProgress = false;
  constructor(readHandler: (index: number) => void) {
    super({
      props: { bgcolor: $color("primarySurface") },
    });
    const addCommentButton = new Button({
      props: {
        bgcolor: $color("systemLink"),
      },
      layout: (make, view) => {
        setLayer(view, layerCommonOptions.circleViewShadow);
        make.size.equalTo($size(50, 50));
        make.right.inset(25);
        make.bottom.inset(40);
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "plus",
            tintColor: $color("white"),
          },
          layout: (make, view) => {
            make.center.equalTo(view.super);
            make.size.equalTo($size(25, 25));
          },
        },
      ],
      events: {
        tapped: async () => {
          if (this._isRequestInProgress) {
            $ui.warning("正在处理上一个请求，请稍后再试");
            return;
          }
          if (!this._infos) return;
          let text = await textDialog({
            title: "添加评论",
          });
          text = text.trim();
          if (!text) return;
          if (getUtf8Length(text) < 10) {
            $ui.alert({
              title: "错误",
              message: "您的评论太短了，至少需要10个字符（UTF-8编码后）",
            });
            return;
          }
          this._isRequestInProgress = true;
          api
            .postNewComment(this._infos.gid, this._infos.token, text)
            .then((infos) => {
              // 从后往前查找，找到自己的评论
              for (let i = infos.comments.length - 1; i >= 0; i--) {
                if (infos.comments[i].is_my_comment) {
                  this._infos!.comments.push(infos.comments[i]);
                  break;
                }
              }
              this._infos!.comments.forEach((comment) => {
                comment.voteable = false;
              });
              this._isRequestInProgress = false;
              this._refreshComments();
              this._trySavingInfos();
            })
            .catch(() => {
              this._isRequestInProgress = false;
              $ui.error("API错误，评论失败");
            });
        },
      },
    });
    const webview = new Web({
      props: {
        html: $file.read("assets/gallery-comment.html").string,
        allowsLinkPreview: false,
        allowsNavigation: false,
        showsProgress: false,
        inlineMedia: false,
        transparent: true,
        script: `document.documentElement.setAttribute('data-theme', '${$device.isDarkMode ? "dark" : "light"}');`,
      },
      layout: (make, view) => {
        make.centerX.equalTo(view.super);
        make.width.equalTo($ui.controller.view.safeArea);
        make.top.bottom.inset(0);
      },
      events: {
        themeChanged: (sender, isDarkMode) => {
          sender.notify({
            event: "toggleTheme",
            message: { isDarkMode },
          });
        },
        decideNavigation: (sender, action) => {
          // 阻止不合规的请求
          const alert = () => {
            $ui.alert({
              title: "跳转至浏览器",
              message: action.requestURL,
              actions: [
                {
                  title: "取消",
                },
                {
                  title: "打开",
                  handler: () => {
                    $app.openURL(action.requestURL);
                  },
                },
              ],
            });
          };
          const handleSearchTerms = async (sts: EHSearchTerm[]) => {
            const options = (await getSearchOptions(
              {
                type: "front_page",
                options: {
                  searchTerms: sts,
                },
              },
              "showAllExceptArchive"
            )) as FrontPageTabOptions | WatchedTabOptions | FavoritesTabOptions;
            const controller = new PushedSearchResultController();
            controller.uipush({
              navBarHidden: true,
              statusBarStyle: 0,
            });
            await $wait(0.3);
            controller.triggerLoad(options);
          };
          if (action.type === 0) {
            const pattToOtherGallery = /https:\/\/e[-x]hentai\.org\/\w+\/(\d+)\/(\w+)\/?/;
            const pattToPage = /https:\/\/e[-x]hentai\.org\/s\/\w+\/(\d+)-(\d+)\/?/;
            const pattSearch = /https:\/\/e[-x]hentai\.org\//;
            const r1 = pattToOtherGallery.exec(action.requestURL);
            const r2 = pattToPage.exec(action.requestURL);
            const r3 = pattSearch.exec(action.requestURL);
            if (r1 && r1.length >= 3) {
              const gid = parseInt(r1[1]);
              const token = r1[2];
              if (gid === this._infos?.gid && token === this._infos?.token) {
                return false;
              }
              const galleryController = new GalleryController(gid, token);
              galleryController.uipush({
                navBarHidden: true,
                statusBarStyle: 0,
              });
            } else if (r2 && r2.length >= 3 && parseInt(r2[1]) === this._infos?.gid) {
              let page = parseInt(r2[2]) - 1;
              if (page < 0) page = 0;
              if (this._infos && page >= this._infos.length) page = this._infos.length - 1;
              readHandler(page);
            } else if (r3) {
              const u = new Url(action.requestURL, true);
              const f_search = u.query?.f_search;
              if (!f_search) {
                alert();
                return false;
              }
              let sts: EHSearchTerm[] | undefined;
              try {
                sts = safeParseFsearch(f_search);
              } catch (e: any) {
                alert();
                return false;
              }
              if (!sts || sts.length === 0) {
                alert();
                return false;
              } else {
                handleSearchTerms(sts).then().catch();
              }
            } else {
              alert();
            }
            return false;
          }
          return true;
        },
        handleApi: async (message: {
          action: "showVoteDetails" | "editComment" | "voteComment" | "sortByScore" | "sortByTime";
          info: any;
        }) => {
          if (!this._infos) return;
          if (this._isRequestInProgress) {
            $ui.warning("正在处理上一个请求，请稍后再试");
            return;
          }
          switch (message.action) {
            case "showVoteDetails": {
              const { comment_id } = message.info as { comment_id: string };
              const comment = this._infos.comments.find((comment) => comment.comment_id === parseInt(comment_id));
              if (comment && comment.votes) {
                const base = comment.votes.base;
                const baseStr = base === 0 ? "0" : base > 0 ? `+${base}` : `${base}`;
                const votersStr = comment.votes.voters
                  .map((voter) => {
                    const score = voter.score;
                    const scoreStr = score === 0 ? "0" : score > 0 ? `+${score}` : `${score}`;
                    return `${voter.voter} ${scoreStr}`;
                  })
                  .join("\n");
                const otherVoters = comment.votes.remaining_voter_count
                  ? `\n还有另外${comment.votes.remaining_voter_count}人投票`
                  : "";
                $ui.alert({
                  title: "分数详情",
                  message: "Base " + baseStr + (votersStr && "\n") + votersStr + otherVoters,
                });
              }
              break;
            }
            case "editComment": {
              this._isRequestInProgress = true;
              const { comment_id } = message.info as { comment_id: number };
              try {
                const text = await api.getEditComment(
                  this._infos.gid,
                  this._infos.token,
                  this._infos.apikey,
                  this._infos.apiuid,
                  comment_id
                );
                let newText = await textDialog({
                  title: "修改评论",
                  text,
                });
                newText = newText.trim();

                if (getUtf8Length(newText) < 10) {
                  this._isRequestInProgress = false;
                  $ui.alert({
                    title: "错误",
                    message: "您的评论太短了，至少需要10个字符（UTF-8编码后）",
                  });
                  return;
                }
                const infos = await api.postEditComment(this._infos.gid, this._infos.token, comment_id, newText);
                const newComment =
                  infos.comments.find((comment) => comment.comment_id === comment_id)?.comment_div || newText;
                this._infos.comments.find((comment) => comment.comment_id === comment_id)!.comment_div = newComment;
                this._refreshComments();
                this._trySavingInfos();
              } catch (e) {
                if (e !== "cancel") $ui.error("API错误，修改评论失败");
              } finally {
                this._isRequestInProgress = false;
              }
              break;
            }
            case "voteComment": {
              this._isRequestInProgress = true;
              const { comment_id, currentVote, type } = message.info as {
                comment_id: number;
                currentVote: number;
                type: "up" | "down";
              };
              let result:
                | {
                    comment_id: number;
                    comment_score: number;
                    comment_vote: 1 | -1 | 0;
                  }
                | undefined;
              try {
                result = await api.voteComment(
                  this._infos.gid,
                  this._infos.token,
                  comment_id,
                  this._infos.apikey,
                  this._infos.apiuid,
                  type === "up" ? 1 : -1
                );
              } catch (e) {
                this._isRequestInProgress = false;
                $ui.error("API错误，投票失败");
                return;
              }
              if (!result) {
                this._isRequestInProgress = false;
                $ui.error("API错误，投票失败");
                return;
              }
              this._isRequestInProgress = false;
              const comment = this._infos.comments.find((comment) => comment.comment_id === comment_id);
              comment!.score = result.comment_score;
              comment!.my_vote = result.comment_vote === 0 ? undefined : result.comment_vote;
              this._trySavingInfos();
              webview.view.notify({
                event: "endVoteRequest",
                message: result,
              });
              break;
            }
            case "sortByTime": {
              this._sortType = "time";
              this._refreshComments();
              break;
            }
            case "sortByScore": {
              this._sortType = "score";
              this._refreshComments();
              break;
            }
            default:
              throw new Error("Unknown action");
          }
        },
      },
    });
    this.cviews = {
      webview,
      addCommentButton,
    };
    this.rootView.views = [webview, addCommentButton];
  }

  private _refreshComments() {
    if (!this._infos) return;
    if (this._sortType === "time") {
      this.cviews.webview.view.notify({
        event: "displayComments",
        message: { comments: this._infos.comments },
      });
    } else {
      const sortedComments = [...this._infos.comments];
      sortedComments.sort((a, b) => {
        if (a.is_uploader || a.score === undefined) {
          return -1;
        } else if (b.is_uploader || b.score === undefined) {
          return 1;
        } else {
          return b.score - a.score;
        }
      });
      this.cviews.webview.view.notify({
        event: "displayComments",
        message: { comments: sortedComments },
      });
    }
  }

  private _trySavingInfos() {
    // 尝试保存this._infos到本地
    // 前提是本地已经存在infos文件（否则的话，应该由下载器模块进行保存）
    if (!this._infos) return;
    const path = galleryInfoPath + `${this._infos.gid}.json`;
    if ($file.exists(path)) {
      const text = JSON.stringify(this._infos, null, 2);
      $file.write({
        data: $data({ string: text }),
        path,
      });
    }
  }

  set infos(infos: EHGallery) {
    this._infos = infos;
    this._refreshComments();
  }
}
