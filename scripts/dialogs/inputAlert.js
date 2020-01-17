const baseViewsGenerator = require("./baseViews")

function defineInput(text, type=0) {
    const input = {
        type: "input",
        props: {
            id: "input",
            text: text,
            type: type,
            borderWidth: 1,
            borderColor: $color("#b4b4b4"),
            radius: 7,
            bgcolor: $color("white"),
            autocapitalizationType: 0
        },
        layout: function(make, view) {
            make.size.equalTo($size(240, 32))
            make.center.equalTo(view.super)
        },
        events: {
            returned: function(sender) {
                sender.blur()
            }
        }
    }
    return input
}

async function inputAlert(title='', text='', type=0) {
    return new Promise((resolve, reject) => {
        const titleView = baseViewsGenerator.defineTitleView(title)
        const input = defineInput(text, type=type)
        const buttonCancel = baseViewsGenerator.defineButtonCancel(sender => {
            sender.super.super.remove()
            reject('canceled')
        })
        const buttonConfirm = baseViewsGenerator.defineButtonConfirm(sender => {
            const result = sender.super.get("input").text
            sender.super.super.remove()
            resolve(result)
        })
        const maskView = baseViewsGenerator.maskView
        const content = {
            props: {
                radius: 10,
                bgcolor: $rgb(241, 241, 241)
            },
            views: [titleView, input, buttonCancel, buttonConfirm],
            layout: function(make, view) {
                make.size.equalTo($size(270, 150))
                make.center.equalTo(view.super)
            }
        }
        const view = {
            props: {
                id: 'inputAlert'
            },
            views: [maskView, content],
            layout: $layout.fillSafeArea
        }
        $ui.window.add(view)
    })
}

module.exports = {
    inputAlert: inputAlert
}