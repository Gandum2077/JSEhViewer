const glv = require("scripts/globalVariables")
const utility = require('scripts/utility')
const database = require('scripts/database')

function initAll() {
    for (let path of glv.userFiles) {
        if (!$file.exists(path)) {
            $file.delete(thumbnailPath)
        }
    }
}

function rebuildDB() {
    database.createDB()
    for (let filename of $file.list(glv.imagePath)) {
        if ($file.list(utility.joinPath(glv.imagePath, filename)).length - 2 > 0) {
            const infosFile = utility.joinPath(glv.imagePath, filename, 'manga_infos.json')
            const infos = JSON.parse($file.read(infosFile).string)
            database.insertInfo(infos)
        }
    }
}

const items = [
    {
        name: "删除用户文件（初始化）",
        action: initAll
    },
    {
        name: "修复数据库",
        action: rebuildDB
    }
]

var result = await $ui.menu({
    items: items.map(n => n.name)
})
const action = items.find(n => n.name === result.title).action
if (action) {
    action()
}