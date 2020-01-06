const utility = require('./utility')
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')
const formDialogs = require('./dialogs/formDialogs')
const infosViewGenerator = require('./infosView')

let TIMER
let AUTOLOAD_SPPED
let INFOS
let PAGE

const baseViewsForMpv = [
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
                if (TIMER) {
                    TIMER.invalidate()
                }
                const sections = [{
                    title: $l10n("设置"),
                    footer: '',
                    fields: [
                        {
                            type: "action",
                            buttonTitle: $l10n("分享本页图片"),
                            value: () => {
                                const picPath = getPicPath()
                                if ($file.exists(picPath)) {
                                    $share.sheet($image(picPath))
                                } else {
                                    $ui.toast($l10n("本页图片不存在"))
                                }
                            }
                        },
                        {
                            type: "action",
                            buttonTitle: $l10n("保存本页图片"),
                            value: () => {
                                const picPath = getPicPath()
                                if ($file.exists(picPath)) {
                                    $photo.save({
                                        image: $image(picPath)
                                    })
                                    $ui.toast($l10n("完成"))
                                } else {
                                    $ui.toast($l10n("本页图片不存在"))
                                }
                            }
                        },
                        {
                            type: "action",
                            buttonTitle: $l10n("删除本页图片"),
                            value: () => {
                                const picPath = getPicPath()
                                if ($file.exists(picPath)) {
                                    $file.delete(picPath)
                                    $ui.toast($l10n("完成"))
                                } else {
                                    $ui.toast($l10n("本页图片不存在"))
                                }
                            }
                        },
                        {
                            type: "action",
                            buttonTitle: $l10n("Safari打开"),
                            value: () => {
                                $app.openURL(INFOS.url)
                            }
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
                            value: AUTOLOAD_SPPED,
                            min: 1,
                            max: 30,
                            decimal: 0
                        }
                    ]
                }]
                try {
                    const result = await formDialogs.formDialogs(sections)
                    AUTOLOAD_SPPED = result.autoload_speed
                } catch(err) {

                }
                if (sender.super.get("button_autoload").info.selected) {
                    TIMER = $timer.schedule({
                        interval: AUTOLOAD_SPPED,
                        handler: function() {
                            const newPage = Math.min(PAGE + 1, INFOS.pics.length)
                            if (PAGE !== newPage) {
                                PAGE = newPage
                                refreshMpv()
                            }
                        }
                    })
                }
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
            imageEdgeInsets: $insets(12.5, 12.5, 12.5, 12.5),
            info: {selected: false}
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_setting").top)
        },
        events: {
            tapped: function(sender) {
                if (!sender.info.selected) {
                    sender.info = {selected: true}
                    sender.tintColor = $color("red")
                    TIMER = $timer.schedule({
                        interval: AUTOLOAD_SPPED,
                        handler: function() {
                            const newPage = Math.min(PAGE + 1, INFOS.pics.length)
                            if (PAGE !== newPage) {
                                PAGE = newPage
                                refreshMpv()
                            }
                        }
                    })
                } else {
                    sender.info = {selected: false}
                    sender.tintColor = $color("#007aff")
                    TIMER.invalidate()
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
            make.bottom.equalTo($("button_autoload").top)
        },
        events: {
            tapped: function (sender) {
                $ui.pop()
            }
        }
    },
    {
        type: "view",
        props: {
            id: "downloadProgressCanvas",
            bgcolor: $color("white")
        },
        views: [
            {
                type: "canvas",
                props: {
                    id: "inner",
                    tintColor: $color("#ffcb0f"),
                    bgcolor: $color("clear"),
                    info: {progress: 0}
                },
                layout: function(make, view) {
                    make.size.equalTo($size(16.5, 16.5))
                    make.center.equalTo(view.super)
                },
                events: {
                    draw: function(view, ctx) {
                        const progress = view.info.progress
                        ctx.fillColor = view.tintColor
                        const radius = view.frame.width
                        ctx.setLineWidth(1)
                        ctx.setLineCap(0)
                        ctx.setLineJoin(1)
                        ctx.moveToPoint(radius / 2, radius / 2)
                        ctx.addLineToPoint(radius / 2, 0)
                        ctx.addArc(radius / 2, radius / 2, radius / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
                        ctx.addLineToPoint(radius / 2, radius / 2)
                        ctx.fillPath()
                    }
                }
            }
        ],
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_close").top)
        },
        events: {
            ready: async function(sender) {
                const length = parseInt(INFOS.pics.length)
                const path = utility.joinPath(glv.imagePath, INFOS.filename)
                await $wait(0.1)
                while(sender.super && $file.list(path).length - 1 < length) {
                    sender.get("inner").info = {progress: downloaded / length}
                    sender.get("inner").runtimeValue().invoke("setNeedsDisplay")
                }
                if (sender.super && $file.list(path).length - 1 === length) {
                    sender.get("inner").tintColor = $color("#b4ffbb")
                    sender.get("inner").info = {progress: 1}
                    sender.get("inner").runtimeValue().invoke("setNeedsDisplay")
                }
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_refresh",
            image: $image("assets/icons/refresh_64x64.png").alwaysTemplate,
            tintColor: $color("#007aff"),
            bgcolor: $color("clear"),
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
        },
        events: {
            tapped: function(sender) {
                $ui.push({
                    props: {
                        navBarHidden: true
                    },
                    views: [infosViewGenerator.defineInfosView(INFOS)]
                })
            }
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
    }
]

function defineCustomSlider(layout, obj, changedEvent, finishedEvent) {
    const max = obj.max || 1
    const value = Math.min(obj.value || 1, max)
    const id = obj.id
    const wrapper = {
        type: "view",
        props: {
            id: "wrapper",
            bgcolor: $color("#e4e4e5"),
            radius: 7
        },
        views: [{
            type: "view",
            props: {
                id: "inner",
                bgcolor: $color("#787880"),
                radius: 7
            },
            views: [{
                type: "view",
                props: {
                    bgcolor: $color("black"),
                    radius: 7
                },
                layout: function(make, view) {
                    make.left.right.bottom.inset(0)
                    make.height.equalTo(50)
                }
            }],
            events: {
                ready: async function (sender) {
                    await $wait(0.02)
                    sender.frame = $rect(0, 0, sender.super.frame.width, sender.super.frame.height * value / max)
                }
            }
        }],
        layout: (make, view) => {
            make.centerX.equalTo(view.super)
            make.top.bottom.inset(5)
            make.width.equalTo(view.super).dividedBy(4)
        }
    }

    const customSlider = {
        type: "view",
        props: {
            id: id,
            userInteractionEnabled: true,
            info: {
                max: max
            }
        },
        views: [wrapper],
        layout: layout,
        events: {
            touchesBegan: function (sender, location, locations) {
                const wrapper = sender.get("wrapper")
                const minHeight = wrapper.frame.height * 1 / max
                const width = wrapper.frame.width
                const height = Math.min(Math.max(minHeight, location.y), wrapper.frame.height)
                wrapper.get("inner").frame = $rect(0, 0, width, height)
                const value = Math.round(height / wrapper.frame.height * max)
                changedEvent(value)
            },
            touchesMoved: function (sender, location, locations) {
                const wrapper = sender.get("wrapper")
                const minHeight = wrapper.frame.height * 1 / max
                const width = wrapper.frame.width
                const height = Math.min(Math.max(minHeight, location.y), wrapper.frame.height)
                wrapper.get("inner").frame = $rect(0, 0, width, height)
                const value = Math.round(height / wrapper.frame.height * max)
                changedEvent(value)
            },
            touchesEnded: function (sender, location, locations) {
                const wrapper = sender.get("wrapper")
                const minHeight = wrapper.frame.height * 1 / max
                const width = wrapper.frame.width
                const height = Math.min(Math.max(minHeight, location.y), wrapper.frame.height)
                wrapper.get("inner").frame = $rect(0, 0, width, height)
                const value = Math.round(height / wrapper.frame.height * max)
                changedEvent(value)
                finishedEvent(value)
            }
        }
    }
    return customSlider
}

function defineSlider() {
    const layout = (make, view) => {
        make.width.equalTo(57)
        make.top.inset(18)
        make.bottom.equalTo($("text_current_page").top)
        make.centerX.equalTo($("button_info"))
    }
    const changedEvent = (value) => {
        $ui.window.get("mpv").get("text_current_page").text = value
    }
    
    const finishedEvent = (value) => {
        PAGE = value
        refreshMpv(true)
    }
    const slider = defineCustomSlider(layout, {
        id: 'slider1',
        max: INFOS.pics.length,
        value: PAGE
    }, changedEvent, finishedEvent)
    return slider
}

function changeValueOfSlider(value) {
    const slider = $ui.window.get("mpv").get("slider1")
    const wrapper = $ui.window.get("mpv").get("slider1").get("wrapper")
    const inner = wrapper.get("inner")
    inner.frame = $rect(0, 0, wrapper.frame.width, wrapper.frame.height * value / slider.info.max)
}

function getPicPath() {
    const path = utility.joinPath(glv.imagePath, INFOS.filename)
    const pic = INFOS.pics[PAGE - 1]
    const picPath = utility.joinPath(path, pic.img_id + pic.img_name.slice(pic.img_name.lastIndexOf('.')))
    return picPath
}

function refreshMpv(ignoreSlider=false) {
    const picPath = getPicPath()
    const mpv = $ui.window.get("mpv")
    if ($file.exists(picPath)) {
        if (mpv.get("scroll").zoomScale !== 1) {
            mpv.get("scroll").zoomScale = 1
        }
        mpv.get("scroll").get("contentView").get("image").src = picPath
        mpv.get("spinner").loading = false
    } else {
        mpv.get("scroll").get("contentView").get("image").src = undefined
        mpv.get("spinner").loading = true
    }
    mpv.get('text_current_page').text = PAGE
    if (!ignoreSlider) {
        changeValueOfSlider(PAGE)
    }
}

function defineMpv() {
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
                    const newPage = (location.y <= sender.frame.height / 2) ? Math.max(PAGE - 1, 1): Math.min(PAGE + 1, INFOS.pics.length)
                    if (PAGE !== newPage) {
                        PAGE = newPage
                        refreshMpv()
                    }
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
        },
        events: {
            ready: async function(sender) {
                await $wait(0.1)
                while(sender.super) {
                    if (sender.loading) {
                      refreshMpv()
                    }
                    await $wait(1)
                }
            }
        }
    }

    const slider = defineSlider()
    const mpv = {
        props: {
            id: "mpv",
            bgcolor: $color("white")
        },
        views: [...baseViewsForMpv, scroll, spinner, slider],
        layout: $layout.fill,
        events: {
            ready: async function (sender) {
                const mpv = $ui.window.get('mpv')
                mpv.get('text_total_page').text = INFOS.pics.length
                mpv.get('slider1').max = INFOS.pics.length
                await $wait(0.05)
                mpv.get("scroll").get("contentView").frame = $rect(0, 0, sender.get("scroll").frame.width, sender.get("scroll").frame.height)
                mpv.get("scroll").get("contentView").add(imageView)
            }
        }
    };
    return mpv
}

function init(infos, page = 1) {
    INFOS = infos
    PAGE = page
    AUTOLOAD_SPPED = glv.config['autopage_interval']
    exhentaiParser.downloadPicsByBottleneck(INFOS)
    const mpv = defineMpv()
    const rootView = {
        props: {
            navBarHidden: true,
            statusBarHidden: false,
            statusBarStyle: 0
        },
        views: [mpv],
        events: {
            layoutSubviews: async function(sender) {
                if (sender.get("mpv")) {
                    const scroll = sender.get("mpv").get("scroll")
                    await $wait(0.05)
                    scroll.zoomScale = 1
                    sender.get("mpv").get("scroll").get("contentView").frame = $rect(0, 0, scroll.size.width, scroll.size.height)
                    scroll.zoomScale = 1
                }
            },
            disappeared: function() {
                exhentaiParser.stopDownloadTasksCreatedByBottleneck()
                if (TIMER) {
                    TIMER.invalidate()
                }
            }
        }
    }
    $ui.push(rootView)

}

module.exports = {
    init: init
}