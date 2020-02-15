const maskView = {
  props: {
    bgcolor: $rgba(0, 0, 0, 0.2)
  },
  layout: $layout.fill
};

function defineTitleBarView(title, cancelEvent, confirmEvent) {
  const titleBarView = {
    type: "view",
    props: {
      id: "titleBar",
      bgcolor: $color("white")
    },
    views: [
      {
        type: "button",
        props: {
          id: "buttonCancel",
          radius: 0,
          titleColor: $color("#007aff"),
          bgcolor: $color("clear")
        },
        views: [
          {
            type: "image",
            props: {
              symbol: "xmark",
              tintColor: $color("#007aff")
            },
            layout: function(make, view) {
              make.edges.insets($insets(5, 5, 5, 5));
            }
          }
        ],
        layout: function(make, view) {
          make.centerY.equalTo(view.super).offset(-0.25);
          make.size.equalTo($size(32, 32));
          make.left.inset(15);
        },
        events: {
          tapped: cancelEvent
        }
      },
      {
        type: "label",
        props: {
          text: title,
          font: $font("bold", 17),
          align: $align.center
        },
        layout: function(make, view) {
          make.size.equalTo($size(300, 32));
          make.centerY.equalTo(view.super).offset(-0.25);
          make.centerX.equalTo(view.super);
        }
      },
      {
        type: "button",
        props: {
          id: "buttonConfirm",
          title: "Done",
          font: $font(17),
          radius: 0,
          titleColor: $color("#007aff"),
          bgcolor: $color("clear")
        },
        layout: function(make, view) {
          make.centerY.equalTo(view.super).offset(-0.25);
          make.size.equalTo($size(50, 32));
          make.right.inset(15);
        },
        events: {
          tapped: confirmEvent
        }
      },
      {
        type: "type",
        props: {
          bgcolor: $color("#a9a9ad")
        },
        layout: function(make, view) {
          make.left.right.bottom.inset(0);
          make.height.equalTo(0.5);
        }
      }
    ],
    layout: function(make, view) {
      make.top.left.right.inset(0);
      make.height.equalTo(56.5);
    }
  };
  return titleBarView;
}

function defineTitleView(title) {
  const titleView = {
    type: "label",
    props: {
      id: "title",
      text: title,
      align: $align.center,
      font: $font("bold", 17),
      bgcolor: $color("clear")
    },
    layout: function(make, view) {
      make.top.left.inset(0);
      make.size.equalTo($size(270, 60));
    }
  };
  return titleView;
}

function defineButtonCancel(tappedEvent) {
  const buttonCancel = {
    type: "button",
    props: {
      id: "buttonCancel",
      title: "Cancel",
      type: 1,
      titleColor: $color("#007aff"),
      borderWidth: 1,
      borderColor: $color("#b1b1b1")
    },
    layout: function(make, view) {
      make.left.bottom.inset(-1);
      make.size.equalTo($size(136.5, 45));
    },
    events: {
      tapped: tappedEvent
    }
  };
  return buttonCancel;
}
function defineButtonConfirm(tappedEvent) {
  const buttonConfirm = {
    type: "button",
    props: {
      id: "buttonConfirm",
      title: "OK",
      type: 1,
      titleColor: $color("#007aff"),
      borderWidth: 1,
      borderColor: $color("#b1b1b1")
    },
    layout: function(make, view) {
      make.right.bottom.inset(-1);
      make.size.equalTo($size(136.5, 45));
    },
    events: {
      tapped: tappedEvent
    }
  };
  return buttonConfirm;
}

module.exports = {
  maskView,
  defineTitleBarView,
  defineTitleView,
  defineButtonCancel,
  defineButtonConfirm
};
