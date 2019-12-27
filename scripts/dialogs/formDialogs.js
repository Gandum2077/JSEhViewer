/**
 * 实现formDialogs
 * size锁定为(500, 556)
 * @param {object} sections 定义formDialogs的内容
 * @param {?string} title 标题，将显示在titleBar
 * sections为Array，里面的section定义:
 *      title: string,  // 标题行，可选。lines为1
 *      fields: array,   // 内容，必要
 *      footer: string  // 脚注行，可选。高度可变。
 * fields为Array，里面的field定义:
 *      通用:
 *          type: string  // 类型，必要。包括'string', 'number', 'integer', 'password', 
 *                           'boolean', 'slider', 'segmentedControl', 'datetime', 
 *                           'info', 'link', 'action'
 *          key: string   // 键，必要。
 *          title: string // 标题，可选。供人阅读的标题。
 *          value: *      // 缺省值，可选。在下面专项里有详解。
 *          titleColor: $color  // title颜色，可选。
 *          tintColor: $color  // icon颜色，可选。
 *          icon: $image  // 图标，可选。
 *          iconEdgeInsets: $insets // 图标边距，可选。icon的size是锁定为$size(89/2, 89/2)的，
 *                                     因此提供此参数缩小icon，默认$insets(12, 12, 12, 12)
 * 
 *      专项：  // 除了一律可选，不标注的即对应原控件的属性
 *      string, number, integer, password:
 *          value: string  // 对于number和integer会自动转换格式
 *          autocorrectionType: 0,1,2   // 自动改正
 *          autocapitalizationType: 0,1,2,3  // 自动首字母大写
 *          spellCheckingType: 0,1,2  // 拼写检查
 *          placeholder
 *          textColor
 *      boolean:
 *          value: boolean
 *          onColor
 *          thumbColor
 *      slider:
 *          value: number  // 即slider.value
 *          decimal: number  // 精度，默认1
 *          min
 *          max
 *          minColor
 *          maxColor
 *          thumbColor
 *      segmentedControl:
 *          value: number  // 即index，-1时为不选
 *          items
 *      datetime:
 *          value: Date object  // min和max也要求Date object
 *          min
 *          max
 *          mode
 *          interval
 *      info:
 *          value: string
 *      link:
 *          value: string  // url
 *      action:
 *          value: function // 点击后会执行的函数
 * 
 */

baseViewsGenerator = require("./baseViews")

// 计算特定字号的文字长度
// 此函数不应该用于处理超长文本
function getTextWidth(text, fontSize = 20, fontName = null) {
    return $text.sizeThatFits({
        text: text,
        width: 10000,
        font: (fontName) ? $font(fontName, fontSize) : $font(fontSize),
        align: $align.center,
        lineSpacing: 0
    })
}

function defineFieldView(field, frame = frame) {
    const type = field.type
    const key = field.key
    const title = field.title
    const value = field.value
    const titleColor = field.titleColor || $color('black')
    const tintColor = field.tintColor || $color('#007aff')
    const icon = field.icon
    const iconEdgeInsets = field.iconEdgeInsets || $insets(12, 12, 12, 12)
    let iconView;
    if (icon) {
        iconView = {
            type: "view",
            props: {
                id: 'icon'
            },
            views: [
                {
                    type: "image",
                    props: {
                        id: 'icon',
                        tintColor: tintColor,
                        image: icon.alwaysTemplate
                    },
                    layout: function(make, view) {
                        make.edges.insets(iconEdgeInsets)
                    }
                }
            ],
            layout: function(make, view) {
                make.size.equalTo($size(89/2, 89/2))
                make.left.inset(10)
            }
        }
    }
    const titleLabel = {
        type: "label",
        props: {
            id: 'title',
            text: title,
            textColor: titleColor
        },
        layout: function(make, view) {
            const icon = view.super.get('icon')
            make.height.equalTo(89 / 2)
            make.width.equalTo(getTextWidth(view.text))
            make.top.inset(0)
            if (icon) {
                make.left.equalTo(icon.right).inset(10)
            } else {
                make.left.inset(15)
            }
        }
    }
    let valueView;
    if (type === 'string') {
        const autocorrectionType = field.autocorrectionType || 0
        const autocapitalizationType = field.autocapitalizationType || 0
        const spellCheckingType = field.spellCheckingType || 0
        const placeholder = field.placeholder
        const textColor = field.textColor || $color('#337097')
        valueView = {
            type: 'input',
            props: {
                id: 'valueView',
                text: value,
                kbType: $kbType.default,
                align: $align.left,
                textColor: textColor,
                bgcolor: $color("white"),
                placeholder: placeholder,
                autocorrectionType: autocorrectionType,
                autocapitalizationType: autocapitalizationType,
                spellCheckingType: spellCheckingType
            },
            layout: function(make, view) {
                make.top.bottom.inset(0)
                make.left.equalTo($('title').right).inset(10)
                make.right.inset(15)
            },
            events: {
                changed: function(sender) {
                    sender.super.info = {key: sender.super.info.key, value: sender.text}
                },
                didEndEditing: function(sender) {
                    sender.super.info = {key: sender.super.info.key, value: sender.text}
                },
                returned: function(sender) {
                    sender.blur()
                }
            }
        }
    } else if (type === 'number') {
        const autocorrectionType = field.autocorrectionType || 0
        const autocapitalizationType = field.autocapitalizationType || 0
        const spellCheckingType = field.spellCheckingType || 0
        const placeholder = field.placeholder
        const textColor = field.textColor || $color('#337097')
        valueView = {
            type: 'input',
            props: {
                id: 'valueView',
                text: parseFloat(value).toString(),
                kbType: $kbType.number,
                align: $align.left,
                textColor: textColor,
                bgcolor: $color("white"),
                placeholder: placeholder,
                autocorrectionType: autocorrectionType,
                autocapitalizationType: autocapitalizationType,
                spellCheckingType: spellCheckingType
            },
            layout: function(make, view) {
                make.top.bottom.inset(0)
                make.left.equalTo($('title').right).inset(10)
                make.right.inset(15)
            },
            events: {
                changed: function(sender) {
                    const float = parseFloat(sender.text)
                    sender.super.info = {key: sender.super.info.key, value: float}
                },
                didEndEditing: function(sender) {
                    const float = parseFloat(sender.text)
                    sender.text = float.toString()
                    sender.super.info = {key: sender.super.info.key, value: float}
                },
                returned: function(sender) {
                    sender.blur()
                }
            }
        }
    } else if (type === 'integer') {
        const autocorrectionType = field.autocorrectionType || 0
        const autocapitalizationType = field.autocapitalizationType || 0
        const spellCheckingType = field.spellCheckingType || 0
        const placeholder = field.placeholder
        const textColor = field.textColor || $color('#337097')
        valueView = {
            type: 'input',
            props: {
                id: 'valueView',
                text: parseInt(value).toString(),
                kbType: $kbType.number,
                align: $align.left,
                textColor: textColor,
                bgcolor: $color("white"),
                placeholder: placeholder,
                autocorrectionType: autocorrectionType,
                autocapitalizationType: autocapitalizationType,
                spellCheckingType: spellCheckingType
            },
            layout: function(make, view) {
                make.top.bottom.inset(0)
                make.left.equalTo($('title').right).inset(10)
                make.right.inset(15)
            },
            events: {
                changed: function(sender) {
                    const integer = parseInt(sender.text)
                    sender.super.info = {key: sender.super.info.key, value: integer}
                },
                didEndEditing: function(sender) {
                    const integer = parseInt(sender.text)
                    sender.text = integer.toString()
                    sender.super.info = {key: sender.super.info.key, value: integer}
                },
                returned: function(sender) {
                    sender.blur()
                }
            }
        }
    } else if (type === 'password') {
        const autocorrectionType = field.autocorrectionType || 0
        const autocapitalizationType = field.autocapitalizationType || 0
        const spellCheckingType = field.spellCheckingType || 0
        const placeholder = field.placeholder
        const textColor = field.textColor || $color('#337097')
        valueView = {
            type: 'input',
            props: {
                id: 'valueView',
                text: value,
                kbType: $kbType.default,
                align: $align.left,
                secure: true,
                textColor: textColor,
                bgcolor: $color("white"),
                placeholder: placeholder,
                autocorrectionType: autocorrectionType,
                autocapitalizationType: autocapitalizationType,
                spellCheckingType: spellCheckingType
            },
            layout: function(make, view) {
                make.top.bottom.inset(0)
                make.left.equalTo($('title').right).inset(10)
                make.right.inset(15)
            },
            events: {
                changed: function(sender) {
                    sender.super.info = {key: sender.super.info.key, value: sender.text}
                },
                didEndEditing: function(sender) {
                    sender.super.info = {key: sender.super.info.key, value: sender.text}
                },
                returned: function(sender) {
                    sender.blur()
                }
            }
        }
    } else if (type === 'boolean') {
        const onColor = field.onColor || $color("#007aff")
        const thumbColor = field.thumbColor || $color("white")
        valueView = {
            type: 'switch',
            props: {
                id: 'valueView',
                on: value,
                onColor: onColor,
                thumbColor: thumbColor
            },
            layout: function(make, view) {
                make.size.equalTo($size(51, 31))
                make.centerY.equalTo(view.super)
                make.right.inset(15)
            },
            events: {
                changed: function(sender) {
                    sender.super.info = {key: sender.super.info.key, value: sender.on}
                }
            }
        }
    } else if (type === 'slider') {
        const decimal = field.decimal || 1
        const min = field.min || 0
        const max = field.max || 1
        const minColor = field.minColor || $color('#007aff')
        const maxColor = field.maxColor || $color('#e4e4e6')
        const thumbColor = field.thumbColor || $color('white')
        valueView = {
            type: 'view',
            props: {
                id: 'valueView'
            },
            views: [
                {
                    type: 'label',
                    props: {
                        id: 'sliderValue',
                        text: value.toFixed(decimal),
                        align: $align.right
                    },
                    layout: function(make, view) {
                        make.top.right.bottom.inset(0)
                        make.width.equalTo(50)
                    }
                },
                {
                    type: 'slider',
                    props: {
                        id: 'slider',
                        value: value,
                        max: max,
                        min: min,
                        minColor: minColor,
                        maxColor: maxColor,
                        thumbColor: thumbColor,
                        continuous: true
                    },
                    layout: function(make, view) {
                        make.top.left.bottom.inset(0)
                        make.width.equalTo(200)
                    },
                    events: {
                        changed: function(sender) {
                            const adjustedValue = sender.value.toFixed(decimal)
                            sender.super.get('sliderValue').text = adjustedValue
                            sender.super.super.info = {key: sender.super.super.info.key, value: adjustedValue}
                        }
                    }
                }
            ],
            layout: function(make, view) {
                make.top.bottom.inset(0)
                make.width.equalTo(250)
                make.right.inset(15)
            }
        }
    } else if (type === 'segmentedControl') {
        const items = field.items
        const index = value || -1
        valueView = {
            type: "tab",
            props: {
                id: 'valueView',
                items: items,
                index: index
            },
            layout: function(make, view) {
                make.right.inset(15)
                make.centerY.equalTo(view.super)
                make.size.equalTo($size(200, 40))
            },
            events: {
                changed: function(sender) {
                    sender.super.info = {key: sender.super.info.key, value: sender.index}
                }
            }
        }
    } else if (type === 'datetime') {
        const min = field.min
        const max = field.max
        const mode = field.mode || 0
        const interval = field.interval || 1
        valueView = {
            type: "button",
            props: {
                id: 'valueView',
                title: value.toISOString(),
                align: $align.right,
                type: 1
            },
            layout: function(make, view) {
                make.right.inset(15)
                make.centerY.equalTo(view.super)
                make.size.equalTo($size(200, 40))
            },
            events: {
                tapped: async function(sender) {
                    const result = await $picker.date({
                        date: value,
                        min: min,
                        max: max,
                        mode: mode,
                        interval: interval
                    })
                    const date = new Date(result)
                    sender.title = date.toISOString()
                    sender.super.info = {key: sender.super.info.key, value: date}
                }
            }
        }
    } else if (type === 'info') {
        valueView = {
            type: 'label',
            props: {
                id: 'valueView',
                text: value,
                textColor: $color('#balck'),
                align: $align.right
            },
            layout: function(make, view) {
                make.top.bottom.inset(0)
                make.left.equalTo($('title').right).inset(10)
                make.right.inset(15)
            }
        }
    } else if (type === 'link') {
        valueView = {
            type: "view",
            props: {
                id: 'valueView'
            },
            views: [
                {
                    type: "label",
                    props: {
                        id: 'valueView',
                        text: value,
                        textColor: $color('#007aff'),
                        align: $align.right
                    },
                    layout: $layout.fill,
                },
                {
                    type: "button",
                    props: {
                        type:1
                    },
                    layout: $layout.fill,
                    events: {
                        tapped: function(sender) {
                            console.info(2)
                        }
                    }
                }
            ],
            layout: function(make, view) {
                make.top.bottom.inset(0)
                make.left.equalTo($('title').right).inset(10)
                make.right.inset(15)
            }
        }
    } else if (type === 'action') {
        valueView = {
            type: "button",
            props: {
                id: 'valueView',
                title: title,
                titleColor: $color('#007aff'),
                bgcolor: $color('white'),
                align: $align.left,
                radius: 0
            },
            layout: function(make, view) {
                make.top.bottom.inset(0)
                make.left.equalTo($('title').left)
                make.right.inset(15)
            },
            events: {
                tapped: function(sender) {
                    value()
                }
            }
        }
    }
    const fieldView = {
        type: 'view',
        props: {
            bgcolor: $color('white'),
            info: {
                key: key,
                value: value
            },
            frame: frame
        },
        views: (iconView) ? [iconView, titleLabel, valueView] : [titleLabel, valueView]
    }
    return fieldView
}

function defineSectionView(section, frameX, frameY, width = 500) {
    let cumulativeHeight = 0
    const views = []
    const header = {
        type: "label",
        props: {
            text: section.title,
            textColor: $color('#6D6D72'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(15, 0, width, 29)
        }
    }
    cumulativeHeight += 29
    views.push(header)
    for (let idx in section.fields) {
        const field = section.fields[idx]
        if (parseInt(idx) === 0) {
            const line = {
                type: 'view',
                props: {
                    bgcolor: $color("#c6c6c8"),
                    frame: $rect(0, cumulativeHeight, width, 0.5)
                }
            }
            cumulativeHeight += 0.5
            views.push(line)
        }
        const fieldView = defineFieldView(field, frame = $rect(0, cumulativeHeight, width, 89 / 2))
        cumulativeHeight += 89 / 2
        views.push(fieldView)
        if (parseInt(idx) === section.fields.length - 1) {
            const line = {
                type: 'view',
                props: {
                    bgcolor: $color("#c6c6c8"),
                    frame: $rect(0, cumulativeHeight, width, 0.5)
                }
            }
            cumulativeHeight += 0.5
            views.push(line)
        } else {
            const line1 = {
                type: 'view',
                props: {
                    bgcolor: $color("white"),
                    frame: $rect(0, cumulativeHeight, 15, 0.5)
                }
            }
            const line2 = {
                type: 'view',
                props: {
                    bgcolor: $color("#c6c6c8"),
                    frame: $rect(15, cumulativeHeight, width - 15, 0.5)
                }
            }
            cumulativeHeight += 0.5
            views.push(line1)
            views.push(line2)
        }
    }
    const footer = {
        type: "label",
        props: {
            text: section.footer,
            textColor: $color('#6D6D72'),
            align: $align.left,
            font: $font(12),
            bgcolor: $color("clear"),
            frame: $rect(15, cumulativeHeight, width, 29)
        }
    }
    cumulativeHeight += 29
    views.push(footer)
    const sectionView = {
        type: 'view',
        props: {
            bgcolor: $color("clear"),
            frame: $rect(frameX, frameY, width, cumulativeHeight)
        },
        views: views
    }
    return sectionView
    
}

function defineScrollView(sections) {
    const sectionViews = []
    let frameX = 0
    let frameY = 20
    for (let section of sections) {
        const sectionView = defineSectionView(section, frameX, frameY, width = 500)
        frameY += sectionView.props.frame.height
        sectionViews.push(sectionView)
        frameY += 20
    }
    const scrollView = {
        type: "scroll",
        props: {
            contentSize: $size(0, frameY),
            bgcolor: $color("#f2f2f7")
        },
        views: sectionViews,
        layout: function(make, view) {
            make.left.right.bottom.inset(0)
            make.top.equalTo($("titleBar").bottom)
        }
    }
    return scrollView
}

async function formDialogs(sections, title='') {
    return new Promise((resolve, reject) => {
        const cancelEvent = function(sender) {
            reject('canceled')
            sender.super.super.super.remove()
        }
        const confirmEvent = function(sender) {
            const scroll = sender.super.super.super.get('scroll')
            const result = {}
            for (let sectionView of scroll.views) {
                const fieldViews = sectionView.views.filter(n => (n.info && n.info.key))
                fieldViews.map(n => {
                    result[n.info.key] = n.info.value
                    return
                })
            }
            resolve(result)
            sender.super.super.super.remove()
        }
        const titleBarView = baseViewsGenerator.defineTitleBarView(title, cancelEvent, confirmEvent)
        const scrollView = defineScrollView(sections)
        const maskView = baseViewsGenerator.maskView
        const formDialogsContent = {
            props: {
                radius: 10
            },
            views: [titleBarView, scrollView],
            layout: function(make, view) {
                make.size.equalTo($size(500, 556))
                make.center.equalTo(view.super)
            }
        }
        
        const formDialogs = {
            props: {
                id: 'formDialogs'
            },
            views: [maskView, formDialogsContent],
            layout: $layout.fill
        }
        $ui.window.add(formDialogs)
    })
}

module.exports = {
    formDialogs: formDialogs
}