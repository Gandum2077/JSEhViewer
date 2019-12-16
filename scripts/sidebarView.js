const utility = require('./utility')

const baseViewsForSidebarView = [
    {
        type: "image",
        props: {
            id: "icon_default",
            image: $image("assets/icons/navicon_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.inset(0)
            make.left.inset(0)
        }
    },
    {
        type: "image",
        props: {
            id: "icon_watched",
            image: $image("assets/icons/ios7_bell_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.equalTo($("icon_default").bottom).inset(10)
            make.left.inset(0)
        }
    },
    {
        type: "image",
        props: {
            id: "icon_popular",
            image: $image("assets/icons/arrow_graph_up_right_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.equalTo($("icon_watched").bottom).inset(10)
            make.left.inset(0)
        }
    },
    {
        type: "image",
        props: {
            id: "icon_favorites",
            image: $image("assets/icons/bookmark_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.equalTo($("icon_popular").bottom).inset(10)
            make.left.inset(0)
        }
    },
    {
        type: "image",
        props: {
            id: "icon_downloads",
            image: $image("assets/icons/archive_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.equalTo($("icon_favorites").bottom).inset(10)
            make.left.inset(0)
        }
    },
    {
        type: "image",
        props: {
            id: "icon_settings",
            image: $image("assets/icons/gear_a_32_45.png").alwaysTemplate,
            tintColor: $color("#0079FF"),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(45)
            make.top.equalTo($("icon_downloads").bottom).inset(10)
            make.left.inset(0)
        }
    },
    {
        type: "button",
        props: {
            id: "button_default",
            title: "Default",
            titleColor: $color("#0079FF"),
            font: $font(20),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(119)
            make.top.inset(0)
            make.left.equalTo($("icon_default").right).inset(-1)
        }
    },
    {
        type: "button",
        props: {
            id: "button_watched",
            title: "Watched",
            titleColor: $color("#0079FF"),
            font: $font(20),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(119)
            make.top.equalTo($("icon_watched").top)
            make.left.equalTo($("button_default").left)
        }
    },
    {
        type: "button",
        props: {
            id: "button_popular",
            title: "Popular",
            titleColor: $color("#0079FF"),
            font: $font(20),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(119)
            make.top.equalTo($("icon_popular").top)
            make.left.equalTo($("button_default").left)
        }
    },
    {
        type: "button",
        props: {
            id: "button_favorites",
            title: "Favorites",
            titleColor: $color("#0079FF"),
            font: $font(20),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(119)
            make.top.equalTo($("icon_favorites").top)
            make.left.equalTo($("button_default").left)
        }
    },
    {
        type: "button",
        props: {
            id: "button_downloads",
            title: "Downloads",
            titleColor: $color("#0079FF"),
            font: $font(20),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(119)
            make.top.equalTo($("icon_downloads").top)
            make.left.equalTo($("button_default").left)
        }
    },
    {
        type: "button",
        props: {
            id: "button_settings",
            title: "Settings",
            titleColor: $color("#0079FF"),
            font: $font(20),
            bgcolor: $color("white"),
            radius: 0,
            borderWidth: 1,
            borderColor: $color("#c8c7cc")
        },
        layout: function (make, view) {
            make.height.equalTo(45)
            make.width.equalTo(119)
            make.top.equalTo($("icon_settings").top)
            make.left.equalTo($("button_default").left)
        }
    }
]

function renderSidebarView() {
    const sidebarView = {
        props: {
            id: "sidebarView",
            bgcolor: $color("white"),
            hidden: true
        },
        views: baseViewsForSidebarView,
        layout: function(make, view) {
            make.size.equalTo($size(163, 320))
            make.top.equalTo($("button_sidebar").bottom)
            make.left.equalTo($("button_sidebar"))
        }
    }
    return sidebarView
}

  module.exports = {
    renderSidebarView: renderSidebarView
  }
  