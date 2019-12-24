const baseViews = [
    {
        type: "label",
        props: {
            text: "Default URL",
            textColor: $color('black'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(6, 18, 150, 24)
        }
    },
    {
        type: "label",
        props: {
            text: "启动时显示downloads页",
            textColor: $color('black'),
            align: $align.left,
            font: $font(15),
            bgcolor: $color("white"),
            frame: $rect(6, 42, 528, 40)
        }
    },
    {
        type: "switch",
        props: {
            id: "switch_downloads_on_start",
            on: false,
            frame: $rect(472, 47, 51, 31)
        }
    },
    {
        type: "input",
        props: {
            id: "textfield_default_url",
            frame: $rect(6, 83, 528, 40)
        }
    },
    {
        type: "button",
        props: {
            id: "button_default_url",
            title: "将当前url作为default url",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 124, 528, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "label",
        props: {
            text: "只有path为空字符串的url才能作为default url",
            textColor: $color('black'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(6, 164, 261, 24)
        }
    },
    {
        type: "label",
        props: {
            text: "Access",
            textColor: $color('black'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(6, 222, 150, 24)
        }
    },
    {
        type: "button",
        props: {
            id: "button_reset_account",
            title: "重设账号密码",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 246, 528, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_login",
            title: "重新登录",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 287, 528, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "label",
        props: {
            text: "Storage",
            textColor: $color('black'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(6, 344, 150, 24)
        }
    },
    {
        type: "button",
        props: {
            id: "button_update_tagtranslation",
            title: "更新标签翻译",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 367, 528, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_update_db",
            title: "更新数据库",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 408, 528, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_rm_cache",
            title: "清除缓存",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 449, 528, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_rm_unfav_downloads",
            title: "清除未收藏的下载内容",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 490, 528, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "button",
        props: {
            id: "button_rm_all_downloads",
            title: "清除全部下载内容",
            titleColor: $color('#0079ff'),
            align: $align.center,
            font: $font(15),
            bgcolor: $color("white"),
            radius: 0,
            frame: $rect(6, 531, 528, 40)
        },
        events: {
            tapped: function(sender) {
            }
        }
    },
    {
        type: "label",
        props: {
            text: "Others",
            textColor: $color('black'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(6, 588, 150, 24)
        }
    },
    {
        type: "label",
        props: {
            text: "Favorites排序方式",
            textColor: $color('black'),
            align: $align.left,
            font: $font(15),
            bgcolor: $color("white"),
            frame: $rect(6, 612, 528, 40)
        }
    },
    {
        type: "tab",
        props: {
            id: "segmentedcontrol_favorites",
            items: ['Favorited', 'Posted'],
            frame: $rect(360, 614, 174, 36)
        }
    },
    {
        type: "label",
        props: {
            text: "Downloads排序方式",
            textColor: $color('black'),
            align: $align.left,
            font: $font(15),
            bgcolor: $color("white"),
            frame: $rect(6, 653, 528, 40)
        }
    },
    {
        type: "tab",
        props: {
            id: "segmentedcontrol_downloads",
            items: ['gid', 'st_mtime'],
            frame: $rect(360, 655, 174, 36)
        }
    }
]

function renderSettingsMainView() {
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
                        $('rootView').get('settingsMainView').remove()
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
    const settingsMainContent = {
        type: "view",
        props: {
            id: "settingsMainContent",
            bgcolor: $color("#efeff4")
        },
        layout: function(make, view) {
            make.left.right.bottom.inset(0)
            make.top.equalTo($("titleBar").bottom)
        },
        views: baseViews
    }
    const settingsMainView = {
        type: 'view',
        props: {
            id: 'settingsMainView',
            bgcolor: $color('white'),
            radius: 5,
            alpha: 1
        },
        views: [titleBar, settingsMainContent],
        layout: function(make, view) {
            make.size.equalTo($size(540, 750))
            make.center.equalTo(view.super)
        }
    }
    return settingsMainView
}

module.exports = {
    renderSettingsMainView: renderSettingsMainView
}