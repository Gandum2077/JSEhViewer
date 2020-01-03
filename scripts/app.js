const utility = require("./utility")
const welcome = require("./welcome")
const glv = require('./globalVariables')
const mpvGenerator = require("./mpv")

async function init() {
    const rootView = {
        props: {
            id: "rootView",
            navBarHidden: true,
            statusBarHidden: false,
            statusBarStyle: 0
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
        glv.initConfig()
        const listViewGenerator = require("./listView")
        await listViewGenerator.init()
    }
}

module.exports = {
    init: init
}