import { Base } from "jsbox-cview";

export class EhlistTitleView extends Base<UIButtonView, UiTypes.ButtonOptions> {
  private _arrowSymbolHidden: boolean;
  _defineView: () => UiTypes.ButtonOptions;
  constructor({ defaultTitle, tapped }: { defaultTitle: string; tapped: (sender: UIButtonView) => void }) {
    super();
    this._arrowSymbolHidden = defaultTitle === "空白页";
    this._defineView = () => {
      return {
        type: "button",
        props: {
          id: this.id,
          bgcolor: $color("clear"),
          enabled: !this._arrowSymbolHidden,
        },
        layout: (make, view) => {
          make.width.greaterThanOrEqualTo(110).priority(1000);
          make.width.lessThanOrEqualTo(170).priority(1000);
          make.width.equalTo(view.super).priority(999);
          make.height.equalTo(view.super);
          make.center.equalTo(view.super);
        },
        views: [
          {
            type: "label",
            props: {
              id: this.id + "title-large",
              text: defaultTitle,
              font: $font("bold", 17),
              hidden: !this._arrowSymbolHidden,
            },
            layout: (make, view) => {
              make.center.equalTo(view.super);
            },
          },
          {
            type: "label",
            props: {
              id: this.id + "title",
              text: defaultTitle,
              font: $font("bold", 17),
              hidden: this._arrowSymbolHidden,
            },
            layout: (make, view) => {
              make.centerY.equalTo(view.super);
              make.centerX.equalTo(view.super).offset(-8);
              make.width.lessThanOrEqualTo(view.super).offset(-12);
            },
          },
          {
            type: "image",
            props: {
              id: this.id + "symbol",
              symbol: "arrowtriangle.down.fill",
              tintColor: $color("secondaryText"),
              contentMode: 1,
              hidden: this._arrowSymbolHidden,
            },
            layout: (make, view) => {
              make.height.equalTo(view.super);
              make.centerY.equalTo(view.super);
              make.width.equalTo(12);
              make.left.equalTo(view.prev.right).inset(4);
            },
          },
        ],
        events: {
          tapped: (sender) => {
            tapped(sender);
          },
        },
      };
    };
  }

  get title() {
    return ($(this.id + "title") as UILabelView).text;
  }

  set title(text: string) {
    ($(this.id + "title") as UILabelView).text = text;
    ($(this.id + "title-large") as UILabelView).text = text;
    this.arrowSymbolHidden = text === "空白页";
  }

  get arrowSymbolHidden() {
    return this._arrowSymbolHidden;
  }

  set arrowSymbolHidden(hidden: boolean) {
    this._arrowSymbolHidden = hidden;
    $(this.id + "title-large").hidden = !hidden;
    $(this.id + "title").hidden = hidden;
    $(this.id + "symbol").hidden = hidden;
    ($(this.id) as UIButtonView).enabled = !hidden;
  }
}
