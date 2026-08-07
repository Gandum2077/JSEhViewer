import { Base, getTextWidth } from "jsbox-cview";
import { showIntroductionSheet } from "./show-introduction-sheet";

const ROW_HEIGHT = 44;
const CARD_INSET = 16;
const CARD_GAP = 35;
const DESCRIPTION_GAP = 8;
const DESCRIPTION_HEIGHT = 44;
const DESCRIPTION = "如果遇到GitHub API限额错误（429），建议使用GitHub Token，点击查看帮助";

export interface LoginOptions {
  exhentai: boolean;
  syncMyTags: boolean;
  githubToken: string;
}

type SwitchKey = "exhentai" | "syncMyTags";

export class LoginOptionsView extends Base<UIView, UiTypes.ViewOptions> {
  private readonly _values: LoginOptions = {
    exhentai: false,
    syncMyTags: false,
    githubToken: "",
  };
  private readonly _githubTokenLabelId: string;

  _defineView: () => UiTypes.ViewOptions;

  constructor({ layout }: { layout?: (make: MASConstraintMaker, view: UIView) => void }) {
    super();
    this._githubTokenLabelId = `${this.id}-github-token-label`;

    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        bgcolor: $color("clear"),
      },
      layout,
      views: [
        {
          type: "view",
          props: {
            bgcolor: $color("secondarySurface"),
            radius: 10,
            clipsToBounds: true,
          },
          layout: (make, view) => {
            make.left.right.inset(CARD_INSET);
            make.top.inset(0);
            make.height.equalTo(ROW_HEIGHT * 2);
          },
          views: [
            this._switchRow("登录里站", "exhentai", 0),
            {
              type: "view",
              props: {
                bgcolor: $color("separatorColor"),
              },
              layout: (make) => {
                make.left.inset(15);
                make.right.inset(0);
                make.top.inset(ROW_HEIGHT);
                make.height.equalTo(1 / $device.info.screen.scale);
              },
            },
            this._switchRow("同步我的标签", "syncMyTags", ROW_HEIGHT, () => {
              showIntroductionSheet({
                title: "同步标签",
                path: "assets/sync-mytags-introduction.md",
              });
            }),
          ],
        },
        {
          type: "view",
          props: {
            bgcolor: $color("secondarySurface"),
            radius: 10,
            clipsToBounds: true,
          },
          layout: (make, view) => {
            make.left.right.inset(CARD_INSET);
            make.top.equalTo(view.prev.bottom).offset(CARD_GAP);
            make.height.equalTo(ROW_HEIGHT);
          },
          views: [this._secureRow()],
        },
        {
          type: "label",
          props: {
            text: DESCRIPTION,
            textColor: $color("systemLink"),
            align: $align.left,
            font: $font(13),
            lines: 2,
          },
          layout: (make, view) => {
            make.left.right.inset(CARD_INSET + 15);
            make.top.equalTo(view.prev.bottom).offset(DESCRIPTION_GAP);
            make.height.equalTo(DESCRIPTION_HEIGHT);
          },
          events: {
            tapped: (sender) => {
              showIntroductionSheet({
                title: "关于GitHub Token",
                path: "assets/github-token-introduction.md",
              });
            },
          },
        },
      ],
    });
  }

  get values(): LoginOptions {
    return this._values;
  }

  private _switchRow(title: string, key: SwitchKey, top: number, help?: () => void): UiTypes.ViewOptions {
    return {
      type: "view",
      props: {
        bgcolor: $color("clear"),
      },
      layout: (make, view) => {
        make.left.right.equalTo(view.super);
        make.top.inset(top);
        make.height.equalTo(ROW_HEIGHT);
      },
      views: [
        this._title(title),
        ...(help ? [this._help(title, help)] : []),
        {
          type: "switch",
          props: {
            on: this._values[key],
            onColor: $color("#34C85A"),
          },
          layout: (make, view) => {
            make.size.equalTo($size(51, 31));
            make.centerY.equalTo(view.super);
            make.right.inset(15);
          },
          events: {
            changed: (sender) => {
              this._values[key] = sender.on;
            },
          },
        },
      ],
    };
  }

  private _secureRow(): UiTypes.ViewOptions {
    const title = "GitHub Token";
    return {
      type: "view",
      props: {
        bgcolor: $color("clear"),
      },
      layout: $layout.fill,
      views: [
        {
          type: "view",
          props: {
            bgcolor: $color("clear"),
            userInteractionEnabled: true,
          },
          layout: $layout.fill,
          events: {
            tapped: () => this._inputGithubToken(),
          },
        },
        this._title(title),
        {
          type: "image",
          props: {
            symbol: "chevron.right",
            tintColor: $color("lightGray", "darkGray"),
            contentMode: 1,
          },
          layout: (make, view) => {
            make.centerY.equalTo(view.super);
            make.size.equalTo($size(17, 17));
            make.right.inset(15);
          },
        },
        {
          type: "label",
          props: {
            id: this._githubTokenLabelId,
            text: "",
            textColor: $color("secondaryText"),
            font: $font(17),
            align: $align.right,
            userInteractionEnabled: true,
          },
          layout: (make, view) => {
            make.centerY.equalTo(view.super);
            make.right.equalTo(view.prev.left).offset(-5);
          },
        },
      ],
    };
  }

  private _title(text: string): UiTypes.LabelOptions {
    return {
      type: "label",
      props: {
        text,
        textColor: $color("primaryText"),
        font: $font(17),
      },
      layout: (make, view) => {
        make.left.inset(15);
        make.centerY.equalTo(view.super);
        make.width.equalTo(getTextWidth(text));
      },
    };
  }

  private _help(title: string, tapped: () => void): UiTypes.ViewOptions {
    return {
      type: "view",
      props: {
        bgcolor: $color("clear"),
        userInteractionEnabled: true,
      },
      layout: (make, view) => {
        make.left.inset(15 + getTextWidth(title));
        make.centerY.equalTo(view.super);
        make.size.equalTo($size(28, ROW_HEIGHT));
      },
      events: {
        tapped,
      },
      views: [
        {
          type: "image",
          props: {
            symbol: "questionmark.circle",
            tintColor: $color("systemLink"),
            contentMode: 1,
            userInteractionEnabled: false,
          },
          layout: (make, view) => {
            make.center.equalTo(view.super);
            make.size.equalTo($size(22, 22));
          },
        },
      ],
    };
  }

  private _inputGithubToken(): void {
    $input.text({
      text: "",
      type: $kbType.default,
      placeholder: "github_pat_xxx",
      handler: (text) => {
        this._values.githubToken = text;
        const label = this.view.get(this._githubTokenLabelId) as UILabelView;
        label.text = text ? "******" : "";
      },
    });
  }
}
