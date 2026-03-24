import { ContentView, CustomNavigationBar, Markdown, Sheet, SymbolButton } from "jsbox-cview";

export function showIntroductionSheet(path: string, title: string) {
  const text = $file.read(path).string || "";
  const navbar = new CustomNavigationBar({
    props: {
      title,
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
      content: text,
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
