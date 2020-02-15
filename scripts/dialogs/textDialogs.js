const { maskView, defineTitleBarView } = require("./baseViews");

async function textDialogsSheet({ title = "", text = "" }) {
  const width = 500;
  const layout = function(make, view) {
    make.width.equalTo(width);
    make.height.equalTo(556);
    make.center.equalTo(view.super);
  };
  return new Promise((resolve, reject) => {
    const cancelEvent = function(sender) {
      sender.super.super.super.remove();
      reject("cancel");
    };
    const confrimEvent = function(sender) {
      const result = sender.super.super.get("textView").text;
      sender.super.super.super.remove();
      resolve(result);
    };
    const titleBarView = defineTitleBarView(
      title,
      cancelEvent,
      confrimEvent
    );
    const textView = {
      type: "text",
      props: {
        id: "textView",
        text: text,
        textColor: $color("black"),
        bgcolor: $color("white")
      },
      layout: function(make, view) {
        make.left.right.bottom.inset(0);
        make.top.equalTo($("titleBar").bottom);
      },
      events: {
        ready: sender => {
          sender.focus()
        }
      }
    };
    const content = {
      props: {
        radius: 10
      },
      views: [titleBarView, textView],
      layout: layout
    };
    const textDialogs = {
      props: {
        id: "textDialogs"
      },
      views: [maskView, content],
      layout: $layout.fillSafeArea
    };
    $ui.window.add(textDialogs);
  });
}

async function textDialogsPush({ title = "", text = "" }) {
  let done = false
  let result = text
  return new Promise((resolve, reject) => {
    $ui.push({
      props: {
        title,
        navButtons: [{
          title: "Done",
          handler: () => {
            done = true
            result = $ui.window.get("textView").text
            $ui.pop()
          }
        }]
      },
      views: [
        {
          type: "text",
          props: {
            id: "textView",
            text
          },
          layout: $layout.fillSafeArea,
          events: {
            ready: sender => {
              //sender.focus()
              // 自动聚焦会有动画不顺畅的bug
            }
          }
        }
      ],
      events: {
        dealloc: () => {
          if (done) {
            resolve(result)
          } else {
            reject("cancel")
          }
        }
      }
    })
  });
}

async function textDialogs({ title = "", text = "" }) {
  if ($device.isIpad) {
    return textDialogsSheet({ title, text })
  } else {
    return textDialogsPush({ title, text })
  }
}

module.exports = textDialogs;
