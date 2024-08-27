import { Base } from "jsbox-cview";

const ON_COLOR = $color("#145D7E", "#2A9CD1")
const ON_FONT_SIZE = 18
const OFF_FONT_SIZE = 12

export class TranslateButton extends Base<UIButtonView, UiTypes.ButtonOptions> {
  _defineView: () => UiTypes.ButtonOptions;
  private _translated: boolean;

  constructor({translated, handler}: {translated: boolean, handler: (translated: boolean) => void}){  
    super();
    this._translated = translated;
    this._defineView = () => {
      return {
        type: "button",
        props: {
          id: this.id,
          bgcolor: $color("systemGray4"),
          //borderWidth: 1,
        },
        layout: function(make, view) {
          make.center.equalTo(view.super)
          make.size.equalTo($size(60, 30))
        },
        events: {
          tapped: sender => {
            this.translated = !this.translated
            handler(this.translated)
          }
        },
        views:[
          {
            type: "label",
            props: {
              id: "cn",
              hidden: !translated,
              align: $align.center,
              styledText: {
                text: "中/英",
                styles: [
                  {
                    range: $range(0, 1),
                    color: ON_COLOR,
                    font: $font("bold", ON_FONT_SIZE)
                  },
                  {
                    range: $range(1, 1),
                    color: ON_COLOR,
                    font: $font(OFF_FONT_SIZE)
                  },
                  {
                    range: $range(2, 1),
                    font: $font(OFF_FONT_SIZE)
                  }
                ]
              }
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super)
              make.top.inset(0)
              make.bottom.inset(1)
            }
          },
          {
            type: "label",
            props: {
              id: "en",
              hidden: translated,
              align: $align.center,
              styledText: {
                text: "英/中",
                styles: [
                  {
                    range: $range(0, 1),
                    color: ON_COLOR,
                    font: $font("bold", ON_FONT_SIZE)
                  },
                  {
                    range: $range(1, 1),
                    color: ON_COLOR,
                    font: $font(OFF_FONT_SIZE)
                  },
                  {
                    range: $range(2, 1),
                    font: $font(OFF_FONT_SIZE)
                  }
                ]
              }
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super)
              make.top.inset(0)
              make.bottom.inset(1)
            }
          }
        ]
      }
    }
  }

  get translated() {
    return this._translated
  }

  set translated(translated: boolean) {
    this._translated = translated
    this.view.get("cn").hidden = !translated
    this.view.get("en").hidden = translated
  }

  heightToWidth(width: number) {
    return 50
  }
}

