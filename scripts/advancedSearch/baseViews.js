function defineCheckBox({ value = "on", layout = null }) {
  if (!layout) {
    layout = (make, view) => {
      make.size.equalTo($size(24, 24));
      make.left.inset(0);
      make.centerY.equalTo(view.super);
    };
  }
  const checkBox = {
    type: "button",
    props: {
      id: "button",
      radius: 5,
      borderWidth: 2,
      borderColor: $color("black"),
      bgcolor: value ? $color("#ff48c2") : $color("white"),
      info: { selected: value ? true : false }
    },
    views: [
      {
        type: "image",
        props: {
          symbol: "checkmark",
          tintColor: $color("white"),
          bgcolor: $color("clear")
        },
        layout: $layout.fill
      }
    ],
    layout: layout,
    events: {
      tapped: function(sender) {
        if (sender.info.selected) {
          sender.info = { selected: false };
          sender.bgcolor = $color("white");
          const data = Object.assign({}, sender.super.super.info);
          data[sender.super.id] = "";
          sender.super.super.info = data;
        } else {
          sender.info = { selected: true };
          sender.bgcolor = $color("#ff48c2");
          const data = Object.assign({}, sender.super.super.info);
          data[sender.super.id] = "on";
          sender.super.super.info = data;
        }
      }
    }
  };
  return checkBox;
}

function defineLabelWithCheckBox({ name, text, layout, value = "" }) {
  const checkBox = defineCheckBox({ value });
  const label = {
    type: "label",
    props: {
      text: text,
      font: $font(16)
    },
    layout: function(make, view) {
      make.left.equalTo($("button").right).inset(6);
      make.top.bottom.right.inset(0);
    }
  };
  const labelWithCheckBox = {
    type: "view",
    props: {
      id: name
    },
    views: [checkBox, label],
    layout: layout
  };
  return labelWithCheckBox;
}

function defineSegmentedControlForRating({
  name,
  layout,
  value = "2",
  items = ["2", "3", "4", "5"]
}) {
  const segmentedControl = {
    type: "tab",
    props: {
      id: name,
      items: items,
      index: items.indexOf(value),
      radius: 0,
      bgcolor: $color("#ffd8f2")
    },
    layout: layout,
    events: {
      changed: function(sender) {
        const data = Object.assign({}, sender.super.info);
        data[sender.id] = sender.items[sender.index];
        sender.super.info = data;
      }
    }
  };
  return segmentedControl;
}

function defineInput({ name, layout, value = "" }) {
  const input = {
    type: "input",
    props: {
      id: name,
      text: value,
      type: $kbType.number,
      align: $align.left,
      bgcolor: $color("white"),
      borderWidth: 1,
      borderColor: $color("#c6c6c8"),
      textColor: $color("black")
    },
    layout: layout,
    events: {
      changed: function(sender) {
        const data = Object.assign({}, sender.super.info);
        data[sender.id] = sender.text;
        sender.super.info = data;
      },
      didEndEditing: function(sender) {
        const data = Object.assign({}, sender.super.info);
        data[sender.id] = sender.text;
        sender.super.info = data;
      },
      returned: function(sender) {
        sender.blur();
      }
    }
  };
  return input;
}

function definePlainLabel({ name, text, layout }) {
  const label = {
    type: "label",
    props: {
      id: name,
      text: text,
      align: $align.left,
      font: $font(16)
    },
    layout: layout
  };
  return label;
}

module.exports = {
  defineLabelWithCheckBox,
  defineSegmentedControlForRating,
  defineInput,
  definePlainLabel
};
