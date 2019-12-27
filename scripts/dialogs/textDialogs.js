baseViewsGenerator = require("./baseViews")

async function textDialogs(title='', text='') {
    return new Promise((resolve, reject) => {
        const cancelEvent = function(sender) {
            reject('canceled')
            sender.super.super.super.remove()
        }
        const confrimEvent = function(sender) {
            resolve(sender.super.super.get("textView").text)
            sender.super.super.super.remove()
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
            layout: function(make, view) {
                make.size.equalTo($size(500, 556))
                make.center.equalTo(view.super)
            }
        }
        const textDialogs = {
            props: {
                id: 'textDialogs'
            },
            views: [maskView, content],
            layout: $layout.fill
        }
        $ui.window.add(textDialogs)
    })
}

module.exports = {
    textDialogs: textDialogs
}