const glv = require("./globalVariables");
const formDialogs = require("./dialogs/formDialogs");

function getData(rawData) {
  return rawData.map(n => {
    if (typeof n === "string") {
      return {
        label: {
          text: n
        },
        buttonInfo: {
          hidden: true
        }
      };
    } else {
      return {
        label: {
          text: n.display
        },
        buttonInfo: {
          hidden: false,
          info: { raw: n.raw }
        }
      };
    }
  });
}

const template = {
  props: {
    bgcolor: $color("white")
  },
  views: [
    {
      type: "button",
      props: {
        id: "buttonInfo",
        type: 2,
        tintColor: $color("#007aff")
      },
      layout: function(make, view) {
        make.width.equalTo(44);
        make.right.inset(5);
        make.top.bottom.inset(0);
      },
      events: {
        tapped: function(sender) {
          $ui.alert(sender.info.raw);
        }
      }
    },
    {
      type: "label",
      props: {
        id: "label",
        lines: 2
      },
      layout: function(make, view) {
        make.right.equalTo($("buttonInfo").left);
        make.left.inset(5);
        make.top.bottom.inset(0);
      }
    }
  ]
};

function getRawDataFromListData(listData) {
  return listData.map(n => {
    if (n.buttonInfo.hidden) {
      return n.label.text;
    } else {
      return {
        raw: n.buttonInfo.info.raw,
        display: n.label.text
      };
    }
  });
}

function defineStoredSearchPhrasesView() {
  const buttonAdd = {
    type: "button",
    props: {
      id: "buttonAdd",
      title: "添加新项",
      tintColor: $color("#007aff"),
      type: 5
    },
    layout: function(make, view) {
      make.height.equalTo(32);
      make.left.right.inset(3);
      make.top.inset(10);
    },
    events: {
      tapped: async function(sender) {
        const sections = [
          {
            fields: [
              {
                type: "string",
                title: $l10n("搜索词"),
                key: "raw"
              },
              {
                type: "string",
                title: $l10n("提示词"),
                key: "display"
              }
            ]
          }
        ];
        const result = await formDialogs({
          sections,
          title: $l10n("添加搜索词")
        });
        if (result.raw) {
          if (result.display) {
            glv.config.storage_search_phrases.push({
              raw: result.raw,
              display: result.display
            });
          } else {
            glv.config.storage_search_phrases.push(result.raw);
          }
          sender.super.get("list").data = getData(
            glv.config.storage_search_phrases
          );
          glv.saveConfig();
        }
      }
    }
  };
  const list = {
    type: "list",
    props: {
      id: "list",
      reorder: true,
      template: template,
      data: getData(glv.config.storage_search_phrases),
      actions: [
        {
          title: "delete",
          handler: function(sender, indexPath) {
            glv.config.storage_search_phrases = getRawDataFromListData(
              sender.data
            );
            glv.saveConfig();
          }
        },
        {
          title: $l10n("追加"),
          handler: function(sender, indexPath) {
            const data = sender.data[indexPath.row];
            const text = data.buttonInfo.hidden
              ? data.label.text
              : data.buttonInfo.info.raw;
            const textfield_search = $("rootView")
              .get("listView")
              .get("textfield_search");
            if (textfield_search.text) {
              textfield_search.text += " " + text;
            } else {
              textfield_search.text = text;
            }
          }
        }
      ]
    },
    layout: function(make) {
      make.left.right.inset(3);
      make.bottom.inset(0);
      make.top.equalTo($("buttonAdd").bottom);
    },
    events: {
      didSelect: function(sender, indexPath, data) {
        const text = data.buttonInfo.hidden
          ? data.label.text
          : data.buttonInfo.info.raw;
        $("rootView")
          .get("listView")
          .get("textfield_search").text = text;
      },
      reorderFinished: function(data) {
        glv.config.storage_search_phrases = getRawDataFromListData(data);
        glv.saveConfig();
      }
    }
  };
  const storedSearchPhrasesView = {
    type: "view",
    props: {
      id: "storedSearchPhrasesView",
      bgcolor: $color("white")
    },
    views: [buttonAdd, list],
    layout: function(make, view) {
      make.top.equalTo($("button_storage").bottom);
      make.right.equalTo($("button_storage"));
      make.size.equalTo($size(320, 480));
    }
  };
  return storedSearchPhrasesView;
}

module.exports = {
  defineStoredSearchPhrasesView
};
