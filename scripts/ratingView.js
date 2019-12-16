baseViews = [
    {
        type: "label",
        props: {
            text: "打分",
            align: $align.center,
            font: $font(18),
            bgcolor: $color("clear"),
            frame: $rect(110, 23, 100, 32)
        }
    },
    {
        type: "label",
        props: {
            id: "label_rating",
            text: "5",
            align: $align.center,
            font: $font(18),
            bgcolor: $color("clear"),
            frame: $rect(266, 79, 46, 34)
        }
    },
    {
        type: "slider",
        props: {
            id: "slider1",
            text: "5",
            frame: $rect(12, 79, 253, 34)
        }
    },
    {
        type: "button",
        props: {
            id: "button_cancel",
            title: "cancel",
            align: $align.center,
            font: $font(18),
            bgcolor: $color("#f0f1f6"),
            frame: $rect(50, 140, 80, 32)
        }
    },
    {
        type: "button",
        props: {
            id: "button_confirm",
            title: "OK",
            align: $align.center,
            font: $font(18),
            bgcolor: $color("#f0f1f6"),
            frame: $rect(190, 140, 80, 32)
        }
    }

]

function renderRatingView() {
    return {
        type: 'view',
        props: {
            id: 'ratingView',
            size: $size(320, 200)
        },
        views: baseViews
    }
}

module.exports = {
    renderRatingView: renderRatingView
}