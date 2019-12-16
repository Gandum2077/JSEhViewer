const glv = require('./globalVariables')
const utility = require('./utility')
const info = JSON.parse($file.read(file).string)

function createDB() {
    if ($file.exists(glv.databaseFile)) {
        $file.delete(glv.databaseFile)
    };
    const db = $sqlite.open(glv.databaseFile);
    db.update("CREATE TABLE downloads (\
        gid INTEGER NOT NULL,\
        token TEXT,\
        category TEXT,\
        english_title TEXT,\
        japanese_title TEXT,\
        length INTEGER,\
        posted TEXT,\
        rating REAL,\
        uploader TEXT,\
        PRIMARY KEY(gid))");
    db.update("CREATE TABLE tags (\
        gid INTEGER NOT NULL,\
        class TEXT,\
        tag TEXT)");
    $sqlite.close(db);
}

function insertInfo(info) {
    const values_downloads = [
        info['gid'],
        info['token'],
        info['category'],
        info['english_title'],
        info['japanese_title'],
        info['length'],
        info['posted'],
        info['rating'],
        info['uploader']
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
        sql: "INSERT INTO downloads VALUES (?,?,?,?,?,?,?,?,?)",
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

function search(clause) {
    const db = $sqlite.open(glv.databaseFile);
    const rs = db.query(clause).result;
    const result = [];
    while (rs.next()) {
        result.push(rs.values)
    };
    rs.close();
    $sqlite.close(db);
    return result
}

function countUtf8Bytes(s) {
    var b = 0,
        i = 0,
        c
    for (; c = s.charCodeAt(i++); b += c >> 11 ? 3 : c >> 7 ? 2 : 1);
    return b
}

function handle_f_search(text) {
    const query_tags = []
    const query_uploader = []
    const query_title = []

    const patternTagDouble = /\w+:"[^:$]+\$"/g
    const patternTagSingle = /\w+:[^ $]+\$/g
    const patternMiscDouble = /"[^:$]+\$"/g
    const patternMiscSingle = /[^ $]+\$/g
    const patternUploader = /uploader:[^ ]+/g
    const patternOthers = /[^ ]+/g

    text = text.trim()
    let querystring;
    while (text.length > 0) {
        if ((querystring = patternTagDouble.exec(text)) !== null) {
            text = text.slice(querystring[0].length).trim()
            query_tags.push(querystring[0])
        } else if ((querystring = patternTagSingle.exec(text)) !== null) {
            text = text.slice(querystring[0].length).trim()
            query_tags.push(querystring[0])
        } else if ((querystring = patternMiscDouble.exec(text)) !== null) {
            text = text.slice(querystring[0].length).trim()
            query_tags.push(querystring[0])
        } else if ((querystring = patternMiscSingle.exec(text)) !== null) {
            text = text.slice(querystring[0].length).trim()
            query_tags.push(querystring[0])
        } else if ((querystring = patternUploader.exec(text)) !== null) {
            text = text.slice(querystring[0].length).trim()
            query_uploader.push(querystring[0])
        } else if ((querystring = patternOthers.exec(text)) !== null) {
            text = text.slice(querystring[0].length).trim()
            query_title.push(querystring[0])
        }
    }
    if (query_uploader.length > 1) {
        throw new Error("uploader不止一个")
    }
    if (query_title.length > 3) {
        throw new Error("关键词超过3个")
    }
    for (const i in query_title) {
        if (countUtf8Bytes(i.length) < 3) {
            throw new Error("存在过短的关键词")
        }
    }
    return [query_title, query_uploader, query_tags]
}


function handleQueryDict(queryDict) {
    const cat_sequence = ['Misc', 'Doujinshi', 'Manga', 'Artist CG', 'Game CG', 'Image Set', 'Cosplay', 'Asian Porn', 'Non-H', 'Western']
    const condition_clauses = []
    const args
    const f_search = queryDict['f_search'] // 关键词
    const f_cats = queryDict['f_cats'] // 排除的分类
    const advsearch = queryDict['advsearch'] // 是否启用高级选项，若否下面改为默认选项
    let f_sname, f_stags, f_srdd, f_sp
    // TO-DO 此处advsearch到底为何值尚需确认
    if (advsearch !== '') {
        f_sname = queryDict['f_sname'] // 是否搜索name
        f_stags = queryDict['f_stags'] // 是否搜索tag
        f_srdd = queryDict['f_srdd'] // 评分
        f_sp = queryDict['f_sp'] // 是否搜索页数
    } else {
        f_sname = 'on'
        f_stags = 'on'
        f_srdd = null
        f_sp = null
    }
    if (f_search) {
        const [query_title, query_uploader, query_tags] = handle_f_search(f_search)
        if (query_tags.length && f_stags) {
            for (let i of query_tags) {
                const i2 = (i.indexOf(':') === -1) ? 'misc:' + i : i
                condition_clauses.push("EXISTS (SELECT tags.gid FROM tags WHERE downloads.gid=tags.gid AND tags.class=? AND tags.tag=?)")
                args.push(i2.slice(0, i2.indexOf(':')), /^"?(.*)\$"?/g.exec(i2.slice(i2.indexOf(':') + 1))[1])
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
        f_spf = queryDict['f_spf'] || '1'
        f_spt = querydict['f_spt']
        if (!f_spf.match(/^\d+$/g)) {
            f_spf = '1'
        }
        if (f_spt && !f_spt.match(/^\d+$/g)) {
            f_spt = null
        }
        if (f_spt) {
            condition_clauses.push(`(${f_spf} < downloads.length AND downloads.length < ${f_spt})`)
        } else{
            condition_clauses.push(`${f_spf} < downloads.length`)
        }
    }
    let where_clause;
    if (condition_clauses.length) {
        where_clause = ' WHERE ' + condition_clauses.join(' AND ')
    }
    return {
        clause: "SELECT DISTINCT downloads.gid||'_'||downloads.token FROM downloads" + where_clause,
        args: args
    }
}

function search_by_url(url) {
    querydict = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))
    clause, args = handle_querydict(querydict)
    foldernames = search(clause, args=args)
    return foldernames
}
    