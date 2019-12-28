const utility = require('./utility')
const glv = require('./globalVariables')
const Bottleneck = require("./modules/bottleneck");

const USERAGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36"
const URL_LOGIN = 'https://forums.e-hentai.org/index.php?act=Login&CODE=01'
const URL_EXHENTAI = 'https://exhentai.org/'
const URL_EXHENTAI_CONFIG = 'https://exhentai.org/uconfig.php'
const URL_API = 'https://exhentai.org/api.php'

let COOKIE = null
if ($file.exists(glv.cookieFile)) {
    COOKIE = getCookieLocal()
}

const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 100
});


// 获取xPath全部结果
function xPathAll(element, pattern) {
    const results = [];
    element.enumerate({
        "xPath": pattern,
        handler: (element, index) => {
            results.push(element);
        }
    });
    return results;
}

/**
 * 
 * @param {string} username 
 * @param {string} password 
 * @return {boolean} success
 */
async function login(username, password) {
    const data = {
        CookieDate: "1",
        b: "d",
        bt: "1-1",
        UserName: username,
        PassWord: password,
        ipb_login_submit: "Login!"
    };
    const headerLogin = {
        "User-Agent": USERAGENT,
        "Cache-Control": "no-cache",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://e-hentai.org/bounce_login.php?b=d&bt=1-1"
    };
    const resp1 =  await $http.post({
        url: URL_LOGIN,
        body: data,
        header: headerLogin
    })
    if (resp1.response.statusCode !== 200) {
        return false
    }
    let tmp = parseSetCookieString(resp1.response.headers['Set-Cookie'])
    const cookie = {
        ipb_member_id: tmp['ipb_member_id'],
        ipb_pass_hash: tmp['ipb_pass_hash'],
        yay: 'louder'
    }
    const resp2 =  await $http.get({
        url: URL_EXHENTAI,
        header:  {
            "User-Agent": USERAGENT,
            "Cookie": getCookieStringFromObject(cookie)
        }
    })
    if (resp2.response.statusCode !== 200) {
        return false
    }
    Object.assign(cookie, parseSetCookieString(resp2.response.headers['Set-Cookie']))
    const resp3 =  await $http.get({
        url: URL_EXHENTAI_CONFIG,
        header:  {
            "User-Agent": USERAGENT,
            "Cookie": getCookieStringFromObject(cookie)
        }
    })
    if (resp3.response.statusCode !== 200) {
        return false
    }
    Object.assign(cookie, parseSetCookieString(resp3.response.headers['Set-Cookie']))
    $file.write({
        data: $data({string: JSON.stringify(cookie, null, 2)}),
        path: glv.cookieFile
    });
    COOKIE = getCookieLocal()
    return true
}

function parseSetCookieString(setCookieString) {
    const regex0 = /^([^;=]+)=([^;]+);/g
    const regex = /, ([^;=]+)=([^;]+);/g;
    const found0 = regex0.exec(setCookieString).slice(1);
    const found = [...setCookieString.matchAll(regex)].map(n=>[n[1], n[2]])
    found.unshift(found0)
    const result = {}
    for (let [k, v] of found) {
        result[k] = v
    }
    return result
}

function getCookieStringFromObject(cookie) {
    let texts = []
    for (let key in cookie) {
        const value = cookie[key]
        texts.push(key + '=' + value)
    }
    return texts.join('; ')
}

function getCookieLocal() {
    const cookie = JSON.parse($file.read(glv.cookieFile).string)
    return getCookieStringFromObject(cookie)
}

async function getHtml(url) {
    if (!COOKIE) {
        COOKIE = getCookieLocal()
    }
    var resp = await $http.get({
        url: url,
        header: {
            "User-Agent": USERAGENT,
            Cookie: COOKIE
        }
    });
    return resp.data;
}

function getRootElement(html) {
    const soup = $xml.parse({
        string: html,
        mode: "html",
    });
    return soup.rootElement;
}

async function getListInfosFromUrl(list_url) {
    const html = await getHtml(list_url)
    const infos = getListInfos(getRootElement(html))
    return infos
}

function getListInfos(rootElement) {
    function extractItem(rootElement) {
        const items = []
        for (let trElement of xPathAll(rootElement, '//table[@class="itg glte"]/tr')) {
            const thumbnail_url = trElement.firstChild({"selector": "td.gl1e > div > a > img"}).value({"attribute": "src"});
            const category = trElement.firstChild({"xPath": 'td[@class="gl2e"]/div/div[@class="gl3e"]/div'}).string.toLowerCase();
            const posted_div = trElement.firstChild({"xPath": 'td[@class="gl2e"]/div/div[@class="gl3e"]/div[2]'});
            const posted = posted_div.string
            const visible = (posted_div.firstChild({"selector": "s"})) ? "No" : "Yes"
            const favcat_title = posted_div.value({"attribute": "title"});
            const favcat_style = posted_div.value({"attribute": "style"});
            const favcat = (favcat_style ? utility.getFavcatFromColor(favcat_style.slice(13, 17)) : null);
            const is_personal_rating = ((trElement.firstChild({"selector": 'td.gl2e > div > div.gl3e > div.ir'}).value({"attribute": "class"}).indexOf("irb") !== -1) ? true : null);
            const star_style = trElement.firstChild({"selector": "td.gl2e > div > div.gl3e > div.ir"}).value({"attribute": "style"});
            const tmp = /background-position:-?(\d{1,2})px -?(\d{1,2})px; ?opacity:[0-9.]*/g.exec(star_style).slice(1);
            const rating = ((5 - parseInt(tmp[0]) / 16) - parseInt(parseInt(tmp[1]) / 21) * 0.5).toString();
            const uploader = trElement.firstChild({"selector": "div.gl3e a"}).string;
            const length = /(\d*) page/g.exec(trElement.firstChild({"xPath": 'td[@class="gl2e"]/div/div[@class="gl3e"]/div[5]'}).string)[1];
            const url = trElement.firstChild({"selector": "td.gl1e > div a"}).value({"attribute": "href"});
            const title = trElement.firstChild({"selector": "div.gl4e.glname > div"}).string;
            const taglist = {}
            const patt = /title="([a-z]+):[0-9a-z |.-]+">([0-9a-z |.-]+)+<\/div>/g
            const array = [...trElement.firstChild({"selector": "table"}).node.matchAll(patt)]
            for (let a of array) {
                if (!(a[1] in taglist)) {
                    taglist[a[1]] = [a[2]]
                } else {
                    taglist[a[1]].push(a[2])
                }
            }
            items.push({
                thumbnail_url: thumbnail_url,
                category: category,
                posted: posted,
                visible: visible,
                rating: rating,
                display_rating: rating,
                is_personal_rating: is_personal_rating,
                uploader: uploader,
                length: length,
                url: url,
                title: title,
                favcat: favcat,
                favcat_title: favcat_title,
                taglist: taglist
            })
        }
        return items
    };

    const items = extractItem(rootElement)
    let current_page_str, total_pages_str
    if (rootElement.firstChild({'selector': 'table.ptt'})) {
        current_page_str = rootElement.firstChild({'selector': 'table.ptt td.ptds'}).string
        total_pages_str = rootElement.firstChild({'xPath': '//table[@class="ptt"]/tr/td[last()-1]'}).string
    } else {
        // 此处为了兼容popular
        current_page_str = '1'
        total_pages_str = '1'
    }
    // 仅在favorites页面发挥作用
    let favcat_nums_titles
    if (rootElement.firstChild({'selector': 'div.ido div.nosel'})) {
        favcat_nums_titles = []
        const favcat_nums_titles_elements = rootElement.firstChild({'selector': 'div.ido div.nosel'}).children({"tag": "div"}).slice(0, 10)
        for (let idx in favcat_nums_titles_elements) {
            const t = favcat_nums_titles_elements[idx].children({"tag": "div"})
            favcat_nums_titles.push(['favcat' + idx, t[0].string, t[t.length - 1].string])
        }
    } else {
        favcat_nums_titles = null
    };
    let favorites_order_method
    const t = rootElement.firstChild({'xPath': '//div[@class="ido"]/div[3]/div/a'})
    if (t) {
        favorites_order_method = (t.value({'attribute': 'href'}).slice(-1) === "f") ? 'Posted' : 'Favorited'
    } else {
        favorites_order_method = null
    };
    const search_result_element = rootElement.firstChild({'selector': 'p.ip'})
    const search_result = (search_result_element) ? search_result_element.string : 'Showing ' + items.length + ' results'
    return {
        items: items,
        current_page_str: current_page_str,
        total_pages_str: total_pages_str,
        favcat_nums_titles: favcat_nums_titles,
        favorites_order_method: favorites_order_method,
        search_result: search_result
    };
};


async function getGalleryMpvInfosFromUrl(gallery_url, full_comments=true) {
    const mpv_url = gallery_url.replace(/\/g\//g, '/mpv/')
    const gallery_url_hc = (full_comments) ? gallery_url + '?hc=1' : gallery_url
    const galleryHtml = await getHtml(gallery_url_hc)
    const mpvHtml = await getHtml(mpv_url)
    const infos = getGalleryInfos(getRootElement(galleryHtml))
    infos['pics'] = getMpvInfos(getRootElement(mpvHtml))
    infos['url'] = gallery_url
    return infos
}

function getMpvInfos(rootElement) {
    let t = rootElement.firstChild({"xPath": '//script[2]'}).string
    const gid = /var gid=(\d*);/g.exec(t)[1]
    const mpvkey = /var mpvkey = "(\w*)";/g.exec(t)[1]
    t = t.slice(t.indexOf('['), t.indexOf(']') + 1)
    t = JSON.parse(t)
    const number_of_digits = t.length.toString().length
    return t.map((v, i) => {
        return {
            img_id: utility.prefixInteger(i + 1, number_of_digits),
            key: v['k'],
            page: i + 1,
            img_name: v['n'],
            thumbnail_url: v['t'],
            gid: gid,
            mpvkey: mpvkey
        }
    })
};

function getGalleryInfos(rootElement){
    const infos = extractMetadata(rootElement)
    infos['comments'] = extractComments(rootElement)
    infos['pics'] = extractThumbnailUrls(rootElement)
    infos['filename'] = infos['gid'] + '_' + infos['token']
    return infos
}

function extractMetadata(rootElement) {
    const manga_infos = {}
    manga_infos['thumbnail_url'] = /\((.*)\)/g.exec(rootElement.firstChild({"selector": '#gd1 > div'}).value({"attribute": "style"}))[1]
    manga_infos['english_title'] = rootElement.firstChild({"selector": '#gn'}).string
    manga_infos['japanese_title'] = rootElement.firstChild({"selector": '#gj'}).string
    manga_infos['category'] = rootElement.firstChild({"selector": '#gdc'}).string
    manga_infos['uploader'] = rootElement.firstChild({"selector": '#gdn'}).string;
    [manga_infos['number of reviews'], manga_infos['rating']] = /Rating:(\d*)Average: ([\d.]*)/g.exec(rootElement.firstChild({"selector": '#gdr'}).string).slice(1, 3)
    const taglist = {}
    for (let tr of rootElement.firstChild({"selector": '#taglist > table'}).children({'tag': 'tr'})) {
        const tagType = tr.firstChild({"xPath": 'td[1]'}).string.slice(0, -1)
        const tags = tr.firstChild({"xPath": 'td[2]'}).children({'tag': 'div'}).map(n=>n.string)
        taglist[tagType] = tags
    };
    manga_infos['taglist'] = taglist
    manga_infos['posted'] = rootElement.firstChild({'xPath': '//div[@id="gdd"]/table//tr[1]/td[2]'}).string
    manga_infos['parent'] = rootElement.firstChild({'xPath': '//div[@id="gdd"]/table//tr[2]/td[2]'}).string
    manga_infos['parent_url'] =  (manga_infos['parent'] !== 'None') ? rootElement.firstChild({'xPath': '//div[@id="gdd"]/table//tr[2]/td[2]/a/@href'}).string : null
    manga_infos['visible'] = rootElement.firstChild({'xPath': '//div[@id="gdd"]/table//tr[3]/td[2]'}).string
    manga_infos['language'] = rootElement.firstChild({'xPath': '//div[@id="gdd"]/table//tr[4]/td[2]'}).string
    manga_infos['file size'] = rootElement.firstChild({'xPath': '//div[@id="gdd"]/table//tr[5]/td[2]'}).string
    let t = rootElement.firstChild({'xPath': '//div[@id="gdd"]/table//tr[6]/td[2]'}).string
    manga_infos['length'] = t.slice(0, t.search(' '))
    manga_infos['favorited'] = rootElement.firstChild({'xPath': '//div[@id="gdd"]/table//tr[7]/td[2]'}).string
    if (rootElement.firstChild({'xPath': '//div[@id="gdf"]//a'}).string === ' Add to Favorites') {
        manga_infos['favcat'] = null
        manga_infos['favcat_title'] = null
    } else {
        let t = /background-position:0px -(\d+)px/g.exec(rootElement.firstChild({'xPath': '//div[@id="gdf"]//div[@class="i"]/@style'}).string)[1]
        manga_infos['favcat'] = 'favcat' + Math.floor(parseInt(t) / 19)
        manga_infos['favcat_title'] = rootElement.firstChild({'xPath': '//div[@id="gdf"]'}).string.trim()
    };
    t = rootElement.firstChild({'xPath': '//script[2]'}).string
    manga_infos['gid'] = /var gid = (\w+);/g.exec(t)[1]
    manga_infos['token'] = /var token = "(\w+)";/g.exec(t)[1]
    manga_infos['apiuid'] = /var apiuid = (\w+);/g.exec(t)[1]
    manga_infos['apikey'] = /var apikey = "(\w+)";/g.exec(t)[1]
    manga_infos['display_rating'] = /var display_rating = ([\d.]+);/g.exec(t)[1]
    manga_infos['is_personal_rating'] = (rootElement.firstChild({'xPath': '//*[@id="rating_image"]/@class'}).string.indexOf("irb") !== -1) ? true : false
    if (rootElement.firstChild({'xPath': '//*[@id="gnd"]'})) {
        const aElements = rootElement.firstChild({'xPath': '//*[@id="gnd"]'}).children({'tag': 'a'})
        const textElements = [...rootElement.firstChild({'xPath': '//*[@id="gnd"]'}).string.matchAll(/, added [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}/g)].map(n => n[0])
        manga_infos['newer_versions'] = []
        for (let idx in aElements) {
            manga_infos['newer_versions'].push([aElements[idx].value({'attribute': 'href'}), aElements[idx].string, textElements[idx]])
        };
    } else {
        manga_infos['newer_versions'] = null
    };
    manga_infos['thumbnails_total_pages'] = rootElement.firstChild({'xPath': '//table[@class="ptt"]/tr/td[last()-1]'}).string
    return manga_infos
};

function extractComments(rootElement) {
    const comment_blocks = xPathAll(rootElement, '//div[@id="cdiv"]/div[@class="c1"]')
    const comments = []
    for (let block of comment_blocks) {
        const posted_time = /Posted on (.*UTC)/g.exec(block.firstChild({'selector': ".c3"}).string)[1]
        const commenter = block.firstChild({'selector': '.c3 > a'}).string
        let is_uploader, score, comment_id, votes, is_self_comment, voteable, my_vote
        if (block.firstChild({'selector': '.c4 > a'}) && block.firstChild({'selector': '.c4 > a'}).value({'attribute': 'name'})) {
            is_uploader = true
            score = null
            comment_id = null
            votes = null
            is_self_comment = false
            voteable = false
            my_vote = null
        } else {
            is_uploader = false
            score = block.firstChild({'selector': '.c5 > span'}).string
            comment_id = block.firstChild({'selector': '.c6'}).value({'attribute': 'id'}).slice(8)
            votes = block.firstChild({'selector': '.c7'}).string
            if (!(block.firstChild({'selector': '.c4'}))) { // 不可投票的普通评论
                is_self_comment = false
                voteable = false
                my_vote = null
            } else if (!block.firstChild({'xPath': './/*[contains(@class, "c4")][1]/a[2]'})) { // 自己发表的评论
                is_self_comment = true
                voteable = false
                my_vote = null
            } else { // 可投票的评论
                is_self_comment = false
                voteable = true
                if (block.firstChild({'xPath': './/*[contains(@class, "c4")]/a[1]/@style'}).string) {
                    my_vote = 1
                } else if (block.firstChild({'xPath': './/*[contains(@class, "c4")]/a[2]/@style'}).string) {
                    my_vote = -1
                } else {
                    my_vote = null
                }
            }
        }
        const comment_div = block.firstChild({'selector': '.c6'}).node
        comments.push({
            posted_time: posted_time,
            commenter: commenter,
            comment_id: comment_id,
            is_uploader: is_uploader,
            comment_div: comment_div,
            score: score,
            votes: votes,
            is_self_comment: is_self_comment,
            voteable: voteable,
            my_vote: my_vote
        })
    }
    return comments
}

function extractThumbnailUrls(rootElement) {
    const pic_blocks = xPathAll(rootElement, '//div[@id="gdt"]/div[@class="gdtl"]')
    return pic_blocks.map(block => {
        return {
            img_id: block.firstChild({'selector': "img"}).value({'attribute': 'alt'}),
            img_name: /Page \d+: (.*)/g.exec(block.firstChild({'selector': "img"}).value({'attribute': 'title'}))[1],
            img_url: block.firstChild({'selector': "a"}).value({'attribute': 'href'}),
            thumbnail_url: block.firstChild({'selector': "a"}).value({'attribute': 'src'})
        }
    })
}

function saveMangaInfos(infos, downloadPath) {
    if (!$file.exists(downloadPath)) {
        $file.mkdir(downloadPath)
    }
    $file.write({
        data: $data({string: JSON.stringify(infos, null, 2)}),
        path: utility.joinPath(downloadPath, 'manga_infos.json')
    });
}

async function getFavcatAndFavnote(gallery_url) {
    const [gid, token] = utility.verifyUrl(gallery_url).split('_')
    const query = {"gid": gid, "t": token, "act": "addfav"}
    const url = utility.unparseUrl('https', 'exhentai.org', 'gallerypopups.php', query)
    const html = await getHtml(url)
    const rootElement = getRootElement(html)
    const favcat_nums_titles_elements = rootElement.firstChild({'selector': 'div.nosel'}).children({"tag": "div"}).slice(0, 10)
    const favcat_titles = []
    for (let i in favcat_nums_titles_elements) {
        const v = favcat_nums_titles_elements[i]
        favcat_titles.push({
            favcat: 'favcat' + i,
            title: v.string.trim()
        })
    }
    const input_selected_element = rootElement.firstChild({'xPath': '//input[@checked="checked"]'})
    const favcat_selected = (input_selected_element) ? 'favcat' + input_selected_element.value({'attribute':'id'})[3] : null
    const is_favorited = (rootElement.firstChild({'selector': 'input#favdel'})) ? true : false
    const favnote = rootElement.firstChild({'selector': 'textarea'}).string
    return {
        favcat_titles: favcat_titles,
        favcat_selected: favcat_selected,
        favnote: favnote,
        is_favorited: is_favorited
    }
}

async function addFav(gallery_url, favcat='favcat0', favnote=null, old_is_favorited=false) {
    const [gid, token] = utility.verifyUrl(gallery_url).split('_')
    const query = {"gid": gid, "t": token, "act": "addfav"}
    const header = {
        "User-Agent": USERAGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": COOKIE
    };
    const url = utility.unparseUrl('https', 'exhentai.org', 'gallerypopups.php', query)
    const apply_string = (old_is_favorited) ? 'Apply Changes' : 'Add to Favorites'
    const favcat_string = (favcat === 'favdel') ? 'favdel' : favcat[6]
    const payload = {'favcat': favcat_string, 'favnote': favnote, 'apply': apply_string, 'update': '1'}
    const resp1 =  await $http.post({
        url: url,
        body: payload,
        header: header
    })
}

async function rateGallery(rating, apikey, apiuid, gid, token) {
    rating = parseInt(parseFloat(rating) * 2).toString()
    const header = {
        "User-Agent": USERAGENT,
        "Content-Type": "application/json",
        "Cookie": COOKIE
    };
    const payload = {
        "method": "rategallery",
        "apikey": apikey,
        "apiuid": apiuid,
        "gid": gid,
        "rating": rating,
        "token": token
    };
    const resp1 =  await $http.post({
        url: URL_API,
        body: payload,
        header: header
    })
}

/**
 * 
 * @param {string} gid 
 * @param {string} key 
 * @param {string} mpvkey 
 * @param {number} page 
 * @returns {object} 关于API返回内容的详解：
 *      d: 图片下方的标签 如"1000 x 1000 :: 100.0 KB"
 *      o: 不明 
 *      lf: 获取全尺寸图片的API，需要urljoin，可自动跳转至结果 如"fullimg.php?gid=1234&page=1&key=xxxx"
 *      ls: 获取包含本图片的搜索结果页面的API，需要urljoin
 *      ll: 包含缩略图信息，但无法直接使用
 *      lo: 普通浏览方式应该所在的位置 如"s/xxxx/1234-1"
 *      xres: 宽 如"1000"
 *      yres: 高 如"1000"
 *      i: 图片真实网址，是全网址
 *      s: 不明
 */
async function fetchPicAPIResult(gid, key, mpvkey, page) {
    const header = {
        "User-Agent": USERAGENT,
        "Content-Type": "application/json",
        "Cookie": COOKIE
    };
    const payload = {
        "method": "imagedispatch",
        "gid": gid,
        "page": page,
        "imgkey": key,
        "mpvkey": mpvkey
    };
    const resp = await $http.post({
        url: URL_API,
        header: header,
        body: payload,
        timeout: 20
    })
    const data = resp.data
    if (data && resp.response.statusCode === 200) {
        return data
    } else {
        throw new Error('fail to fetch api resonse')
    }
}

async function downloadResizedImage(fullpath, gid, key, mpvkey, page) {
    try {
        const response = await fetchPicAPIResult(gid, key, mpvkey, page)
        const url = response['i']
        const success = await downloadPic(fullpath, url)
        console.info(success, fullpath)
    } catch(err) {
        console.info(err)
    }
}

async function downloadOriginalImage(fullpath, gid, key, mpvkey, page) {
    const response = await fetchPicAPIResult(gid, key, mpvkey, page)
    const fullimg_url = URL_EXHENTAI + response['lf']
    await downloadPic(fullpath, fullimg_url)
}

// 此函数将专用于下载大图片
async function downloadPic(fullpath, url, timeout=20) {
    const resp = await $http.download({
        url: url,
        timeout: timeout,
        showsProgess: false,
        header: {
            "User-Agent": USERAGENT
        }
    });
    const data = resp.data
    if (data) {
        return $file.write({
            data: resp.data,
            path: fullpath
        })
    } else {
        return false
    }
}

function downloadPicsByBottleneck(infos) {
    for (let pic of infos['pics']) {
        const fullpath = utility.joinPath(glv.imagePath, infos.filename, pic.img_id + pic.img_name.slice(pic.img_name.lastIndexOf('.')))
        if (!$file.exists(fullpath)) {
            limiter.schedule(()=>downloadResizedImage(fullpath, pic.gid, pic.key, pic.mpvkey, pic.page))
        }
    }
}

function stopDownloadTasksCreatedByBottleneck() {
    limiter.stop()
}

module.exports = {
    downloadResizedImage: downloadResizedImage,
    fetchPicAPIResult: fetchPicAPIResult,
    getListInfosFromUrl: getListInfosFromUrl,
    getGalleryMpvInfosFromUrl: getGalleryMpvInfosFromUrl,
    login: login,
    saveMangaInfos: saveMangaInfos,
    COOKIE: COOKIE,
    USERAGENT: USERAGENT,
    getFavcatAndFavnote: getFavcatAndFavnote,
    downloadPicsByBottleneck: downloadPicsByBottleneck,
    stopDownloadTasksCreatedByBottleneck: stopDownloadTasksCreatedByBottleneck
}
