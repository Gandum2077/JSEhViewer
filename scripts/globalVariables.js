const cachePath = 'cache'
const imagePath = 'image'
const configPath = 'assets/config.json'
const cookieFile = 'assets/cookie.json'
const accountFile = 'assets/account.json'
const databaseFile = 'assets/downloads.db'
const tagTranslationFile = 'assets/ehtagtranslator.json'

const config = JSON.parse($file.read(configPath))


module.exports = {
  cachePath: cachePath,
  imagePath: imagePath,
  configPath: configPath,
  cookieFile: cookieFile,
  accountFile: accountFile,
  databaseFile: databaseFile,
  tagTranslationFile: tagTranslationFile,
  config: config
}
