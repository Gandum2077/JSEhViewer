const glv = require('./globalVariables')
const utility = require('./utility')

function createDB() {
    if ($file.exists(glv.databaseFile)) {
        $file.delete(glv.databaseFile)
    };
    const db = $sqlite.open(glv.databaseFile);
    db.update(`CREATE TABLE downloads (
        gid INTEGER NOT NULL,
        token TEXT,
        category TEXT,
        create_time TEXT,
        display_rating REAL,
        english_title TEXT,
        favcat TEXT,
        is_personal_rating INTEGER,
        japanese_title TEXT,
        length INTEGER,
        posted TEXT,
        rating REAL,
        taglist TEXT,
        thumbnail_url TEXT,
        uploader TEXT,
        url TEXT,
        visible INTEGER,
        PRIMARY KEY(gid))`);
    db.update(`CREATE TABLE tags (
        gid INTEGER NOT NULL,
        class TEXT,
        tag TEXT)`);
    $sqlite.close(db);
}

function insertInfo(info) {
    const values_downloads = [
        info['gid'],
        info['token'],
        info['category'],
        info['create_time'],
        info['display_rating'],
        info['english_title'],
        info['favcat'],
        info['is_personal_rating'],
        info['japanese_title'],
        info['length'],
        info['posted'],
        info['rating'],
        JSON.stringify(info['taglist']),
        info['thumbnail_url'],
        info['uploader'],
        info['url'],
        info['visible']
    ];
    const gid = values_downloads[0]
    const values_keys = [];
    for (let i in info['taglist']) {
        for (let j in info['taglist'][i]) {
            values_keys.push([gid, i, info['taglist'][i][j]])
        }
    };
    const db = $sqlite.open(glv.databaseFile);
    db.update({
        sql: "DELETE FROM downloads WHERE gid=?",
        args: [gid]
    });
    db.update({
        sql: "DELETE FROM tags WHERE gid=?",
        args: [gid]
    });
    db.update({
        sql: "INSERT INTO downloads VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        args: values_downloads
    });
    for (let i of values_keys) {
        db.update({
            sql: "INSERT INTO tags VALUES (?,?,?)",
            args: i
        });
    }
    $sqlite.close(db);
};

function deleteById(gid) {
    const db = $sqlite.open(glv.databaseFile);
    db.update({
        sql: "DELETE FROM downloads WHERE gid=?",
        args: [gid]
    });
    db.update({
        sql: "DELETE FROM tags WHERE gid=?",
        args: [gid]
    });
    $sqlite.close(db);
}

function search(clause, args=null) {
    const db = $sqlite.open(glv.databaseFile)
    const result = []
    db.query({
        sql: clause,
        args: args
    }, (rs, err) => {
        while (rs.next()) {
            const values = rs.values
            result.push(values)
        }
        rs.close()
    })
    $sqlite.close(db)
    return result
}

function handle_f_search(text) {
    const query_tags = []
    const query_uploader = []
    const query_title = []

    const patternTagDouble = /^\w+:"[^:$]+\$"/
    const patternTagSingle = /^\w+:[^ $]+\$/
    const patternMiscDouble = /^"[^:$]+\$"/
    const patternMiscSingle = /^[^ $]+\$/
    const patternUploader = /^uploader:[^ ]+/
    const patternOthers = /^[^ ]+/
    let remainingText = text.trim();
    while (remainingText) {
        if (patternTagDouble.test(remainingText)) {
            const result = patternTagDouble.exec(remainingText)[0]
            remainingText = remainingText.slice(result.length).trim()
            query_tags.push(result)
        } else if (patternTagSingle.test(remainingText)) {
            const result = patternTagSingle.exec(remainingText)[0]
            remainingText = remainingText.slice(result.length).trim()
            query_tags.push(result)
        } else if (patternMiscDouble.test(remainingText)) {
            const result = patternMiscDouble.exec(remainingText)[0]
            remainingText = remainingText.slice(result.length).trim()
            query_tags.push(result)
        } else if (patternMiscSingle.test(remainingText)) {
            const result = patternMiscSingle.exec(remainingText)[0]
            remainingText = remainingText.slice(result.length).trim()
            query_tags.push(result)
        } else if (patternUploader.test(remainingText)) {
            const result = patternUploader.exec(remainingText)[0]
            remainingText = remainingText.slice(result.length).trim()
            query_uploader.push(result)
        } else if (patternOthers.test(remainingText)) {
            const result = patternOthers.exec(remainingText)[0]
            remainingText = remainingText.slice(result.length).trim()
            query_title.push(result)
        }
    }
    if (query_uploader.length > 1) {
        throw new Error("uploader不止一个")
    }
    if (query_title.length > 3) {
        throw new Error("关键词超过3个")
    }
    for (let i of query_title) {
        if (utility.getUtf8Length(i) < 3) {
            throw new Error("存在过短的关键词")
        }
    }
    return [query_title, query_uploader, query_tags]
}


function handleQuery(query, downloads_order_method = "gid") {
    const cat_sequence = ['Misc', 'Doujinshi', 'Manga', 'Artist CG', 'Game CG', 'Image Set', 'Cosplay', 'Asian Porn', 'Non-H', 'Western']
    const condition_clauses = []
    const args = []
    const f_search = query['f_search'] // 关键词
    const f_cats = query['f_cats'] // 排除的分类
    const advsearch = query['advsearch'] // 是否启用高级选项，若否下面改为默认选项
    let f_sname, f_stags, f_srdd, f_sp
    // TO-DO 此处advsearch到底为何值尚需确认
    if (advsearch) {
        f_sname = query['f_sname'] // 是否搜索name
        f_stags = query['f_stags'] // 是否搜索tag
        f_srdd = query['f_srdd'] // 评分
        f_sp = query['f_sp'] // 是否搜索页数
    } else {
        f_sname = 'on'
        f_stags = 'on'
        f_srdd = ''
        f_sp = ''
    }
    if (f_search) {
        const [query_title, query_uploader, query_tags] = handle_f_search(f_search)
        if (query_tags.length && f_stags) {
            for (let i of query_tags) {
                const i2 = (i.indexOf(':') === -1) ? 'misc:' + i : i
                condition_clauses.push("EXISTS (SELECT tags.gid FROM tags WHERE downloads.gid=tags.gid AND tags.class=? AND (tags.tag=? OR tags.tag like ?))")
                const tagclass = i2.slice(0, i2.indexOf(':'))
                const tagname = /^"?(.*)\$"?/.exec(i2.slice(i2.indexOf(':') + 1))[1]
                const taglike = tagname + ' |%'
                args.push(tagclass, tagname, taglike)
            }
        }
        if (query_uploader.length) {
            condition_clauses.push("downloads.uploader=?")
            args.append(query_uploader[0].slice(9))
        }
        if (query_title.length && f_sname) {
            for (let i of query_title) {
                condition_clauses.push("(downloads.japanese_title like ? OR downloads.english_title like ?)")
                args.push('%' + i + '%', '%' + i + '%')
            }
        }
    }
    if (f_cats) {
        const nums = utility.prefixInteger(parseInt(f_cats).toString(2), 10)
        const zip = (arr1, arr2) => arr1.map((k, i) => [k, arr2[i]])
        const filtered_cat = []
        for (let [cat, n] of zip(cat_sequence.reverse(), nums)) {
            if (n === '1') {
                filtered_cat.push(cat)
            }
        }
        condition_clauses.push(`downloads.category NOT IN ('${filtered_cat.join("', '")}')`)
    }
    if (f_srdd) {
        condition_clauses.push(`downloads.rating>=${f_srdd}`)
    }
    let f_spf, f_spt;
    if (f_sp) {
        f_spf = query['f_spf'] || '1'
        f_spt = query['f_spt']
        if (!/^\d+$/.test(f_spf)) {
            f_spf = '1'
        }
        if (/^\d+$/.test(f_spt)) {
            f_spt = null
        }
        if (f_spt) {
            condition_clauses.push(`(${f_spf} < downloads.length AND downloads.length < ${f_spt})`)
        } else{
            condition_clauses.push(`${f_spf} < downloads.length`)
        }
    }
    let where_clause = ''
    let sort_clause
    if (condition_clauses.length) {
        where_clause = ' WHERE ' + condition_clauses.join(' AND ')
    }
    if (downloads_order_method === "gid") {
        sort_clause = ' ORDER BY gid DESC'
    } else {
        sort_clause = ' ORDER BY create_time DESC'
    }
    return {
        clause: "SELECT DISTINCT * FROM downloads" + where_clause + sort_clause,
        args: args
    }
}

function searchByUrl(url, downloads_order_method = "gid") {
    const query = utility.parseUrl(url).query
    const result = handleQuery(query, downloads_order_method = downloads_order_method)
    const foldernames = search(result.clause, args=result.args)
    return foldernames
}

module.exports = {
    search: search,
    createDB: createDB,
    insertInfo: insertInfo,
    deleteById: deleteById,
    searchByUrl: searchByUrl
}