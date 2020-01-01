const glv = require('./globalVariables')
const utility = require('./utility')
const htmlToText = require('./modules/html-to-text');

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

const baseViewsForCommentsView = [
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

const template = {
    views: baseViewsForCommentsView
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
                text: item['posted_time'] + ' by ' + item['commenter'] + ', ' + c4text
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
                text: convertHtmlToText(item['comment_div']),
                info: {idealHeight: 0}
            }
        }
        data.push(itemData)
    }
    return data
}

function renderCommentsView(infos) {
    const titleBar = {
        type: "view",
        props: {
            id: "titleBar",
            bgcolor: $color("white")
        },
        layout: function(make, view) {
            make.left.right.top.inset(0)
            make.height.equalTo(55)
        },
        views: [
            {
                type: "button",
                props: {
                    id: "button_close",
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
                    make.centerY.equalTo(view.super)
                    make.left.inset(16)
                    make.size.equalTo($size(32, 32))
                },
                events: {
                    tapped: function(sender) {
                        $('rootView').get('enlargedCommentsView').remove()
                        $('rootView').get('maskView').remove()
                    }
                }
            },
            {
                type: "label",
                props: {
                    text: "Comments",
                    font: $font("bold", 18),
                    textColor: $color("black"),
                    align: $align.center,
                    bgcolor: $color("clear")
                },
                layout: function(make, view) {
                    make.center.equalTo(view.super)
                    make.size.equalTo($size(150, 32))
                }
            },
            {
                type: "button",
                props: {
                    id: "button_new_post",
                    title: "New",
                    font: $font(18),
                    align: $align.right,
                    titleColor: $color("#007aff"),
                    bgcolor: $color("clear")
                },
                layout: function(make, view) {
                    make.centerY.equalTo(view.super)
                    make.right.inset(16)
                    make.size.equalTo($size(50, 32))
                }
            },
            {
                type: "view",
                props: {
                    bgcolor: $color("#c8c7cc")
                },
                layout: function(make, view) {
                    make.left.right.bottom.inset(0)
                    make.height.equalTo(1)
                }
            }
        ]
    }
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
    const commentsView = {
        type: "type",
        props: {
            id: "enlargedCommentsView",
            radius: 10,
            bgcolor: $color("white")
        },
        views: [titleBar, commentListView],
        layout: function(make, view) {
            make.center.equalTo(view.super)
            make.width.equalTo(600)
            make.height.equalTo(800)
            make.top.bottom.greaterThanOrEqualTo(100)
            make.left.right.greaterThanOrEqualTo(50)
        }
    }
    return commentsView
}

module.exports = {
    renderCommentsView: renderCommentsView
}