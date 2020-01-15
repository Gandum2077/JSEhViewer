const glv = require('./globalVariables')
const utility = require('./utility')
const exhentaiParser = require('./exhentaiParser')
const database = require('./database')
const galleryViewGenerator = require('./galleryView')
const sidebarViewGenerator = require("./sidebarView")
const advancedSearchViewGenerator = require("./advancedSearchView")
const storedSearchPhrasesViewGenerator = require('./storedSearchPhrasesView')
const inputAlert = require('./dialogs/inputAlert')
const loginAlert = require('./dialogs/loginAlert')
const formDialogs = require('./dialogs/formDialogs')

let url
let INFOS
let FLAG_RELOAD = false

const baseViewsForListView = [
    {
        type: "button",
        props: {
            id: "button_sidebar",
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
        },
        events: {
            tapped: async function(sender) {
                const asv = $("rootView").get("listView").get("advancedSearchView")
                if (asv) {
                    const option = asv.get("optionsSegmentedControl").index
                    let urlCategory
                    switch (option) {
                        case -1:
                            urlCategory = 'default'
                            break;
                        case 0:
                            urlCategory = 'default'
                            break;
                        case 1:
                            urlCategory = 'watched'
                            break;
                        case 2:
                            urlCategory = 'favorites'
                            break;
                        case 3:
                            urlCategory = 'downloads'
                            break;
                        default:
                            break;
                    }
                    const query = {}
                    const searchPhrase = $("rootView").get("listView").get("textfield_search").text
                    if (searchPhrase) {
                        query['f_search'] = searchPhrase
                    }
                    if (option === 0 || option === 1) {
                        const ASOHomeView = asv.get('advancedSearchOptionsLocationView').get('ASOHomeView')
                        let f_cats = 0
                        ASOHomeView.get('categoriesMatrix').data.map(n => {
                            if (!n.label.selected) {
                                f_cats += Math.pow(2, n.label.categoryIndex)
                            }
                        })
                        if (f_cats) {
                            query['f_cats'] = f_cats
                        }
                        const advsearch = ASOHomeView.get('advancedSearchOptionSwitch').info.advsearch
                        if (advsearch) {
                            query['advsearch'] = advsearch
                            Object.assign(query, ASOHomeView.get('optionsHome').info)
                        }
                    } else if (option === 2) {
                        const ASOFavoritesView = asv.get('advancedSearchOptionsLocationView').get('ASOFavoritesView')
                        const favcatItem = ASOFavoritesView.get('favoriteCategoriesMatrix').data.find(n => {
                            if (n.background.borderWidth === 3) {
                                return true
                            }
                        })
                        if (favcatItem) {
                            query['favcat'] = favcatItem.name.favcat[6]
                        }
                        Object.assign(query, ASOFavoritesView.get('optionFavorites').info)
                    } else if (option === 3) {
                        const ASODownloadsView = asv.get('advancedSearchOptionsLocationView').get('ASODownloadsView')
                        let f_cats = 0
                        ASODownloadsView.get('categoriesMatrix').data.map(n => {
                            if (!n.label.selected) {
                                f_cats += Math.pow(2, n.label.categoryIndex)
                            }
                        })
                        if (f_cats) {
                            query['f_cats'] = f_cats
                        }
                        const advsearch = ASODownloadsView.get('advancedSearchOptionSwitch').info.advsearch
                        if (advsearch) {
                            query['advsearch'] = advsearch
                            Object.assign(query, ASODownloadsView.get('optionsDownloads').info)
                        }
                    }
                    if (!query['f_sr']) {
                        query['f_srdd'] = undefined
                    }
                    if (!query['f_sp']) {
                        query['f_spf'] = undefined
                        query['f_spt'] = undefined
                    }
                    const sortedQuery = {}
                    Object.entries(query).map(n => {
                        if (n[1]) {
                            sortedQuery[n[0]] = n[1]
                        }
                    })
                    const searchUrl = utility.getSearchUrl(sortedQuery, urlCategory)
                    await refresh(searchUrl)
                    // 更新search_phrases
                    if (searchPhrase) {
                        const index = glv.config.search_phrases.indexOf(searchPhrase)
                        if (index !== -1) {
                            glv.config.search_phrases.splice(index, 1)
                        }
                        glv.config.search_phrases.unshift(searchPhrase)
                        if (glv.config.search_phrases.length > 10) {
                            glv.config.search_phrases.pop()
                        }
                        glv.saveConfig()
                    }
                }
            }
        }
    },
    {
        type: "input",
        props: {
            id: "textfield_search",
            placeholder: "JSEhViewer",
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
                await refresh(url);
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
            const lowlevel = $("lowlevel_view_rating")
            make.center.equalTo(lowlevel)
            make.height.lessThanOrEqualTo(lowlevel)
            make.width.lessThanOrEqualTo(lowlevel.height).multipliedBy(5)
            make.width.equalTo(lowlevel).priority(999)
            make.height.equalTo(view.width).multipliedBy(1/5)
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
                inner.bgcolor = sender.info.ratingColor
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
            make.center.equalTo($("maskview_grey_for_fivestars"))
            make.size.equalTo($("maskview_grey_for_fivestars"))
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
            insets: $insets(2, 5, 5, 0),
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
        bgcolor: $color("#c6c6c8")
    },
    views: baseViewForItemCellView
}

function getData(items) {
    const data = []
    for (let item of items) {
        const taglist = (typeof(item["taglist"]) === 'string') ? JSON.parse(item["taglist"]) : item["taglist"]
        const itemData = {
            thumbnail_imageview: {
                src: utility.joinPath(glv.cachePath, item['thumbnail_url'].split('/').pop()),
                info: {url: item['url']}
            },
            label_title: {
                text: item['title'] || item['japanese_title'] || item['english_title']
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
                text: utility.renderTaglistToText(utility.translateTaglist(taglist))
            }
        }
        data.push(itemData)
    }
    return data
}

function defineRealListView() {
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
                        const deleted = INFOS.items[indexPath.row]
                        INFOS.items.splice(indexPath.row, 1)
                        database.deleteById(deleted.gid)
                        $file.delete(utility.joinPath(glv.imagePath, `${deleted.gid}_${deleted.token}`))
                        const headerText = sender.header.text
                        const num = /\d+/.exec(headerText)[0]
                        const newHeaderText = headerText.replace(/\d+/, num - 1)
                        sender.header.text = newHeaderText
                        INFOS.search_result = newHeaderText
                    }
                }
            ],
            template: template,
            header: {
                type: "label",
                props: {
                    height: 24,
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
                if (utility.getUrlCategory(url) === 'downloads') {
                    return true
                }
            },
            willBeginDragging: function(sender) {
                initSubviewsStatus()
            },
            ready: async function(sender) {
                while(sender.super) {
                    if (FLAG_RELOAD) {
                        sender.data = getData(INFOS['items'])
                        let unfinished = checkIsDownloadUnfinished()
                        if (!unfinished) {
                            FLAG_RELOAD = false
                        }
                    }
                    await $wait(1)
                }
            }
        }
    }
    return listView
}

function defineListView() {
    const listView = {
        type: "view",
        props: {
            id: "listView"
        },
        views: [...baseViewsForListView, defineRealListView()],
        layout: $layout.fillSafeArea
    }
    return listView
}

function getDownloadsInfosFromDB(url) {
    const result = database.searchByUrl(url, glv.config.downloads_order_method)
    const page = parseInt(utility.parseUrl(url).query.page)
    return {
        items: result.slice(page * 50, (page + 1) * 50),
        current_page_str: (page + 1).toString(),
        total_pages_str: Math.ceil(result.length / 50),
        favcat_nums_titles: null,
        favorites_order_method: null,
        search_result: 'Showing ' + result.length + ' results'
    }
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
    FLAG_RELOAD = false
    url = newUrl
    initSubviewsStatus()
    const urlCategory = utility.getUrlCategory(url)
    let infos
    if (urlCategory === 'downloads') {
        infos = getDownloadsInfosFromDB(url)
    } else {
        utility.startLoading()
        infos = await exhentaiParser.getListInfosFromUrl(url)
        utility.stopLoading()
    }
    // 在此时机插入更新favcat的信息
    if (infos.favcat_nums_titles && infos.favorites_order_method) {
        glv.config.favcat_nums_titles = infos.favcat_nums_titles
        glv.config.favorites_order_method = infos.favorites_order_method
        glv.saveConfig()
    }
    $('rootView').get('listView').get('realListView').data = getData(infos['items'])
    $('rootView').get('listView').get('realListView').header.text = infos['search_result']
    $('rootView').get('listView').get('realListView').scrollTo({
        indexPath: $indexPath(0, 0),
        animated: false
      })
    $('rootView').get('listView').get('button_sidebar').image = getSideBarButtonImage(urlCategory)
    $('rootView').get('listView').get('button_jump_page').get('label_current_page').text = infos['current_page_str']
    $('rootView').get('listView').get('button_jump_page').get('label_total_page').text = infos['total_pages_str']
    $('rootView').get('listView').get('textfield_search').text = utility.parseUrl(url).query.f_search || ''
    startDownloadthumbnails(infos)
    INFOS = infos
    FLAG_RELOAD = true
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

async function init(newUrl) {
    if (!newUrl) {
        if (glv.config.display_downloads_on_start) {
            newUrl = glv.urls.downloads
        } else {
            newUrl = glv.config.default_url
        }
    }
    const listView = defineListView() 
    $("rootView").add(listView)
    const sideBarView = sidebarViewGenerator.defineSidebarView(refresh, presentSettings)
    $("rootView").get("listView").add(sideBarView)  
    refresh(newUrl)
}

function startDownloadthumbnails(infos) {
    const thumbnails = infos['items'].map(n => {
        const url = n['thumbnail_url']
        return {
            url: url,
            path: utility.joinPath(glv.cachePath, url.split('/').pop())
        }
    })
    exhentaiParser.downloadListThumbnailsByBottleneck(thumbnails)
}

function checkIsDownloadUnfinished() {
    const counts = exhentaiParser.checkDownloadListThumbnailsByBottleneck()
    const unfinished = counts.EXECUTING + counts.QUEUED + counts.RUNNING + counts.RECEIVED
    if (unfinished) {
        return true
    } else {
        return false
    }
}

async function presentSettings() {
    const sections = [
        {
            title: 'Default URL',
            footer: $l10n("推荐pathname为空字符串的url作为default url"),
            fields: [
                {
                    type: "string",
                    key: "default_url",
                    title: "URL",
                    value: glv.config.default_url
                },
                {
                    type: "action",
                    buttonTitle: $l10n("将当前url作为default url"),
                    value: async () => {  // I'm hacking myself
                        const scroll = $('formDialogs').views[1].views[1]
                        const target = scroll.views[2].views[2]
                        const valueView = target.views[1]
                        valueView.text = url
                        target.info = {
                            "key": "default_url",
                            "value": url,
                            "type": "string"
                        }
                    }
                },
                {
                    type: "boolean",
                    key: "display_downloads_on_start",
                    title: $l10n("启动时显示downloads页"),
                    value: glv.config.display_downloads_on_start
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
                        $ui.toast($l10n("完成"))
                    }
                },
                {
                    type: "action",
                    buttonTitle: $l10n("重新登录"),
                    value: async () => {
                        const alert = await $ui.alert({
                            title: "确定要重新登录？",
                            actions: [{title: "Cancel"}, {title: "OK"}]
                        })
                        if (alert.index) {
                            const login = JSON.parse($file.read(glv.accountFile).string)
                            utility.startLoading()
                            utility.changeLoadingTitle('正在登录')
                            const success = await exhentaiParser.login(login.username, login.password)
                            if (!success) {
                                utility.stopLoading()
                                $ui.alert($l10n("失败"))
                            }
                            utility.stopLoading()
                            $ui.toast($l10n("完成"))
                        }
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
                        const alert = await $ui.alert({
                            title: "确定要更新标签翻译？",
                            actions: [{title: "Cancel"}, {title: "OK"}]
                        })
                        if (alert.index) {
                            utility.startLoading()
                            await utility.generateTagTranslatorJson()
                            utility.stopLoading()
                            utility.updateTagTranslatorDict()
                            $ui.toast($l10n("完成"))
                        }
                    }
                },
                {
                    type: "action",
                    buttonTitle: $l10n("更新数据库"),
                    value: async () => {
                        const alert = await $ui.alert({
                            title: "确定要更新数据库？",
                            actions: [{title: "Cancel"}, {title: "OK"}]
                        })
                        if (alert.index) {
                            database.createDB()
                            for (let filename of $file.list(glv.imagePath)) {
                                if ($file.list(utility.joinPath(glv.imagePath, filename)).length - 2 > 0) {
                                    const infosFile = utility.joinPath(glv.imagePath, filename, 'manga_infos.json')
                                    const infos = JSON.parse($file.read(infosFile).string)
                                    database.insertInfo(infos)
                                }
                            }
                            $ui.toast($l10n("完成"))
                        }
                    }
                },
                {
                    type: "action",
                    buttonTitle: $l10n("清除缓存"),
                    value: async () => {
                        const alert = await $ui.alert({
                            title: "确定要清除缓存？",
                            actions: [{title: "Cancel"}, {title: "OK"}]
                        })
                        if (alert.index) {
                            $file.delete(glv.cachePath)
                            $file.mkdir(glv.cachePath)
                            for (let filename of $file.list(glv.imagePath)) {
                                if ($file.list(utility.joinPath(glv.imagePath, filename)).length - 2 > 0) {
                                    $file.delete(utility.joinPath(glv.imagePath, filename))
                                }
                            }
                            $ui.toast($l10n("完成"))
                        }
                    }
                },
                {
                    type: "action",
                    buttonTitle: $l10n("清除未收藏的下载内容"),
                    value: async () => {
                        const alert = await $ui.alert({
                            title: "确定要清除全部下载内容？",
                            actions: [{title: "Cancel"}, {title: "OK"}]
                        })
                        if (alert.index) {
                            for (let folder of $file.list(glv.imagePath)) {
                                const infos = JSON.parse($file.read(utility.joinPath(glv.imagePath, folder, 'manga_infos.json')).string)
                                if (!infos['favcat']) {
                                    $file.delete(utility.joinPath(glv.imagePath, folder))
                                }
                            }
                            $ui.toast($l10n("完成"))
                        }
                    }
                },
                {
                    type: "action",
                    buttonTitle: $l10n("清除全部下载内容"),
                    value: async () => {
                        const alert = await $ui.alert({
                            title: "确定要清除全部下载内容？",
                            actions: [{title: "Cancel"}, {title: "OK"}]
                        })
                        if (alert.index) {
                            $file.delete(glv.imagePath)
                            $file.mkdir(glv.imagePath)
                            $ui.toast($l10n("完成"))
                        }
                    }
                }
            ]
        },
        {
            title: 'Others',
            fields: [
                {
                    type: "segmentedControl",
                    key: "favorites_order_method",
                    title: $l10n("Favorites排序方式"),
                    items: ['按收藏时间', '按发布时间'], // Favorited, Posted
                    value: (glv.config.favorites_order_method === 'Posted') ? 1 : 0
                },
                {
                    type: "segmentedControl",
                    key: "downloads_order_method",
                    title: $l10n("downloads排序方式"),
                    items: ['按序号', '按创建时间'], // gid, st_mtime
                    value: (glv.config.downloads_order_method === 'st_mtime') ? 1 : 0
                }
            ]
        }
    ]
    const result = await formDialogs.formDialogs(sections)
    const favorites_order_method_items = ['Favorited', 'Posted']
    const downloads_order_method_items = ['gid', 'st_mtime']
    const favorites_order_method = favorites_order_method_items[result.favorites_order_method]
    if (!(glv.config.favorites_order_method === favorites_order_method)) {
        let success
        if (favorites_order_method === 'Favorited') {
            success = await exhentaiParser.setFavoritesUsingFavorited()
        } else {
            success = await exhentaiParser.setFavoritesUsingPosted()
        }
        if (!success) {
            $ui.toast($l10n("改变favorites排序方式失败"))
        } else {
            glv.config.favorites_order_method = favorites_order_method
        }
    }
    glv.config.downloads_order_method = downloads_order_method_items[result.downloads_order_method]
    glv.config.display_downloads_on_start = result.display_downloads_on_start
    glv.config.default_url = result.default_url
    glv.saveConfig()
}


module.exports = {
    init: init
}
