const utility = require('./utility')
const mpvGenerator = require('./mpv')
const tagTableViewGenerator = require('./tagTableView')
const ratingAlert = require('./dialogs/ratingAlert')
const favoriteDialogs = require('./dialogs/favoriteDialogs')
const commentsViewGenerator = require('./enlargedCommentsView')
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')

let GLOBAL_WIDTH = utility.getWindowSize().width;
let url;
let infos;

var baseViewsForGalleryView = [
    {
        type: "button",
        props: {
            id: "button_archive",
            image: $image("assets/icons/archive_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.inset(57 * 2)
        }
    },
    {
        type: "button",
        props: {
            id: "button_close",
            bgcolor: $color("white")
        },
        views: [
            {
                type: "image",
                props: {
                    symbol: 'arrowshape.turn.up.left',
                    tintColor: $color("#007aff")
                },
                layout: function(make, view) {
                    make.edges.insets($insets(12.5, 12.5, 12.5, 12.5))
                }
            }
        ],
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_archive").top)
        },
        events: {
            tapped: function (sender) {
                $ui.pop()
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
            make.bottom.equalTo($("button_close").top)
        },
        events: {
            tapped: async function(sender) {
                await refresh()
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_share",
            image: $image("assets/icons/share_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
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
            id: "button_safari",
            image: $image("assets/icons/ios7_world_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_share").top)
        }
    },
    {
        type: "button",
        props: {
            id: "button_info",
            image: $image("assets/icons/information_circled_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("white"),
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_safari").top)
        }
    },
    {
        type: "button",
        props: {
            id: "button_update",
            title: "更新版本",
            align: $align.center,
            font: $font(13),
            titleColor: $color("#007aff"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_info").top)
        }
    },
    {
        type: "button",
        props: {
            id: "button_try_import_old_version",
            title: "导入旧版",
            align: $align.center,
            font: $font(13),
            titleColor: $color("#007aff"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_info").top)
        }
    }
]

function renderGalleryInfoView() {
    const baseViewsForGalleryInfoView = [
        {
            type: "image",
            props: {
                id: "thumbnail_imageview",
                source: {
                    url: infos['pics'][0]['thumbnail_url'],
                    header: {
                        "User-Agent": glv.userAgent,
                        "Cookie": exhentaiParser.getCookie(),
                    }
                },
                contentMode: 1,
                bgcolor: $color("#efeff4")
            },
            layout: function (make, view) {
                make.top.left.bottom.inset(1)
                make.right.equalTo(view.super.right).multipliedBy(182 / 695)
            }
        },
        {
            type: "label",
            props: {
                id: "label_japanese_title",
                text: infos['japanese_title'],
                font: $font(14),
                align: $align.left,
                lines: 0,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(40)
                make.top.right.inset(1)
                make.left.equalTo($("thumbnail_imageview").right).inset(1)
            }
        },
        {
            type: "label",
            props: {
                id: "label_english_title",
                text: infos['english_title'],
                font: $font(14),
                align: $align.left,
                lines: 0,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(40)
                make.right.inset(1)
                make.top.equalTo($("label_japanese_title").bottom).inset(1)
                make.left.equalTo($("label_japanese_title").left)
            }
        },
        {
            type: "label",
            props: {
                id: "label_url",
                text: infos['url'],
                font: $font(12),
                align: $align.left,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(24)
                make.right.inset(1)
                make.top.equalTo($("label_english_title").bottom).inset(1)
                make.left.equalTo($("label_english_title").left)
            }
        },
        {
            type: "label",
            props: {
                id: "label_category",
                text: infos['category'],
                font: $font('bold', 15),
                align: $align.center,
                textColor: $color("white"),
                bgcolor: $color(utility.getNameAndColor(infos['category'].toLowerCase())['color'])
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_url").left)
                make.top.equalTo($("label_url").bottom).inset(2)
                make.right.multipliedBy((183 + 170) / 695)
            }
        },
        {
            type: "label",
            props: {
                id: "label_length",
                text: infos['length'] + ' pages',
                font: $font(12),
                align: $align.center,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_category").left)
                make.top.equalTo($("label_category").bottom).inset(1)
                make.right.equalTo($("label_category").right)
            }
        },
        {
            type: "label",
            props: {
                id: "label_uploader",
                text: 'uploader: ' + infos['uploader'],
                font: $font(12),
                align: $align.center,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_length").left)
                make.top.equalTo($("label_length").bottom).inset(1)
                make.right.equalTo($("label_length").right)
            }
        },
        {
            type: "label",
            props: {
                id: "label_posted",
                text: infos['posted'],
                font: $font(12),
                align: $align.center,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_uploader").left)
                make.top.equalTo($("label_uploader").bottom).inset(1)
                make.right.equalTo($("label_uploader").right)
            }
        },
        {
            type: "view",
            props: {
                id: "lowlevel_view_rating",
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_category").right).inset(1)
                make.top.equalTo($("label_url").bottom).inset(2)
                make.right.multipliedBy((354 + 170) / 695)
            }
        },
        {
            type: "canvas",
            props: {
                id: "canvas_rating",
                info: {
                    display_rating: parseFloat(infos['display_rating']), 
                    ratingColor: $color((infos['is_personal_rating']) ? "#5eacff" : "#ffd217")
                }
            },
            layout: (make, view) => {
                make.height.equalTo(30)
                make.width.equalTo(150)
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
                image: $image("assets/icons/fivestars_mask_500x100.png").alwaysTemplate,
                contentMode: 2,
                userInteractionEnabled: true
            },
            layout: (make, view) => {
                make.height.equalTo(30)
                make.width.equalTo(150)
                make.center.equalTo($("lowlevel_view_rating"))
            },
            events: {
                tapped: async function(sender) {
                    const rating = await ratingAlert.ratingAlert(infos.display_rating)
                    console.info(rating)
                }
            }
        },
        {
            type: "label",
            props: {
                id: "label_review",
                text: infos['rating'] + ' on ' + infos['number of reviews'] + ' reviews',
                font: $font(12),
                align: $align.center,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(34)
                make.left.equalTo($("lowlevel_view_rating").left)
                make.top.equalTo($("lowlevel_view_rating").bottom).inset(1)
                make.right.equalTo($("lowlevel_view_rating").right)
            }
        },
        {
            type: "label",
            props: {
                id: "label_favorite_title",
                text: (infos['favcat']) ? infos['favcat_title'] : '未收藏',
                font: $font("bold", 14),
                align: $align.center,
                userInteractionEnabled: true,
                textColor: (infos['favcat']) ? $color("white") : $color("black"),
                bgcolor: (infos['favcat']) ? $color(utility.getColorFromFavcat(infos['favcat'])): $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_review").left)
                make.top.equalTo($("label_review").bottom).inset(1)
                make.right.equalTo($("label_review").right)
            },
            events: {
                tapped: async function(sender) {
                    const favInfos = await exhentaiParser.getFavcatAndFavnote(infos['url'])
                    const result = await favoriteDialogs.favoriteDialogs(favInfos.favcat_titles, favInfos.favcat_selected, favInfos.favnote, favInfos.is_favorited)
                    console.info(result)
                }
            }
        },
        {
            type: "label",
            props: {
                id: "label_favorite_num",
                text: 'favorited: ' + infos['favorited'],
                font: $font(12),
                align: $align.center,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_favorite_title").left)
                make.top.equalTo($("label_favorite_title").bottom).inset(1)
                make.right.equalTo($("label_favorite_title").right)
            }
        },
        {
            type: "label",
            props: {
                id: "label_language",
                text: infos['language'],
                font: $font(12),
                align: $align.center,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("lowlevel_view_rating").right).inset(1)
                make.top.equalTo($("label_url").bottom).inset(2)
                make.right.inset(1)
            }
        },
        {
            type: "label",
            props: {
                id: "label_filesize",
                text: infos['file size'],
                font: $font(12),
                align: $align.center,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_language").left)
                make.top.equalTo($("label_language").bottom).inset(1)
                make.right.equalTo($("label_language").right)
            }
        },
        {
            type: "button",
            props: {
                id: "button_start_mpv",
                title: "阅读",
                titleColor: $color("#007aff"),
                bgcolor: $color("white"),
                font: $font(15),
                radius: 5,
                borderWidth: 2,
                borderColor: $color("#7faaff")
            },
            layout: function (make, view) {
                make.height.equalTo(72)
                make.right.inset(6)
                make.top.equalTo($("label_filesize").bottom).inset(1)
                make.left.equalTo($("label_favorite_num").right).inset(6)
            },
            events : {
                tapped: function(sender) {
                    mpvGenerator.init(infos)
                }
            }
        }
    ]
    const galleryInfoView = {
        type: "view",
        props: {
            id: "galleryInfoView",
            bgcolor: $color("#efeff4")
        },
        views: baseViewsForGalleryInfoView,
        layout: function (make, view) {
            make.height.equalTo(257)
            make.left.inset(16)
            make.top.inset(18)
            make.right.inset(57)
        }
    }
    return galleryInfoView
}

function renderFullTagTableView(width, translated = true) {
    const bilingualTaglist = utility.getBilingualTaglist(infos.taglist, translated = translated)
    const tagTableView = tagTableViewGenerator.renderTagTableView(width - 2 - 50, bilingualTaglist)
    const height = tagTableView.props.frame.height + 2
    const views = [
        {
            type: "scroll",
            props: {
                id: "scroll",
                contentSize: $size(0, height-2)
            },
            layout: function (make, view) {
                make.top.bottom.left.inset(1)
                make.right.inset(51)
            },
            views: [tagTableView]
        },
        {
            type: "view",
            props: {
                bgcolor: $color("#c8c7cc")
            },
            layout: function (make, view) {
                make.width.equalTo(1)
                make.top.bottom.inset(0)
                make.right.inset(50)
            }
        },
        {
            type: "button",
            props: {
                id: 'buttonTranslate',
                image: $image('assets/icons/language_64x64.png').alwaysTemplate,
                tintColor: $color("#007aff"),
                bgcolor: $color("clear"),
                imageEdgeInsets: $insets(5, 5, 5, 5)
            },
            layout: function (make, view) {
                make.size.equalTo($size(32, 32))
                make.top.inset(height * 0.25 - 16)
                make.right.inset(10)
            }
        },
        {
            type: "button",
            props: {
                id: 'buttonCopy',
                image: $image('assets/icons/ios7_copy_64x64.png').alwaysTemplate,
                tintColor: $color("#007aff"),
                bgcolor: $color("clear")
            },
            layout: function (make, view) {
                make.size.equalTo($size(32, 32))
                make.bottom.inset(height * 0.25 - 16)
                make.right.inset(10)
            }
        }
    ]
    return {
        props: {
            id: "fullTagTableView",
            bgcolor: $color("white"),
            borderWidth: 1,
            borderColor: $color('#c8c7cc'),
            frame: $rect(0, 0, width, height)
        },
        views: views,
        layout: (make, view) => {
          make.left.top.right.inset(0)
          make.height.equalTo(height)
        }
    }
}

function renderCommentsView() {
    const comments_text = []
    for (let i of infos['comments']) {
        let c4text;
        if (i['is_uploader']) {
            c4text = 'uploader'
        } else if (i['score']) {
            c4text = i['score']
        } else {
            c4text = ''
        }
        const text = '<p>' + i['posted_time'] + ' by ' + i['commenter'] + ', ' + c4text + '</p>' + i['comment_div'] + '<hr>'
        comments_text.push(text)
    }
    const textview = {
        type: "text",
        props: {
            id: "textview_taglist",
            html: comments_text.join([...Array(30)].map((n,i)=>'-').join('')),
            font: $font(12),
            align: $align.left,
            editable: false,
            selectable: false,
            textColor: $color("black"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.top.left.bottom.inset(1)
            make.right.inset(51)
        }
    }
    const button = {
        type: "button",
        props: {
            id: "button_enlarge",
            image: $image('assets/icons/arrow_expand_64x64.png').alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("clear")
        },
        layout: function (make, view) {
            make.size.equalTo($size(32, 32))
            make.centerY.equalTo(view.super)
            make.right.inset(10)
        },
        events: {
            tapped: function(sender) {
                const commentsView = commentsViewGenerator.renderCommentsView(infos)
                const maskView = utility.renderMaskView()
                $ui.window.add(maskView)
                $ui.window.add(commentsView)
            }
        }
    }
    const line = {
        type: "view",
        props: {
            bgcolor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.width.equalTo(1)
            make.top.bottom.inset(0)
            make.right.inset(50)
        }
    }
    const commentsView = {
        type: "view",
        props: {
            id: 'commentsView',
            borderWidth: 1,
            borderColor: $color("#c8c7cc"),
            bgcolor: $color("white")
        },
        views: [textview, button, line],
        layout: function (make, view) {
            make.height.equalTo(150)
            make.left.right.inset(0)
            make.top.equalTo($("fullTagTableView").bottom)
        }
    }
    return commentsView
}

function renderHeaderView() {
    const fullTagTableView = renderFullTagTableView(695)
    const commentsView = renderCommentsView()
    const headerViewHeight = fullTagTableView.props.frame.height + 150
    const views = [
        fullTagTableView,
        commentsView
    ]
    const headerView = {
        type: "view",
        props: {
            height: headerViewHeight,
            id: "headerView"
        },
        views: views
    }
    return headerView
}

function getData() {
    const data = []
    for (let pic of infos['pics']) {
        const itemData = {
            thumbnail_imageview: {
                source: {
                    url: pic['thumbnail_url'],
                    header: {
                        "User-Agent": glv.userAgent,
                        "Cookie": exhentaiParser.getCookie(),
                    }
                },
                info: {url: infos['url'], page: pic['page']}
            },
            label_title: {
                text: pic['img_id']
            }
        }
        data.push(itemData)
    }
    return data
}

function renderMatrixView() {
    const matrix = {
        type: "matrix",
        props: {
            id: "matrixView",
            borderWidth: 1,
            borderColor: $color('#c8c7cc'),
            bgcolor: $color('#efeff4'),
            itemSize: $size(139, 213),
            template: [
                {
                    type: "image",
                    props: {
                        id: "thumbnail_imageview",
                        bgcolor: $color("clear"),
                        borderWidth: 0.0,
                        contentMode: 1,
                        userInteractionEnabled: true
                    },
                    layout: function(make, view) {
                        make.size.equalTo($size(137, 195))
                        make.top.inset(0)
                        make.left.inset(1)
                    }
                },
                {
                    type: "label",
                    props: {
                        id: "label_title",
                        font: $font(12),
                        align: $align.center,
                        bgcolor: $color("clear"),
                        borderWidth: 0.0
                    },
                    layout: function(make, view) {
                        make.size.equalTo($size(158, 18))
                        make.top.inset(195)
                        make.left.inset(0)
                    }
                }
            ],
            data: getData(),
            header: renderHeaderView()
        },
        layout: function (make, view) {
            make.bottom.inset(0)
            make.top.equalTo($("galleryInfoView").bottom).inset(1)
            make.left.inset(16)
            make.right.inset(57)
        },
        events: {
            didSelect: function(sender, indexPath, data) {
                mpvGenerator.init(infos, indexPath.item + 1)
            }
        }
    }
    return matrix
}

function renderGalleryView() {
    const galleryView = {
        type: "view",
        props: {
            id: "galleryView",
            bgcolor: $color("white")
        },
        views: baseViewsForGalleryView,
        layout: $layout.fill
    }
    return galleryView
}

async function refresh(newUrl, getNewInfos=true) {
    if (!newUrl) {
        url = infos.url
    } else {
        url = newUrl
    }
    if (getNewInfos) {
        utility.startLoading()
        infos = await exhentaiParser.getGalleryMpvInfosFromUrl(url)
        utility.stopLoading()
        const path = utility.joinPath(glv.imagePath, infos.filename)
        exhentaiParser.saveMangaInfos(infos, path)
    }
    const galleryView = $ui.window.get('galleryView')
    const galleryInfoView = galleryView.get('galleryInfoView')
    const matrixView = galleryView.get('matrixView')
    if (galleryInfoView) {
        galleryInfoView.remove()
    }
    if (matrixView) {
        matrixView.remove()
    }
    galleryView.add(renderGalleryInfoView())
    galleryView.add(renderMatrixView())
}

async function init(newUrl) {
    const galleryView = renderGalleryView()
    const rootView = {
        props: {
            navBarHidden: true,
            statusBarHidden: false,
            statusBarStyle: 0
        },
        views: [galleryView],
        events: {
            layoutSubviews: async function(sender) {
                if (sender.frame.width !== GLOBAL_WIDTH) {
                    GLOBAL_WIDTH = sender.frame.width
                }
            }
        }
    }
    $ui.push(rootView)
    const filename = utility.verifyUrl(newUrl)
    const infosFile = utility.joinPath(glv.imagePath, filename, 'manga_infos.json')
    if ($file.exists(infosFile)) {
        infos = JSON.parse($file.read(infosFile).string)
        await refresh(newUrl, getNewInfos=false)
    } else {
        await refresh(newUrl)
    }
}

module.exports = {
    init: init
}
