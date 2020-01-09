const glv = require('./globalVariables')
const utility = require('./utility')
const exhentaiParser = require('./exhentaiParser')
const database = require('./database')
const mpvGenerator = require('./mpv')
const infosViewGenerator = require('./infosView')
const tagTableViewGenerator = require('./tagTableView')
const ratingAlert = require('./dialogs/ratingAlert')
const favoriteDialogs = require('./dialogs/favoriteDialogs')
const commentDialogs = require('./dialogs/commentDialogs')

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
        },
        events: {
            tapped: async function(sender) {
                let alertTitle
                if (parseInt(infos.length) === $file.list(utility.joinPath(glv.imagePath, infos.filename)).length - 2) {
                    alertTitle = "是否保存为压缩包？"
                } else {
                    alertTitle = "本图库尚未下载完成，是否保存为压缩包？"
                }
                const alert = await $ui.alert({
                    title: alertTitle,
                    actions: [{title: "Cancel"}, {title: "OK"}]
                })
                if (alert.index) {
                    await $archiver.zip({
                        directory: utility.joinPath(glv.imagePath, infos.filename),
                        dest: infos.filename + '.zip'
                    });
                    $ui.toast($l10n("完成"))
                }
            }
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
        },
        events: {
            tapped: function(sender) {
                const title = infos.japanese_title || infos.english_title
                $share.sheet(title + '\n' + infos.url)
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_safari",
            bgcolor: $color("white")
        },
        views: [
            {
                type: "image",
                props: {
                    symbol: 'safari',
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
            make.bottom.equalTo($("button_share").top)
        },
        events: {
            tapped: function(sender) {
                $app.openURL(infos.url)
            }
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
        },
        events: {
            tapped: function(sender) {
                $ui.push({
                    props: {
                        navBarHidden: true,
                        statusBarHidden: false,
                        statusBarStyle: 0
                    },
                    views: [infosViewGenerator.defineInfosView(infos)]
                })
            }
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
            bgcolor: $color("white"),
            hidden: true
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_info").top)
        },
        events: {
            tapped: async function(sender) {
                const old_gid = infos.gid
                const old_filename = infos.filename
                const old_pics_dict = {}
                infos.pics.map(n => {
                    old_pics_dict[n.key] = utility.joinPath(glv.imagePath, infos.filename, n.img_id + n.img_name.slice(n.img_name.lastIndexOf('.')))
                })
                const newUrl = sender.info.url
                const filename = utility.verifyUrl(newUrl)
                const infosFile = utility.joinPath(glv.imagePath, filename, 'manga_infos.json')
                if ($file.exists(infosFile)) {
                    infos = JSON.parse($file.read(infosFile).string)
                    await refresh(newUrl, getNewInfos=false)
                } else {
                    await refresh(newUrl)
                }
                new_pics_dict = {}
                infos.pics.map(n => {
                    new_pics_dict[n.key] = utility.joinPath(glv.imagePath, infos.filename, n.img_id + n.img_name.slice(n.img_name.lastIndexOf('.')))
                })
                for (let key in old_pics_dict) {
                    if ($file.exists(old_pics_dict[key]) && key in new_pics_dict && !$file.exists(new_pics_dict[key])) {
                        $file.move({
                            src: old_pics_dict[key],
                            dst: new_pics_dict[key]
                        })
                    }
                }
                database.deleteById(old_gid)
                $file.delete(utility.joinPath(glv.imagePath, old_filename))
                $ui.window.get("galleryView").get("button_try_import_old_version").hidden = true
            }
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
            bgcolor: $color("white"),
            hidden: true
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_info").top)
        },
        events: {
            tapped: function(sender) {
                const old_filename = sender.info.filename
                const old_gid = old_filename.split('_')[0]
                const old_infosFile = utility.joinPath(glv.imagePath, old_filename, 'manga_infos.json')
                const old_infos = JSON.parse($file.read(old_infosFile).string)
                const old_pics_dict = {}
                old_infos.pics.map(n => {
                    old_pics_dict[n.key] = utility.joinPath(glv.imagePath, old_filename, n.img_id + n.img_name.slice(n.img_name.lastIndexOf('.')))
                })
                new_pics_dict = {}
                infos.pics.map(n => {
                    new_pics_dict[n.key] = utility.joinPath(glv.imagePath, infos.filename, n.img_id + n.img_name.slice(n.img_name.lastIndexOf('.')))
                })
                for (let key in old_pics_dict) {
                    if ($file.exists(old_pics_dict[key]) && key in new_pics_dict && !$file.exists(new_pics_dict[key])) {
                        console.info(key)
                        $file.move({
                            src: old_pics_dict[key],
                            dst: new_pics_dict[key]
                        })
                    }
                }
                database.deleteById(old_gid)
                $file.delete(utility.joinPath(glv.imagePath, old_filename))
                $ui.window.get("galleryView").get("button_try_import_old_version").hidden = true
            }
        }
    }
]

function defineGalleryInfoView() {
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
            type: "view",
            props: {
                id: "downloadProgressView",
                bgcolor: $color("white")
            },
            views: [
                {
                    type: "view",
                    props: {
                    id: "inner",
                    bgcolor: $color("#ffffb6")
                    }
                }
            ],
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_category").left)
                make.top.equalTo($("label_category").bottom).inset(1)
                make.right.equalTo($("label_category").right)
            },
            events: {
                ready: async function(sender) {
                    const path = utility.joinPath(glv.imagePath, infos.filename)
                    await $wait(0.1)
                    while (sender.super && $file.list(path).length - 2 < parseInt(infos.pics.length)) {
                        sender.get("inner").frame = $rect(0, 0, sender.frame.width * ($file.list(path).length - 2) / parseInt(infos.pics.length), 36)
                        await $wait(1)
                    }
                    if (sender.super && $file.list(path).length - 2 === parseInt(infos.pics.length)) {
                        sender.get("inner").frame = $rect(0, 0, sender.frame.width, 36)
                        sender.get("inner").bgcolor = $color("#b4ffbb")
                    }
                }
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
                bgcolor: $color("clear")
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
                bgcolor: $color("white"),
                userInteractionEnabled: true,
                info: {selected: false}
            },
            layout: function (make, view) {
                make.height.equalTo(36)
                make.left.equalTo($("label_length").left)
                make.top.equalTo($("label_length").bottom).inset(1)
                make.right.equalTo($("label_length").right)
            },
            events: {
                tapped: function(sender) {
                    if (!sender.info.selected) {
                        sender.bgcolor = $color("gray")
                        sender.info = {selected: true}
                    } else {
                        sender.bgcolor = $color("white")
                        sender.info = {selected: false}
                    }
                }
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
                id: "delete_line_view",
                bgcolor: $color("black"),
                alpha: 0.5,
                hidden: ((infos['visible'] === "Yes") ? true : false)
            },
            layout: function (make, view) {
                make.height.equalTo(1)
                make.center.equalTo($("label_posted"))
                make.width.equalTo(105)
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
                id: "canvas_rating"
            },
            layout: (make, view) => {
                make.height.equalTo(30)
                make.width.equalTo(150)
                make.center.equalTo($("lowlevel_view_rating"))
            },
            events: {
                draw: function(view, ctx) {
                    const width = view.frame.width * parseFloat(infos['display_rating']) / 5;
                    const height = view.frame.height;
                    ctx.fillColor = $color((infos['is_personal_rating']) ? "#5eacff" : "#ffd217");
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
                    utility.startLoading()
                    const success = await exhentaiParser.rateGallery(rating, infos.apikey, infos.apiuid, infos.gid, infos.token)
                    utility.stopLoading()
                    if (success) {
                        infos['is_personal_rating'] = true
                        infos['display_rating'] = rating
                        const canvas = sender.super.get('canvas_rating')
                        canvas.runtimeValue().invoke("setNeedsDisplay")
                        const path = utility.joinPath(glv.imagePath, infos.filename)
                        exhentaiParser.saveMangaInfos(infos, path)
                    } else {
                        $ui.toast($l10n("评分失败"))
                    }
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
                make.height.equalTo(36)
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
                    utility.startLoading()
                    const favInfos = await exhentaiParser.getFavcatAndFavnote(infos['url'])
                    utility.stopLoading()
                    const result = await favoriteDialogs.favoriteDialogs(favInfos.favcat_titles, favInfos.favcat_selected, favInfos.favnote, favInfos.is_favorited)
                    const old_is_favorited = favInfos.is_favorited
                    utility.startLoading()
                    const success = await exhentaiParser.addFav(infos['url'], result.favcat, result.favnote, old_is_favorited)
                    utility.stopLoading()
                    if (success) {
                        infos['favcat_title'] = result.favcat_title
                        infos['favcat'] = (result.favcat === "favdel") ? null : result.favcat
                        sender.text = (infos['favcat']) ? infos['favcat_title'] : '未收藏'
                        sender.textColor = (infos['favcat']) ? $color("white") : $color("black")
                        sender.bgcolor = (infos['favcat']) ? $color(utility.getColorFromFavcat(infos['favcat'])) : $color("white")
                        const path = utility.joinPath(glv.imagePath, infos.filename)
                        exhentaiParser.saveMangaInfos(infos, path)
                    } else {
                        $ui.toast($l10n("收藏失败"))
                    }
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
                    $ui.window.get("galleryView").get("button_try_import_old_version").hidden = true
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

function defineFullTagTableView(width, translated = true) {
    const bilingualTaglist = utility.getBilingualTaglist(infos.taglist, translated = translated)
    const tagTableView = tagTableViewGenerator.defineTagTableView(width - 51, bilingualTaglist)
    const height = Math.max(tagTableView.props.info.height, 100)
    const views = [
        {
            type: "scroll",
            props: {
                id: "scroll",
                contentSize: $size(width - 51, height)
            },
            layout: function (make, view) {
                make.top.bottom.left.inset(0)
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
                imageEdgeInsets: $insets(5, 5, 5, 5),
                info: {translated: translated}
            },
            layout: function (make, view) {
                make.size.equalTo($size(32, 32))
                make.top.inset(height * 0.25 - 16)
                make.right.inset(10)
            },
            events: {
                tapped: function(sender) {
                    const translated = !sender.info.translated
                    const newTagTableView = tagTableViewGenerator.defineTagTableView(width - 51, bilingualTaglist, translated)
                    const height = newTagTableView.props.info.height
                    const scroll = sender.super.get("scroll")
                    scroll.get("tagTableView").remove()
                    scroll.add(newTagTableView)
                    scroll.contentSize = $size(width - 51, height)
                    sender.info = {translated: translated}
                }
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
            },
            events: {
                tapped: function(sender) {
                    const label_uploader = $ui.window.get("galleryView").get("galleryInfoView").get("label_uploader")
                    const selectedTags = []
                    const tagTableView = sender.super.get("scroll").get("tagTableView")
                    const tagsViews = tagTableView.views.filter(n => n.views.length)
                    for (let tagsView of tagsViews) {
                        tagsView.views.map(n => {
                            if (n.info.selected) {
                                selectedTags.push(n.info)
                            }
                        })
                    }
                    const texts = []
                    if (selectedTags.length === 0 && !label_uploader.info.selected) {
                        $ui.toast($l10n("未选中任何标签"))
                    } else {
                        if (label_uploader.info.selected) {
                            texts.push('uploader:' + label_uploader.text.slice(10))
                        }
                        if (selectedTags.length) {
                            selectedTags.map(n => {
                                if (n.originalText.indexOf(' ') !== -1) {
                                    texts.push(`${n.tagType }:"${n.originalText }$"`)
                                } else {
                                    texts.push(`${n.tagType }:${n.originalText }$`)
                                }
                            })
                        }
                    }
                    $clipboard.text = texts.join(' ')
                    $ui.toast($l10n("已复制标签"))
                }
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

function getCommentsViewText() {
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
        const title = i['posted_time'] + ' by ' + i['commenter'] + ', ' + c4text
        const content = utility.convertHtmlToText(i['comment_div'])
        const seperator = '\n' + '——'.repeat(15)
        comments_text.push(title, content, seperator)
    }
    return comments_text.slice(0, -1).join('\n')
}

function defineCommentsView() {
    const textView = {
        type: "text",
        props: {
            id: "textView",
            text: getCommentsViewText(),
            font: $font(12),
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
            tapped: async function(sender) {
                utility.startLoading()
                const newInfos = await exhentaiParser.getGalleryInfosFromUrl(url)
                utility.stopLoading()
                infos.comments = newInfos['comments']
                await commentDialogs.commentDialogs(infos)
                sender.super.get("textView").text = getCommentsViewText()
                const path = utility.joinPath(glv.imagePath, infos.filename)
                exhentaiParser.saveMangaInfos(infos, path)
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
        views: [textView, button, line],
        layout: function (make, view) {
            make.height.equalTo(150)
            make.left.right.inset(0)
            make.top.equalTo($("fullTagTableView").bottom).offset(-1)
        }
    }
    return commentsView
}

function defineHeaderView() {
    const width = Math.min($device.info.screen.width, $device.info.screen.height) - 57 - 16
    const fullTagTableView = defineFullTagTableView(width)
    const commentsView = defineCommentsView()
    const headerViewHeight = fullTagTableView.props.frame.height + 150 - 1
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

function defineMatrixView() {
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
            header: defineHeaderView()
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

function defineGalleryView() {
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
    galleryView.add(defineGalleryInfoView())
    galleryView.add(defineMatrixView())
    // 更新版本按钮
    const path = utility.joinPath(glv.imagePath, infos.filename)
    const button_update = $ui.window.get("galleryView").get("button_update")
    if ($file.list(path).length - 2 > 0 && infos.newer_versions) {
        button_update.hidden = false
        button_update.info = {url: infos.newer_versions[infos.newer_versions.length - 1][0]}
    } else {
        button_update.hidden = true
    }
    // 导入旧版按钮
    const button_try_import_old_version = $ui.window.get("galleryView").get("button_try_import_old_version")
    if ($file.list(path).length - 2 === 0 && infos.parent_url) {
        let filename
        const clause = `SELECT DISTINCT gid||'_'||token
                        FROM downloads
                        WHERE gid = ?
                        LIMIT 1`
        const args = [utility.verifyUrl(infos.parent_url).split('_')[0]]
        const result = database.search(clause, args)
        if (result.length) {
            filename = result[0]["gid||'_'||token"]
        } else {
            const clause = `SELECT DISTINCT gid||'_'||token
                            FROM downloads
                            WHERE uploader=?
                            AND english_title=?
                            AND gid < ?
                            ORDER BY gid DESC
                            LIMIT 1
                            `
            const args = [
                infos['uploader'],
                infos['english_title'],
                infos['gid']
            ]
            const result = database.search(clause, args)
            if (result.length) {
                filename = result[0]["gid||'_'||token"]
            }
        }
        if (filename) {
            button_try_import_old_version.hidden = false
            button_try_import_old_version.info = {filename: filename}
        } else {
            button_try_import_old_version.hidden = true
        }
    } else {
        button_try_import_old_version.hidden = true
    }
}

async function init(newUrl) {
    const galleryView = defineGalleryView()
    const rootView = {
        props: {
            navBarHidden: true,
            statusBarHidden: false,
            statusBarStyle: 0
        },
        views: [galleryView],
        events: {
            disappeared: function() {
                if ($file.list(utility.joinPath(glv.imagePath, infos.filename)).length - 2 > 0) {
                    database.insertInfo(infos)
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
