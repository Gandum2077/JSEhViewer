const baseViews = [
    {
        type: "label",
        props: {
            text: "设置",
            textColor: $color('black'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(6, 18, 150, 24)
        }
    },
    {
        type: "button",
        props: {
            id: "button_share_picture",
            title: "分享本页图片",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 42, 308, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_save",
            title: "保存本页图片",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 83, 308, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_delete_thispage",
            title: "删除本页图片",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 124, 308, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_safari",
            title: "Safari打开",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 165, 308, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_refresh_infos",
            title: "刷新infos",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 206, 308, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "label",
        props: {
            text: "自动翻页速度：",
            textColor: $color('black'),
            align: $align.left,
            font: $font(15),
            bgcolor: $color("white"),
            frame: $rect(6, 247, 308, 40)
        }
    },
    {
        type: "label",
        props: {
            id: "label_autopage_speed",
            text: "30",
            textColor: $color('black'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("clear"),
            frame: $rect(199, 247, 28, 40)
        }
    },
    {
        type: "label",
        props: {
            text: "秒/每页",
            textColor: $color('black'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("clear"),
            frame: $rect(230, 247, 80, 40)
        }
    },
    {
        type: "view",
        props: {
            bgcolor: $color("white"),
            frame: $rect(6, 288, 308, 40)
        }
    },
    {
        type: "label",
        props: {
            text: "1",
            textColor: $color('black'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("clear"),
            frame: $rect(8, 291, 26, 34)
        }
    },
    {
        type: "label",
        props: {
            text: "30",
            textColor: $color('black'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("clear"),
            frame: $rect(286, 291, 26, 34)
        }
    },
    {
        type: "slider",
        props: {
            id: "slider_autopage_speed",
            continuous: true,
            minColor: $color('#0079ff'),
            value: 15 / 30,
            frame: $rect(36, 291, 248, 34)
        },
        events: {
            changed: function(sender) {
            }
        }
    }
]

function renderSettingsForMpvView() {
    const titleBar = {
        type: "view",
        props: {
            id: "titleBar",
            bgcolor: $color("white")
        },
        layout: function(make, view) {
            make.left.right.top.inset(0)
            make.height.equalTo(55)
        },
        views: [
            {
                type: "button",
                props: {
                    id: "button_close",
                    tintColor: $color("#0079ff"),
                    image: $image("assets/icons/cross_32_57.png").alwaysTemplate,
                    bgcolor: $color("clear")
                },
                layout: function(make, view) {
                    make.centerY.equalTo(view.super)
                    make.left.inset(16)
                    make.size.equalTo($size(32, 32))
                },
                events: {
                    tapped: function(sender) {
                        $('rootView').get('settingsForMpvView').remove()
                        $('rootView').get('maskView').remove()
                    }
                }
            },
            {
                type: "view",
                props: {
                    bgcolor: $color("#c8c7cc")
                },
                layout: function(make, view) {
                    make.left.right.bottom.inset(0)
                    make.height.equalTo(1)
                }
            }
        ]
    }
    const settingsForMpvContent = {
        type: "view",
        props: {
            id: "settingsForMpvContent",
            bgcolor: $color("#efeff4")
        },
        layout: function(make, view) {
            make.left.right.bottom.inset(0)
            make.top.equalTo($("titleBar").bottom)
        },
        views: baseViews
    }
    const settingsForMpvView = {
        type: 'view',
        props: {
            id: 'settingsForMpvView',
            bgcolor: $color('white'),
            radius: 5,
            alpha: 1
        },
        views: [titleBar, settingsForMpvContent],
        layout: function(make, view) {
            make.size.equalTo($size(320, 462))
            make.center.equalTo(view.super)
        }
    }
    return settingsForMpvView
}

module.exports = {
    renderSettingsForMpvView: renderSettingsForMpvView
}