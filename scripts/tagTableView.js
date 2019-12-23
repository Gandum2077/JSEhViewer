const utility = require('./utility')

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
 * @param {!number} width - 注意传入的width要已经减掉fullTagTableView左右其他部件的width，即width - 90 - 50 - 3
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
        const size = adjustSize(utility.getTextWidth(text))
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
    const tagsView = {
        type: "view",
        props: {
            bgcolor: $color("clear"),
            frame: $rect(0, 0, width, y + labels[labels.length - 1].props.frame.height),
            info: {
                class: 'tagsView',
                tagType: tagType
            }
        },
        views: labels
    }
    return tagsView
}

/**
 * 此函数返回tagTableView的定义
 * tagTypeLabel宽度90，tagsView占据其余全部的宽度，但两者之间有inset=1
 * 每个tagsView上下各有verticalMargin=5，两个之间再间隔inset=1
 * 此处不负责处理border问题，同时frame的x，y都将为0
 * @param {!number} width 此处的width应为fullTagTableView的width - 50 - 2（2的意思是2个inset）
 * @param {!object} bilingualTaglist 
 * @param {boolean=true} translated 
 * @param {number=1} inset 此变量用于tagTypeLabel、lowlevelView相互之间的间距
 * @param {number=5} verticalMargin 此变量用于给tagsView上下留白
 * @param {number=0} rightMargin 此变量用于给tagsView右边留白
 */

function renderTagTableView(width, bilingualTaglist, translated = true, inset = 1, verticalMargin = 5, rightMargin = 0) {
    const tagsViewsArray = [] // 先获得全部的tagsView，其中frame的x, y未调整
    for (let tagType in bilingualTaglist) {
        const bilingualTags = bilingualTaglist[tagType]
        const tagsView = renderTagsView(width - 90 - inset - rightMargin, bilingualTags, tagType, translated = translated)
        tagsViewsArray.push(tagsView)
    }
    // 然后去获得辅助tagsView的其他View，每个tagsView对应一个底层view和一个tagTypeLabel
    const views = []
    let cumulatedHeight = 0
    for (let idx in tagsViewsArray) {
        const tagsView = tagsViewsArray[idx]
        tagsView.props.frame.x = 90 + inset
        tagsView.props.frame.y = cumulatedHeight + verticalMargin
        const tagType = tagsView.props.info.tagType
        const tagTypeLabel = {
            type: "label",
            props: {
                text: (translated) ? utility.translateTagType(tagType) : tagType,
                font: $font(14),
                align: $align.center,
                bgcolor: $color("white"),
                frame: $rect(0, cumulatedHeight, 90, tagsView.props.frame.height + verticalMargin * 2)
            }
        }
        const lowlevelView = {
            type: "view",
            props: {
                bgcolor: $color("white"),
                frame: $rect(90 + inset, cumulatedHeight, width - 90 - inset, tagsView.props.frame.height + verticalMargin * 2)
            }
        }
        cumulatedHeight += 2 * verticalMargin + inset + tagsView.props.frame.height
        views.push(tagTypeLabel, lowlevelView, tagsView)
    }
    return {
        props: {
            id: "tagTableView",
            bgcolor: $color("#c8c7cc"),
            frame: $rect(0, 0, width, cumulatedHeight - inset)
        },
        views: views
    }
}

module.exports = {
    renderTagTableView: renderTagTableView
}