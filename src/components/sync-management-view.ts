import { Base } from "jsbox-cview";
export const syncColors = {
  background: $color("#FAF8F5", "#171614"),
  card: $color("#FFFFFF", "#24221F"),
  ink: $color("#26231F", "#F7F2EA"),
  muted: $color("#726B62", "#B9B0A4"),
  orange: $color("#B94B16", "#FFAC75"),
  tint: $color("#FBEBDD", "#38291F"),
  danger: $color("#BD3939", "#FF8E89"),
};
/** 标题与说明组成的操作行，可用于冲突、日志和设备列表。 */
export class SyncActionRowView extends Base<UIView, UiTypes.ViewOptions> {
  protected _defineView: () => UiTypes.ViewOptions;
  constructor({
    props,
    layout = $layout.fill,
    events = {},
  }: {
    props: {
      title: string;
      detail: string;
      danger?: boolean;
    };
    layout?: (make: MASConstraintMaker, view: UIView) => void;
    events?: {
      tapped?: () => void;
    };
  }) {
    super();
    const { title, detail, danger = false } = props;
    const action = events.tapped;
    this._defineView = () => ({
      type: "view",
      props: { bgcolor: syncColors.card },
      layout,
      events: action ? { tapped: action } : {},
      views: [
        {
          type: "label",
          props: { text: action ? "›" : "", font: $font(24), textColor: syncColors.muted },
          layout: (make, view) => {
            make.right.inset(16);
            make.width.equalTo(16);
            make.centerY.equalTo(view.super);
            make.height.equalTo(28);
          },
        },
        {
          type: "label",
          props: {
            text: title,
            font: $font("bold", 16),
            lines: 0,
            textColor: danger ? syncColors.danger : syncColors.ink,
          },
          layout: (make) => {
            make.left.inset(16);
            make.right.inset(40);
            make.top.inset(15);
          },
        },
        {
          type: "label",
          props: { text: detail, font: $font(13), lines: 0, textColor: syncColors.muted },
          layout: (make, view) => {
            make.left.inset(16);
            make.right.inset(40);
            make.top.equalTo(view.prev.bottom).offset(6);
            make.bottom.inset(15);
          },
        },
      ],
    });
    this.heightToWidth = (width) =>
      36 +
      Math.ceil($text.sizeThatFits({ text: title, width: Math.max(1, width - 56), font: $font("bold", 16) }).height) +
      Math.ceil($text.sizeThatFits({ text: detail, width: Math.max(1, width - 56), font: $font(13) }).height);
  }
  readonly heightToWidth: (width: number) => number;
}
/** 管理页统一的主、次操作按钮。 */
export class SyncActionButtonView extends Base<UIButtonView, UiTypes.ButtonOptions> {
  protected _defineView: () => UiTypes.ButtonOptions;
  constructor({
    props,
    layout = $layout.fill,
    events = {},
  }: {
    props: {
      title: string;
      secondary?: boolean;
      enabled?: boolean;
    };
    layout?: (make: MASConstraintMaker, view: UIButtonView) => void;
    events?: {
      tapped?: () => void;
    };
  }) {
    super();
    const { title, secondary = false, enabled = true } = props;
    const action = events.tapped;
    this._defineView = () => ({
      type: "button",
      layout,
      props: {
        title,
        enabled,
        font: $font("bold", 15),
        cornerRadius: 13,
        bgcolor: secondary ? syncColors.tint : syncColors.ink,
        titleColor: secondary ? syncColors.orange : syncColors.background,
        alpha: enabled ? 1 : 0.4,
      },
      events: { tapped: action },
    });
  }
}
export interface SyncStatusProps {
  joined: boolean;
  running: boolean;
  paused: boolean;
  fullDownload: boolean;
  upload: number;
  download: number;
  conflictCount: number;
  lastSync: string;
  message?: string;
  pauseRequested?: boolean;
  downloadLabel?: string;
}
/** 同步状态、三项数量和操作按钮，只展示外部传入的状态。 */
export class SyncStatusView extends Base<UIView, UiTypes.ViewOptions> {
  protected _defineView: () => UiTypes.ViewOptions;
  readonly heightToWidth = (_width: number) => 230;
  constructor({
    props,
    layout = $layout.fill,
    events = {},
  }: {
    props: SyncStatusProps;
    layout?: (make: MASConstraintMaker, view: UIView) => void;
    events?: {
      primaryTapped?: () => void;
      pauseTapped?: () => void;
      conflictsTapped?: () => void;
    };
  }) {
    super();
    const title = !props.joined
      ? "尚未连接云同步"
      : props.running
        ? props.fullDownload
          ? "正在完整下载"
          : "正在同步"
        : props.paused
          ? "同步已暂停"
          : props.conflictCount
            ? "有内容需要你决定"
            : "已准备好同步";
    const subtitle = !props.joined
      ? "本机数据仍然保留，可重新加入云同步。"
      : props.running
        ? props.message || "正在处理同步数据…"
        : props.message || `上次同步 · ${props.lastSync}`;
    const start = new SyncActionButtonView({
      props: {
        title: !props.joined ? "重新加入同步" : props.running ? "同步中…" : props.paused ? "继续同步" : "立即同步",
        secondary: false,
        enabled: !props.running,
      },
      events: {
        tapped: () => events.primaryTapped?.(),
      },
    });
    const pause = new SyncActionButtonView({
      props: {
        title: props.pauseRequested ? "正在暂停…" : props.paused ? "已暂停" : "暂停同步",
        secondary: true,
        enabled: props.joined && props.running && !props.pauseRequested,
      },
      events: {
        tapped: () => events.pauseTapped?.(),
      },
    });
    this._defineView = () => ({
      type: "view",
      props: { bgcolor: syncColors.card },
      layout,
      views: [
        {
          type: "view",
          props: {},
          layout: (make) => {
            make.edges.inset(0);
            make.height.equalTo(230);
          },
          views: [
            {
              type: "label",
              props: { text: title, font: $font("bold", 21), textColor: syncColors.ink },
              layout: (make) => {
                make.left.right.inset(18);
                make.top.inset(20);
                make.height.equalTo(28);
              },
            },
            {
              type: "label",
              props: { text: subtitle, font: $font(12), textColor: syncColors.muted },
              layout: (make) => {
                make.left.right.inset(18);
                make.top.inset(54);
                make.height.equalTo(20);
              },
            },
            ...[
              [props.upload, "待上传"],
              [props.download, props.downloadLabel ?? "本轮下载"],
              [props.conflictCount, "冲突"],
            ].map(
              ([value, label], index): UiTypes.ViewOptions => ({
                type: "view",
                props: {},
                layout: (make, view) => {
                  make.width.equalTo(view.super).dividedBy(3);
                  make.centerX.equalTo(view.super).multipliedBy((index * 2 + 1) / 3);
                  make.top.inset(91);
                  make.height.equalTo(60);
                },
                events: index === 2 && props.joined ? { tapped: () => events.conflictsTapped?.() } : {},
                views: [
                  {
                    type: "label",
                    props: {
                      text: props.joined ? String(value) : "—",
                      font: $font("bold", 29),
                      align: $align.center,
                      textColor: index === 2 && Number(value) > 0 ? syncColors.orange : syncColors.ink,
                    },
                    layout: (make) => {
                      make.left.top.right.inset(0);
                      make.height.equalTo(36);
                    },
                  },
                  {
                    type: "label",
                    props: { text: String(label), font: $font(12), align: $align.center, textColor: syncColors.muted },
                    layout: (make) => {
                      make.left.right.bottom.inset(0);
                      make.height.equalTo(18);
                    },
                  },
                ],
              }),
            ),
            {
              ...start.definition,
              layout: (make: MASConstraintMaker, view: UIButtonView) => {
                make.left.inset(16);
                make.right.equalTo(view.super.centerX).offset(-5);
                make.bottom.inset(16);
                make.height.equalTo(46);
              },
            },
            {
              ...pause.definition,
              layout: (make: MASConstraintMaker, view: UIButtonView) => {
                make.left.equalTo(view.super.centerX).offset(5);
                make.right.inset(16);
                make.bottom.inset(16);
                make.height.equalTo(46);
              },
            },
          ],
        },
      ],
    });
  }
}
type SyncRowView = SyncActionRowView | SyncStatusView;
export interface SyncManagementSection {
  title: string;
  rows: SyncRowView[];
}
/** 分组列表：将 CView 转为原生模板与属性绑定，事件留在 JS 内。 */
export class SyncManagementListView extends Base<UIListView, UiTypes.ListOptions> {
  protected _defineView: () => UiTypes.ListOptions;
  private _sections: SyncManagementSection[];
  private actions = new Map<string, (sender: any) => void>();
  private nextActionId = 0;
  constructor({
    props,
    layout = $layout.fill,
    events = {},
  }: {
    props: {
      sections: SyncManagementSection[];
    };
    layout?: (make: MASConstraintMaker, view: UIListView) => void;
    events?: {
      actionFailed?: (error: unknown) => void;
    };
  }) {
    super();
    this._sections = props.sections;
    const template = (component: SyncRowView, prefix: string) => {
      const definition = component.definition;
      let index = 0;
      const visit = (view: UiTypes.AllViewOptions) => {
        view.props = { ...view.props, id: `${prefix}-${index++}` };
        // 普通行统一由 didSelect 处理。状态卡只给真正的操作控件绑定手势，
        // 不给文字标签添加空手势，以免吞掉整行或父控件的点击。
        const interactive = prefix === "status" && !!view.events?.tapped;
        if (prefix === "detail") view.props.userInteractionEnabled = false;
        view.events = interactive
          ? {
              tapped: async (sender: UIBaseView) => {
                const id = sender.info?.actionId;
                if (typeof id !== "string") return;
                try {
                  await this.actions.get(id)?.(sender);
                } catch (error) {
                  events.actionFailed?.(error);
                }
              },
            }
          : undefined;
        if ("views" in view) view.views?.forEach(visit);
      };
      visit(definition);
      definition.layout = $layout.fill;
      return definition;
    };
    this._defineView = () => ({
      type: "list",
      props: {
        style: 2,
        bgcolor: syncColors.background,
        selectable: true,
        template: {
          props: { bgcolor: syncColors.card },
          views: [
            template(
              new SyncStatusView({
                props: {
                  joined: true,
                  running: false,
                  paused: false,
                  fullDownload: false,
                  upload: 0,
                  download: 0,
                  conflictCount: 0,
                  lastSync: "",
                },
              }),
              "status",
            ),
            template(new SyncActionRowView({ props: { title: "", detail: "" } }), "detail"),
          ],
        },
        data: this.listData(),
      },
      layout,
      events: {
        didSelect: async (sender, _indexPath, data) => {
          const id = data["detail-0"]?.info?.actionId;
          if (typeof id !== "string") return;
          try {
            await this.actions.get(id)?.(sender);
          } catch (error) {
            events.actionFailed?.(error);
          }
        },
        rowHeight: (sender, indexPath) =>
          this._sections[indexPath.section].rows[indexPath.row].heightToWidth(Math.max(1, sender.frame.width - 40)),
      },
    });
  }
  private listData() {
    this.actions.clear();
    return this._sections.map((section) => ({
      title: section.title,
      rows: section.rows.map((component) => {
        const prefix = component instanceof SyncStatusView ? "status" : "detail";
        const data: Record<string, UiTypes.BaseViewProps> = {
          "status-0": { hidden: prefix !== "status" },
          "detail-0": { hidden: prefix !== "detail" },
        };
        let index = 0;
        const visit = (view: UiTypes.AllViewOptions) => {
          const id = `${prefix}-${index++}`;
          const action = view.events?.tapped;
          const actionId = action ? String(++this.nextActionId) : "";
          if (action) this.actions.set(actionId, action);
          // 不把 CView 自动生成的 id 回写模板，不向原生传递函数。
          const { id: _id, ...props } = view.props ?? {};
          data[id] = { ...props, hidden: false, info: { actionId } };
          if ("views" in view) view.views?.forEach(visit);
        };
        visit(component.definition);
        return data;
      }),
    }));
  }
  set sections(sections: SyncManagementSection[]) {
    this._sections = sections;
    if (!this.view) return;
    const offset = this.view.contentOffset;
    this.view.data = this.listData();
    this.view.contentOffset = offset;
  }
  updateProgress(message: string, downloaded: number) {
    const cell = this.view?.cell($indexPath(0, 0));
    if (!cell) return;
    const subtitle = cell.get("status-3") as UILabelView;
    const count = cell.get("status-8") as UILabelView;
    if (subtitle) subtitle.text = message;
    if (count) count.text = String(downloaded);
  }
  dispose() {
    this.actions.clear();
  }
}
