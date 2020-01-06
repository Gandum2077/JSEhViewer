const glv = require('../globalVariables')
const utility = require('../utility')
const exhentaiParser = require('../exhentaiParser')

baseViewsGenerator = require("./baseViews")
const textDialogs = require('./textDialogs')

const htmlToText = require('../modules/html-to-text')

let INFOS

function convertHtmlToText(html) {
    const text = htmlToText.fromString(html, {
        wordwrap: false,
        hideLinkHrefIfSameAsText: true,
        ignoreImage: true
      });
    return text
}

function getHeightOfSizeToFitText(text, width=600) {
    const textView = $ui.create({
        type: "text",
        props: {
            text: text,
            font: $font(12),
            size: $size(width, 1),
            scrollEnabled: false
        }
    })
    textView.sizeToFit()
    return textView.size.height
}

function defineTitleBarView(title, closeEvent) {
    const titleBarView = {
        type: "view",
        props: {
            id: "titleBar",
            bgcolor: $color("white")
        },
        views: [
            {
                type: "button",
                props: {
                    id: "buttonClose",
                    tintColor: $color("#007aff"),
                    bgcolor: $color("clear")
                },
                views: [
                    {
                        type: "image",
                        props: {
                            symbol: 'xmark',
                            tintColor: $color("#007aff")
                        },
                        layout: function(make, view) {
                            make.edges.insets($insets(5, 5, 5, 5))
                        }
                    }
                ],
                layout: function(make, view) {
                    make.centerY.equalTo(view.super).offset(-0.25)
                    make.size.equalTo($size(32, 32))
                    make.left.inset(15)
                },
                events: {
                    tapped: closeEvent
                }
            },
            {
                type: "label",
                props: {
                    text: title,
                    font: $font("bold", 17),
                    align: $align.center
                },
                layout: function(make, view) {
                    make.size.equalTo($size(300,32))
                    make.centerY.equalTo(view.super).offset(-0.25)
                    make.centerX.equalTo(view.super)
                }
            },
            {
                type: "button",
                props: {
                    id: "buttonNewPost",
                    title: "New",
                    font: $font(17),
                    radius: 0,
                    titleColor: $color("#007aff"),
                    bgcolor: $color("clear")
                },
                layout: function(make, view) {
                    make.centerY.equalTo(view.super).offset(-0.25)
                    make.size.equalTo($size(50, 32))
                    make.right.inset(15)
                },
                events: {
                    tapped: async function(sender) {
                        const text = await textDialogs.textDialogs($l10n('发表新评论'))
                        if (utility.getUtf8Length(text) < 10) {
                            $ui.toast($l10n("评论过短"))
                            return
                        }
                        const newInfos = await exhentaiParser.postNewComment(INFOS.url, text)
                        if (newInfos) {
                            INFOS.comments = newInfos['comments']
                            sender.super.super.get("commentListView").data = getData(INFOS)
                        } else {
                            $ui.toast($l10n("评论发表失败"))
                        }
                    }
                }
            },
            {
                type: "view",
                props: {
                    bgcolor: $color("#a9a9ad")
                },
                layout: function(make, view) {
                    make.left.right.bottom.inset(0)
                    make.height.equalTo(0.5)
                }
            }
        ],
        layout: function(make, view) {
            make.left.right.top.inset(0)
            make.height.equalTo(56.5)
        }
    }
    return titleBarView
}

const template = {
    views: [
        {
            type: "label",
            props: {
                id: "label_title",
                font: $font(15),
                textColor: $color("black"),
                bgcolor: $color("#c8c7cc")
            },
            layout: function(make, view) {
                make.height.equalTo(32)
                make.top.left.right.inset(0)
            }
        },
        {
            type: "button",
            props: {
                id: "button_voteup",
                title: "Vote+",
                font: $font(15),
                bgcolor: $color("clear")
            },
            layout: function(make, view) {
                make.size.equalTo($size(80, 32))
                make.right.inset(100)
                make.top.inset(0)
            },
            events: {
                tapped: async function(sender) {
                    const comment_id = sender.super.get("label_title").info.comment_id
                    const result = await exhentaiParser.voteComment(INFOS.apikey, INFOS.apiuid, INFOS.gid, INFOS.token, comment_id, 1)
                    if (result) {
                        const this_comment = INFOS.comments.find(n => n.comment_id === comment_id)
                        this_comment.my_vote = (result.comment_vote) ? result.comment_vote : null
                        this_comment.score = (result.comment_score >= 0) ? '+' + result.comment_score : '' + result.comment_score
                        sender.super.super.super.data = getData(INFOS)
                    } else {
                        $ui.toast($l10n("失败"))
                    }
                }
            }
        },
        {
            type: "button",
            props: {
                id: "button_votedown",
                title: "Vote-",
                font: $font(15),
                bgcolor: $color("clear")
            },
            layout: function(make, view) {
                make.size.equalTo($size(80, 32))
                make.right.inset(10)
                make.top.inset(0)
            },
            events: {
                tapped: async function(sender) {
                    const comment_id = sender.super.get("label_title").info.comment_id
                    const result = await exhentaiParser.voteComment(INFOS.apikey, INFOS.apiuid, INFOS.gid, INFOS.token, comment_id, -1)
                    if (result) {
                        const this_comment = INFOS.comments.find(n => n.comment_id === comment_id)
                        this_comment.my_vote = (result.comment_vote) ? result.comment_vote : null
                        this_comment.score = (result.comment_score >= 0) ? '+' + result.comment_score : '' + result.comment_score
                        sender.super.super.super.data = getData(INFOS)
                    } else {
                        $ui.toast($l10n("失败"))
                    }
                }
            }
        },
        {
            type: "button",
            props: {
                id: "button_edit",
                title: "Edit",
                font: $font(15),
                titleColor: $color("#007aff"),
                bgcolor: $color("clear")
            },
            layout: function(make, view) {
                make.size.equalTo($size(80, 32))
                make.right.inset(55)
                make.top.inset(0)
            },
            events: {
                tapped: async function(sender) {
                    const comment_id = sender.super.get("label_title").info.comment_id
                    const result = await exhentaiParser.getEditComment(INFOS.apikey, INFOS.apiuid, INFOS.gid, INFOS.token, comment_id)
                    if (result) {
                        const html = result.editable_comment
                        const soup = $xml.parse({
                            string: html,
                            mode: "html",
                        })
                        const text = soup.rootElement.firstChild({"selector": "textarea"}).string
                        const newText = await textDialogs.textDialogs($l10n('修改评论'), text)
                        if (utility.getUtf8Length(newText) < 10) {
                            $ui.toast($l10n("评论过短"))
                            return
                        }
                        const newInfos = await exhentaiParser.postEditComment(INFOS.url, comment_id, newText)
                        if (newInfos) {
                            const comment_div = newInfos.comments.find(n => n.comment_id === comment_id).comment_div
                            const rootElement = $xml.parse({
                                string: comment_div,
                                mode: "html",
                            }).rootElement
                            if (!rootElement.firstChild({"selector": "textarea"})) {
                                INFOS.comments = newInfos['comments']
                                sender.super.super.super.data = getData(INFOS)
                            } else {
                                $ui.toast($l10n("提交评论失败"))
                            }
                        } else {
                            $ui.toast($l10n("提交评论失败"))
                        }
                    } else {
                        $ui.toast($l10n("获取评论失败"))
                    }
                }
            }
        },
        {
            type: "text",
            props: {
                id: "textView",
                font: $font(12),
                scrollEnabled: false,
                editable: false,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function(make, view) {
                make.left.right.bottom.inset(0)
                make.top.equalTo($("label_title").bottom)
            }
        }
    ]
}

function getData(infos) {
    const data = []
    for (let item of infos['comments']) {
        let c4text
        if (item['is_uploader']) {
            c4text = 'uploader'
        } else if (item['score']) {
            c4text = item['score']
        } else {
            c4text = ''
        }
        const itemData = {
            label_title: {
                text: item['posted_time'] + ' by ' + item['commenter'] + ', ' + c4text,
                info: {
                    comment_id: item["comment_id"]
                }
            },
            button_voteup: {
                titleColor: (item['my_vote'] === 1) ? $color("blue") : $color("black"),
                hidden: (item['voteable']) ? false : true
            },
            button_votedown: {
                titleColor: (item['my_vote'] === -1) ? $color("blue") : $color("black"),
                hidden: (item['voteable']) ? false : true
            },
            button_edit: {
                hidden: (item['is_self_comment']) ? false : true
            },
            textView: {
                text: convertHtmlToText(item['comment_div'])
            }
        }
        data.push(itemData)
    }
    return data
}

function defineCommentListView(infos) {

    const commentListView = {
        type: 'list',
        props: {
            id: "commentListView",
            separatorHidden: true,
            template: template,
            data: getData(infos)
        },
        layout: function(make, view) {
            make.left.right.bottom.inset(0)
            make.top.equalTo($("titleBar").bottom)
        },
        events: {
            rowHeight: function(sender, indexPath) {
                const textView = sender.get("textView")
                if (textView && textView.text) {
                    const height = getHeightOfSizeToFitText(textView.text, width=sender.super.frame.width)
                    return Math.max(height, 64) + 32
                }
            }
        }
    }
    return commentListView
}

async function commentDialogs(infos) {
    INFOS = infos
    return new Promise((resolve, reject) => {
        const closeEvent = function(sender) {
            sender.super.super.super.remove()
            resolve('closed')
        }
        
        const titleBarView = defineTitleBarView($l10n("评论"), closeEvent)
        const commentListView = defineCommentListView(infos)
        const maskView = baseViewsGenerator.maskView
        const commentDialogsContent = {
            props: {
                radius: 10
            },
            views: [titleBarView, commentListView],
            layout: function(make, view) {
                make.size.equalTo($size(600, 800))
                make.center.equalTo(view.super)
                make.top.bottom.greaterThanOrEqualTo(100)
                make.left.right.greaterThanOrEqualTo(50)
            }
        }
        const commentDialogs = {
            props: {
                id: 'formDialogs'
            },
            views: [maskView, commentDialogsContent],
            layout: $layout.fill
        }
        $ui.window.add(commentDialogs)
    })
}

module.exports = {
    commentDialogs: commentDialogs
}