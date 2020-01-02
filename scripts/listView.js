const utility = require('./utility')
const galleryViewGenerator = require('./galleryView')
const sidebarViewGenerator = require("./sidebarView")
const advancedSearchViewGenerator = require("./advancedSearchView")
const storedSearchPhrasesViewGenerator = require('./storedSearchPhrasesView')
const inputAlert = require('./dialogs/inputAlert')
const loginAlert = require('./dialogs/loginAlert')
const formDialogs = require('./dialogs/formDialogs')
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')


let url

const baseViewsForListView = [
    {
        type: "button",
        props: {
            id: "button_sidebar",
            //image: $image("assets/icons/navicon_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc"),
            imageEdgeInsets: $insets(6.5, 6.5, 6.5, 6.5)
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
            image: $image("assets/icons/plus_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc"),
            imageEdgeInsets: $insets(6.5, 6.5, 6.5, 6.5)
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.inset(18)
            make.right.inset(16)
        },
        events: {
            tapped: function(sender) {
                if ($("rootView").get("listView").get("storedSearchPhrasesView")) {
                    $("rootView").get("listView").get("storedSearchPhrasesView").remove()
                } else {
                    const storedSearchPhrasesView = storedSearchPhrasesViewGenerator.defineStoredSearchPhrasesView()
                    $("rootView").get("listView").add(storedSearchPhrasesView)
                }
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_search",
            image: $image("assets/icons/ios7_search_strong_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc"),
            imageEdgeInsets: $insets(6.5, 6.5, 6.5, 6.5)
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
            tintColor: $color("#007aff"),
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
        },
        events: {
            didBeginEditing: function(sender) {
                const asv = advancedSearchViewGenerator.defineAdvancedSearchView()
                $("rootView").get("listView").add(asv)
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_close",
            image: $image("assets/icons/close_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
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
            image: $image("assets/icons/link_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_close").top)
        },
        events: {
            tapped: async function (sender) {
                let text = $clipboard.link
                try {
                    utility.verifyUrl(text)
                } catch(err) {
                    text = ''
                }
                console.info(1)
                const url = await inputAlert.inputAlert(title='直接打开',text=text)
                utility.verifyUrl(url)
                await galleryViewGenerator.init(url)
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_refresh",
            image: $image("assets/icons/refresh_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_open_url").top)
        },
        events: {
            tapped: async function (sender) {
                await refresh();
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_next",
            image: $image("assets/icons/arrow_right_b_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_refresh").top)
        },
        events: {
            tapped: async function (sender) {
                const current_page_str = $('rootView').get('listView').get('button_jump_page').get('label_current_page').text
                const total_pages_str = $('rootView').get('listView').get('button_jump_page').get('label_total_page').text
                let nowPage
                if (/\d+-\d+/.test(current_page_str)) {
                    nowPage = parseInt(current_page_str.slice(current_page_str.indexOf('-') + 1)) - 1
                } else {
                    nowPage = parseInt(current_page_str) - 1
                }
                const lastPage = parseInt(total_pages_str) - 1
                if (nowPage < lastPage) {
                    const newUrl = utility.updateQueryOfUrl(url, {'page': nowPage + 1})
                    await refresh(newUrl)
                }
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_previous",
            image: $image("assets/icons/arrow_left_b_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_next").top)
        },
        events: {
            tapped: async function (sender) {
                const current_page_str = $('rootView').get('listView').get('button_jump_page').get('label_current_page').text
                const nowPage = parseInt(current_page_str) - 1
                if (nowPage > 0) {
                    const newUrl = utility.updateQueryOfUrl(url, {'page': nowPage - 1})
                    await refresh(newUrl)
                }
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_jump_page",
            bgcolor: $color("white"),
            borderWidth: 1,
            borderColor: $color("#c6c6c8")
    
        },
        views: [{
                type: "label",
                props: {
                    id: "label_current_page",
                    font: $font(13),
                    lines: 2,
                    autoFontSize: true,
                    align: $align.center
                },
                layout: function(make, view) {
                    make.left.right.top.inset(0)
                    make.height.equalTo(view.super).dividedBy(2)
                }
            },
            {
                type: "label",
                props: {
                    id: "label_total_page",
                    font: $font(13),
                    align: $align.center
                },
                layout: function(make, view) {
                    make.left.right.bottom.inset(0)
                    make.height.equalTo(view.super).dividedBy(2)
                }
            },
            {
                type: "view",
                props: {
                    bgcolor: $color("#c6c6c8")
                },
                layout: function(make, view) {
                    make.left.right.inset(0)
                    make.centerY.equalTo(view.super)
                    make.height.equalTo(1)
                }
            },
        ],
        layout: function(make, view) {
            make.size.equalTo($size(55, 65))
            make.bottom.equalTo($("button_previous").top).inset(50)
            make.left.equalTo($("button_previous")).inset(1)
        },
        events: {
            tapped: async function (sender) {
                const total_pages_str = $('rootView').get('listView').get('button_jump_page').get('label_total_page').text
                if (total_pages_str !== '1') {
                    const page_str = await inputAlert.inputAlert(title = `输入页码(1-${total_pages_str})`, text='', type = 4)
                    if (/^\d+$/.test(page_str)) {
                        const newUrl = utility.updateQueryOfUrl(url, {'page': parseInt(page_str) - 1})
                        await refresh(newUrl)
                    } else {
                        $ui.toast($l10n("输入不合法"))
                    }
                }
            }
        }
    }
]

const baseViewForItemCellView = [
    {
        type: "image",
        props: {
            id: "thumbnail_imageview",
            contentMode: 1,
            tintColor: $color("#007aff"),
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
            }
        }
    },
    {
        type: "label",
        props: {
            id: "label_title",
            font: $font(13),
            align: $align.left,
            lines: 2,
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
            font: $font("bold", 15),
            align: $align.center,
            textColor: $color("white"),
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
        type: "view",
        props: {
            id: "maskview_grey_for_fivestars",
            bgcolor: $color("#efeff4")
        },
        layout: (make, view) => {
            make.height.equalTo(24)
            make.width.equalTo(120)
            make.center.equalTo($("lowlevel_view_rating"))
        },
        views: [
            {
                type: "view",
                props: {
                    id: "maskview_colored_for_fivestars"
                }
            }
        ],
        events: {
            layoutSubviews: sender => {
                const inner = sender.get("maskview_colored_for_fivestars");
                const bounds = sender.frame;
                const percentage = sender.info.display_rating / 5.0
                inner.frame = $rect(0, 0, bounds.width * percentage, bounds.height);
              }
        }
    },
    {
        type: "image",
        props: {
            id: "image_fivestars_mask",
            tintColor: $color("white"),
            image: $image("assets/icons/fivestars_mask_500x100.png").alwaysTemplate,
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
            font: $font(12),
            align: $align.center,
            tintColor: $color("black"),
            bgcolor: $color("white"),
            borderWidth: 2
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
            alpha: 0.5
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
    }
]

const template = {
    props: {
        bgcolor: $color("#c8c7cc")
    },
    views: baseViewForItemCellView
}

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
                        "Cookie": exhentaiParser.getCookie(),
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
            maskview_grey_for_fivestars: {
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

function renderRealListView() {
    const listView = {
        type: 'list',
        props: {
            id: "realListView",
            rowHeight: 160,
            separatorHidden: true,
            actions: [
                {
                    title: "delete",
                    handler: function(sender, indexPath) {
                        console.info(indexPath)
                    }
                }
            ],
            template: template,
            //data: getData(infos),
            header: {
                type: "label",
                props: {
                    height: 24,
                    //text: infos['search_result'],
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
        },
        events: {
            forEachItem: (view, indexPath) => {
                const wrapper = view.get("maskview_grey_for_fivestars");
                const inner = wrapper.get("maskview_colored_for_fivestars");
                const percentage = wrapper.info.display_rating /  5.0;
                inner.frame = $rect(0, 0, wrapper.frame.width * percentage, wrapper.frame.height);
                inner.bgcolor = wrapper.info.ratingColor
            },
            swipeEnabled: function(sender, indexPath) {
                return false;
            },
            willBeginDragging: function(sender) {
                initSubviewsStatus()
            }
        }
    }
    return listView
}

function renderListView() {
    const listView = {
        type: "view",
        props: {
            id: "listView"
        },
        views: [...baseViewsForListView, renderRealListView()],
        layout: $layout.fill
    }
    return listView
}

function initSubviewsStatus() {
    if (!$("rootView").get("listView").get("sidebarView").hidden) {
        $("rootView").get("listView").get("sidebarView").hidden = true
    }
    if ($("rootView").get("listView").get("advancedSearchView")) {
        $("rootView").get("listView").get("advancedSearchView").remove()
        $("rootView").get("listView").get("textfield_search").blur()
    }
    if ($("rootView").get("listView").get("storedSearchPhrasesView")) {
        $("rootView").get("listView").get("storedSearchPhrasesView").remove()
    }
}

async function refresh(newUrl){
    url = newUrl
    initSubviewsStatus()
    utility.startLoading()
    const infos = await exhentaiParser.getListInfosFromUrl(url)
    utility.stopLoading()
    const urlCategory = utility.getUrlCategory(url)
    $('rootView').get('listView').get('realListView').data = getData(infos)
    $('rootView').get('listView').get('realListView').header.text = infos['search_result']
    $('rootView').get('listView').get('realListView').scrollTo({
        indexPath: $indexPath(0, 0),
        animated: true
      })
    $('rootView').get('listView').get('button_sidebar').image = getSideBarButtonImage(urlCategory)
    $('rootView').get('listView').get('button_jump_page').get('label_current_page').text = infos['current_page_str']
    $('rootView').get('listView').get('button_jump_page').get('label_total_page').text = infos['total_pages_str']
}

function getSideBarButtonImage(urlCategory) {
    const dict = {
        default: "assets/icons/navicon_64x64.png",
        popular: "assets/icons/arrow_graph_up_right_64x64.png",
        watched: "assets/icons/ios7_bell_64x64.png",
        favorites: "assets/icons/bookmark_64x64.png",
        downloads: "assets/icons/archive_64x64.png"
    }
    return $image(dict[urlCategory]).alwaysTemplate
}

async function init(listUrl=null) {
    if (!listUrl) {
        listUrl = glv.config.default_url
    }
    const listView = renderListView() 
    $("rootView").add(listView)
    const sideBarView = sidebarViewGenerator.renderSidebarView(refresh, presentSettings)
    $("rootView").get("listView").add(sideBarView)  
    refresh(listUrl)
}

async function presentSettings() {
    const sections = [
        {
            title: 'Default URL',
            footer: $l10n("只有path为空字符串的url才能作为default url"),
            fields: [
                {
                    type: "boolean",
                    key: "downloads_on_start",
                    title: $l10n("启动时显示downloads页"),
                    value: false
                },
                {
                    type: "string",
                    key: "default_url",
                    value: glv.config.default_url
                },
                {
                    type: "action",
                    buttonTitle: $l10n("将当前url作为default url"),
                    value: null
                }
            ]
        },
        {
            title: 'Access',
            fields: [
                {
                    type: "action",
                    buttonTitle: $l10n("重设账号密码"),
                    value: async () => {
                        const login = await loginAlert.loginAlert()
                        $file.write({
                            data: $data({string: JSON.stringify(login, null, 2)}),
                            path: glv.accountFile
                        });
                    }
                },
                {
                    type: "action",
                    buttonTitle: $l10n("重新登录"),
                    value: async () => {
                        utility.startLoading()
                        utility.changeLoadingTitle('正在登录')
                        const success = await exhentaiParser.login(login.username, login.password)
                        if (!success) {
                            utility.stopLoading()
                            $ui.alert($l10n("失败"))
                            return false
                        }
                        utility.stopLoading()
                    }
                }
            ]
        },
        {
            title: 'Storage',
            fields: [
                {
                    type: "action",
                    buttonTitle: $l10n("更新标签翻译"),
                    value: async () => {
                        await utility.generateTagTranslatorJson()
                        utility.updateTagTranslatorDict()
                    }
                },
                {
                    type: "action",
                    buttonTitle: $l10n("更新数据库"),
                    value: () => {
    // TO-DO                    
                    }
                },
                {
                    type: "action",
                    buttonTitle: $l10n("清除缓存"),
                    value: null
                },
                {
                    type: "action",
                    buttonTitle: $l10n("清除未收藏的下载内容"),
                    value: null
                },
                {
                    type: "action",
                    buttonTitle: $l10n("清除全部下载内容"),
                    value: null
                }
            ]
        },
        {
            title: 'Others',
            fields: [
                {
                    type: "segmentedControl",
                    title: $l10n("Favorites排序方式"),
                    items: ['Favorited', 'Posted'],
                    value: null
                },
                {
                    type: "segmentedControl",
                    title: $l10n("downloads排序方式"),
                    items: ['序号', '下载时间'],
                    value: null
                }
            ]
        }
    ]
    console.info(sections)
    const result = await formDialogs.formDialogs(sections)
    console.info(result)
}


module.exports = {
    init: init
}
