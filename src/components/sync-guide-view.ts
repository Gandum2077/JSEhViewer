import { Base, WelcomeView, WelcomeViewButton, inputAlert } from "jsbox-cview";
import URLParse from "url-parse";

import { SYNC_TABLES } from "../sync/schema";
import { syncErrorMessage } from "../sync/errors";
import { syncLog } from "../sync/logging";

const descriptions: Record<string, string> = {
  archive_entries_v2: "下面的缩进项依赖图库记录",
  local_marked_tags_v2: "仅在不与 E 站同步标签时有效",
  webdav_services_v2: "不同步账号密码与启用状态",
  ai_translation_services_v2: "不同步敏感参数与启用状态",
};

interface SyncContentListItem {
  name: string;
  title: string;
  description?: string;
  requiresArchive?: boolean;
  on: boolean;
  enabled: boolean;
}

function mapSyncTablesToItems(selected: string[]): SyncContentListItem[] {
  return SYNC_TABLES.map((table) => ({
    name: table.name,
    title: table.title,
    description: descriptions[table.name],
    requiresArchive: "parent" in table,
    on: selected.includes(table.name),
    enabled: !("parent" in table) || selected.includes("archive_entries_v2"),
  }));
}

export class SyncContentList extends Base<UIListView, UiTypes.ListOptions> {
  private _items: SyncContentListItem[];
  protected _defineView: () => UiTypes.ListOptions;

  constructor(selected = SYNC_TABLES.map((table) => table.name) as string[]) {
    super();
    this._items = mapSyncTablesToItems(selected);
    this._defineView = () => ({
      type: "list",
      props: {
        style: 0,
        smoothCorners: true,
        cornerRadius: 10,
        bgcolor: palette.background,
        separatorInset: $insets(0, 15, 0, 0),
        selectable: false,
        template: {
          props: { bgcolor: palette.card },
          views: [
            {
              type: "switch",
              props: {
                id: "switch",
                onColor: $color("#34C85A"),
              },
              layout: (make, view) => {
                make.size.equalTo($size(51, 31));
                make.centerY.equalTo(view.super);
                make.right.inset(15);
              },
              events: {
                changed: (sender) => {
                  const name = sender.info.name as string;
                  const on = sender.on;
                  this._items.find((item) => item.name === name)!.on = on;
                  if (name === "archive_entries_v2") {
                    this._items.forEach((item) => {
                      if (item.requiresArchive) {
                        item.enabled = on;
                      }
                    });
                    this.view.data = this.mapData(this._items);
                  }
                },
              },
            },
            {
              type: "label",
              props: { id: "title", font: $font("bold", 16), textColor: palette.ink, lines: 1 },
              layout: (make, view) => {
                make.left.inset(15);
                make.right.equalTo(view.prev.left).inset(12);
                make.top.bottom.inset(12);
              },
            },
            {
              type: "view",
              props: { id: "title_and_description", bgcolor: $color("clear") },
              layout: (make, view) => {
                make.left.inset(15);
                make.right.equalTo(view.prev);
                make.top.bottom.inset(0);
              },
              views: [
                {
                  type: "label",
                  props: { id: "title2", font: $font("bold", 16), textColor: palette.ink, lines: 1 },
                  layout: (make) => {
                    make.top.inset(11);
                    make.left.right.inset(0);
                    make.height.equalTo(21);
                  },
                },
                {
                  type: "label",
                  props: { id: "description", font: $font(13), textColor: palette.muted, lines: 1 },
                  layout: (make, view) => {
                    make.left.right.inset(0);
                    make.top.equalTo(view.prev.bottom).inset(5);
                    make.height.equalTo(21);
                  },
                },
              ],
            },
          ],
        },
        data: this.mapData(this._items),
      },
      layout: $layout.fill,
      events: {
        rowHeight: (sender, indexPath) => {
          if (this._items[indexPath.row].description) {
            return 66;
          } else return 44;
        },
      },
    });
  }

  mapData(items: SyncContentListItem[]) {
    return items.map((item) => {
      const hasDescription = Boolean(item.description);
      const title = (item.requiresArchive ? "    - " : "") + item.title;
      return {
        switch: { on: item.on, enabled: item.enabled, info: { name: item.name } },
        title: { text: title, hidden: hasDescription },
        title_and_description: { hidden: !hasDescription },
        title2: { text: title },
        description: { text: item.description },
      };
    });
  }

  get selectedTables(): string[] {
    return this._items.filter((n) => n.on && n.enabled).map((n) => n.name);
  }
}

class InputLikeView extends Base<UIView, UiTypes.ViewOptions> {
  protected _defineView: () => UiTypes.ViewOptions;
  constructor({
    props,
    events,
  }: {
    props: Pick<UiTypes.InputProps, "text" | "placeholder" | "type" | "secure">;
    events: { checkInput: (text: string) => boolean };
  }) {
    super();
    this._defineView = () => {
      return {
        type: "view",
        props: {
          userInteractionEnabled: true,
        },
        events: {
          tapped: async (sender) => {
            try {
              const text = await inputAlert({
                title: props.placeholder ?? "请输入",
                text: this.text,
                placeholder: props.placeholder,
                type: props.type,
                secure: props.secure ?? false,
              });
              const tr = text.trim();
              const r = events.checkInput(tr);
              if (r) this.text = tr;
            } catch (error) {
              if (error !== "cancel") $ui.error("输入未完成，请重试");
            }
          },
        },
        views: [
          {
            type: "input",
            props: {
              id: this.id + "input",
              userInteractionEnabled: false,
              text: props.text,
              placeholder: props.placeholder,
              type: props.type,
              secure: props.secure ?? false,
              font: $font(14),
              bgcolor: palette.background,
              textColor: palette.ink,
              radius: 10,
            },
            layout: $layout.fill,
          },
        ],
      };
    };
  }

  get text() {
    return ($(this.id + "input") as UIInputView).text;
  }

  set text(s: string) {
    ($(this.id + "input") as UIInputView).text = s;
  }
}

const links = {
  deploy: "https://gandum2077.github.io/cloudflare-d1-sync/",
};
const palette = {
  //background: $color("#FAF8F5", "#171614"),
  //card: $color("#FFFFFF", "#24221F"),
  //ink: $color("#26231F", "#F7F2EA"),
  //muted: $color("#726B62", "#B9B0A4"),
  background: $color("insetGroupedBackground"),
  card: $color("secondarySurface"),
  ink: $color("primaryText"),
  muted: $color("secondaryText"),
  accent: $color("#B94B16", "#FFAC75"),
  tint: $color("#FBEBDD", "#38291F"),
};

type Block = {
  view: UiTypes.AllViewOptions;
  height: (width: number) => number;
};

// 同一套测量用于 WelcomeView 的 contentHeight 和内部约束，旋转时一起更新。
class Column extends Base<UIView, UiTypes.ViewOptions> {
  constructor(
    private blocks: Block[],
    private gap = 12,
    private padding = 0,
    private background = $color("clear"),
  ) {
    super();
  }
  heightToWidth = (width: number): number =>
    this.padding * 2 +
    this.blocks.reduce((sum, item) => sum + item.height(Math.max(1, width - this.padding * 2)), 0) +
    Math.max(0, this.blocks.length - 1) * this.gap;

  protected _defineView = (): UiTypes.ViewOptions => ({
    type: "view",
    props: { bgcolor: this.background, cornerRadius: 20, smoothCorners: true },
    layout: $layout.fill,
    views: this.blocks.map((item, index) => ({
      ...item.view,
      layout: (make: MASConstraintMaker, view: UIView) => {
        make.left.right.inset(this.padding);
        if (index === 0) make.top.inset(this.padding);
        else make.top.equalTo(view.prev.bottom).offset(this.gap);
        make.height.equalTo(1);
      },
    })),
    events: {
      layoutSubviews: (sender) => {
        if (sender.frame.width <= 0) return;
        const width = Math.max(1, sender.frame.width - this.padding * 2);
        sender.views.forEach((view, index) => {
          const height = this.blocks[index].height(width);
          if (Math.abs(view.frame.height - height) > 0.5) view.updateLayout((make) => make.height.equalTo(height));
        });
      },
    },
  });
}

function text(value: string, size = 15, bold = false, color = palette.ink): Block {
  const font = bold ? $font("bold", size) : $font(size);
  return {
    height: (width) => Math.ceil($text.sizeThatFits({ text: value, width, font }).height) + 4,
    view: { type: "label", props: { text: value, font, textColor: color, lines: 0 } },
  };
}
function columnBlock(column: Column): Block {
  return { view: column.definition, height: column.heightToWidth };
}
function card(blocks: Block[], tinted = false): Block {
  return columnBlock(new Column(blocks, 8, 16, tinted ? palette.tint : palette.card));
}
function link(title: string, url: string): Block {
  return {
    height: () => 44,
    view: {
      type: "button",
      props: { title, font: $font("bold", 14), titleColor: palette.accent, bgcolor: $color("clear") },
      events: { tapped: () => $app.openURL(url) },
    },
  };
}

function button(title: string, tapped: WelcomeViewButton["tapped"]): WelcomeViewButton {
  return {
    props: {
      title,
      font: $font("bold", 16),
      cornerRadius: 15,
      bgcolor: palette.ink,
      titleColor: palette.background,
    },
    tapped,
  };
}

export class CloudflareSyncGuideView extends WelcomeView {
  constructor(
    finishHandler: (
      sender: CloudflareSyncGuideView,
      info: {
        deviceName: string;
        endpoint: string;
        masterKey: string;
        selectedTables: string[];
      },
    ) => Promise<boolean>,
  ) {
    // 原生设备符号与 Cloudflare 图标。
    const illustration: Block = {
      height: () => 112,
      view: {
        type: "view",
        props: { bgcolor: palette.tint, cornerRadius: 24 },
        views: [
          {
            type: "image",
            props: {
              contentMode: 2,
              src: "assets/cloudflare-icon.png",
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.centerY.equalTo(view.super).offset(-9);
              make.width.equalTo(68);
              make.height.equalTo(44);
            },
          },
          ...["iphone", "ipad"].map(
            (symbol, index): UiTypes.ImageOptions => ({
              type: "image",
              props: { symbol, tintColor: palette.accent, contentMode: 1 },
              layout: (make, view) => {
                make.centerY.equalTo(view.super).offset(-9);
                make.centerX.equalTo(view.super).multipliedBy([0.34, 1.66][index]);
                make.width.equalTo(32);
                make.height.equalTo(44);
              },
            }),
          ),
          ...[0.67, 1.33].map(
            (position): UiTypes.ImageOptions => ({
              type: "image",
              props: { symbol: "arrow.left.arrow.right", tintColor: palette.accent, contentMode: 1 },
              layout: (make, view) => {
                make.centerX.equalTo(view.super).multipliedBy(position);
                make.centerY.equalTo(view.super).offset(-9);
                make.width.height.equalTo(18);
              },
            }),
          ),
          {
            type: "label",
            props: {
              text: "你的设备   ·   你的 Cloudflare   ·   你的数据",
              font: $font(10),
              align: $align.center,
              textColor: palette.accent,
            },
            layout: (make) => {
              make.left.right.inset(8);
              make.bottom.inset(14);
              make.height.equalTo(16);
            },
          },
        ],
      },
    };

    const intro = new Column(
      [
        text("01  认识云同步", 27, true, palette.accent),
        illustration,
        card([
          text("工作原理", 17, true),
          text("使用 Cloudflare Worker + D1 免费版本，为本应用搭建一套个人云同步服务。", 14, true, palette.muted),
          text("Cloudflare Worker 是面向开发者的工具，稍微有一点复杂，请耐心跟随引导操作。", 12, false, palette.muted),
          text(
            "如果遇到意料之外的问题，可以问 Cloudflare 自带的 Ask AI 功能。或者试试让 AI 帮你完成。",
            12,
            false,
            palette.muted,
          ),
        ]),
        card([
          text("额度限制", 17, true),
          text("每日读取 500 万行，写入 10 万行。", 14, true, palette.muted),
          text(
            "上传或下载数据时，还需要进行索引、日志、更新设备状态等操作，因此实际上会消耗数倍的额度。",
            12,
            false,
            palette.muted,
          ),
          text(
            "首次同步大量数据可能达到每日额度；实际用量取决于记录、索引和同步操作。额度恢复后可以继续同步。",
            12,
            false,
            palette.muted,
          ),
        ]),
      ],
      12,
    );

    const nameInput = new InputLikeView({
      props: {
        placeholder: "设备名",
        text: $device.info.name,
      },
      events: {
        checkInput: (text) => {
          if (text.length > 0 && text.length <= 32) {
            return true;
          } else {
            $ui.alert("请输入 1～32 个字符的设备名");
            return false;
          }
        },
      },
    });

    const apiInput = new InputLikeView({
      props: {
        placeholder: "https://your-worker.workers.dev",
        type: $kbType.url,
      },
      events: {
        checkInput: (text) => {
          const parsed = new URLParse(text);
          if (
            parsed.protocol !== "https:" ||
            !parsed.hostname ||
            parsed.username ||
            parsed.password ||
            parsed.query ||
            parsed.hash ||
            !["", "/"].includes(parsed.pathname)
          ) {
            $ui.alert("请填写 Worker 的 HTTPS 根地址，不包含 /v1 路径、查询参数或登录信息。");
            return false;
          } else {
            return true;
          }
        },
      },
    });

    const keyInput = new InputLikeView({
      props: {
        placeholder: "粘贴 64 位主密钥",
        secure: true,
      },
      events: {
        checkInput: (text) => {
          if (!/^[0-9a-f]{64}$/.test(text)) {
            $ui.alert("主密钥应为 64 位小写十六进制字符，请粘贴部署时填写的 MASTER_KEY。");
            return false;
          } else {
            return true;
          }
        },
      },
    });

    const setup = new Column(
      [
        text("02  连接你的云", 27, true, palette.accent),
        card(
          [
            text("部署引导 · GitHub Pages", 17, true),
            text(
              "准备好 GitHub 与 Cloudflare 账户。在引导页生成主密钥，部署时填入 MASTER_KEY，完成后复制 Worker 地址。",
              13,
              false,
              palette.muted,
            ),
            link("前往 GitHub Pages 部署 ↗", links.deploy),
          ],
          true,
        ),
        card([
          text("填写连接信息", 17, true),
          text("设备名", 12, true),
          { view: nameInput.definition, height: () => 46 },
          text("API · Worker HTTPS 根地址", 12, true),
          { view: apiInput.definition, height: () => 46 },
          text("主密钥 · 部署时的 MASTER_KEY", 12, true),
          { view: keyInput.definition, height: () => 46 },
          text("加入同步的其他设备上也填写相同的API和主密钥。", 12, false, palette.accent),
        ]),
      ],
      12,
    );
    const selectionList = new SyncContentList();
    const selectionPage = new Column(
      [
        text("03  选择同步内容", 27, true, palette.accent),
        text("你可以自由选择本设备与云端同步的内容。", 14, false, palette.muted),
        text(
          "本应用不保存网站的账号密码，所以不同账号的数据也可以同步，这种情况下建议关闭图库收藏状态和图库评分的同步。",
          12,
          false,
          palette.muted,
        ),
        // 列表拥有独立的有限视口，不把全部行撑进 WelcomeView 的外层滚动区。
        {
          view: selectionList.definition,
          height: () => Math.max(160, Math.min(429, (this.view?.frame.height ?? 740) - 350)),
        },
      ],
      12,
    );
    // 三页使用同一正文高度，WelcomeView 居中计算得到相同的顶部位置。
    // 每次按当前宽度重新测量，兼容文本换行、横竖屏及第三页列表视口变化。
    const sharedContentHeight = (width: number) =>
      Math.max(intro.heightToWidth(width), setup.heightToWidth(width), selectionPage.heightToWidth(width));
    super({
      props: {
        bgcolor: palette.background,
        horizontalInset: 24,
        maxContentWidth: 440,
        leadingSymbol: "chevron.left",
        leadingSymbolColor: palette.muted,
        pages: [
          {
            content: intro,
            contentHeight: sharedContentHeight,
            buttons: [button("我已了解", () => this.scrollToPage(1))],
          },
          {
            content: setup,
            contentHeight: sharedContentHeight,
            buttons: [button("下一步", () => this.scrollToPage(2))],
          },
          {
            content: selectionPage,
            contentHeight: sharedContentHeight,
            buttons: [
              button("开始连接", async (sender) => {
                const deviceName = nameInput.text.trim();
                const endpoint = apiInput.text;
                const masterKey = keyInput.text;
                if (!deviceName || deviceName.length > 32 || !endpoint || !masterKey) {
                  $ui.alert("请填写连接信息，设备名需为 1～32 个字符。");
                  return;
                }
                const selectedTables = selectionList.selectedTables;
                if (!selectedTables || selectedTables.length === 0) {
                  $ui.alert("请选择要同步的内容");
                  return;
                }
                sender.title = "验证登录信息...";
                sender.enabled = false;
                try {
                  const success = await finishHandler(this, { deviceName, endpoint, masterKey, selectedTables });
                  if (success) {
                    sender.title = "连接成功，请稍候……";
                    // 导航生命周期由调用方负责。
                  } else {
                    $ui.alert("验证失败，请检查连接信息后重试。");
                    sender.title = "开始连接";
                    sender.enabled = true;
                  }
                } catch (error) {
                  syncLog("connection_error", { error }, "error", masterKey);
                  $ui.alert(syncErrorMessage(error));
                  sender.title = "开始连接";
                  sender.enabled = true;
                }
              }),
            ],
          },
        ],
      },
      layout: $layout.fill,
      events: {
        leadingTapped: (sender) => (sender.page > 0 ? sender.scrollToPage(sender.page - 1) : $ui.pop()),
      },
    });
  }
}
