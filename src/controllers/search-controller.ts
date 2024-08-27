import { CustomNavigationBar, Input, PresentedPageController, Sheet, SymbolButton } from "jsbox-cview";

export class SearchController extends PresentedPageController {
  constructor() {
    super({
      props: {
        presentMode: 5,
        animated: false,
        interactiveDismissalDisabled: false
      }
    });
    const navbar = new CustomNavigationBar({
      props: {
        style: 2,
        bgcolor: $color("clear"),
        leftBarButtonItems: [{
          cview: new SymbolButton({
            props: {
              symbol: "chevron.left",
              tintColor: $color("primaryText"),
            },
            events: {
              tapped: () => {
                this.dismiss()
              }
            }
          })
        }],
        rightBarButtonItems: [{
          title: "搜索",
          tintColor: $color("primaryText"),
          handler: () => {$ui.toast("search")}
        }],
        titleView: new Input({
          props: {
            bgcolor: $color("red")
          },
          layout: $layout.fill,
        })
      }
    })
    this.rootView.views = [navbar]
  }


}