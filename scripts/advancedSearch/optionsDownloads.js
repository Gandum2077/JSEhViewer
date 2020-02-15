const baseViews = require("./baseViews");

function getDefaultConfig() {
  const defaultConfig = {
    f_sname: "on",
    f_stags: "on",
    f_sr: "",
    f_sp: "",
    f_srdd: "2",
    f_spf: "",
    f_spt: ""
  };
  return defaultConfig;
}

function getStandardDefinitions() {
  const standardDefinitions = [
    {
      type: "label",
      name: "f_sname",
      text: "搜索图册名称",
      layout: (make, view) => {
        make.top.left.inset(0);
        make.width
          .equalTo(view.super)
          .dividedBy(2)
          .offset(-20);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_stags",
      text: "搜索图册标签",
      layout: (make, view) => {
        make.top.right.inset(0);
        make.width
          .equalTo(view.super)
          .dividedBy(2)
          .offset(-20);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_sr",
      text: "最低评价：",
      layout: (make, view) => {
        make.left.right.equalTo($("f_sname"));
        make.top.equalTo($("f_sname").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_sp",
      text: "页码在此之间：",
      layout: (make, view) => {
        make.left.right.equalTo($("f_sr"));
        make.top.equalTo($("f_sr").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "segmentedControl",
      name: "f_srdd",
      layout: (make, view) => {
        make.left.right.equalTo($("f_stags"));
        make.top.equalTo($("f_stags").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "plainLabel",
      name: "separatorOfInputs",
      text: "-",
      layout: (make, view) => {
        make.top.equalTo($("f_srdd").bottom).inset(6);
        make.centerX.equalTo($("f_srdd"));
        make.size.equalTo($size(9, 24));
      }
    },
    {
      type: "input",
      name: "f_spf",
      layout: (make, view) => {
        make.top.equalTo($("f_srdd").bottom).inset(6);
        make.left.equalTo($("f_srdd"));
        make.right.equalTo($("separatorOfInputs").left).inset(10);
        make.height.equalTo(24);
      }
    },
    {
      type: "input",
      name: "f_spt",
      layout: (make, view) => {
        make.top.equalTo($("f_srdd").bottom).inset(6);
        make.right.equalTo($("f_srdd"));
        make.left.equalTo($("separatorOfInputs").right).inset(10);
        make.height.equalTo(24);
      }
    }
  ];
  return standardDefinitions;
}

function getUpdatedConfig(config) {
  const defaultConfig = getDefaultConfig();
  if (config) {
    const updatedConfig = Object.assign(defaultConfig, config);
    return updatedConfig;
  }
  return defaultConfig;
}

function updateDefinitionsByConfig(config) {
  const definitions = getStandardDefinitions();
  definitions.map(n => {
    const value = config[n.name];
    if (value) {
      n.value = value;
    }
  });
  return definitions;
}

function defineOptionsDownloads(layout, config = null) {
  const updatedConfig = getUpdatedConfig(config);
  const definitions = updateDefinitionsByConfig(updatedConfig);
  const views = definitions.map(n => {
    if (n.type === "label") {
      return baseViews.defineLabelWithCheckBox(
        n.name,
        n.text,
        n.layout,
        (value = n.value)
      );
    } else if (n.type === "plainLabel") {
      return baseViews.definePlainLabel(n.name, n.text, n.layout);
    } else if (n.type === "segmentedControl") {
      return baseViews.defineSegmentedControlForRating(
        n.name,
        n.layout,
        (value = n.value)
      );
    } else if (n.type === "input") {
      return baseViews.defineInput(n.name, n.layout, (value = n.value));
    }
  });
  const optionsDownloads = {
    tpye: "view",
    props: {
      id: "optionsDownloads",
      info: updatedConfig
    },
    views: views,
    layout: layout
  };
  return optionsDownloads;
}

module.exports = {
  defineOptionsDownloads
};
