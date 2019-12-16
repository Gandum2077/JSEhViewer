const utility = require('./utility')
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')

function sliderLayoutFunction(make, view) {
    const t = view.super.size.height - 57 * 6 - 30 * 2 - 2 - 18
    make.height.equalTo(34)
    make.width.equalTo(t)
    make.centerX.equalTo(view.super.right).offset(-17)
    make.centerY.equalTo(view.super.top).offset(t / 2 + 18)
}

const baseViewsForMpv = [
    {
        type: "view",
        props: {
            frame: $rect(711, 18, 57, 1006),
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        }
    },
    {
        type: "view",
        props: {
            frame: $rect(0, 0, 768, 18),
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        }
    },
    {
        type: "button",
        props: {
            id: "button_setting",
            image: $image("assets/icons/more_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.inset(57)
        }
    },
    {
        type: "button",
        props: {
            id: "button_autoload",
            image: $image("assets/icons/ios7_fastforward_32_57.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        layout: function (make, view) {
            make.height.equalTo(57)
            make.width.equalTo(57)
            make.right.inset(0)
            make.bottom.equalTo($("button_setting").top)
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
            id: "button_info",
            image: $image("assets/icons/information_circled_32_57.png").alwaysTemplate,
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
        type: "label",
        props: {
            id: "text_total_page",
            text: "9999",
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
            text: "9999",
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
            value: 0.5,
            max: 1.0,
            min: 0.0,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white")
        },
        events: {
            ready: async function (sender) {
                await $wait(0.05)
                sender.rotate(Math.PI / 2)
            }
        }
    }
]


function renderMpv(infos, path, page = 1) {
    lengthOfLengthnumber = infos.length.length
    const imageView = {
        type: "scroll",
        props: {
            zoomEnabled: true,
            doubleTapToZoom: false,
            maxZoomScale: 3
        },
        layout: function (make, view) {
            make.edges.insets($insets(18, 0, 0, 57))
        },
        views: [{
            type: "image",
            props: {
                src: utility.joinPath(path, utility.prefixInteger(page, lengthOfLengthnumber) + '.jpg'),
                contentMode: 1
            },
            layout: $layout.fill
        }],
        events: {
            tapped: function (sender) {
                page += 1
                sender.get("image").src = utility.joinPath(path, utility.prefixInteger(page, lengthOfLengthnumber) + '.jpg')
                $('rootView').get('mpv').get('text_current_page').text = page
                $('rootView').get('mpv').get('slider1').value = page / parseInt(infos.length)
            },
            ready: function (sender) {
                $('rootView').get('mpv').get('text_total_page').text = infos.length
                $('rootView').get('mpv').get('text_current_page').text = page
                $('rootView').get('mpv').get('slider1').value = page / parseInt(infos.length)
            }
        }
    }
    const mpv = {
        props: {
            id: "mpv",
            bgcolor: $color("white")
        },
        views: baseViewsForMpv.concat(imageView),
        layout: $layout.fill
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