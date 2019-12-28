const cachePath = 'cache'
const imagePath = 'image'
const configPath = 'assets/config.json'
const cookieFile = 'assets/cookie.json'
const accountFile = 'assets/account.json'
const databaseFile = 'assets/downloads.db'
const tagTranslationFile = 'assets/ehtagtranslator.json'
const userFiles = [
    cachePath, 
    imagePath,
    configPath,
    accountFile,
    cookieFile,
    databaseFile,
    tagTranslationFile
]
const urls = {
    homepage: 'https://exhentai.org/',
    watched: 'https://exhentai.org/watched',
    popular: 'https://exhentai.org/popular',
    favorites: 'https://exhentai.org/favorites.php',
    config: 'https://exhentai.org/uconfig.php',
    downloads: 'downloads://?page=0'
}

let config = {}
if ($file.exists(config)) {
    initConfig()
}

function initConfig() {
    Object.assign(config, JSON.parse($file.read(configPath)))
}

function saveConfig() {
    $file.write({
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
    userFiles: userFiles,
    urls: urls,
    config: config,
    initConfig: initConfig,
    saveConfig: saveConfig
}
