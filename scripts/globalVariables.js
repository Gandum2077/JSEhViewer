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
    downloads: 'downloads://index?page=0',
    login: 'https://forums.e-hentai.org/index.php?act=Login&CODE=01',
    api: 'https://exhentai.org/api.php',
    gallerypopups: 'https://exhentai.org/gallerypopups.php'
}
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36"

let config = {}

function initConfig() {
    Object.assign(config, JSON.parse($file.read(configPath).string))
}

function saveConfig() {
    $file.write({
        data: $data({string: JSON.stringify(config, null, 2)}),
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
    userAgent: userAgent,
    config: config,
    initConfig: initConfig,
    saveConfig: saveConfig
}
