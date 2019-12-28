const utility = require("./utility")
const welcome = require("./welcome")
const glv = require('./globalVariables')
const mpvGenerator = require("./mpv")

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
    if (glv.userFiles.find(n => !$file.exists(n))) {
        const success = await welcome.init()
        if (success) {
            const listViewGenerator = require("./listView")
            await listViewGenerator.init()
        }
    } else {
        const listViewGenerator = require("./listView")
        glv.initConfig()
        await listViewGenerator.init()
    }
}

module.exports = {
    init: init
}