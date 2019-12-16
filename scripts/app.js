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
            layoutSubviews: function(sender) {
                if (sender.frame.width !== GLOBAL_WIDTH) {
                    GLOBAL_WIDTH = sender.frame.width
                } else {
                }
                if ($("rootView").get("mpv")) {
                    $("rootView").get("mpv").get("slider1").updateLayout(function (make, view) {
                        mpvGenerator.sliderLayoutFunction(make, view)
                    })
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