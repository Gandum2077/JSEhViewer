import { Base } from "jsbox-cview";

export class AiTranslationButton extends Base<
  UIButtonView,
  UiTypes.ButtonOptions
> {
  _status: "pending" | "loading" | "success" | "error" = "pending";
  _defineView: () => UiTypes.ButtonOptions;
  constructor({
    layout,
    events,
  }: {
    layout: (make: MASConstraintMaker, view: UIButtonView) => void;
    events: {
      tapped?: (sender: UIButtonView) => void;
    };
  }) {
    super();
    this._layout = layout;
    this._defineView = () => ({
      type: "button",
      props: {
        id: this.id,
        radius: 0,
        bgcolor: $color("clear"),
      },
      views: [
        {
          // success
          type: "view",
          props: {
            id: this.id + "success",
            hidden: this._status !== "success",
            userInteractionEnabled: false,
          },
          layout: (make, view) => {
            make.edges.insets($insets(12.5, 12.5, 12.5, 12.5));
            make.center.equalTo(view.super);
          },
          views: [
            {
              type: "image",
              props: {
                symbol: "arrow.triangle.2.circlepath",
                tintColor: $color("systemLink"),
                contentMode: 1,
              },
              layout: $layout.fill,
            },
            {
              type: "label",
              props: {
                text: "译",
                align: $align.center,
                textColor: $color("systemLink"),
                font: $font("bold", 10),
              },
              layout: $layout.fill,
            },
          ],
        },
        {
          // error
          type: "image",
          props: {
            id: this.id + "error",
            symbol: "xmark.circle.fill",
            tintColor: $color("#F44336"),
            contentMode: 1,
            hidden: this._status !== "error",
          },
          layout: (make, view) => {
            make.edges.insets($insets(12.5, 12.5, 12.5, 12.5));
            make.center.equalTo(view.super);
          },
        },
        {
          // loading
          type: "spinner",
          props: {
            id: this.id + "loading",
            loading: this._status === "loading",
            hidden: this._status !== "loading",
          },
          layout: (make, view) => {
            make.center.equalTo(view.super);
          },
        },
        {
          // pending
          type: "view",
          props: {
            id: this.id + "pending",
            hidden: this._status !== "pending",
            userInteractionEnabled: false,
          },
          layout: (make, view) => {
            make.edges.insets($insets(12.5, 12.5, 12.5, 12.5));
            make.center.equalTo(view.super);
          },
          views: [
            {
              type: "image",
              props: {
                symbol: "arrow.triangle.2.circlepath",
                tintColor: $color("primaryText"),
                contentMode: 1,
              },
              layout: $layout.fill,
            },
            {
              type: "label",
              props: {
                text: "AI",
                align: $align.center,
                textColor: $color("primaryText"),
                font: $font("bold", 10),
              },
              layout: $layout.fill,
            },
          ],
        },
      ],
      layout: this._layout,
      events,
    });
  }

  get status() {
    return this._status;
  }

  set status(value: "pending" | "loading" | "success" | "error") {
    if (this._status === value) return;
    this._status = value;
    if (value === "loading") {
      ($(this.id + "loading") as UISpinnerView).loading = true;
      $(this.id + "loading").hidden = false;
      $(this.id + "pending").hidden = true;
      $(this.id + "success").hidden = true;
      $(this.id + "error").hidden = true;
    } else if (value === "success") {
      ($(this.id + "loading") as UISpinnerView).loading = false;
      $(this.id + "loading").hidden = true;
      $(this.id + "pending").hidden = true;
      $(this.id + "success").hidden = false;
      $(this.id + "error").hidden = true;
    } else if (value === "error") {
      ($(this.id + "loading") as UISpinnerView).loading = false;
      $(this.id + "loading").hidden = true;
      $(this.id + "pending").hidden = true;
      $(this.id + "success").hidden = true;
      $(this.id + "error").hidden = false;
    } else {
      ($(this.id + "loading") as UISpinnerView).loading = false;
      $(this.id + "loading").hidden = true;
      $(this.id + "pending").hidden = false;
      $(this.id + "success").hidden = true;
      $(this.id + "error").hidden = true;
    }
  }
}
