function getColorFromFavcat(name) {
  const d = {
    favcat0: "#000",
    favcat1: "#f00",
    favcat2: "#fa0",
    favcat3: "#dd0",
    favcat4: "#080",
    favcat5: "#9f4",
    favcat6: "#4bf",
    favcat7: "#00f",
    favcat8: "#508",
    favcat9: "#e8e"
  };
  return d[name];
}

const template = {
  props: {
    bgcolor: $color("clear")
  },
  views: [
    {
      type: "view",
      props: {
        id: "background"
      },
      layout: $layout.fill
    },
    {
      type: "label",
      props: {
        id: "number",
        font: $font(16),
        align: $align.right,
        textColor: $color("black")
      },
      layout: function(make, view) {
        make.top.bottom.inset(3);
        make.left.inset(3);
        make.width.equalTo(50);
      }
    },
    {
      type: "image",
      props: {
        id: "image",
        symbol: "suit.diamond.fill",
        contentMode: 1
      },
      layout: function(make, view) {
        make.top.bottom.inset(3);
        make.left.equalTo($("number").right).inset(10);
        make.width.equalTo(24);
      }
    },
    {
      type: "label",
      props: {
        id: "name",
        font: $font(16),
        align: $align.left,
        textColor: $color("black")
      },
      layout: function(make, view) {
        make.top.bottom.inset(3);
        make.left.equalTo($("image").right).inset(10);
        make.right.inset(3);
      }
    }
  ],
  layout: $layout.fill
};

function getData(rawData) {
  return rawData.map(n => {
    return {
      background: {
        borderWidth: 0
      },
      number: {
        text: n[1]
      },
      image: {
        tintColor: $color(getColorFromFavcat(n[0]))
      },
      name: {
        text: n[2],
        favcat: n[0]
      }
    };
  });
}

function defineFavoriteCategoriesMatrix(layout, rawData) {
  const matrix = {
    type: "matrix",
    props: {
      id: "favoriteCategoriesMatrix",
      bgcolor: $color("white"),
      scrollEnabled: false,
      itemSize: $size(230, 38),
      spacing: 2,
      template: template,
      data: getData(rawData)
    },
    layout: layout,
    events: {
      didSelect: function(sender, indexPath, data) {
        const new_data = sender.data.map((n, i) => {
          if (indexPath.item === i && data.background.borderWidth === 0) {
            return Object.assign(n, { background: { borderWidth: 3 } });
          } else {
            return Object.assign(n, { background: { borderWidth: 0 } });
          }
        });
        sender.data = new_data;
      }
    }
  };
  return matrix;
}

module.exports = {
  defineFavoriteCategoriesMatrix
};
