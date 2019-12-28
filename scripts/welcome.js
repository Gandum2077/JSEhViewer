const utility = require('./utility')
const formDialogs = require('./dialogs/formDialogs')
const loginAlert = require('./dialogs/loginAlert')
const exhentaiParser = require('./exhentaiParser')
const glv = require('./globalVariables')
const database = require('./database')

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
            title: $l10n("2. 科学的网络环境"),
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
            title: $l10n("3. 可以访问exhentai.org的账号"),
            icon: $image("assets/icons/ios7_unlocked_64x64.png")
        },
        {
            type: "info",
            title: "4. Hath Perk: Multi-Page Viewer",
            icon: $image("assets/icons/star_64x64.png")
        },
        {
            type: "action",
            title: $l10n("5. 在设置页面进行相关设置"),
            buttonTitle: $l10n("详情"),
            buttonType: 1,
            value: () => {
                $ui.push({
                    props: {
                        navBarHidden: true
                    },
                    views: [{
                        type: "markdown",
                        props: {
                            content: "- (必须)Front Page Settings设为Extended\n- (必须)Thumbnail Settings中的Size设为Large\n- (可选)Gallery Name Display 设为 Japanese Title (if available)\n- (可选)Search Result Count 设为 50 results",
                        },
                        layout: $layout.fill
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
                        navBarHidden: true
                    },
                    views: [{
                        type: "markdown",
                        props: {
                            content: $file.read("README.md").string
                        },
                        layout: $layout.fill
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
    const url = 'https://exhentai.org/favorites.php'
    const infos = await exhentaiParser.getListInfosFromUrl(url)
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
    let flagContinue = true
    if (!$device.isIpad) {
        const alert = await $ui.alert({
            title: "本App只适配iPad，是否继续？",
            actions: [{title: "Cancel"}, {title: "OK", disabled: true}]
        })
        flagContinue = (alert.index) ? true : false
    }
    if (flagContinue) {
        try {
            await formDialogs.formDialogs(sections, title=$l10n("初始设置"))
            const login = await loginAlert.loginAlert()
            $file.write({
                data: $data({string: JSON.stringify(login, null, 2)}),
                path: glv.accountFile
            });
            utility.startLoading()
            utility.changeLoadingTitle('正在登录')
            const success = await exhentaiParser.login(login.username, login.password)
            if (!success) {
                utility.stopLoading()
                return false
            }
            utility.changeLoadingTitle('获取设置')
            await getFavcat()
            utility.changeLoadingTitle('获取标签翻译')
            await utility.generateTagTranslatorJson()
            utility.updateTagTranslatorDict()
            utility.stopLoading()
            return true
        } catch(err) {
            console.info(err)
            $ui.toast(err.message);
            //reset()
            return false
        } 
    }
}

module.exports = {
    init: init
}