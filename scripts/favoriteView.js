const favcatNameColorArray = [
    {
        name: 'Temp',
        color: '#f00'
    },
    {
        name: '关注的作者',
        color: '#0f0'
    },
    {
        name: '稍后阅读',
        color: '#00f'
    },
    {
        name: 'Favorites 3',
        color: '#000'
    },
    {
        name: 'Favorites 4',
        color: '#453446'
    },
    {
        name: 'Favorites 5',
        color: '#0ff'
    },
    {
        name: 'Favorites 6',
        color: '#f0f'
    },
    {
        name: 'Favorites 7',
        color: '#ff0'
    },
    {
        name: '图集',
        color: '#142084'
    },
    {
        name: 'test10',
        color: '#0ff'
    },
    {
        name: 'test11',
        color: '#f0f'
    }
];

function getData(favcatNameColorArray) {
    const data = []
    for (let i of favcatNameColorArray) {
        const item = {
            backgroundView: {
                bgcolor: $color("clear")
            },
            label: {
                text: i.name
            },
            canvas: {
                tintColor: $color(i.color),
            }
        }
        data.push(item)
    }
    return data
}

function getDataWithSelection(data, index) {
    for (let i in data) {
      if (parseInt(i) === index) {
        data[i].backgroundView.bgcolor = $color("#ccc")
      } else {
        data[i].backgroundView.bgcolor = $color("clear")
      }
    }
    return data
}

const favcatList = {
    type: "list",
    props: {
        rowHeight: 32,
        selectable: true,
        scrollEnabled: false,
        separatorColor: $color("white"),
        bgcolor: $color("white"),
        template: {
            props: {
                bgcolor: $color("clear")
            },
            views: [
                {
                    type: "view",
                    props: {
                        id: "backgroundView"
                    },
                    layout: $layout.fill
                },
                {
                    type: "canvas",
                    props: {
                        id: "canvas",
                        bgcolor: $color("clear")
                    },
                    layout: (make, view) => {
                        make.size.equalTo($size(32, 32));
                        make.left.inset(15);
                    },
                    events: {
                        draw: function(view, ctx) {
                            var centerX = view.frame.width * 0.5;
                            var centerY = view.frame.height * 0.5;
                            var radius = (40 / 50) * 16;
                            ctx.fillColor = view.tintColor;
                            ctx.moveToPoint(centerX, centerY - radius);
                            for (var i = 1; i < 4; ++i) {
                                var x = radius * Math.sin(i * Math.PI * 0.5);
                                var y = radius * Math.cos(i * Math.PI * 0.5);
                                ctx.addLineToPoint(x + centerX, centerY - y);
                            }
                            ctx.fillPath();
                        }
                    }
                },
                {
                    type: "label",
                    props: {
                        id: "label",
                        bgcolor: $color("clear"),
                        textColor: $color("black"),
                        align: $align.center,
                        font: $font(18)
                    },
                    layout: (make, view) => {
                        make.left.equalTo($("canvas").right).inset(15);
                        make.centerY.equalTo(view.super);
                    }
                }
            ]
        },
        data: getData(favcatNameColorArray)
    },
    layout: (make, view) => {
        make.left.inset(28);
        make.top.inset(59);
        make.width.equalTo(200);
        make.height.equalTo(32 * view.data.length);
    },
    events: {
        didSelect: function(sender, indexPath, data) {
            sender.data = getDataWithSelection(sender.data, indexPath.item)
            //sender.data = data2;
        }
    }
};

baseViews = [
    {
        type: "label",
        props: {
            id: "label_name",
            text: "收藏",
            align: $align.center,
            font: $font(18),
            textColor: $color("black"),
            bgcolor: $color("clear"),
            frame: $rect(182, 6, 150, 32)
        }
    },
    {
        type: "label",
        props: {
            id: "label_favnote",
            text: "Favorite Note",
            align: $align.center,
            font: $font(18),
            textColor: $color("black"),
            bgcolor: $color("white"),
            frame: $rect(236, 59, 285, 32)
        }
    },
    {
        type: "label",
        props: {
            id: "label_matters",
            text: "此处最多只能写200个字节（utf-8编码后的长度，英文1字节，汉字一般3字节）。中间换行无效。",
            align: $align.left,
            font: $font(12),
            lines: 2,
            textColor: $color("black"),
            bgcolor: $color("clear"),
            frame: $rect(236, 380, 285, 32)
        }
    },
    {
        type: "button",
        props: {
            id: "button_cancel",
            title: "cancel",
            align: $align.center,
            font: $font(18),
            titleColor: $color("#0079ff"),
            bgcolor: $color("white"),
            radius: 10,
            frame: $rect(148, 468, 80, 32)
        }
    },
    {
        type: "button",
        props: {
            id: "button_confirm",
            title: "OK",
            align: $align.center,
            font: $font(18),
            titleColor: $color("#0079ff"),
            bgcolor: $color("white"),
            radius: 10,
            frame: $rect(336, 468, 80, 32)
        }
    },
    {
        type: "text",
        props: {
            id: "text_favnote",
            align: $align.left,
            font: $font(12),
            borderWidth: 1,
            borderColor: $color("black"),
            textColor: $color("black"),
            bgcolor: $color("white"),
            frame: $rect(236, 92, 285, 287)
        }
    }

]

const favoriteView = {
    type: "view",
    props: {
        size: $size(540, 540),
        bgcolor: $color("#efeff4"),
        radius: 10
    },
    views: [...baseViews, favcatList],
    layout: (make, view) => {
        make.center.equalTo(view.super);
        make.size.equalTo(view.size);
    }
};

const maskView = {
    type: "view",
    props: {
        id: "maskView"
    },
    views: [favoriteView]
}

module.exports = {
    renderFavoriteView: renderFavoriteView
}