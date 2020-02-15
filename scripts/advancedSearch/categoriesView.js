const categoryInfos = [
  {
    name: "doujinshi",
    origin: "Doujinshi",
    translation: "同人志",
    color: "#9E2720",
    categoryIndex: 1
  },
  {
    name: "manga",
    origin: "Manga",
    translation: "漫画",
    color: "#DB6C24",
    categoryIndex: 2
  },
  {
    name: "artist cg",
    origin: "Artist CG",
    translation: "画师集",
    color: "#D38F1D",
    categoryIndex: 3
  },
  {
    name: "game cg",
    origin: "Game CG",
    translation: "游戏CG",
    color: "#617C63",
    categoryIndex: 4
  },
  {
    name: "western",
    origin: "Western",
    translation: "西方",
    color: "#AB9F60",
    categoryIndex: 9
  },
  {
    name: "non-h",
    origin: "Non-H",
    translation: "非H",
    color: "#5FA9CF",
    categoryIndex: 8
  },
  {
    name: "image set",
    origin: "Image Set",
    translation: "图集",
    color: "#325CA2",
    categoryIndex: 5
  },
  {
    name: "cosplay",
    origin: "Cosplay",
    translation: "Cosplay",
    color: "#6A32A2",
    categoryIndex: 6
  },
  {
    name: "asian porn",
    origin: "Asian Porn",
    translation: "亚洲",
    color: "#A23282",
    categoryIndex: 7
  },
  {
    name: "misc",
    origin: "Misc",
    translation: "其他",
    color: "#777777",
    categoryIndex: 0
  }
];

const template = {
  props: {
    bgcolor: $color("clear")
  },
  views: [
    {
      type: "label",
      props: {
        id: "label",
        font: $font("bold", 18),
        align: $align.center,
        textColor: $color("white")
      },
      layout: $layout.fill
    }
  ]
};

function getData() {
  return categoryInfos.map(n => {
    return {
      label: {
        text: n.translation,
        bgcolor: $color(n.color),
        categoryIndex: n.categoryIndex,
        selected: true,
        alpha: 1
      }
    };
  });
}

function defineCategoriesMatrix(layout) {
  const matrix = {
    type: "matrix",
    props: {
      id: "categoriesMatrix",
      bgcolor: $color("white"),
      scrollEnabled: false,
      columns: 5,
      itemHeight: 32,
      spacing: 6,
      template: template,
      data: getData(),
      footer: {
        type: "view",
        props: {
          height: 30
        },
        views: [
          {
            type: "button",
            props: {
              id: "selectReverse",
              title: "反选",
              font: $font(14)
            },
            layout: function(make, view) {
              make.size.equalTo($size(70, 24));
              make.top.inset(0);
              make.right.inset(6);
            },
            events: {
              tapped: function(sender) {
                const matrix = sender.super.super.super;
                const new_data = matrix.data.map(n => {
                  if (n.label.selected) {
                    return {
                      label: Object.assign(n.label, {
                        alpha: 0.5,
                        selected: false
                      })
                    };
                  } else {
                    return {
                      label: Object.assign(n.label, {
                        alpha: 1,
                        selected: true
                      })
                    };
                  }
                });
                matrix.data = new_data;
              }
            }
          },
          {
            type: "button",
            props: {
              id: "selectNone",
              title: "全不选",
              font: $font(14)
            },
            layout: function(make, view) {
              make.size.equalTo($size(70, 24));
              make.top.inset(0);
              make.right.equalTo($("selectReverse").left).inset(10);
            },
            events: {
              tapped: function(sender) {
                const matrix = sender.super.super.super;
                const new_data = matrix.data.map(n => {
                  return {
                    label: Object.assign(n.label, {
                      alpha: 0.5,
                      selected: false
                    })
                  };
                });
                matrix.data = new_data;
              }
            }
          },
          {
            type: "button",
            props: {
              id: "selectAll",
              title: "全选",
              font: $font(14)
            },
            layout: function(make, view) {
              make.size.equalTo($size(70, 24));
              make.top.inset(0);
              make.right.equalTo($("selectNone").left).inset(10);
            },
            events: {
              tapped: function(sender) {
                const matrix = sender.super.super.super;
                const new_data = matrix.data.map(n => {
                  return {
                    label: Object.assign(n.label, { alpha: 1, selected: true })
                  };
                });
                matrix.data = new_data;
              }
            }
          }
        ],
        layout: $layout.fill
      }
    },
    layout: layout,
    events: {
      didSelect: function(sender, indexPath, data) {
        let itemData;
        if (data.label.selected) {
          itemData = {
            label: Object.assign(data.label, { alpha: 0.5, selected: false })
          };
        } else {
          itemData = {
            label: Object.assign(data.label, { alpha: 1, selected: true })
          };
        }
        const new_data = sender.data.map(n => n);
        new_data[indexPath.item] = itemData;
        sender.data = new_data;
      }
    }
  };
  return matrix;
}

module.exports = {
  defineCategoriesMatrix
};
