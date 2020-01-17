const baseViewsGenerator = require("./baseViews")

function getUtf8Length(s) {
    var len = 0;
    for (var i = 0; i < s.length; i++) {
        var code = s.charCodeAt(i);
        if (code <= 0x7f) {
            len += 1;
        } else if (code <= 0x7ff) {
            len += 2;
        } else if (code >= 0xd800 && code <= 0xdfff) {
            len += 4; i++;
        } else {
            len += 3;
        }
    }
    return len;
}


function getColorFromFavcat(name) {
    const d = {
        'favcat0': '#000',
        'favcat1': '#f00',
        'favcat2': '#fa0',
        'favcat3': '#dd0',
        'favcat4': '#080',
        'favcat5': '#9f4',
        'favcat6': '#4bf',
        'favcat7': '#00f',
        'favcat8': '#508',
        'favcat9': '#e8e'
    }
    return d[name]
}

function defineFavnoteView(favnote) {
    const title = {
        type: "label",
        props: {
            id: "title",
            text: "Favorite Note",
            align: $align.center,
            font: $font(18),
            textColor: $color("black"),
            bgcolor: $color("white")
        },
        layout: function(make, view) {
            make.height.equalTo(32)
            make.left.top.right.inset(0)
        }
    }
    const footer = {
        type: "label",
        props: {
            id: "footer",
            text: "此处最多只能写200字节（utf-8编码后的长度，英文1字节，汉字一般3字节）。中间换行无效",
            align: $align.left,
            font: $font(12),
            lines: 2,
            textColor: $color("black"),
            bgcolor: $color("clear")
        },
        layout: function(make, view) {
            make.height.equalTo(32)
            make.left.bottom.right.inset(0)
        }
    }
    const textView = {
        type: "text",
        props: {
            id: "text",
            text: favnote,
            align: $align.left,
            font: $font(12),
            borderWidth: 1,
            borderColor: $color("black"),
            textColor: $color("black"),
            bgcolor: $color("white"),
        },
        layout: function(make, view) {
            make.left.right.inset(0)
            make.top.equalTo($("title").bottom)
            make.bottom.equalTo($("footer").top)
        }
    }
    const favnoteView = {
        type: "view",
        props: {
            id: "favnoteView",
            bgcolor: $color("clear")
        },
        views: [title, footer, textView],
        layout: function(make, view) {
            make.left.equalTo($("favcatList").right).inset(10)
            make.top.equalTo($("favcatList").top)
            make.bottom.equalTo($("staticRow").bottom)
            make.right.inset(10)
        }
    }
    return favnoteView
}

function defineStaticRow(is_favorited) {
    const staticRow = {
        props: {
            id: "staticRow",
            bgcolor: $color("white"),
            userInteractionEnabled: true,
            hidden: (is_favorited) ? false : true
        },
        views: [
            {
                type: "view",
                props: {
                    id: "canvas",
                    bgcolor: $color("clear")
                },
                views: [
                    {
                        type: "image",
                        props: {
                            symbol: 'delete.right.fill',
                            bgcolor: $color("clear")
                        },
                        layout: function(make, view) {
                            make.edges.insets($insets(2, 2, 2, 2))
                        }
                    }
                ],
                layout: (make, view) => {
                    make.size.equalTo($size(32, 32));
                    make.left.inset(15);
                }
            },
            {
                type: "label",
                props: {
                    id: "label",
                    text: $l10n("取消收藏"),
                    bgcolor: $color("clear"),
                    textColor: $color("black"),
                    align: $align.center,
                    font: $font(18)
                },
                layout: (make, view) => {
                    make.left.equalTo($("canvas").right).inset(15);
                    make.centerY.equalTo(view.super);
                }
            }
        ],
        layout: function(make, view) {
            make.size.equalTo($size(200, 32))
            make.left.equalTo($("favcatList"))
            make.top.equalTo($("favcatList").bottom)
        },
        events: {
            tapped: function(sender) {
                sender.bgcolor = $color("#ccc")
                const favcatList = sender.super.get('favcatList')
                favcatList.data = getDataWithSelection(favcatList.data, -1)
                favcatList.info = {
                    favcat: "favdel",
                    favcat_title: null
                }
            }
        }
    }
    return staticRow
}

const template = {
    props: {
        bgcolor: $color("clear")
    },
    views: [
        {
            type: "view",
            props: {
                id: "backgroundView"
            },
            layout: $layout.fill
        },
        {
            type: 'image',
            props: {
                id: 'canvas',
                symbol: 'suit.diamond.fill',
                contentMode: 1
            },
            layout: (make, view) => {
                make.size.equalTo($size(30, 30));
                make.left.inset(15);
                make.centerY.equalTo(view.super);
            }
        },
        {
            type: "label",
            props: {
                id: "label",
                bgcolor: $color("clear"),
                textColor: $color("black"),
                align: $align.center,
                font: $font(18)
            },
            layout: (make, view) => {
                make.left.equalTo($("canvas").right).inset(15);
                make.centerY.equalTo(view.super);
            }
        }
    ]
}

function getData(favcat_titles) {
    const data = []
    for (let i of favcat_titles) {
        const item = {
            backgroundView: {
                bgcolor: $color("clear")
            },
            label: {
                text: i.title
            },
            canvas: {
                tintColor: $color(getColorFromFavcat(i.favcat)),
            }
        }
        data.push(item)
    }
    return data
}

function getDataWithSelection(data, index) {
    for (let i in data) {
      if (parseInt(i) === index) {
        data[i].backgroundView.bgcolor = $color("#ccc")
      } else {
        data[i].backgroundView.bgcolor = $color("clear")
      }
    }
    return data
}

function defineFavcatList(favcat_titles, favcat_selected, is_favorited) {
    let data = getData(favcat_titles)
    if (is_favorited) {
        data = getDataWithSelection(data, parseInt(favcat_selected[6]))
    } else {
        data = getDataWithSelection(data, 0)
    }
    const favcat = (is_favorited) ? favcat_selected  : "favcat0"
    const favcat_title = favcat_titles.find(n => n.favcat === favcat).title
    const favcatList = {
        type: "list",
        props: {
            id: "favcatList",
            rowHeight: 32,
            selectable: true,
            scrollEnabled: false,
            separatorColor: $color("white"),
            bgcolor: $color("white"),
            template: template,
            data: data,
            info: {
                favcat: favcat,
                favcat_title: favcat_title
            }
        },
        layout: (make, view) => {
            make.left.inset(10);
            make.top.equalTo($("titleBar").bottom).inset(59);
            make.width.equalTo(200);
            make.height.equalTo(320);
        },
        events: {
            didSelect: function(sender, indexPath, data) {
                sender.data = getDataWithSelection(sender.data, indexPath.item)
                sender.super.get('staticRow').bgcolor = $color("white")
                sender.info = {
                    favcat: "favcat" + indexPath.item,
                    favcat_title: favcat_titles.find(n => n.favcat === "favcat" + indexPath.item).title
                }
            }
        }
    };
    return favcatList
}

async function favoriteDialogs(favcat_titles, favcat_selected, favnote, is_favorited) {
    
    return new Promise((resolve, reject) => {
        const cancelEvent = function(sender) {
            sender.super.super.super.remove()
            reject('canceled')
        }
        const confirmEvent = async function(sender) {
            let flagContinue = true
            const favcat = sender.super.super.get("favcatList").info.favcat
            const favcat_title = sender.super.super.get("favcatList").info.favcat_title
            const favnote = sender.super.super.get("text").text
            if (getUtf8Length(favnote) > 200) {
                const answer = await $ui.alert({
                    title: $l10n("字数超额"),
                    message: $l10n("多余部分将直接丢弃，继续吗？"),
                    actions: [{title: "Cancel"}, {title: "OK"}]
                })
                flagContinue = (answer.index === 1) ? true : false
            }
            if (flagContinue) {
                const result = {
                    favcat: favcat,
                    favnote: favnote,
                    favcat_title: favcat_title
                }
                sender.super.super.super.remove()
                resolve(result)
            }
        }
        
        const titleBarView = baseViewsGenerator.defineTitleBarView($l10n("收藏"), cancelEvent, confirmEvent)
        const favcatList = defineFavcatList(favcat_titles, favcat_selected, is_favorited)
        const staticRow = defineStaticRow(is_favorited)
        const favnoteView = defineFavnoteView(favnote)
        const maskView = baseViewsGenerator.maskView
        
        const content = {
            props: {
                radius: 10,
                bgcolor: $color("#f2f2f7")

            },
            views: [titleBarView, favcatList, staticRow, favnoteView],
            layout: function(make, view) {
                make.size.equalTo($size(500, 556))
                make.center.equalTo(view.super)
            }
        }
        const view = {
            props: {
                id: 'favoriteDialogs'
            },
            views: [maskView, content],
            layout: $layout.fillSafeArea
        }
        $ui.window.add(view)
    })
}

module.exports = {
    favoriteDialogs: favoriteDialogs
}