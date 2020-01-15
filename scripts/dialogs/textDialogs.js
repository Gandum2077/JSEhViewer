const baseViewsGenerator = require("./baseViews")

async function textDialogs(title='', text='') {
    let layout
    let width
    if ($device.isIpad) {
        width = 500
        layout = function(make, view) {
            make.width.equalTo(width)
            make.height.equalTo(556)
            make.center.equalTo(view.super)
        }
    } else {
        width = $device.info.screen.width
        layout = function(make, view) {
            make.width.equalTo(width)
            make.top.bottom.inset(18)
            make.center.equalTo(view.super)
        }
    }
    return new Promise((resolve, reject) => {
        const cancelEvent = function(sender) {
            sender.super.super.super.remove()
            reject('canceled')
        }
        const confrimEvent = function(sender) {
            const result = sender.super.super.get("textView").text
            sender.super.super.super.remove()
            resolve(result)
        }
        const titleBarView = baseViewsGenerator.defineTitleBarView(title, cancelEvent, confrimEvent)
        const textView = {
            type: "text",
            props: {
                id: "textView",
                text: text,
                textColor: $color("black"),
                bgcolor: $color("white")
            },
            layout: function(make, view) {
                make.left.right.bottom.inset(0)
                make.top.equalTo($("titleBar").bottom)
            }
        }
        const maskView = baseViewsGenerator.maskView
        const content = {
            props: {
                radius: 10
            },
            views: [titleBarView, textView],
            layout: layout
        }
        const textDialogs = {
            props: {
                id: 'textDialogs'
            },
            views: [maskView, content],
            layout: $layout.fillSafeArea
        }
        $ui.window.add(textDialogs)
    })
}

module.exports = {
    textDialogs: textDialogs
}