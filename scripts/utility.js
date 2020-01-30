const glv = require('./globalVariables')
const urlParse = require('./modules/url-parse')
const htmlToText = require('./modules/html-to-text')

let TAGTRANSLATOR_DICT;
if ($file.exists(glv.tagTranslationFile)) {
    TAGTRANSLATOR_DICT = JSON.parse($file.read(glv.tagTranslationFile).string)
}


// 数字补零
function prefixInteger(num, length) {
    return ("0000000000000000" + num).substr(-length);
}

// 拼接目录
function joinPath(...args) {
    return args.map((part, i) => {
        if (i === 0) {
            return part.trim().replace(/[/]*$/g, '')
        } else {
            return part.trim().replace(/(^[/]*|[/]*$)/g, '')
        }
    }).filter(x => x.length).join('/')
}

// 获取UTF-8编码后的长度
function getUtf8Length(s) {
    var len = 0;
    for (var i = 0; i < s.length; i++) {
        var code = s.charCodeAt(i);
        if (code <= 0x7f) {
            len += 1;
        } else if (code <= 0x7ff) {
            len += 2;
        } else if (code >= 0xd800 && code <= 0xdfff) {
            len += 4; i++;
        } else {
            len += 3;
        }
    }
    return len;
}

// html2text
function convertHtmlToText(html) {
    const text = htmlToText.fromString(html, {
        wordwrap: false,
        hideLinkHrefIfSameAsText: true,
        ignoreImage: false
      });
    return text
}

// 立即获得window size
function getWindowSize() {
    const window = $objc("UIWindow").$keyWindow().jsValue();
    return window.size;
}

// 计算特定字号的文字长度
// 此函数不应该用于处理超长文本
function getTextWidth(text, fontSize = 14) {
    return $text.sizeThatFits({
        text: text,
        width: 10000,
        font: $font(fontSize),
        align: $align.center,
        lineSpacing: 0
    })
}

// 验证url是否合法，若合法返回foldername
function verifyUrl(url) {
    const patt = /https:\/\/e[-x]hentai\.org\/g\/(\d*)\/(\w*)\/?/
    const t = patt.exec(url)
    if (t) {
        return t.slice(1).join('_')
    } else {
        throw new Error('url有误')
    }
}

function getNameAndColor(name) {
    const d = {
        'misc': {
            'string': 'Misc',
            'color': '#777777'
        },
        'doujinshi': {
            'string': 'Doujinshi',
            'color': '#9E2720'
        },
        'manga': {
            'string': 'Manga',
            'color': '#DB6C24'
        },
        'artist cg': {
            'string': 'Artist CG',
            'color': '#D38F1D'
        },
        'game cg': {
            'string': 'Game CG',
            'color': '#617C63'
        },
        'image set': {
            'string': 'Image Set',
            'color': '#325CA2'
        },
        'cosplay': {
            'string': 'Cosplay',
            'color': '#6A32A2'
        },
        'asian porn': {
            'string': 'Asian Porn',
            'color': '#A23282'
        },
        'non-h': {
            'string': 'Non-H',
            'color': '#5FA9CF'
        },
        'western': {
            'string': 'Western',
            'color': '#AB9F60'
        }
    }
    return d[name.toLowerCase()]
}

function getColorFromFavcat(name) {
    const d = {
        'favcat0': '#000',
        'favcat1': '#f00',
        'favcat2': '#fa0',
        'favcat3': '#dd0',
        'favcat4': '#080',
        'favcat5': '#9f4',
        'favcat6': '#4bf',
        'favcat7': '#00f',
        'favcat8': '#508',
        'favcat9': '#e8e'
    }
    return d[name]
}

function getFavcatFromColor(name) {
    const d = {
        '#000': 'favcat0',
        '#f00': 'favcat1',
        '#fa0': 'favcat2',
        '#dd0': 'favcat3',
        '#080': 'favcat4',
        '#9f4': 'favcat5',
        '#4bf': 'favcat6',
        '#00f': 'favcat7',
        '#508': 'favcat8',
        '#e8e': 'favcat9',
    }
    return d[name]
}

function translateTagType(eng) {
    const d = {
        'artist': '作者',
        'female': '女性',
        'male': '男性',
        'parody': '原作',
        'character': '角色',
        'group': '团队',
        'language': '语言',
        'reclass': '归类',
        'misc': '杂项'
    }
    return d[eng]
}

function getLatestVersion() {
    const current_version = JSON.parse($file.read(glv.appConfigPath).string).info.version
    const url = 'https://api.github.com/repos/Gandum2077/JSEhViewer/releases/latest'
    $http.get({
        url: url,
        timeout: 10,
        handler: function(resp) {
            if (resp.data && resp.response.statusCode === 200) {
                const info = resp.data
                const latest_version = info['tag_name']
                if (current_version !== latest_version) {
                    $ui.toast('可更新，请从Github更新')
                }
            }
        }
    })
}

async function generateTagTranslatorJson() {
    const url = 'https://api.github.com/repos/EhTagTranslation/Database/releases/latest'
    const resp = await $http.get({url: url})
    const info = resp.data
    const dbUrl = info.assets.find(i => i.name === 'db.text.json').browser_download_url
    const resp2 = await $http.get(dbUrl)
    const dbJson = resp2.data
    const typesDict = {}
    for (let i of dbJson['data']) {
        const values = {}
        for (let j in i['data']) {
            const translatedText = i['data'][j].name
            values[j] = translatedText
        }
        typesDict[i.namespace] = values
    }
    $file.write({
        data: $data({
            string: JSON.stringify(typesDict, null, 2)
        }),
        path: glv.tagTranslationFile
    })
}

function updateTagTranslatorDict() {
    TAGTRANSLATOR_DICT = JSON.parse($file.read(glv.tagTranslationFile).string)
}

function translateTaglist(taglist) {
    const translatedTaglist = {}
    for (let tagType in taglist) {
        const tags = taglist[tagType]
        const translatedtagType = translateTagType(tagType)
        const translatedTags = []
        for (let tag of tags) {
            if (tag.indexOf('|') !== -1) {
                tag = tag.slice(0, tag.indexOf('|')).trim()
            }
            translatedTags.push(TAGTRANSLATOR_DICT[tagType][tag] || tag)
        }
        translatedTaglist[translatedtagType] = translatedTags
    }
    return translatedTaglist
}

var sortFunc = (a, b) => {
    const sortSequence = {
        'female': 0,
        '女性': 1,
        'male': 2,
        '男性': 3,
        'language': 4,
        '语言': 5,
        'parody': 6,
        '原作': 7,
        'character': 8,
        '角色': 9,
        'group': 10,
        '团队': 11,
        'artist': 12,
        '作者': 13,
        'misc': 14,
        '杂项': 15,
        'reclass': 16,
        '归类': 17
    }
    const x = a.slice(0, a.indexOf(':'))
    const y = b.slice(0, b.indexOf(':'))
    return sortSequence[x] - sortSequence[y]
}

function renderTaglistToText(taglist) {
    const texts = []
    for (let tagType in taglist) {
        const tags = taglist[tagType]
        texts.push(tagType + ':    ' + tags.join(', '))
    }
    texts.sort(sortFunc)
    return texts.join('\n')
}

function getBilingualTaglist(taglist) {
    const bilingualTaglist = {}
    for (let tagType in taglist) {
        const tags = taglist[tagType]
        const bilingualTags = []
        for (let tag of tags) {
            const trimedTag = (tag.indexOf('|') !== -1) ? tag.slice(0, tag.indexOf('|')).trim() : tag
            const translatedTag = TAGTRANSLATOR_DICT[tagType][trimedTag] || tag
            bilingualTags.push([tag, translatedTag])
        }
        bilingualTaglist[tagType] = bilingualTags
    }
    return bilingualTaglist
}

/**
 * 组装url
 * @param {string} protocol 限定https:, downloads:
 * @param {string} host 限定exhentai.org, index
 * @param {string} pathname 理论上有五种：'', '/', '/watched', '/favorites.php', '/popular'
 * @param {object} query 类似于{k1: v1, k2: v2}
 * @returns {string} url
 */
function unparseUrl(protocol, host, pathname, query) {
    const result = new urlparse()
    result.set('protocol', protocol)
    result.set('host', host)
    result.set('pathname', pathname)
    result.set('query', query)
    return result.toString()
}

/**
 * 分解url
 * @param {string} url 传入的url的形式严格限定为protocol//host/pathname?querystring，其中querystring必须是转义过的，整个url不能有空格
 * @returns {object} {protocol: protocol, host: host, pathname: pathname, query: query}，前三个为string，query为object
 */
function parseUrl(url) {
    const result = urlParse(url, true)
    return {
        protocol: result.protocol,
        host: result.host,
        pathname: result.pathname,
        query: result.query
    }
}

/**
 * 替换url参数
 * @param {string} url 
 * @param {object} newQuery 
 */
function updateQueryOfUrl(url, queryForUpdate) {
    const result = urlParse(url, true)
    const query = result.query
    const newQuery = Object.assign(query, queryForUpdate)
    result.set('query', newQuery)
    return result.toString()
}

// 给url分类，结果为default, popular, watched, favorites, downloads
function getUrlCategory(url) {
    const result = parseUrl(url)
    if (result.pathname === '/popular') {
        return 'popular'
    } else if (result.protocol === 'downloads:') {
        return 'downloads'
    } else if (result.pathname === '/watched') {
        return 'watched'
    } else if (result.pathname === '/favorites.php') {
        return 'favorites'
    } else {
        return 'default'
    }
}

function getSearchUrl(query, urlCategory = 'default') {
    return updateQueryOfUrl(glv.urls[urlCategory], query)
}

// 冻结屏幕，并播放动画，表示等待状态
// dirty work - 它要求整个应用中不能再有同id的view（即loadingView_e582da14）
function startLoading(title) {
    if (!title) {
        title = '请等待……'
    }
    const titleView = {
        type: "label",
        props: {
            id: "titleView",
            text: title,
            align: $align.center,
            font: $font('bold', 17),
            bgcolor: $color("clear")
        },
        layout: function(make, view) {
            make.top.equalTo($("lottieView").bottom).inset(-50)
            make.centerX.equalTo($("lottieView"))
            make.size.equalTo($size(100,20))
        }
    }

    const lottieView = {
        type: "lottie",
        props: {
            id: "lottieView",
            loop: true,
            src: "assets/icons/lottie_loading.json"
        },
        layout: (make, view) => {
            make.size.equalTo($size(200, 200));
            make.center.equalTo(view.super);
        },
        events: {
            ready: sender => sender.play()
        }
    }
    
    const maskView = {
        props: {
            bgcolor: $rgba(255, 255, 255, 0.5)
        },
        layout: $layout.fill
    }
    const loadingView = {
        props: {
            id: 'loadingView_e582da14'
        },
        views: [maskView, lottieView, titleView],
        layout: $layout.fillSafeArea
    }
    $ui.window.add(loadingView)

}

// 改变等待画面的标题
// dirty work - 它要求整个应用中不能再有同id的view（即loadingView_e582da14）
function changeLoadingTitle(title) {
    $ui.window.get("loadingView_e582da14").get('titleView').text = title
}

// 结束等待
// dirty work - 它要求整个应用中不能再有同id的view（即loadingView_e582da14）
function stopLoading() {
    $ui.window.get("loadingView_e582da14").remove()
}

const bgImage = $imagekit.render({
    size: $size(124, 24),
    color: $color("#f2f2f7")
})
const yellowImage = $imagekit.render({
    size: $size(124, 24),
    color: $color("#ffd217")
})
const blueImage = $imagekit.render({
    size: $size(124, 24),
    color: $color("#5eacff")
})

function createRatingStarsImage({
    display_rating = 5,
    is_personal_rating = false
}) {
    const colorImage = (is_personal_rating) ? blueImage : yellowImage
    const colorRectWidth = Math.round(display_rating / 5 * 120) // $imagekit中不能使用存在小于1的值的size，会返回null
    if (0 < colorRectWidth && colorRectWidth < 120) { 
        const image1 = $imagekit.scaleTo(colorImage, $size(colorRectWidth, 24), 0)
        const image2 = $imagekit.scaleTo(bgImage, $size(120 - colorRectWidth, 24), 0)
        const output = $imagekit.concatenate([image1, image2], 0, 1)
        return output
    } else if (colorRectWidth === 0) {
        return bgImage
    } else {
        return colorImage
    }
}

module.exports = {
    prefixInteger: prefixInteger,
    joinPath: joinPath,
    getUtf8Length: getUtf8Length,
    convertHtmlToText: convertHtmlToText,
    getWindowSize: getWindowSize,
    getTextWidth: getTextWidth,
    verifyUrl: verifyUrl,
    getNameAndColor: getNameAndColor,
    getColorFromFavcat: getColorFromFavcat,
    getFavcatFromColor: getFavcatFromColor,
    translateTagType: translateTagType,
    getLatestVersion: getLatestVersion,
    generateTagTranslatorJson: generateTagTranslatorJson,
    updateTagTranslatorDict: updateTagTranslatorDict,
    translateTaglist: translateTaglist,
    renderTaglistToText: renderTaglistToText,
    getBilingualTaglist: getBilingualTaglist,
    getSearchUrl: getSearchUrl,
    unparseUrl: unparseUrl,
    parseUrl: parseUrl,
    updateQueryOfUrl: updateQueryOfUrl,
    getUrlCategory: getUrlCategory,
    startLoading: startLoading,
    stopLoading: stopLoading,
    changeLoadingTitle: changeLoadingTitle,
    createRatingStarsImage: createRatingStarsImage
}