const utility = require("./utility");

function defineInfosView(infos) {
  const texts = [
    "url: " + infos["url"],
    "japanese_title: " + infos["japanese_title"],
    "english_title: " + infos["english_title"],
    "category: " + infos["category"],
    "uploader: " + infos["uploader"],
    "posted: " + infos["posted"],
    "language: " + infos["language"],
    "length: " + infos["length"],
    "rating: " + infos["rating"] + "/5.0",
    "number of reviews: " + infos["number of reviews"] + " reviews",
    "favorited: " + infos["favorited"].slice(0, -6) + " favorites",
    "",
    utility.renderTaglistToText(infos["taglist"]),
    "",
    utility.renderTaglistToText(utility.translateTaglist(infos["taglist"]))
  ];
  const text = {
    type: "text",
    props: {
      text: texts.join("\n"),
      editable: false
    },
    layout: $layout.fillSafeArea
  };
  return text;
}

module.exports = {
  defineInfosView
};
