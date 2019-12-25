const utility = require('./utility')

const baseViews = [
    {
        type: "label",
        props: {
            text: "初始设置",
            textColor: $color('black'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("clear"),
            frame: $rect(85, 20, 150, 32)
        }
    },
    {
        type: "label",
        props: {
            text: "🔻五大诉求，缺一不可",
            textColor: $color('black'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(4, 52, 312, 32)
        }
    },
    {
        type: "image",
        props: {
            tintColor: $color(($device.isIpad) ? "#0079ff" : "red"),
            image: $image(($device.isIpad) ? "assets/icons/ipad_24_40.png" : "assets/icons/close_24_40.png").alwaysTemplate,
            bgcolor: $color("white"),
            frame: $rect(4, 84, 40, 40)
        }
    },
    {
        type: "label",
        props: {
            text: "1. iPad",
            textColor: $color('black'),
            align: $align.left,
            font: $font(16),
            bgcolor: $color("white"),
            frame: $rect(45, 84, 271, 40)
        }
    },
    {
        type: "image",
        props: {
            tintColor: $color("#0079ff"),
            image: $image("assets/icons/earth_24_40.png").alwaysTemplate,
            bgcolor: $color("white"),
            frame: $rect(4, 125, 40, 40)
        }
    },
    {
        type: "label",
        props: {
            text: "2. 科学的网络环境",
            textColor: $color('black'),
            align: $align.left,
            font: $font(16),
            bgcolor: $color("white"),
            frame: $rect(45, 125, 271, 40)
        }
    },
    {
        type: "button",
        props: {
            id: "button_test_web",
            title: "帮我测试",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("#f0f1f6"),
            radius: 3,
            borderWidth: 1,
            borderColor: $color("#c8c7cc"),
            frame: $rect(223, 130, 80, 30)
        },
        events: {
            tapped: async function(sender) {
                const result = await testAccessToEhentai()
                if (result) {
                    $ui.alert('成功')
                    sender.super.get("label_tip").text = ($device.isIpad) ? "满足全部诉求后，请点击输入账号进行下一步" : "很遗憾，您的设备不是iPad"
                } else {
                    $ui.alert('失败')
                    sender.super.get("label_tip").text = '很遗憾，似乎您的网络还没设置好'
                }
            }
        }
    },
    {
        type: "image",
        props: {
            tintColor: $color("#0079ff"),
            image: $image("assets/icons/ios7_unlocked_outline_24_40.png").alwaysTemplate,
            bgcolor: $color("white"),
            frame: $rect(4, 166, 40, 40)
        }
    },
    {
        type: "label",
        props: {
            text: "3. 可以访问exhentai.org的账号",
            textColor: $color('black'),
            align: $align.left,
            font: $font(16),
            bgcolor: $color("white"),
            frame: $rect(45, 166, 271, 40)
        }
    },
    {
        type: "image",
        props: {
            tintColor: $color("#0079ff"),
            image: $image("assets/icons/star_24_40.png").alwaysTemplate,
            bgcolor: $color("white"),
            frame: $rect(4, 207, 40, 40)
        }
    },
    {
        type: "label",
        props: {
            text: "4. Hath Perk: Multi-Page Viewer",
            textColor: $color('black'),
            align: $align.left,
            font: $font(16),
            bgcolor: $color("white"),
            frame: $rect(45, 207, 271, 40)
        }
    },
    {
        type: "image",
        props: {
            tintColor: $color("#0079ff"),
            image: $image("assets/icons/gear_a_24_40.png").alwaysTemplate,
            bgcolor: $color("white"),
            contentMode: 1,
            frame: $rect(4, 248, 40, 160)
        }
    },
    {
        type: "label",
        props: {
            text: "5. 设置",
            textColor: $color('black'),
            align: $align.left,
            font: $font(16),
            bgcolor: $color("white"),
            frame: $rect(45, 248, 271, 32)
        }
    },
    {
        type: "text",
        props: {
            text: "(必须)Front Page Settings设为Extended\n(必须)Thumbnail Settings中的Size设为Large\n(可选)Gallery Name Display 设为 Japanese Title (if available)\n(可选)Search Result Count 设为 50 results",
            font: $font(13),
            editable: false,
            selectable: false,
            scrollEnabled: false,
            bgcolor: $color("white"),
            frame: $rect(45, 276, 271, 132)
        }
    },
    {
        type: "label",
        props: {
            text: "阅读README了解详情    ⇒ ",
            textColor: $color('black'),
            align: $align.left,
            font: $font("bold", 16),
            bgcolor: $color("white"),
            frame: $rect(4, 416, 312, 40)
        }
    },
    {
        type: "button",
        props: {
            id: "button_readme",
            title: "README",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font("bold", 16),
            bgcolor: $color("clear"),
            radius: 0,
            frame: $rect(218, 416, 98, 40)
        },
        events: {
            tapped: function(sender) {
                presentReademe()
            }
        }
    },
    {
        type: "label",
        props: {
            id: "label_tip",
            text: ($device.isIpad) ? "满足全部诉求后，请点击输入账号进行下一步" : "很遗憾，您的设备不是iPad",
            textColor: $color('black'),
            align: $align.center,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(4, 468, 312, 32)
        }
    },
    {
        type: "button",
        props: {
            id: "button_cancel",
            title: "退出设置",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("#f0f1f6"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc"),
            frame: $rect(25, 500, 110, 50)
        },
        events: {
            tapped: function(sender) {
                $app.close()
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_next",
            title: "输入账号",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("#f0f1f6"),
            radius: 5,
            borderWidth: 1,
            borderColor: $color("#c8c7cc"),
            frame: $rect(185, 500, 110, 50)
        },
        events: {
            tapped: async function(sender) {
                const login = await utility.getUsernamePassword()
                console.info(login)
            }
        }
    }
]

function presentReademe() {
    $ui.push({
        props: {
            navBarHidden: true
        },
        views: [{
            type: "markdown",
            props: {
                content: $file.read("README.md").string
            },
            layout: $layout.fill
        }]
    })
  }

async function testAccessToEhentai() {
    const url = 'https://e-hentai.org/'
    utility.startLoading()
    const resp = await $http.get({
        url: url,
        timeout: 20
    })
    utility.stopLoading()
    if (!resp.error && resp.response.statusCode === 200) {
        return true
    } else {
        return
    }
}

function renderSettingsMainView() {
    const welcomeView = {
        type: 'view',
        props: {
            id: 'welcomeView',
            bgcolor: $color('#efeff4'),
            radius: 5,
            alpha: 1
        },
        views: baseViews,
        layout: function(make, view) {
            make.size.equalTo($size(320, 568))
            make.center.equalTo(view.super)
        }
    }
    return welcomeView
}

async function init() {
    let answer = 'OK'
    if (!$device.isIpad) {
        const alert = await $ui.alert({
            title: "本App只适配iPad，是否继续？",
            actions: [{title: "Cancel"}, {title: "OK"}]
        })
        answer = alert.title
    }
    if (answer === 'OK') {
        $ui.render({
            props: {
                navBarHidden: true
            },
            views: [renderSettingsMainView()]
        })
    }
}

module.exports = {
    init: init
}