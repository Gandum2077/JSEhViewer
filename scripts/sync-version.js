const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const packagePath = path.join(root, "package.json")
const lockPath = path.join(root, "package-lock.json")
const configPath = path.join(root, "app", "config.json")
const readmePath = path.join(root, "README.md")
const checkOnly = process.argv.includes("--check")

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"))
const packageJson = readJson(packagePath)
const packageLock = readJson(lockPath)
const config = readJson(configPath)
const version = packageJson.version

if (!version || typeof version !== "string") {
  throw new Error("package.json 中缺少有效的 version")
}

const installUrlPattern = /(\[一键安装\]\([^\n]*releases%2Fdownload%2F)[^%\s)]+(%2FJSEhViewer\.box\))/
const readme = fs.readFileSync(readmePath, "utf8")
const installUrlMatch = readme.match(installUrlPattern)

if (!installUrlMatch) {
  throw new Error("README.md 中未找到一键安装链接，无法同步版本")
}

const mismatches = []
if (packageLock.version !== version) mismatches.push("package-lock.json.version")
if (packageLock.packages?.[""]?.version !== version) {
  mismatches.push('package-lock.json.packages[""].version')
}
if (config.info?.version !== version) mismatches.push("app/config.json.info.version")
if (installUrlMatch[0] !== `${installUrlMatch[1]}${version}${installUrlMatch[2]}`) {
  mismatches.push("README.md 一键安装链接")
}

if (checkOnly) {
  if (mismatches.length) {
    throw new Error(`版本 ${version} 未同步到：${mismatches.join("、")}`)
  }
  console.log(`版本 ${version} 已在所有发布文件中保持一致`)
  process.exit(0)
}

config.info.version = version
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
fs.writeFileSync(
  readmePath,
  readme.replace(installUrlPattern, `$1${version}$2`),
)

console.log(`已将 app/config.json 和 README.md 同步到 ${version}`)

