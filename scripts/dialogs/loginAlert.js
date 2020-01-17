const baseViewsGenerator = require("./baseViews")

function defineInputs() {
    const inputs = {
        type: "view",
        props: {
            id: "inputs",
            borderWidth: 1,
            borderColor: $color("#b4b4b4"),
            radius: 5,
            bgcolor: $rgb(255, 255, 255)
        },
        views: [
            {
                type: "input",
                props: {
                    id: "username",
                    borderWidth: 1,
                    borderColor: $color("#b4b4b4"),
                    radius: 0,
                    bgcolor: $color("white"),
                    autocapitalizationType: 0
                },
                layout: function(make, view) {
                    make.size.equalTo($size(240, 30.5))
                    make.top.left.inset(0)
                },
                events: {
                    returned: function(sender) {
                        sender.super.get('password').focus()
                    }
                }
            },
            {
                type: "input",
                props: {
                    id: "password",
                    secure: true,
                    borderWidth: 1,
                    borderColor: $color("#b4b4b4"),
                    radius: 0,
                    bgcolor: $color("white")
                },
                layout: function(make, view) {
                    make.size.equalTo($size(240, 30.5))
                    make.bottom.left.inset(0)
                },
                events: {
                    returned: function(sender) {
                        sender.blur()
                    }
                }
            }
        ],
        layout: function(make, view) {
            make.size.equalTo($size(240, 60))
            make.center.equalTo(view.super)
        }
    }
    return inputs
}

async function loginAlert(title) {
    if (!title) {
        title = $l10n("登录")
    }

    return new Promise((resolve, reject) => {
        const titleView = baseViewsGenerator.defineTitleView(title)
        const inputs = defineInputs()
        const buttonCancel = baseViewsGenerator.defineButtonCancel(sender => {
            sender.super.super.remove()
            reject('canceled')
        })
        const buttonConfirm = baseViewsGenerator.defineButtonConfirm(sender => {
            const result = {
                username: sender.super.get("username").text,
                password: sender.super.get("password").text
            }
            sender.super.super.remove()
            resolve(result)
        })
        const maskView = baseViewsGenerator.maskView
        const content = {
            props: {
                radius: 10,
                bgcolor: $rgb(241, 241, 241)
            },
            views: [titleView, inputs, buttonCancel, buttonConfirm],
            layout: function(make, view) {
                make.size.equalTo($size(270, 180))
                make.center.equalTo(view.super)
            }
        }
        const loginView = {
            props: {
                id: 'loginView'
            },
            views: [maskView, content],
            layout: $layout.fillSafeArea
        }
        $ui.window.add(loginView)
    })
}

module.exports = {
    loginAlert: loginAlert
}