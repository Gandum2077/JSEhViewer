const utility = require('./utility')
const galleryViewGenerator = require('./galleryView')
const sidebarViewGenerator = require("./sidebarView");
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')

const baseViewsForListView = [
    {
        type: "button",
        props: {
            id: "button_sidebar",
            image: $image("assets/icons/navicon_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.inset(18)
            make.left.inset(16)
        },
        events: {
            tapped: function(sender) {
                $("rootView").get("listView").get("sidebarView").hidden = !$("rootView").get("listView").get("sidebarView").hidden
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_storage",
            image: $image("assets/icons/plus_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.inset(18)
            make.right.inset(16)
        }
    },
    {
        type: "button",
        props: {
            id: "button_search",
            image: $image("assets/icons/ios7_search_strong_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.inset(18)
            make.right.equalTo($("button_storage").left).inset(1)
        }
    },
    {
        type: "input",
        props: {
            id: "textfield_search",
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.top.inset(18)
            make.right.equalTo($("button_search").left).inset(1)
            make.left.equalTo($("button_sidebar").right).inset(1)
        }
    },
    {
        type: "button",
        props: {
            id: "button_close",
            image: $image("assets/icons/close_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.inset(57 * 3)
        },
        events: {
            tapped: function (sender) {
                $app.close();
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_open_url",
            image: $image("assets/icons/link_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_close").top)
        }
    },
    {
        type: "button",
        props: {
            id: "button_refresh",
            image: $image("assets/icons/refresh_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_open_url").top)
        }
    },
    {
        type: "button",
        props: {
            id: "button_next",
            image: $image("assets/icons/arrow_right_b_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_refresh").top)
        }
    },
    {
        type: "button",
        props: {
            id: "button_previous",
            image: $image("assets/icons/arrow_left_b_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_next").top)
        }
    }
]

const baseViewForItemCellView = [
    {
        type: "view",
        props: {
            id: "backgroundView",
            bgcolor: $color("#c8c7cc")
        },
        layout: $layout.fill
    },
    {
        type: "image",
        props: {
            id: "thumbnail_imageview",
            //src: utility.joinPath('cache', item['thumbnail_url'].slice(29)),
            contentMode: 1,
            tintColor: $color("#0079FF"),
            bgcolor: $color("#efeff4"),
            userInteractionEnabled: true
        },
        layout: function (make, view) {
            make.top.left.bottom.inset(1)
            make.right.equalTo(view.super.right).multipliedBy(113 / 695)
        },
        events: {
            tapped: async function (sender) {
                await galleryViewGenerator.init(sender.info.url)
            },
            ready: async function (sender) {
                let flag = false;
                while (flag) {
                    await $wait(1);
                }
            }
        }
    },
    {
        type: "label",
        props: {
            id: "label_title",
            //text: item['title'],
            font: $font(13),
            align: $align.left,
            textColor: $color("black"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(37)
            make.top.right.inset(1)
            make.left.equalTo($("thumbnail_imageview").right).inset(1)
        }
    },
    {
        type: "label",
        props: {
            id: "label_category",
            //text: utility.getNameAndColor(item['category'])['string'],
            font: $font("bold", 15),
            align: $align.center,
            textColor: $color("white"),
            //bgcolor: $color(utility.getNameAndColor(item['category'])['color'])
        },
        layout: function (make, view) {
            make.height.equalTo(24)
            make.top.equalTo($("label_title").bottom).inset(1)
            make.left.equalTo($("label_title").left)
            make.right.equalTo(view.super.right).multipliedBy(237 / 695)
        }
    },
    {
        type: "label",
        props: {
            id: "label_length",
            //text: item['length'] + '页',
            font: $font(12),
            align: $align.center,
            textColor: $color("black"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(24)
            make.top.equalTo($("label_category").bottom)
            make.left.equalTo($("label_category").left)
            make.right.equalTo($("label_category").right)
        }
    },
    {
        type: "view",
        props: {
            id: "lowlevel_view_rating",
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(24)
            make.top.equalTo($("label_length").bottom)
            make.left.equalTo($("label_category").left)
            make.right.equalTo($("label_category").right)
        }
    },
    {
        type: "canvas",
        props: {
            id: "canvas_rating"
        },
        layout: (make, view) => {
            make.height.equalTo(24)
            make.width.equalTo(120)
            make.center.equalTo($("lowlevel_view_rating"))
        },
        events: {
            draw: function(view, ctx) {
                const width = view.frame.width * view.info.display_rating / 5;
                const height = view.frame.height;
                ctx.fillColor = view.info.ratingColor;
                ctx.addRect($rect(0, 0, width, height));
                ctx.fillPath();
                ctx.fillColor = $color('#efeff4');
                ctx.addRect($rect(width, 0, view.frame.width - width, height));
                ctx.fillPath()
            }
        }
    },
    {
        type: "image",
        props: {
            id: "image_fivestars_mask",
            tintColor: $color("white"),
            image: $image("assets/icons/fivestars_mask.png").alwaysTemplate,
            contentMode: 2
        },
        layout: (make, view) => {
            make.height.equalTo(24)
            make.width.equalTo(120)
            make.center.equalTo($("lowlevel_view_rating"))
        }
    },
    {
        type: "label",
        props: {
            id: "label_uploader",
            //text: item['uploader'],
            font: $font(12),
            align: $align.center,
            textColor: $color("black"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(24)
            make.top.equalTo($("lowlevel_view_rating").bottom)
            make.left.equalTo($("label_category").left)
            make.right.equalTo($("label_category").right)
        }
    },
    {
        type: "label",
        props: {
            id: "label_posted",
            //text: item['posted'],
            font: $font(12),
            align: $align.center,
            tintColor: $color("black"),
            bgcolor: $color("white"),
            borderWidth: 2,
            //borderColor: $color(utility.getColorFromFavcat(item['favcat']))
        },
        layout: function (make, view) {
            make.height.equalTo(24)
            make.top.equalTo($("label_uploader").bottom)
            make.left.equalTo($("label_category").left)
            make.right.equalTo($("label_category").right)
        }
    },
    {
        type: "view",
        props: {
            id: "delete_line_view",
            bgcolor: $color("black"),
            alpha: 0.5,
            //hidden: ((item['visible'] === "Yes") ? true : false)
        },
        layout: function (make, view) {
            make.height.equalTo(1)
            make.center.equalTo($("label_posted"))
            make.width.equalTo(105)
        }
    },
    {
        type: "text",
        props: {
            id: "textview_taglist",
            //text: utility.renderTaglistToText(utility.translateTaglist(item['taglist'])),
            font: $font(11),
            align: $align.left,
            editable: false,
            selectable: false,
            textColor: $color("black"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.bottom.right.inset(1)
            make.top.equalTo($("label_title").bottom).inset(1)
            make.left.equalTo($("label_category").right).inset(1)
        }
    },
    {
        type: "button",
        props: {
            id: "button_delete_download",
            image: $image("assets/icons/ios7_close_outline_32_32.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("clear")
        },
        layout: function (make, view) {
            make.height.equalTo(32)
            make.width.equalTo(32)
            make.right.bottom.inset(0)
        }
    }
]

function getData(infos) {
    const data = []
    for (let item of infos['items']) {
        const itemData = {
            thumbnail_imageview: {
                source: {
                    url: item['thumbnail_url'],
                    //placeholder: image,
                    header: {
                        "User-Agent": exhentaiParser.USERAGENT,
                        "Cookie": exhentaiParser.COOKIE,
                    }
                },
                //src: utility.joinPath('cache', item['thumbnail_url'].slice(29)),
                info: {url: item['url']}
            },
            label_title: {
                text: item['title']
            },
            label_category: {
                text: utility.getNameAndColor(item['category'])['string'],
                bgcolor: $color(utility.getNameAndColor(item['category'])['color'])
            },
            label_length: {
                text: item['length'] + '页'
            },
            canvas_rating: {
                info: {
                    display_rating: parseFloat(item['display_rating']), 
                    ratingColor: $color((item['is_personal_rating']) ? "#5eacff" : "#ffd217")
                }
            },
            label_uploader: {
                text: item['uploader']
            },
            label_posted: {
                text: item['posted'],
                borderColor: (item['favcat']) ? $color(utility.getColorFromFavcat(item['favcat'])) : $color("white")
            },
            delete_line_view: {
                hidden: ((item['visible'] === "Yes") ? true : false)
            },
            textview_taglist: {
                text: utility.renderTaglistToText(utility.translateTaglist(item['taglist']))
            }
        }
        data.push(itemData)
    }
    return data
}

function renderRealListView(infos) {
    const listView = {
        type: 'list',
        props: {
            id: "realListView",
            rowHeight: 160,
            separatorHidden: true,
            template: baseViewForItemCellView,
            data: getData(infos),
            header: {
                type: "label",
                props: {
                    height: 24,
                    text: infos['search_result'],
                    textColor: $color("black"),
                    align: $align.center,
                    font: $font(14)
                }
              }

        },
        layout: function (make, view) {
            make.bottom.inset(0)
            make.top.equalTo($("textfield_search").bottom)
            make.left.inset(16)
            make.right.inset(57)
        }
    }
    return listView
}

function renderListView(infos) {
    const listView = {
        type: "view",
        props: {
            id: "listView"
        },
        views: [...baseViewsForListView, renderRealListView(infos)],
        layout: $layout.fill
    }
    return listView
}

function refresh(infos){
    $('rootView').get('listView').get('realListView').data = getData(infos)
    $('rootView').get('listView').get('realListView').header.text = infos['search_result']
}
    
async function init(url=null) {
    if (!url) {
        url = glv.default_url
    }
    const infos = await exhentaiParser.getListInfosFromUrl(url)
    const listView = renderListView(infos)
    const sideBarView = sidebarViewGenerator.renderSidebarView()
    $("rootView").add(listView)
    $("rootView").get("listView").add(sideBarView)
}


module.exports = {
    init: init
}
