const Fs = require('fs')
const Path = require('path')
const Axios = require('axios')

const query = $context.query;
const URL_API = query.URL_API;
const USERAGENT = query.USERAGENT;
const COOKIE = query.COOKIE;
const fullpath = query.fullpath
const gid = query.gid;
const key = query.key;
const mpvkey = query.mpvkey;
const page = query.page;

const headersForAPI = {
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
const configForAPI = {
    url: URL_API,
    method: "post",
    headers: headersForAPI,
    data: JSON.stringify(payload),
    timeout: 20000
}
Axios(configForAPI)
    .then(response => {
        if (response.status === 200) {
            const img_url = response.data.i
            const headersForImage = {
                "User-Agent": USERAGENT
            };
            const configForImage = {
                url: img_url,
                method: "get",
                headers: headersForImage,
                timeout: 20000,
                responseType: 'stream'
            }
            const path = Path.resolve("..", fullpath)
            Axios(configForImage).then(function (response) {
                    response.data.pipe(Fs.createWriteStream(path))
                    $jsbox.notify("eventId", {
                        url: configForImage.url,
                        success: true
                    })
                })
                .catch(function (error) {
                    $jsbox.notify("eventId", {
                        url: configForImage.url,
                        success: false,
                        reason: 'image'
                    })
                })
        }
    })
    .catch(error => {
        $jsbox.notify("eventId", {
            url: configForAPI.url,
            success: false,
            reason: 'api'
        })
    })