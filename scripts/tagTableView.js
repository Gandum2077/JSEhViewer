const utility = require('./utility')

// 此函数用于获取调整过的tag尺寸
function adjustSize(size) {
    return $size(((size.width < 26) ? 30 : Math.ceil(size.width + 4)), Math.ceil(size.height + 4))
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
 * props.info还有一个selected变量，用于规定label是否被选中，默认为false
 */
function defineTouchableLabel(text, frame, originalText, translatedText, tagType, translated) {
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
                originalText: originalText,
                translatedText: translatedText,
                translated: translated,
                tagType: tagType,
                selected: false
            }
        },
        events: {
            tapped: function(sender) {
                if (!sender.info.selected) {
                    const data = Object.assign({}, sender.info)
                    data.selected = true
                    sender.bgcolor = $color("gray")
                    sender.info = data
                } else {
                    const data = Object.assign({}, sender.info)
                    data.selected = false
                    sender.bgcolor = $color("#bcffc3")
                    sender.info = data
                }
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

function defineTagsView(width, bilingualTags, tagType, translated = true) {
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
        label = defineTouchableLabel(text, frame, originalText, translatedText, tagType, translated)
        labels.push(label)
    }
    const tagsView = {
        type: "view",
        props: {
            id: "tagsView",
            bgcolor: $color("clear"),
            size: $size(width, y + labels[labels.length - 1].props.frame.height),
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
 * tagTypeLabel宽度90，tagsView占据其余全部的宽度
 * 每个tagsView上下各有verticalMargin=5，两个之间再间隔inset=1
 * 此处不负责处理border问题，同时frame的x，y都将为0
 * @param {!number} idealWidth 宽度采用自动布局，但是对于tagsView，目前无法做到自动布局，因此提出idealWidth的概念，意为最常用的宽度，将用于tagsView的生成
 * @param {!object} bilingualTaglist 
 * @param {boolean=true} translated 
 * @param {number=1} inset 此变量用于tagTypeLabel、lowlevelView相互之间的间距
 * @param {number=5} verticalMargin 此变量用于给tagsView上下留白
 * @param {number=0} rightMargin 此变量用于给tagsView右边留白
 */

function defineTagTableView(idealWidth, bilingualTaglist, translated = true, verticalMargin = 5) {
    const tagsViewsArray = [] // 先获得全部的tagsView，其中frame的x, y未调整
    for (let tagType in bilingualTaglist) {
        const bilingualTags = bilingualTaglist[tagType]
        const tagsView = defineTagsView(idealWidth - 90 - 2 * verticalMargin, bilingualTags, tagType, translated = translated)
        tagsViewsArray.push(tagsView)
    }
    // 然后去获得辅助tagsView的其他View，每个tagsView对应一个底层view和一个tagTypeLabel
    const views = []
    let cumulatedHeight = 0
    for (let idx in tagsViewsArray) {
        const tagsView = tagsViewsArray[idx]
        tagsView.props.frame = $rect(90 + 5, cumulatedHeight + verticalMargin, tagsView.props.size.width, tagsView.props.size.height)
        const tagType = tagsView.props.info.tagType
        const tagTypeLabel = {
            type: "label",
            props: {
                text: (translated) ? utility.translateTagType(tagType) : tagType,
                font: $font(14),
                align: $align.center,
                borderWidth: 0.5,
                borderColor: $color("#c6c6c8"),
                bgcolor: $color("white"),
                frame: $rect(0, cumulatedHeight, 90, tagsView.props.frame.height + verticalMargin * 2)
            }
        }
        const lowlevelView = {
            type: "view",
            props: {
                bgcolor: $color("clear"),
                borderWidth: 0.5,
                borderColor: $color("#c6c6c8"),
                info: {cumulatedHeight: cumulatedHeight, height: tagsView.props.frame.height + verticalMargin * 2}
            },
            layout: function(make, view) {
                make.left.inset(90)
                make.width.equalTo(view.super.width).offset(-90 + 0.5)
                make.top.inset(view.info.cumulatedHeight)
                make.height.equalTo(view.info.height)
            }
        }
        cumulatedHeight += 2 * verticalMargin + tagsView.props.frame.height
        views.push(tagTypeLabel, lowlevelView, tagsView)
    }
    return {
        props: {
            id: "tagTableView",
            bgcolor: $color("clear"),
            info: {height: cumulatedHeight}
        },
        views: views,
        layout: function(make, view) {
            make.left.top.inset(0)
            make.width.equalTo(view.super).priority(999)
            make.width.greaterThanOrEqualTo(idealWidth)
            make.height.equalTo(cumulatedHeight)
        }
    }
}

module.exports = {
    renderTagTableView: defineTagTableView
}