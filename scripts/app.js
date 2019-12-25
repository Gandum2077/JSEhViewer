const listViewGenerator = require("./listView");
const mpvGenerator = require("./mpv");
const utility = require("./utility");
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')

let GLOBAL_WIDTH = utility.getWindowSize().width;


async function init() {
    const rootView = {
        props: {
            id: "rootView",
            navBarHidden: true,
            statusBarHidden: false,
            statusBarStyle: 0
        },
        events: {
            layoutSubviews: async function(sender) {
                if (sender.frame.width !== GLOBAL_WIDTH) {
                    GLOBAL_WIDTH = sender.frame.width
                } else {
                }
                if ($("rootView").get("mpv")) {
                    const scroll = $("rootView").get("mpv").get("scroll")
                    await $wait(0.05)
                    scroll.zoomScale = 1
                    $("rootView").get("mpv").get("scroll").get("contentView").frame = $rect(0, 0, scroll.size.width, scroll.size.height)
                    scroll.zoomScale = 1
                    $("rootView").get("mpv").get("slider1").updateLayout(mpvGenerator.sliderLayoutFunction)
                }
            }
        }
    }
    $ui.render(rootView)
    await $wait(0.01)
    listViewGenerator.init()
}

module.exports = {
    init: init
}