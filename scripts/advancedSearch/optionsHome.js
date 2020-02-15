const baseViews = require("./baseViews");

function getDefaultConfig() {
  const defaultConfig = {
    f_sname: "on",
    f_stags: "on",
    f_sdesc: "",
    f_storr: "",
    f_sr: "",
    f_sp: "",
    f_sto: "",
    f_sdt1: "",
    f_sdt2: "",
    f_sh: "",
    f_srdd: "2",
    f_spf: "",
    f_spt: "",
    f_sfl: "",
    f_sfu: "",
    f_sft: ""
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
        make.left.right.equalTo($("f_sname"));
        make.top.equalTo($("f_sname").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_sdesc",
      text: "搜索图册描述",
      layout: (make, view) => {
        make.left.right.equalTo($("f_stags"));
        make.top.equalTo($("f_stags").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_storr",
      text: "搜索种子文件名称",
      layout: (make, view) => {
        make.left.right.equalTo($("f_sdesc"));
        make.top.equalTo($("f_sdesc").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_sr",
      text: "最低评价：",
      layout: (make, view) => {
        make.left.right.equalTo($("f_storr"));
        make.top.equalTo($("f_storr").bottom).inset(6);
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
      type: "label",
      name: "f_sto",
      text: "只显示有种子的图册",
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
      name: "f_sdt1",
      text: "搜索低权重的标签",
      layout: (make, view) => {
        make.left.right.equalTo($("f_sto"));
        make.top.equalTo($("f_sto").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_sdt2",
      text: "搜索被反对的标签",
      layout: (make, view) => {
        make.left.right.equalTo($("f_sdt1"));
        make.top.equalTo($("f_sdt1").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_sh",
      text: "显示隐藏图册",
      layout: (make, view) => {
        make.left.right.equalTo($("f_sdt2"));
        make.top.equalTo($("f_sdt2").bottom).inset(6);
        make.height.equalTo(24);
      }
    },
    {
      type: "segmentedControl",
      name: "f_srdd",
      layout: (make, view) => {
        make.left.right.equalTo($("f_sh"));
        make.top.equalTo($("f_sh").bottom).inset(6);
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
    },
    {
      type: "label",
      name: "f_sft",
      text: "标签",
      layout: (make, view) => {
        make.bottom.right.inset(0);
        make.width.equalTo(view.super).dividedBy(5);
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_sfu",
      text: "上传者",
      layout: (make, view) => {
        make.bottom.inset(0);
        make.right.equalTo($("f_sft").left).inset(6);
        make.width.equalTo($("f_sft"));
        make.height.equalTo(24);
      }
    },
    {
      type: "label",
      name: "f_sfl",
      text: "语言",
      layout: (make, view) => {
        make.bottom.inset(0);
        make.right.equalTo($("f_sfu").left).inset(6);
        make.width.equalTo($("f_sft"));
        make.height.equalTo(24);
      }
    },
    {
      type: "plainLabel",
      name: "filterTitle",
      text: "取消默认过滤规则：",
      layout: (make, view) => {
        make.left.bottom.inset(0);
        make.right.equalTo($("f_sfl").left).inset(0);
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

function defineOptionsHome(layout, config = null) {
  const updatedConfig = getUpdatedConfig(config);
  const definitions = updateDefinitionsByConfig(updatedConfig);
  const views = definitions.map(n => {
    if (n.type === "label") {
      return baseViews.defineLabelWithCheckBox({
        name: n.name,
        text: n.text,
        layout: n.layout,
        value: n.value
      });
    } else if (n.type === "plainLabel") {
      return baseViews.definePlainLabel({
        name: n.name,
        text: n.text,
        layout: n.layout
      });
    } else if (n.type === "segmentedControl") {
      return baseViews.defineSegmentedControlForRating({
        name: n.name,
        layout: n.layout,
        value: n.value
      });
    } else if (n.type === "input") {
      return baseViews.defineInput({
        name: n.name,
        layout: n.layout,
        value: n.value
      });
    }
  });
  const optionsHome = {
    tpye: "view",
    props: {
      id: "optionsHome",
      bgcolor: $color("clear"),
      info: updatedConfig
    },
    views: views,
    layout: layout
  };
  return optionsHome;
}

module.exports = {
  defineOptionsHome
};
