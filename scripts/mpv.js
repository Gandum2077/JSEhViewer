const utility = require('./utility')
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')
const formDialogs = require('./dialogs/formDialogs')

const sliderLayoutFunction = (make, view) => {
    const t = view.super.size.height - 57 * 6 - 30 * 2 - 2 - 18
    make.height.equalTo(34)
    make.width.equalTo(t)
    make.centerX.equalTo(view.super.right).offset(-17)
    make.centerY.equalTo(view.super.top).offset(t / 2 + 18)
}

function renderMpv(infos, path, page = 1) {

    function refreshMpv() {
        const pic = infos.pics[page - 1]
        const picPath = utility.joinPath(path, pic.img_id + pic.img_name.slice(pic.img_name.lastIndexOf('.')))
        const mpv = $("rootView").get("mpv")
        if ($file.exists(picPath)) {
            mpv.get("scroll").get("contentView").get("image").src = picPath
            mpv.get("spinner").loading = false
        } else {
            mpv.get("scroll").get("contentView").get("image").src = undefined
            mpv.get("spinner").loading = true
        }
        mpv.get('text_current_page').text = page
        mpv.get('slider1').value = page / parseInt(infos.length)
    }

    const baseViewsForMpv = [
        {
            type: "view",
            props: {
                frame: $rect(711, 18, 57, 1006),
                tintColor: $color("#007aff"),
                bgcolor: $color("white")
            }
        },
        {
            type: "view",
            props: {
                frame: $rect(0, 0, 768, 18),
                tintColor: $color("#007aff"),
                bgcolor: $color("white")
            }
        },
        {
            type: "button",
            props: {
                id: "button_setting",
                image: $image("assets/icons/more_64x64.png").alwaysTemplate,
                tintColor: $color("#007aff"),
                bgcolor: $color("white"),
                imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
            },
            layout: function (make, view) {
                make.height.equalTo(57)
                make.width.equalTo(57)
                make.right.inset(0)
                make.bottom.inset(57)
            },
            events: {
                tapped: async function(sender) {
                    const sections = [{
                        title: $l10n("设置"),
                        footer: '',
                        fields: [
                            {
                                type: "action",
                                buttonTitle: $l10n("分享本页图片"),
                                value: null
                            },
                            {
                                type: "action",
                                buttonTitle: $l10n("保存本页图片"),
                                value: null
                            },
                            {
                                type: "action",
                                buttonTitle: $l10n("删除本页图片"),
                                value: null
                            },
                            {
                                type: "action",
                                buttonTitle: $l10n("Safari打开"),
                                value: null
                            },
                            {
                                type: "action",
                                buttonTitle: $l10n("刷新infos"),
                                value: null
                            },
                            {
                                type: "slider",
                                key: "autoload_speed",
                                title: $l10n("自动翻页速度（秒/页）"),
                                value: 5,
                                min: 1,
                                max: 30,
                                decimal: 0
                            }
                        ]
                    }]
                    const result = await formDialogs.formDialogs(sections)
                    console.info(result)
                }
            }
        },
        {
            type: "button",
            props: {
                id: "button_autoload",
                image: $image("assets/icons/ios7_fastforward_64x64.png").alwaysTemplate,
                tintColor: $color("#007aff"),
                bgcolor: $color("white"),
                imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5)
            },
            layout: function (make, view) {
                make.height.equalTo(57)
                make.width.equalTo(57)
                make.right.inset(0)
                make.bottom.equalTo($("button_setting").top)
            },
            events: {
                tapped: function(sender) {
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
                make.bottom.equalTo($("button_autoload").top)
            },
            events: {
                tapped: function (sender) {
                    exhentaiParser.stopDownloadTasksCreatedByBottleneck()
                    $("rootView").get("mpv").remove()
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
                make.bottom.equalTo($("button_refresh").top)
            }
        },
        {
            type: "label",
            props: {
                id: "text_total_page",
                text: "1",
                align: $align.right,
                font: $font(15),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(30)
                make.width.equalTo(40)
                make.right.inset(17)
                make.bottom.equalTo($("button_info").top).inset(2)
            }
        },
        {
            type: "label",
            props: {
                id: "text_current_page",
                text: "1",
                align: $align.center,
                font: $font(15),
                bgcolor: $color("white")
            },
            layout: function (make, view) {
                make.height.equalTo(30)
                make.width.equalTo(40)
                make.right.inset(17)
                make.bottom.equalTo($("text_total_page").top)
            }
        },
        {
            type: "slider",
            props: {
                id: "slider1",
                max: 1.0,
                min: 0.0,
                continuous: false,
                tintColor: $color("#007aff"),
                bgcolor: $color("white")
            },
            events: {
                ready: function (sender) {
                    sender.rotate(Math.PI / 2)
                },
                changed: function(sender) {
                    page = Math.max(Math.ceil(sender.value * infos.pics.length), 1)
                    refreshMpv()
                }
            }
        }
    ]

    const imageView = {
        type: "image",
        props: {
            contentMode: 1
        },
        layout: $layout.fill,
        events: {
            ready: function(sender) {
                refreshMpv()
            }
        }
    };
    
    const contentView = {
        type: "view",
        props: {
            id: "contentView",
            userInteractionEnabled: true
        },
        events: {
            touchesEnded: function (sender, location, locations) {
                if (sender.super.zoomScale === 1) {
                    page = (location.y <= sender.frame.height / 2) ? Math.max(page - 1, 1): Math.min(page + 1, infos.pics.length)
                    refreshMpv()
                } else {
                    sender.super.zoomScale = 1
                }
            }
        }
    }

    const scroll = {
        type: "scroll",
        props: {
            id: "scroll",
            bgcolor: $("clear"),
            zoomEnabled: true,
            doubleTapToZoom: false,
            maxZoomScale: 3 // Optional, default is 2
        },
        layout: (make, view) => {
            make.edges.insets($insets(18, 0, 0, 57))
        },
        views: [contentView]
    }

    const spinner = {
        type: "spinner",
        props: {
            id: "spinner",
            loading: true
        },
        layout: function(make, view) {
            make.center.equalTo($("scroll").center)
        }
    }
    const mpv = {
        props: {
            id: "mpv",
            bgcolor: $color("white")
        },
        views: [...baseViewsForMpv, scroll, spinner],
        layout: $layout.fill,
        events: {
            ready: async function (sender) {
                $('rootView').get('mpv').get('text_total_page').text = infos.length
                await $wait(0.05)
                $("rootView").get("mpv").get("scroll").get("contentView").frame = $rect(0, 0, sender.get("scroll").frame.width, sender.get("scroll").frame.height)
                $("rootView").get("mpv").get("scroll").get("contentView").add(imageView)
            }
        }
    };
    return mpv
}

function init(infos, page = 1) {
    const path = utility.joinPath(glv.imagePath, infos.filename)
    exhentaiParser.downloadPicsByBottleneck(infos)
    const mpv = renderMpv(infos, path, page = page)
    $('rootView').add(mpv)
}

module.exports = {
    init: init,
    sliderLayoutFunction: sliderLayoutFunction
}