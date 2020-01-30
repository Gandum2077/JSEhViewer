const glv = require('./globalVariables')
const welcome = require("./welcome")

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
            const utility = require('./utility')
            utility.getLatestVersion()
        }
    } else {
        glv.initConfig()
        const listViewGenerator = require("./listView")
        await listViewGenerator.init()
        const utility = require('./utility')
        utility.getLatestVersion()
    }
}

module.exports = {
    init: init
}