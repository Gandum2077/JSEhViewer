baseViews = require('./baseViews')

function getDefaultConfig() {
    const defaultConfig = {
        sn: "on",
        st: "on",
        sf: "on"
    }
    return defaultConfig
}


function getStandardDefinitions() {
    const standardDefinitions = [
        {
            type: 'plainLabel',
            name: 'filterTitle',
            text: '搜索：',
            layout: (make, view) => {
                make.top.left.inset(0)
                make.width.equalTo(view.super).dividedBy(4)
                make.height.equalTo(24)
            }
        },
        {
            type: 'label',
            name: 'sn',
            text: '名称',
            layout: (make, view) => {
                make.top.inset(0)
                make.left.equalTo($("filterTitle").right)
                make.width.equalTo(view.super).dividedBy(4)
                make.height.equalTo(24)
            }
        },
        {
            type: 'label',
            name: 'st',
            text: '标签',
            layout: (make, view) => {
                make.top.inset(0)
                make.left.equalTo($("sn").right)
                make.width.equalTo(view.super).dividedBy(4)
                make.height.equalTo(24)
            }
        },
        {
            type: 'label',
            name: 'sf',
            text: '笔记',
            layout: (make, view) => {
                make.top.inset(0)
                make.left.equalTo($("st").right)
                make.width.equalTo(view.super).dividedBy(4)
                make.height.equalTo(24)
            }
        }
    ]
    return standardDefinitions
}


function getUpdatedConfig(config) {
    const defaultConfig = getDefaultConfig()
    if (config) {
        const updatedConfig = Object.assign(defaultConfig, config)
        return updatedConfig
    }
    return defaultConfig
}

function updateDefinitionsByConfig(config) {
    const definitions = getStandardDefinitions()
    definitions.map(n => {
        const value = config[n.name]
        if (value) {
            n.value = value
        }
    })
    return definitions
}

function defineOptionsFavorites(layout, config={}) {
    const updatedConfig = getUpdatedConfig(config)
    const definitions = updateDefinitionsByConfig(updatedConfig)
    const views = definitions.map(n => {
        if (n.type === 'label') {
            return baseViews.defineLabelWithCheckBox(n.name, n.text, n.layout, value=n.value)
        } else if (n.type === 'plainLabel') {
            return baseViews.definePlainLabel(n.name, n.text, n.layout)
        } else if (n.type === 'segmentedControl') {
            return baseViews.defineSegmentedControlForRating(n.name, n.layout, value=n.value)
        } else if (n.type === 'input') {
            return baseViews.defineInput(n.name, n.layout, value=n.value)
        }
    })
    const optionFavorites = {
        tpye: 'view',
        props: {
            id: "optionFavorites"
        },
        views: views,
        layout: layout
    }
    return optionFavorites
}

module.exports = {
    defineOptionsFavorites: defineOptionsFavorites
}