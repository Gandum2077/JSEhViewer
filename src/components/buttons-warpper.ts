import { Base } from "jsbox-cview";

class ButtonWarpper extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor(button: Base<any, any>, separatorHidden: boolean = false) {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          bgcolor: $color("clear"),
        },
        layout: $layout.fill,
        views: [
          {
            type: "view",
            props: {},
            layout: (make, view) => {
              make.top.bottom.inset(0);
              make.width.equalTo(view.super);
              make.left.right.inset(0.5);
            },
            views: [button.definition],
          },
          {
            type: "view",
            props: {
              bgcolor: $color("separatorColor"),
              cornerRadius: 0.3,
              smoothCorners: true,
              hidden: separatorHidden,
            },
            layout: (make, view) => {
              make.height.equalTo(view.super).dividedBy(3);
              make.width.equalTo(1);
              make.centerY.equalTo(view.super);
              make.right.offset(0.5);
            },
          },
        ],
      };
    };
  }
}

export class ButtonsWarpper extends Base<UIView, UiTypes.ViewOptions> {
  private _height: number;
  _defineView: () => UiTypes.ViewOptions;
  constructor(buttons: Base<any, any>[], height: number = 100) {
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
        views: [
          {
            type: "stack",
            props: {
              axis: $stackViewAxis.horizontal,
              distribution: $stackViewDistribution.fillEqually,
              bgcolor: $color("tertiarySurface"),
              smoothCorners: true,
              cornerRadius: 8,
              stack: {
                views: buttons.map(
                  (button, index) =>
                    new ButtonWarpper(button, index === buttons.length - 1)
                      .definition
                ),
              },
            },
            layout: $layout.fill,
          },
        ],
      };
    };
  }

  heightToWidth(width: number) {
    return this._height;
  }
}
