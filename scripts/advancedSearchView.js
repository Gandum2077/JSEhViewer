const glv = require('./globalVariables')
const optionsHome = require('./advancedSearch/optionsHome')
const optionsFavorites = require('./advancedSearch/optionsFavorites')
const optionsDownloads = require('./advancedSearch/optionsDownloads')
const categoriesView = require('./advancedSearch/categoriesView')
const favoriteCategoriesView = require('./advancedSearch/favoriteCategoriesView')


function defineAdvancedSearchOptionSwitchView() {
    const button = {
        type: "button",
        props: {
            id: "advancedSearchOptionSwitch",
            title: "高级搜索",
            symbol: "arrowtriangle.down.fill",
            titleColor: $color("#6e6eff"),
            tintColor: $color("#6e6eff"),
            bgcolor: $color("clear"),
            info: {'advsearch': '1'}
        },
        layout: function(make, view) {
            make.left.inset(50)
            make.top.equalTo($("categoriesMatrix").bottom).inset(-20)
            make.size.equalTo($size(100, 32))
        },
        events: {
            tapped: function(sender) {
                if (sender.info.advsearch === '1') {
                    sender.prev.hidden = true
                    sender.symbol = "arrowtriangle.right.fill",
                    sender.info = {'advsearch': ''}
                } else {
                    sender.prev.hidden = false
                    sender.symbol = "arrowtriangle.down.fill",
                    sender.info = {'advsearch': '1'}
                }
            }
        }
    }
    return button
}

function defineASOHomeView() {
    const layoutForCategories = (make, view) => {
        make.centerX.equalTo(view.super)
        make.top.inset(0)
        make.size.equalTo($size(574, 112))
    }
    const layoutForOptions = (make, view) => {
        make.centerX.equalTo(view.super)
        make.top.equalTo($("categoriesMatrix").bottom).inset(12)
        make.size.equalTo($size(400, 204))
    }
    const categoriesMatrix = categoriesView.defineCategoriesMatrix(layoutForCategories)
    const options = optionsHome.defineOptionsHome(layoutForOptions)
    const ASOSwitch = defineAdvancedSearchOptionSwitchView()

    const ASOHomeView = {
        type: "view",
        props: {
            id: "ASOHomeView",
        },
        views: [categoriesMatrix, options, ASOSwitch],
        layout: function(make, view) {
            make.top.inset(3)
            make.top.left.right.inset(0)
            make.height.equalTo(335)
        }
    }
    return ASOHomeView
}

function defineASOFavoritesView(rawData) {
    const layoutForFavcats = (make, view) => {
        make.size.equalTo($size(522, 202))
        make.centerX.equalTo(view.super)
        make.top.inset(0)
    }
    const layoutForOptions = (make, view) => {
        make.centerX.equalTo(view.super)
        make.top.equalTo($("favoriteCategoriesMatrix").bottom).inset(12)
        make.size.equalTo($size(400, 24))
    }
    const favoriteCategoriesMatrix = favoriteCategoriesView.defineFavoriteCategoriesMatrix(layoutForFavcats, rawData)
    const options = optionsFavorites.defineOptionsFavorites(layoutForOptions)
    
    const ASOFavoritesView = {
        type: "view",
        props: {
            id: "ASOFavoritesView",
        },
        views: [favoriteCategoriesMatrix, options],
        layout: function(make, view) {
            make.top.inset(3)
            make.top.left.right.inset(0)
            make.height.equalTo(335)
        }
    }
    return ASOFavoritesView
}

function defineASODownloadsView() {
    const layoutForCategories = (make, view) => {
        make.centerX.equalTo(view.super)
        make.top.inset(0)
        make.size.equalTo($size(574, 112))
    }
    const layoutForOptions = (make, view) => {
        make.centerX.equalTo(view.super)
        make.top.equalTo($("categoriesMatrix").bottom).inset(12)
        make.size.equalTo($size(400, 84))
    }
    const categoriesMatrix = categoriesView.defineCategoriesMatrix(layoutForCategories)
    const options = optionsDownloads.defineOptionsDownloads(layoutForOptions)
    const ASOSwitch = defineAdvancedSearchOptionSwitchView()

    const ASODownloadsView = {
        type: "view",
        props: {
            id: "ASODownloadsView",
        },
        views: [categoriesMatrix, options, ASOSwitch],
        layout: function(make, view) {
            make.top.inset(3)
            make.top.left.right.inset(0)
            make.height.equalTo(335)
        }
    }
    return ASODownloadsView
}

function defineAdvancedSearchView() {
    const advancedSearchView = {
        type: 'view',
        props: {
            id: 'advancedSearchView',
            clipsToBounds: true
        },
        views: [
            {
                type: "list",
                props: {
                    id: 'list',
                    data: glv.config['search_phrases']
                },
                layout: (make, view) => {
                    make.left.right.top.inset(0)
                    make.height.equalTo(176)
                },
                events: {
                    didSelect: function(sender, indexPath, data) {
                        $("rootView").get("listView").get("textfield_search").text = data
                    }
                }
            },
            {
                type: "tab",
                props: {
                    id: 'optionsSegmentedControl',
                    index: -1,
                    items: ['Home', 'Watched', 'Favorites', 'Downloads'],
                    bgcolor: $color("white")
                },
                layout: (make, view) => {
                    make.left.right.inset(0)
                    make.top.equalTo($("list").bottom)
                    make.height.equalTo(30)
                },
                events: {
                    changed: function(sender) {
                        sender.super.updateLayout((make, view) => {
                            make.height.equalTo(176 + 30 + 335)
                        })
                        const advancedSearchOptionsLocationView = sender.super.get('advancedSearchOptionsLocationView')
                        if (advancedSearchOptionsLocationView.views.length) {
                            advancedSearchOptionsLocationView.views[0].remove()
                        }
                        if (sender.index === 0 || sender.index === 1) {
                            advancedSearchOptionsLocationView.add(defineASOHomeView())
                        } else if (sender.index === 2) {
                            advancedSearchOptionsLocationView.add(defineASOFavoritesView(glv.config['favcat_nums_titles']))
                        } else if (sender.index === 3) {
                            advancedSearchOptionsLocationView.add(defineASODownloadsView())
                        }
                    }
                }
            },
            {
                type: "view",
                props: {
                    id: 'advancedSearchOptionsLocationView',
                    clipsToBounds: true,
                    bgcolor: $color("white")
                },
                layout: (make, view) => {
                    make.left.right.inset(0)
                    make.top.equalTo($("optionsSegmentedControl").bottom).inset(1)
                    make.height.equalTo(335)
                }
            },
        ],
        layout: function(make, view) {
            make.height.equalTo(176 + 30)
            make.left.right.equalTo($("textfield_search"))
            make.top.equalTo($("textfield_search").bottom)
        }
    }
    return advancedSearchView
}

 module.exports = {
    defineAdvancedSearchView: defineAdvancedSearchView
 }