const utility = require('./utility')


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

// 获取窗口尺寸
function getWindowSize() {
    const window = $objc("UIWindow").$keyWindow().jsValue();
    return window.size;
}

// 此函数用于获取调整过的tag尺寸
function adjustSize(size) {
    return $size(((size.width < 26) ? 30 : size.width + 4), size.height + 4)
}

/**
 * 此函数的作用是返回字体为$font(14)的标签定义
 * @param {!string} text 
 * @param {object} frame - $rect()
 * @param {?string} originalText - 以下为其他信息，保存于info，方便events调用
 * @param {?string} translatedText 
 * @param {?string} tagType 
 * @param {boolean} translated
 * @returns {object} label - label定义 
 * props.info还有一个choosen变量，用于规定label是否被选中，默认为false
 */
function renderTouchableLabel(text, frame, originalText, translatedText, tagType, translated) {
    const label = {
        type: "label",
        props: {
            text: text,
            font: $font(14),
            align: $align.center,
            bgcolor: $color("#bcffc3"),
            userInteractionEnabled: true,
            frame: frame,
            info: {
                orginalText: originalText,
                translatedText: translatedText,
                translated: translated,
                tagType: tagType,
                choosen: false
            }
        }
    }
    return label
}

/**
 * 此函数的作用为获取width不定的label放置在width确定的view容器中，返回view容器定义
 * 此处不负责上下左右的inset，即都是0。
 * 字体为$font(14)，label之间的inset为6。
 * @param {!number} width - 注意传入的width要已经减掉fullTagTableView左右其他部件的width
 * @param {!object} tags - bilingualTaglist['tagType']
 * @param {!string} tagType - 上一条中的tagType
 * @param {!boolean} translated 
 * @returns {!object} tagsView - tagsView的定义
 * 为了方便查找，此view的props.info加入class='tagsView'
 */

function renderTagsView(width, bilingualTags, tagType, translated = true) {
    const labels = []
    let x = 0;
    let y = 0;
    const inset = 6;
    for (let tag of bilingualTags) {
        const originalText = tag[0]
        const translatedText = tag[1]
        const text = (translated) ? translatedText : originalText
        const size = adjustSize(getTextWidth(text))
        let frame;
        if (x + size.width <= width) {
            frame = $rect(x, y, size.width, size.height)
            x = x + size.width + inset
        } else {
            frame = $rect(0, y + size.height + inset, size.width, size.height)
            x = 0 + size.width + inset
            y = y + size.height + inset
        }
        label = renderTouchableLabel(text, frame, originalText, translatedText, tagType, translated)
        labels.push(label)
    }
    TagsView = {
        type: "view",
        props: {
            bgcolor: $color("white"),
            frame: $rect(0, 0, width, y + labels[labels.length - 1].props.frame.height),
            info: {
                class: 'tagsView'
            }
        },
        views: labels
    }
    return TagsView
}

/**
 * 此函数返回tagTableView的定义
 * tagTypeLabel宽度90，tagsView占据其余全部的宽度，但两者之间有horizontalInset=1
 * 每个tagsView上下各有verticalInset=5，两个之间再有一个高度为1的lineView
 * @param {!number} width 此处的width应为fullTagTableView的width - 52
 * @param {!object} bilingualTaglist 
 * @param {!boolean} translated 
 * @param {number=1} horizontalInset 
 * @param {number=5} verticalInset 
 */

function renderTagTableView(width, bilingualTaglist, translated = true, horizontalInset = 1, verticalInset = 5) {
    const views = []
    let y = 0;
    let flagFristLine = true;
    for (let tagType in bilingualTaglist) {
        const bilingualTags = bilingualTaglist[tagType]
        if (!flagFristLine) {
            const line = {
                type: "view",
                props: {
                    bgcolor: $color("#c8c7cc"),
                    frame: $rect(0, y, width, 1)
                }
            }
            views.push(line)
            y += 1
        } else {
            flagFristLine = !flagFristLine
        }
        y += verticalInset
        const tagsView = renderTagsView(width - 90, bilingualTags, tagType, translated = translated)
        tagsView.props.frame.x = 90 + horizontalInset
        tagsView.props.frame.y = y
        views.push(tagsView)
        const label = {
            type: "label",
            props: {
                text: (translated) ? utility.translateTagType(tagType) : tagType,
                font: $font(14),
                align: $align.center,
                bgcolor: $color("white"),
                frame: $rect(0, y, 90, tagsView.props.frame.height)
            }
        }
        views.push(label)
        y = y + tagsView.props.frame.height + verticalInset
    }
    return {
        props: {
            id: "tagTableView",
            bgcolor: $color("white"),
            frame: $rect(1, 1, width, y)
        },
        views: views
    }
}

function renderFullTagTableView(width, info, translated = true) {
    const tagTableView = renderTagTableView(width - 2 - 50, utility.getBilingualTaglist(info.taglist, translated = translated))
    const height = tagTableView.props.frame.height + 2
    const views = [
        tagTableView,
        {
            type: "view",
            props: {
                bgcolor: $color("#c8c7cc"),
                frame: $rect(width - 51, 0, 1, height)
            }
        },
        {
            type: "button",
            props: {
                id: 'buttonTranslate',
                image: $image('assets/icons/translate_32_32.png').alwaysTemplate,
                tintColor: $color("#0079FF"),
                bgcolor: $color("clear"),
                frame: $rect(width - 50 + 8, height * 0.25 - 16, 32, 32)
            }
        },
        {
            type: "button",
            props: {
                id: 'buttonCopy',
                image: $image('assets/icons/ios7_copy_32_32.png').alwaysTemplate,
                tintColor: $color("#0079FF"),
                bgcolor: $color("clear"),
                frame: $rect(width - 50 + 8, height * 0.75 - 16, 32, 32)
            }
        }
    ]
    return {
        props: {
            id: "fullTagTableView",
            bgcolor: $color("white"),
            borderWidth: 1,
            borderColor: $color('#c8c7cc'),
            frame: $rect(0, 0, width, height)
        },
        views: views
    }
}

module.exports = {
    renderFullTagTableView: renderFullTagTableView
}