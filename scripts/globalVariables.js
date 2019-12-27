const cachePath = 'cache'
const imagePath = 'image'
const configPath = 'assets/config.json'
const cookieFile = 'assets/cookie.json'
const accountFile = 'assets/account.json'
const databaseFile = 'assets/downloads.db'
const tagTranslationFile = 'assets/ehtagtranslator.json'

let config
if ($file.exists(config)) {
    config = JSON.parse($file.read(configPath))
}

function saveConfig() {
    $file.save({
        data: $data({string: JSON.stringify(config)}),
        path: configPath
    })
}

module.exports = {
    cachePath: cachePath,
    imagePath: imagePath,
    configPath: configPath,
    cookieFile: cookieFile,
    accountFile: accountFile,
    databaseFile: databaseFile,
    tagTranslationFile: tagTranslationFile,
    config: config,
    saveConfig: saveConfig
}
