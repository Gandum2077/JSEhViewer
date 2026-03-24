import { Base } from "jsbox-cview";

export class BlankView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  private _height: number;
  constructor(height: number) {
    super();
    this._height = height;
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("clear"),
        },
        layout: $layout.fill,
      };
    };
  }

  get height() {
    return this._height;
  }

  set height(height: number) {
    this._height = height;
  }

  heightToWidth(width: number) {
    return this._height;
  }
}
