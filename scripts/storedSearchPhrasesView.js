baseViews = [
    {
        type: "button",
        props: {
            id: "button_edit",
            icon: $icon("002", $color("#0079ff"), $size(20, 20)),
            title: "编辑",
            titleColor: $color("#0079ff"),
            bgcolor: $color("#f0f1f6"),
            radius: 5,
            frame: $rect(180, 16, 80, 32)
        }
    },
    {
        type: "button",
        props: {
            id: "button_add",
            icon: $icon("031", $color("#0079ff"), $size(20, 20)),
            title: "添加",
            titleColor: $color("#0079ff"),
            bgcolor: $color("#f0f1f6"),
            radius: 5,
            frame: $rect(60, 16, 80, 32)
        }
    }
]

function renderStoredSearchPhrasesView() {
    return {
        type: 'view',
        props: {
            id: 'storedSearchPhrasesView',
            size: $size(320, 480)
        },
        views: baseViews
    }
}

module.exports = {
    renderStoredSearchPhrasesView: renderStoredSearchPhrasesView
}