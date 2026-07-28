import { ContentView, CustomNavigationBar, Markdown, Sheet, SymbolButton } from "jsbox-cview";

export function showIntroductionSheet(options: { path: string; title: string } | { text: string; title: string }) {
  let content = "";
  if ("path" in options) {
    content = $file.read(options.path).string || "";
  } else if ("text" in options) {
    content = options.text;
  }
  const navbar = new CustomNavigationBar({
    props: {
      title: options.title,
      rightBarButtonItems: [
        {
          cview: new SymbolButton({
            props: {
              symbol: "xmark",
            },
            events: {
              tapped: () => {
                sheet.dismiss();
              },
            },
          }),
        },
      ],
    },
  });
  const markdown = new Markdown({
    props: {
      content,
    },
    layout: (make, view) => {
      make.top.equalTo(view.prev.bottom);
      make.left.right.bottom.equalTo(view.super.safeArea);
    },
  });
  const sheet = new Sheet<ContentView, UIView, UiTypes.ViewOptions>({
    cview: new ContentView({
      layout: $layout.fill,
      views: [navbar.definition, markdown.definition],
    }),
  });
  sheet.present();
}
