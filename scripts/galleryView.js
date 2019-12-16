const utility = require('./utility')
const mpvGenerator = require('./mpv')
const fullTagTableViewGenerator = require('./tagTableView')
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')

var baseViewsForGalleryView = [
    {
        type: "button",
        props: {
            id: "button_archive",
            image: $image("assets/icons/archive_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
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
            image: $image("assets/icons/close_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_archive").top)
        },
        events: {
            tapped: function (sender) {
                $("rootView").get("galleryView").remove()
            }
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
            make.bottom.equalTo($("button_close").top)
        }
    },
    {
        type: "button",
        props: {
            id: "button_share",
            image: $image("assets/icons/share_32_57.png").alwaysTemplate,
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
            id: "button_safari",
            image: $image("assets/icons/ios7_world_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
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
            image: $image("assets/icons/information_circled_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
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
            titleColor: $color("#0079FF"),
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
            titleColor: $color("#0079FF"),
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

function renderGalleryInfoView(infos, path) {
    const baseViewsForGalleryInfoView = [
        {
            type: "image",
            props: {
                id: "thumbnail_imageview",
                source: {
                    url: infos['pics'][0]['thumbnail_url'],
                    //placeholder: image,
                    header: {
                        "User-Agent": exhentaiParser.USERAGENT,
                        "Cookie": exhentaiParser.COOKIE,
                    }
                },
                //src: utility.joinPath(path, 'thumbnails', infos['pics'][0]['img_id'] + '.jpg'),
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
                image: $image("assets/icons/fivestars_mask.png").alwaysTemplate,
                contentMode: 2
            },
            layout: (make, view) => {
                make.height.equalTo(30)
                make.width.equalTo(150)
                make.center.equalTo($("lowlevel_view_rating"))
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
                textColor: (infos['favcat']) ? $color("white") : $color("black"),
                bgcolor: (infos['favcat']) ? $color(utility.getColorFromFavcat(infos['favcat'])): $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_review").left)
                make.top.equalTo($("label_review").bottom).inset(1)
                make.right.equalTo($("label_review").right)
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
                titleColor: $color("#0079FF"),
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

function renderCommentsView(infos) {
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
            image: $image('assets/icons/arrow_expand_32_32.png').alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("clear")
        },
        layout: function (make, view) {
            make.size.equalTo($size(32, 32))
            make.centerY.equalTo(view.super)
            make.right.inset(10)
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

function renderThumbnailView(img_id, thumbnail_url, img_path, url) {
    const image = {
        type: "image",
        props: {
            source: {
                url: thumbnail_url,
                //placeholder: image,
                header: {
                    "User-Agent": exhentaiParser.USERAGENT,
                    "Cookie": exhentaiParser.COOKIE,
                }
            },
            info: {url: url, page: parseInt(img_id)},
            bgcolor: $color("clear"),
            borderWidth: 0.0,
            frame: $rect(1, 0, 137, 195),
            contentMode: 1,
            userInteractionEnabled: true
        }
    }
    const label = {
        type: "label",
        props: {
            text: img_id,
            font: $font(12),
            align: $align.center,
            bgcolor: $color("clear"),
            borderWidth: 0.0,
            frame: $rect(0, 195, 158, 18)
        }
    }
    const thumbnailView = {
        type: 'view',
        props: {
            size: $size(139, 213)
        },
        views: [image, label]
    }
    return thumbnailView
}

function renderThumbnailsView(infos, path) {
    const nums_in_a_row = 5
    const interval_width = (695 % 139) / (nums_in_a_row - 1)
    const thumbnailsView = []
    for (let n in infos['pics']) {
        const pic = infos['pics'][n]
        const p = utility.joinPath(path, 'thumbnails', pic['img_id']+'.jpg')
        const thumbnailView = renderThumbnailView(pic['img_id'], pic['thumbnail_url'], p, infos['url'])
        thumbnailView.props.frame = $rect(
            139 * (n % nums_in_a_row) + interval_width * (n % nums_in_a_row), 
            213 * Math.floor(n / nums_in_a_row), 139, 213
        )
        thumbnailsView.push(thumbnailView)
    }
    return {
        type: 'view',
        props: {
            borderWidth: 1,
            borderColor: $color("#c8c7cc"),
            size: $size(695, 213 * Math.ceil(infos['pics'].length / nums_in_a_row))
        },
        views: thumbnailsView,
        layout: function(make, view) {
            make.left.right.inset(0)
            make.top.equalTo($("commentsView").bottom)
            make.height.equalTo(view.size.height)
        }
    }
}

function renderScrollContentView(infos, path) {
    const fullTagTableView = fullTagTableViewGenerator.renderFullTagTableView(695, infos)
    const commentsView = renderCommentsView(infos)
    const thumbnailsView = renderThumbnailsView(infos, path)
    const scrollContentViewHeight = fullTagTableView.props.frame.height + 150 + thumbnailsView.props.size.height
    const views = [
        fullTagTableView,
        commentsView,
        thumbnailsView
    ]
    const scrollContentView = {
        type: "view",
        props: {
            id: "scrollContentView"
        },
        views: views,
        layout: function (make, view) {
            make.height.equalTo()
            make.right.equalTo(view.super.super.right)
            make.left.equalTo(view.super.super.left)
        }
    }
    return [scrollContentView, scrollContentViewHeight]
}

function renderScrollView(infos, path, contentSizeHeight) {
    const scrollView = {
        type: "scroll",
        props: {
            id: "scrollView",
            contentSize: $size(0, contentSizeHeight)
        },
        layout: $layout.fill
    }
    const scrollLocationView = {
        type: "view",
        props: {
            id: "scrollLocationView"
        },
        views: [scrollView],
        layout: function (make, view) {
            make.bottom.inset(0)
            make.top.equalTo($("galleryInfoView").bottom).inset(1)
            make.left.inset(16)
            make.right.inset(57)
        }
    }
    return scrollLocationView
}

function renderGalleryView(infos, path, contentSizeHeight) {
    const galleryView = {
        type: "view",
        props: {
            id: "galleryView",
            bgcolor: $color("white")
        },
        views: [...baseViewsForGalleryView, renderGalleryInfoView(infos, path), renderScrollView(infos, path, contentSizeHeight)],
        layout: $layout.fill
    }
    return galleryView
}

async function init(url) {
    const infos = await exhentaiParser.getGalleryMpvInfosFromUrl(url)
    const path = utility.joinPath(glv.imagePath, infos['filename'])
    exhentaiParser.saveMangaInfos(infos, path)
    const [scrollContentView, scrollContentViewHeight] = renderScrollContentView(infos, path)
    $("rootView").add(renderGalleryView(infos, path, scrollContentViewHeight))
    $("rootView").get("galleryView").get("scrollLocationView").get("scrollView").add(scrollContentView)
}

module.exports = {
    init: init
}
