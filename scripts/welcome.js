const glv = require('./globalVariables')
const utility = require('./utility')
const exhentaiParser = require('./exhentaiParser')
const database = require('./database')
const formDialogs = require('./dialogs/formDialogs')
const loginAlert = require('./dialogs/loginAlert')

const sections = [{
    title: $l10n("🔻五大诉求，缺一不可"),
    footer: ($device.isIpad) ? $l10n("满足全部诉求后，点击完成输入账号密码") : $l10n("很遗憾，您的设备不是iPad"),
    fields: [
        {
            type: "info",
            title: "1. iPad",
            icon: $image(($device.isIpad) ? "assets/icons/ipad_64x64.png" : "assets/icons/close_64x64.png")
        },
        {
            type: "action",
            title: $l10n("2. 科学上网"),
            buttonTitle: $l10n("帮我测试"),
            buttonType: 1,
            value: async () => {
                const url = 'https://e-hentai.org/'
                utility.startLoading()
                const resp = await $http.get({
                    url: url,
                    timeout: 20
                })
                utility.stopLoading()
                if (!resp.error && resp.response.statusCode === 200) {
                    $ui.toast($l10n('成功'));
                } else {
                    $ui.toast($l10n('失败'));
                }
            },
            icon: $image("assets/icons/connection_bars_64x64.png")
        },
        {
            type: "info",
            title: $l10n("3. exhentai.org访问权限"),
            icon: $image("assets/icons/ios7_unlocked_64x64.png")
        },
        {
            type: "info",
            title: "4. Multi-Page Viewer",
            icon: $image("assets/icons/star_64x64.png")
        },
        {
            type: "action",
            title: $l10n("5. 详细设置"),
            buttonTitle: $l10n("详情"),
            buttonType: 1,
            value: () => {
                $ui.push({
                    props: {
                        navBarHidden: true,
                        statusBarHidden: false,
                        statusBarStyle: 0
                    },
                    views: [{
                        type: "markdown",
                        props: {
                            content: "- (必须)Front Page Settings设为Extended\n- (必须)Thumbnail Settings中的Size设为Large\n- (可选)Gallery Name Display 设为 Japanese Title (if available)\n- (可选)Search Result Count 设为 50 results",
                        },
                        layout: $layout.fillSafeArea
                    }]
                })
            },
            icon: $image("assets/icons/gear_a_64x64.png")
        },
        {
            type: "action",
            title: $l10n("阅读README了解详情"),
            buttonTitle: "README",
            buttonType: 1,
            value: () => {
                $ui.push({
                    props: {
                        navBarHidden: true,
                        statusBarHidden: false,
                        statusBarStyle: 0
                    },
                    views: [{
                        type: "markdown",
                        props: {
                            content: $file.read("README.md").string
                        },
                        layout: $layout.fillSafeArea
                    }]
                })
            }
        }
    ]
}]

function reset() {
    for (let i of glv.userFiles) {
        if ($file.exists(i)) {
            $file.delete(i)
        }
    }
}

async function getFavcat() {
    const infos = await exhentaiParser.getListInfosFromUrl(glv.urls.favorites)
    glv.config.favcat_nums_titles = infos.favcat_nums_titles
    glv.config.favorites_order_method = infos.favorites_order_method
    glv.saveConfig()
}

async function init() {
    reset()
    $file.mkdir(glv.cachePath)
    $file.mkdir(glv.imagePath)
    database.createDB()
    $file.copy({
        src: glv.configPath + '.example',
        dst: glv.configPath
    });
    glv.initConfig()
    if (!$device.isIpad) {
        const alert = await $ui.alert({
            title: "本App尚未完全适配iPhone，是否继续？",
            actions: [{title: "Cancel"}, {title: "OK", disabled: false}]
        })
        if (!alert.index) {
            $app.close()
        }
    }
    try {
        await formDialogs.formDialogs(sections, title=$l10n("初始设置"))
    } catch(err) {
        $app.close()
    }
    let login
    try {
        login = await loginAlert.loginAlert()
    } catch(err) {
        $app.close()
    }
    $file.write({
        data: $data({string: JSON.stringify(login, null, 2)}),
        path: glv.accountFile
    })
    try {
        utility.startLoading()
        utility.changeLoadingTitle('正在登录')
        await exhentaiParser.login(login.username, login.password)
        await $wait(5)
        utility.changeLoadingTitle('获取设置')
        await getFavcat()
        utility.changeLoadingTitle('获取标签翻译')
        await utility.generateTagTranslatorJson()
        utility.updateTagTranslatorDict()
        utility.stopLoading()
        return true
    } catch(err) {
        utility.stopLoading()
        console.error(err)
        await $ui.alert({
            title: "Error",
            message: err.message,
            actions: [{title: "Cancel"}]
          })
        return
    } 
}

module.exports = {
    init: init
}