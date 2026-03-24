import {
  Base,
  BaseController,
  CustomNavigationBar,
  DynamicPreferenceListView,
  DynamicRowHeightList,
  PrefsRow,
  PreferenceSection,
} from "jsbox-cview";
import { BlankView } from "../components/blank-view-for-dynamic-rowheight-list";
import { AITranslationService } from "../types";
import { showIntroductionSheet } from "../components/show-introduction-sheet";
import { aiTranslationIntroductionPath } from "../utils/glv";
import { CONFIG_FORM_TEMPLATE, DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT } from "../ai-translations/preset";
import {
  validateUserCustomConfigFormText,
  validateUserCustomScriptText,
} from "../ai-translations/user-custom-validation";

const DESCRIPTION = `在本页面你可以设置自定义 AI 翻译服务。你需要提供两部分内容：

1. 一个匿名异步函数，用来接收图片并返回翻译后的图片。
2. 一个可选的配置表单定义，用来让常用参数可以在界面中直接修改。

如果提供了配置表单定义，请点击对应区域的“应用”按钮，会在下方生成配置表单。

点击右上方问号可以查看更详细的说明文档。在一切完成后，请记得点击保存按钮。`;

function mapTranslationConfigRows(service: Pick<AITranslationService, "configForm" | "config">): PrefsRow[] {
  return (service.configForm ?? []).map((item) => {
    const value = Object.prototype.hasOwnProperty.call(service.config ?? {}, item.key)
      ? service.config?.[item.key]
      : item.default;

    switch (item.type) {
      case "string":
        return {
          type: "string",
          title: item.title,
          key: item.key,
          value,
        };
      case "integer":
        return {
          type: "integer",
          title: item.title,
          key: item.key,
          min: item.min,
          max: item.max,
          value,
        };
      case "boolean":
        return {
          type: "boolean",
          title: item.title,
          key: item.key,
          value,
        };
      case "list":
        return {
          type: "list",
          title: item.title,
          key: item.key,
          items: item.items,
          value,
        };
    }
  });
}

class DynamicPreferenceListViewWithoutSectionTitle extends DynamicPreferenceListView {
  constructor({
    sections,
    props,
    layout,
    events,
  }: {
    sections: PreferenceSection[];
    props: UiTypes.ListProps;
    layout?: (make: MASConstraintMaker, view: UIListView) => void;
    events?: {
      changed?: (values: any) => void;
    };
  }) {
    super({
      sections,
      props: {
        ...props,
        style: 2,
        rowHeight: 44,
        scrollEnabled: false,
      },
      layout,
      events,
    });
  }

  heightToWidth(width: number): number {
    const rowCounts = this.sections.reduce((prev, curr) => prev + curr.rows.length, 0);
    return this.sections.length * 35 + 35 + 44 * rowCounts;
  }
}

class InfoCard extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  constructor() {
    super();
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        bgcolor: $color("clear"),
      },
      layout: $layout.fill,
      views: [
        {
          type: "view",
          props: {
            bgcolor: $color("secondarySurface"),
            smoothCorners: true,
            cornerRadius: 12,
          },
          layout: (make, view) => {
            make.left.right.inset(16);
            make.top.bottom.inset(0);
          },
          views: [
            {
              type: "label",
              props: {
                id: this.id + "-title",
                text: "简要说明",
                textColor: $color("primaryText"),
                font: $font("bold", 18),
              },
              layout: (make) => {
                make.left.right.inset(18);
                make.top.inset(16);
                make.height.equalTo(24);
              },
            },
            {
              type: "label",
              props: {
                id: this.id + "-summary",
                textColor: $color("secondaryText"),
                font: $font(13),
                lines: 0,
                text: DESCRIPTION,
              },
              layout: (make, view) => {
                make.left.right.inset(18);
                make.top.equalTo(view.prev.bottom).offset(8);
                make.bottom.inset(18);
              },
            },
          ],
        },
      ],
    });
  }

  heightToWidth(width: number): number {
    const fixedHeight = 16 + 24 + 8 + 18; // 上内边距 + 标题高度 + 标题与内容间距 + 内容与底部间距
    return (
      Math.ceil(
        $text.sizeThatFits({
          text: DESCRIPTION,
          width: width - 16 * 2 - 18 * 2,
          font: $font(13),
        }).height,
      ) + fixedHeight
    );
  }
}

class CodeEditorCard extends Base<UIView, UiTypes.ViewOptions> {
  private _summary: string;
  private _editing: boolean = false;
  private _type: "script" | "schema";
  _defineView: () => UiTypes.ViewOptions;
  constructor({
    title,
    summary,
    text,
    template,
    type,
    checkButtonTitle,
    checkHandler,
  }: {
    title: string;
    summary: string;
    text: string;
    template: string;
    type: "script" | "schema";
    checkButtonTitle: string;
    checkHandler: () => void;
  }) {
    super();
    this._summary = summary;
    this._type = type;
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
        bgcolor: $color("clear"),
      },
      layout: $layout.fill,
      views: [
        {
          type: "view",
          props: {
            bgcolor: $color("secondarySurface"),
            smoothCorners: true,
            cornerRadius: 12,
          },
          layout: (make, view) => {
            make.left.right.inset(16);
            make.top.bottom.inset(0);
          },
          views: [
            {
              type: "label",
              props: {
                id: this.id + "-title",
                text: title,
                textColor: $color("primaryText"),
                font: $font("bold", 18),
              },
              layout: (make) => {
                make.left.right.inset(18);
                make.top.inset(16);
                make.height.equalTo(24);
              },
            },
            {
              type: "code",
              props: {
                id: this.id + "-editor",
                language: this._type === "script" ? "javascript" : "json",
                text,
                smoothCorners: true,
                cornerRadius: 12,
              },
              layout: (make, view) => {
                make.left.right.inset(18);
                make.height.equalTo(352);
                make.bottom.inset(18);
              },
              events: {
                didChange: (sender) => {
                  this._editing = true;
                },
              },
            },
            {
              // 按钮区
              type: "stack",
              props: {
                spacing: 12,
                distribution: $stackViewDistribution.fillEqually,
                stack: {
                  views: [
                    {
                      type: "button",
                      props: {
                        title: "清空",
                        titleColor: $color("red"),
                        borderColor: $color("red"),
                        borderWidth: 1,
                        bgcolor: $color("clear"),
                        font: $font(13),
                        smoothCorners: true,
                        cornerRadius: 8,
                      },
                      events: {
                        tapped: (sender) => {
                          $ui.alert({
                            title: "确认清空吗？",
                            actions: [
                              {
                                title: "取消",
                                handler: () => {},
                              },
                              {
                                title: "确定",
                                handler: () => {
                                  this.code = "";
                                  this._editing = true;
                                },
                              },
                            ],
                          });
                        },
                      },
                    },
                    {
                      type: "button",
                      props: {
                        title: "插入模板",
                        titleColor: $color("systemLink"),
                        borderColor: $color("systemLink"),
                        borderWidth: 1,
                        bgcolor: $color("clear"),
                        font: $font(13),
                        smoothCorners: true,
                        cornerRadius: 8,
                      },
                      events: {
                        tapped: (sender) => {
                          $ui.alert({
                            title: "要插入模板吗？",
                            message: "这样会清空现有内容",
                            actions: [
                              {
                                title: "取消",
                                handler: () => {},
                              },
                              {
                                title: "确定",
                                handler: () => {
                                  this.code = template;
                                  this._editing = true;
                                },
                              },
                            ],
                          });
                        },
                      },
                    },
                    {
                      type: "button",
                      props: {
                        title: checkButtonTitle,
                        titleColor: $color("systemLink"),
                        borderColor: $color("systemLink"),
                        borderWidth: 1,
                        bgcolor: $color("clear"),
                        font: $font(13),
                        smoothCorners: true,
                        cornerRadius: 8,
                      },
                      events: {
                        tapped: (sender) => {
                          const r = this.validationInfo;
                          if (!r.ok) {
                            $ui.alert({
                              title: "错误",
                              message: r.issues?.at(0)?.message,
                              actions: [
                                {
                                  title: "好的",
                                },
                              ],
                            });
                          } else {
                            this._editing = false;
                            if (this._type === "script") {
                              this.code = r.normalizedScriptText || "";
                            } else {
                              this.code = r.configForm ? JSON.stringify(r.configForm, null, 2) : "";
                            }
                            checkHandler();
                          }
                        },
                      },
                    },
                  ],
                },
              },
              layout: (make, view) => {
                make.left.inset(18);
                make.right.lessThanOrEqualTo(view.super).inset(18).priority(1000);
                make.width.equalTo(500).priority(999);
                make.bottom.equalTo(view.prev.top).inset(8);
                make.height.equalTo(34);
              },
            },
            {
              type: "view",
              props: {},
              layout: (make, view) => {
                make.left.right.inset(18);
                make.bottom.equalTo(view.prev.top).inset(8);
                make.top.equalTo(view.prev.prev.prev.bottom).inset(8);
              },
              views: [
                {
                  type: "label",
                  props: {
                    id: this.id + "-summary",
                    textColor: $color("secondaryText"),
                    font: $font(13),
                    lines: 0,
                    text: summary,
                  },
                  layout: (make, view) => {
                    make.left.right.top.inset(0);
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  }

  heightToWidth(width: number): number {
    const fixedHeight = 16 + 24 + 8 + 8 + 34 + 8 + 352 + 18;
    return (
      Math.ceil(
        $text.sizeThatFits({
          text: this._summary,
          width: width - 16 * 2 - 18 * 2,
          font: $font(13),
        }).height,
      ) + fixedHeight
    );
  }

  get editing() {
    return this._editing;
  }

  get valid() {
    if (this._type === "script") {
      return validateUserCustomScriptText(this.code).ok;
    } else {
      return validateUserCustomConfigFormText(this.code).ok;
    }
  }

  get validationInfo() {
    if (this._type === "script") {
      return validateUserCustomScriptText(this.code);
    } else {
      return validateUserCustomConfigFormText(this.code);
    }
  }

  get code() {
    return ($(this.id + "-editor") as UICodeView).text;
  }

  set code(text: string) {
    ($(this.id + "-editor") as UICodeView).text = text;
  }
}

class AITranslationConfigEditorController extends BaseController {
  private _serviceNameKey: string = "__service_name__";
  private _serviceName: string;
  cviews: {
    navbar: CustomNavigationBar;
    infoCard: InfoCard;
    scriptEditor: CodeEditorCard;
    schemaEditor: CodeEditorCard;
    list: DynamicRowHeightList;
    infoList: DynamicPreferenceListViewWithoutSectionTitle;
  };
  constructor(
    service: AITranslationService,
    resolve: (service: AITranslationService) => void,
    reject: (reason?: any) => void,
  ) {
    let settled = false;
    super({
      props: {
        bgcolor: $color("insetGroupedBackground"),
      },
      events: {
        didRemove: () => {
          if (!settled) {
            settled = true;
            reject("cancel");
          }
        },
      },
    });

    this._serviceName = service.name;

    const navbar = new CustomNavigationBar({
      props: {
        title: "编辑服务",
        popButtonEnabled: true,
        rightBarButtonItems: [
          {
            symbol: "questionmark.circle",
            handler: () => {
              showIntroductionSheet(aiTranslationIntroductionPath, "自定义 AI 翻译");
            },
          },
          {
            symbol: "checkmark",
            handler: () => {
              if (this.cviews.scriptEditor.editing) {
                $ui.error("脚本未校验");
                return;
              }
              if (this.cviews.schemaEditor.editing) {
                $ui.error("配置表单定义未应用");
                return;
              }
              const scriptValidation = validateUserCustomScriptText(this.cviews.scriptEditor.code);
              if (!scriptValidation.ok) {
                $ui.error("脚本存在错误");
                return;
              }
              const schemaValidation = validateUserCustomConfigFormText(this.cviews.schemaEditor.code);
              if (!schemaValidation.ok) {
                $ui.error("配置表单定义存在错误");
                return;
              }

              const values = this.cviews.infoList.values as {
                [key: string]: any;
              };
              const name = values[this._serviceNameKey] as string;
              delete values[this._serviceNameKey];

              settled = true;
              resolve({
                id: service.id,
                name,
                selected: service.selected,
                scriptText: scriptValidation.normalizedScriptText || "",
                configForm: schemaValidation.configForm,
                config: schemaValidation.configForm?.length ? values : undefined,
              });
              $ui.pop();
            },
          },
        ],
      },
    });

    const infoCard = new InfoCard();

    const sections = this._map(service);

    const infoList = new DynamicPreferenceListViewWithoutSectionTitle({
      sections,
      props: {
        bgcolor: $color("clear"),
      },
      layout: $layout.fill,
      events: {
        changed: (values) => {
          this._serviceName = values[this._serviceNameKey] as string;
        },
      },
    });

    const scriptEditor = new CodeEditorCard({
      title: "1. 脚本",
      summary: "你需要自行实现一个匿名异步函数完成翻译功能。填写完成后请点击“校验”。",
      text: service.scriptText,
      template: DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT,
      type: "script",
      checkButtonTitle: "校验",
      checkHandler: () => {},
    });

    const schemaEditor = new CodeEditorCard({
      title: "2. 配置表单定义",
      summary: "你可以额外提供一个 JSON 数组来描述配置表单定义。填写完成后请点击“应用”，会在上方生成对应的配置表单。",
      text: service.configForm ? JSON.stringify(service.configForm, null, 2) : "",
      template: CONFIG_FORM_TEMPLATE,
      type: "schema",
      checkButtonTitle: "应用",
      checkHandler: () => {
        this.cviews.infoList.sections = this._map({
          name: this._serviceName,
          configForm: this.cviews.schemaEditor.validationInfo.configForm,
        });
      },
    });

    const list = new DynamicRowHeightList({
      rows: [new BlankView(35), infoCard, infoList, scriptEditor, new BlankView(35), schemaEditor, new BlankView(350)],
      props: {
        separatorHidden: true,
        bgcolor: $color("clear"),
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.inset(0);
      },
      events: {},
    });

    this.cviews = {
      navbar,
      infoCard,
      scriptEditor,
      schemaEditor,
      infoList,
      list,
    };
    this.rootView.views = [navbar, list];
  }

  _map(service: Pick<AITranslationService, "name" | "configForm" | "config">) {
    const sections: PreferenceSection[] = [
      {
        title: "",
        rows: [
          {
            type: "string",
            title: "名称",
            key: this._serviceNameKey,
            value: service.name,
          },
        ],
      },
    ];
    if (service.configForm && service.configForm.length) {
      sections.push({
        title: "",
        rows: mapTranslationConfigRows(service),
      });
    }
    return sections;
  }
}

export function editAITranslationService(service: AITranslationService) {
  return new Promise<AITranslationService>((resolve, reject) => {
    const controller = new AITranslationConfigEditorController(service, resolve, reject);
    controller.uipush({
      navBarHidden: true,
      statusBarStyle: 0,
    });
  });
}
