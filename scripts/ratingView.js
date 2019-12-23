function renderRatingView(rating) {
    const adjustedRating = Math.round(parseFloat(rating) * 2)/2
    const baseViews = [
        {
            type: "label",
            props: {
                text: "打分",
                textColor: $color('black'),
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
                text: adjustedRating,
                textColor: $color('black'),
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
                continuous: true,
                minColor: $color('#0079ff'),
                value: adjustedRating / 5.0,
                frame: $rect(12, 79, 253, 34)
            },
            events: {
                changed: function(sender) {
                    const labelRating = sender.super.get("label_rating")
                    labelRating.text = (parseInt(sender.value * 10) / 2).toString()
                }
            }
        },
        {
            type: "button",
            props: {
                id: "button_cancel",
                title: "cancel",
                titleColor: $color('#0079ff'),
                align: $align.center,
                font: $font(18),
                bgcolor: $color("#f0f1f6"),
                frame: $rect(50, 140, 80, 32)
            },
            events: {
                tapped: function(sender) {
                    $('rootView').get('ratingView').remove()
                    $('rootView').get('maskView').remove()
                }
            }
        },
        {
            type: "button",
            props: {
                id: "button_confirm",
                titleColor: $color('#0079ff'),
                title: "OK",
                align: $align.center,
                font: $font(18),
                bgcolor: $color("#f0f1f6"),
                frame: $rect(190, 140, 80, 32)
            }
        }
    ]
    const ratingView = {
        type: 'view',
        props: {
            id: 'ratingView',
            bgcolor: $color('white'),
            radius: 5,
            alpha: 1
        },
        views: baseViews,
        layout: function(make, view) {
            make.size.equalTo($size(320, 200))
            make.center.equalTo(view.super)
        }
    }
    return ratingView
}

module.exports = {
    renderRatingView: renderRatingView
}