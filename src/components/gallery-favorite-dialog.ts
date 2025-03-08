import { EHFavoriteInfo, EHGallery } from "ehentai-parser";
import {
  Base,
  DialogSheet,
  DynamicRowHeightList,
  Text,
  Label,
  List,
  ContentView,
} from "jsbox-cview";
import { api } from "../utils/api";
import { configManager } from "../utils/config";
import { favcatColor } from "../utils/glv";
import { getUtf8Length } from "../utils/tools";

class FavcatList extends List {
  private _favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 0;
  constructor() {
    super({
      props: {
        style: 2,
        bgcolor: $color("clear"),
        scrollEnabled: false,
        data: configManager.favcatTitles.map((title, index) => {
          const i = index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
          return {
            icon: {
              tintColor: favcatColor[i],
            },
            title: {
              text: title,
            },
            check: {
              hidden: true,
            },
          };
        }),
        template: {
          props: {
            bgcolor: $color("tertiarySurface"),
          },
          views: [
            {
              type: "image",
              props: {
                id: "icon",
                symbol: "heart.fill",
                contentMode: 1,
              },
              layout: (make, view) => {
                make.left.inset(10);
                make.centerY.equalTo(view.super);
                make.size.equalTo($size(20, 20));
              },
            },
            {
              type: "label",
              props: {
                id: "title",
                font: $font(16),
                align: $align.left,
              },
              layout: (make, view) => {
                make.left.equalTo(view.prev.right).inset(10);
                make.centerY.equalTo(view.super);
              },
            },
            {
              type: "image",
              props: {
                id: "check",
                symbol: "checkmark",
                tintColor: $color("systemLink"),
                hidden: true,
              },
              layout: (make, view) => {
                make.right.inset(10);
                make.centerY.equalTo(view.super);
                make.size.equalTo($size(20, 20));
              },
            },
          ],
        },
      },
      layout: $layout.fill,
      events: {
        didSelect: (sender, indexPath, data) => {
          const i = indexPath.row as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
          this.favcat = i;
        },
      },
    });
  }

  set favcat(favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
    this._favcat = favcat;
    this.view.data = this.view.data.map((item, index) => {
      const i = index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      item.check.hidden = i !== favcat;
      return item;
    });
  }

  get favcat() {
    return this._favcat;
  }

  heightToWidth(width: number) {
    return 44 * 10 + 35 * 2;
  }
}

class CustomText extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor(didBeginEditingHandler: (sender: UITextView) => void) {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("backgroundColor"),
        },
        layout: $layout.fill,
        views: [
          {
            type: "text",
            props: {
              id: "text",
              bgcolor: $color("tertiarySurface"),
              smoothCorners: true,
              cornerRadius: 12,
            },
            layout: (make, view) => {
              make.left.right.inset(16);
              make.top.bottom.inset(0);
            },
            events: {
              didBeginEditing: (sender) => {
                didBeginEditingHandler(sender);
              },
              didChange: (sender) => {
                if (getUtf8Length(sender.text) > 200) {
                  $ui.error("备注字数超出限制");
                }
              },
            },
          },
        ],
      };
    };
  }

  set text(text: string) {
    (this.view.get("text") as UITextView).text = text;
  }

  get text() {
    return (this.view.get("text") as UITextView).text;
  }

  heightToWidth(width: number) {
    return 300;
  }
}

class CustomLabel extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor() {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("backgroundColor"),
        },
        layout: $layout.fill,
        views: [
          {
            type: "label",
            props: {
              bgcolor: $color("clear"),
              text: "添加备注",
              textColor: $color("primaryText"),
              font: $font(16),
            },
            layout: (make, view) => {
              make.left.right.inset(16);
              make.top.inset(0);
              make.height.equalTo(20);
            },
          },
          {
            type: "label",
            props: {
              id: "slot",
              text: "",
              bgcolor: $color("clear"),
              textColor: $color("secondaryText"),
              font: $font(12),
            },
            layout: (make, view) => {
              make.left.right.inset(16);
              make.top.equalTo(view.prev.bottom).inset(0);
              make.height.equalTo(20);
            },
          },
        ],
      };
    };
  }

  refreshSlot({
    num_of_favnote_slots_used,
    num_of_favnote_slots,
  }: {
    num_of_favnote_slots: number;
    num_of_favnote_slots_used: number;
  }) {
    (
      this.view.get("slot") as UILabelView
    ).text = `已使用${num_of_favnote_slots_used}个备注，共${num_of_favnote_slots}个`;
  }

  heightToWidth(width: number) {
    return 40;
  }
}

class FooterLabel extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor() {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("backgroundColor"),
        },
        layout: $layout.fill,
        views: [
          {
            type: "label",
            props: {
              text: "备注至多200字符，以UTF-8编码后的长度为准",
              textColor: $color("secondaryText"),
              font: $font(12),
              align: $align.left,
            },
            layout: (make, view) => {
              make.left.right.inset(16);
              make.top.bottom.inset(0);
            },
          },
        ],
      };
    };
  }

  heightToWidth(width: number) {
    return 20;
  }
}

export async function galleryFavoriteDialog(infos: EHGallery): Promise<
  | {
      success: true;
      favorited: true;
      favcat: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      favnote: string;
    }
  | { success: false; dissmissed?: boolean }
> {
  let favoriteInfo: EHFavoriteInfo | undefined;
  const favcatList = new FavcatList();
  const customLabel = new CustomLabel();
  const customText = new CustomText((sender) => {
    list.view.scrollToOffset($point(0, 44 * 10 + 35 * 2));
  });
  const list = new DynamicRowHeightList({
    rows: [favcatList, customLabel, customText, new FooterLabel()],
    props: {
      bgcolor: $color("clear"),
      separatorHidden: true,
      hidden: true,
      footer: {
        type: "view",
        props: {
          height: 350,
        },
      },
    },
    layout: $layout.fill,
    events: {},
  });
  const placholder = new Label({
    props: {
      text: "加载中...",
      textColor: $color("secondaryText"),
      align: $align.center,
    },
    layout: $layout.center,
  });
  const cview = new ContentView({
    props: {
      bgcolor: $color("clear"),
    },
    views: [list.definition, placholder.definition],
    layout: (make, view) => {
      make.left.right.bottom.equalTo(view.super.safeArea);
      make.top.equalTo(view.super.safeArea).inset(50);
    },
    events: {
      ready: async (sender) => {
        try {
          favoriteInfo = await api.getFavcatFavnote(infos.gid, infos.token);
          list.view.hidden = false;
          placholder.view.hidden = true;
          favcatList.favcat = infos.favcat || 0;
          customText.text = favoriteInfo.favnote || "";
          customLabel.refreshSlot({
            num_of_favnote_slots: favoriteInfo.num_of_favnote_slots,
            num_of_favnote_slots_used: favoriteInfo.num_of_favnote_slots_used,
          });
        } catch (e) {
          placholder.view.text = "加载失败！";
        }
      },
    },
  });
  const sheet = new DialogSheet({
    title: "收藏",
    bgcolor: $color("backgroundColor"),
    cview,
    doneHandler: async () => {
      if (!favoriteInfo) return { success: false, dismissed: true };
      if (getUtf8Length(customText.text) > 200) {
        $ui.alert("备注字数超出限制，无法执行收藏操作");
        return { success: false, dismissed: true };
      }
      return {
        success: true,
        favorited: true,
        favcat: favcatList.favcat,
        favnote: customText.text,
      };
    },
  });
  return new Promise((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}
