const utility = require('./utility')
const glv = require('./globalVariables')
const rawData = [
    {
        title: "Default",
        src: "assets/icons/navicon_64x64.png",
        url: glv.config.default_url
    },
    {
        title: "Watched",
        src: "assets/icons/ios7_bell_64x64.png",
        url: glv.urls.watched
    },
    {
        title: "Popular",
        src: "assets/icons/arrow_graph_up_right_64x64.png",
        url: glv.urls.popular
    },
    {
        title: "Favorites",
        src: "assets/icons/bookmark_64x64.png",
        url: glv.urls.favorites
    },
    {
        title: "Downloads",
        src: "assets/icons/archive_64x64.png",
        url: glv.urls.downloads
    },
    {
        title: "Settings",
        src: "assets/icons/gear_a_64x64.png"
    }
] 

function getData() {

    const data = rawData.map(n => {
        return {
            image: {
                image: $image(n.src).alwaysTemplate
            },
            button: {
                title: n.title
            }
        }
    })
    return data
}

const template = {
    props: {
        bgcolor: $color('white')
    },
    views: [
        {
            type: "view",
            props: {
                id: "view1",
                bgcolor: $color("white"),
                radius: 0,
                borderWidth: 1,
                borderColor: $color("#c8c7cc")
            },
            layout: function (make, view) {
                make.size.equalTo($size(45, 45))
                make.left.inset(0)
                make.top.inset(5)
            }
        },
        {
            type: "image",
            props: {
                id: "image",
                tintColor: $color("#007aff"),
                radius: 0
            },
            layout: function (make, view) {
                make.size.equalTo($size(32, 32))
                make.center.equalTo($('view1'))
            }
        },
        {
            type: "button",
            props: {
                id: "button",
                titleColor: $color("#007aff"),
                font: $font(20),
                align: $align.center,
                bgcolor: $color("white"),
                radius: 0,
                borderWidth: 1,
                borderColor: $color("#c8c7cc")
            },
            layout: function (make, view) {
                make.size.equalTo($size(119, 45))
                make.top.inset(5)
                make.left.equalTo($("view1").right).inset(-1)
            }
        }
    ]
}

function renderSidebarView() {
    const sidebarView = {
        type: 'list',
        props: {
            id: "sidebarView",
            bgcolor: $color("white"),
            scrollEnabled: false,
            selectable: false,
            hidden: true,
            rowHeight: 55,
            separatorHidden: true,
            data: getData(),
            template: template
        },
        layout: function(make, view) {
            make.size.equalTo($size(163, 325))
            make.top.equalTo($("button_sidebar").bottom)
            make.left.equalTo($("button_sidebar"))
        }
    }
    return sidebarView
}

  module.exports = {
    renderSidebarView: renderSidebarView
  }
  