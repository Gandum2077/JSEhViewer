baseViewsGenerator = require("./baseViews")

async function ratingAlert(rating) {
    const adjustedRating = Math.round(parseFloat(rating) * 2)/2
    return new Promise((resolve, reject) => {
        const titleView = baseViewsGenerator.defineTitleView(title)
        const buttonCancel = baseViewsGenerator.defineButtonCancel(sender => {
            reject('canceled')
            sender.super.super.remove()
        })
        const buttonConfirm = baseViewsGenerator.defineButtonConfirm(sender => {
            resolve(sender.super.get("label_rating").text)
            sender.super.super.remove()
        })
        const maskView = baseViewsGenerator.maskView
        
        const slider = {
            type: "slider",
            props: {
                id: "slider",
                min: 0.1,
                continuous: true,
                minColor: $color('#0079ff'),
                value: adjustedRating / 5.0
            },
            layout: function(make, view) {
                make.size.equalTo($size(220, 34))
                make.centerX.equalTo(view.super).offset(-20)
                make.centerY.equalTo(view.super)
            },
            events: {
                changed: function(sender) {
                    sender.super.get('label_rating').text = (parseInt(sender.value * 10) / 2).toString()
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
        
        const content = {
            props: {
                radius: 10,
                bgcolor: $rgb(241, 241, 241)
            },
            views: [titleView, slider, label, buttonCancel, buttonConfirm],
            layout: function(make, view) {
                make.size.equalTo($size(270, 150))
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