baseViewsGenerator = require("./baseViews")

function defineSliderStyleRatingView(adjustedRating) {
    const slider = {
        type: "slider",
        props: {
            id: "slider",
            min: 0.1,
            continuous: true,
            minColor: $color('#007aff'),
            value: adjustedRating / 5.0
        },
        layout: function(make, view) {
            make.size.equalTo($size(220, 34))
            make.centerX.equalTo(view.super).offset(-20)
            make.centerY.equalTo(view.super)
        },
        events: {
            changed: function(sender) {
                const rating = (parseInt(sender.value * 10) / 2)
                sender.super.get('label_rating').text = rating.toString()
                sender.super.info = {rating: rating.toString()}
            }
        }
    }
    const label = {
        type: "label",
        props: {
            id: "label_rating",
            text: adjustedRating,
            textColor: $color('black'),
            align: $align.center,
            font: $font(18),
            bgcolor: $color("clear")
        },
        layout: function(make, view) {
            make.size.equalTo($size(50, 34))
            make.left.equalTo($('slider').right)
            make.centerY.equalTo(view.super)
        }
    }
    const ratingView = {
        type: 'view',
        props: {
            id: 'ratingView',
            info: {rating: adjustedRating.toString()}
        },
        views: [slider, label],
        layout: function(make, view) {
            make.height.equalTo(34)
            make.left.right.inset(0)
            make.centerY.equalTo(view.super)
        }
    }
    return ratingView
}


function defineImageStyleRatingView(adjustedRating) {
    const bgview = {
        type: "view",
        props: {
            id: "bgview",
            bgcolor: $rgb(210, 210, 210)
        },
        layout: $layout.fill,
        views: [
            {
                type: "view",
                props: {
                    id: "colorView",
                    bgcolor: $color("#ffd217"),
                    frame: $rect(0, 0, adjustedRating * 50, 50)
                }
            }
        ]
    }
    const image = {
        type: "image",
        props: {
            id: "image_fivestars_mask",
            tintColor: $rgb(241, 241, 241),
            image: $image("assets/icons/fivestars_mask_500x100.png").alwaysTemplate,
            contentMode: 2
        },
        layout: $layout.fill
    }
    const ratingView = {
        type: 'view',
        props: {
            id: 'ratingView',
            userInteractionEnabled: true,
            info: {rating: adjustedRating.toString()}
        },
        views: [bgview, image],
        layout: function(make, view) {
            make.height.equalTo(50)
            make.width.equalTo(250)
            make.center.equalTo(view.super)
        },
        events: {
            touchesBegan: function(sender, location) {
                const width = Math.min(250, Math.max(location.x, 25))
                sender.get('colorView').frame = $rect(0, 0, width, 50)
            },
            touchesMoved: function(sender, location) {
                const width = Math.min(250, Math.max(location.x, 25))
                sender.get('colorView').frame = $rect(0, 0, width, 50)
            },
            touchesEnded: function(sender, location) {
                const width = Math.min(250, Math.max(location.x, 25))
                const rating = Math.round(width / 25) /2
                sender.get('colorView').frame = $rect(0, 0, rating * 50, 50)
                sender.info = {rating: rating.toString()}
            }
        }
    }
    return ratingView
}
//  slider: 0, stars_image: 1
async function ratingAlert(rating, style=1) {
    const adjustedRating = Math.max(1, Math.round(parseFloat(rating) * 2)) / 2
    return new Promise((resolve, reject) => {
        const titleView = baseViewsGenerator.defineTitleView($l10n('评分'))
        const buttonCancel = baseViewsGenerator.defineButtonCancel(sender => {
            sender.super.super.remove()
            reject('canceled')
        })
        const buttonConfirm = baseViewsGenerator.defineButtonConfirm(sender => {
            const result = sender.super.get("ratingView").info.rating
            sender.super.super.remove()
            resolve(result)
        })
        
        const maskView = baseViewsGenerator.maskView
        let ratingView;
        if (style === 0) {
            ratingView = defineSliderStyleRatingView(adjustedRating)
        } else if (style === 1) {
            ratingView = defineImageStyleRatingView(adjustedRating)
        }
        const content = {
            props: {
                radius: 10,
                bgcolor: $rgb(241, 241, 241)
            },
            views: [titleView, ratingView, buttonCancel, buttonConfirm],
            layout: function(make, view) {
                make.size.equalTo($size(270, 180))
                make.center.equalTo(view.super)
            }
        }
        const view = {
            props: {
                id: 'ratingAlert'
            },
            views: [maskView, content],
            layout: $layout.fill
        }
        $ui.window.add(view)
    })
}

module.exports = {
    ratingAlert: ratingAlert
}