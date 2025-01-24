import { Base, BaseController, ContentView, CustomNavigationBar, DynamicPreferenceListView, DynamicRowHeightList, Markdown, PreferenceSection, Sheet, SymbolButton, Text } from "jsbox-cview";
import * as MangaImageTranslator from "../ai-translations/manga-image-translator";
import * as CotransTouhouAi from "../ai-translations/cotrans-touhou-ai";
import * as UserCustom from "../ai-translations/user-custom";
import { configManager } from "../utils/config";

const serviceTitles = [MangaImageTranslator, CotransTouhouAi, UserCustom]
  .map((service) => service.config.title);

const serviceNames = [MangaImageTranslator, CotransTouhouAi, UserCustom]
  .map((service) => service.config.name);

function getDefaultConfig(serviceName: string) {
  switch (serviceName) {
    case "manga-image-translator":
      return MangaImageTranslator.config;
    case "cotrans.touhou.ai":
      return CotransTouhouAi.config;
    case "user-custom":
      return UserCustom.config;
    default:
      throw new Error("service not found");
  }
}

/**
 * 为DynamicPreferenceListView添加一个heightToWidth方法，前提是section没有title
 */
class DynamicPreferenceListViewWithoutSectionTitle extends DynamicPreferenceListView {
  constructor({ sections, props, layout, events }: {
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
        scrollEnabled: false
      },
      layout,
      events
    });

  }

  heightToWidth(width: number): number {
    const rowCounts = this.sections.reduce((prev, curr) => prev + curr.rows.length, 0);
    return this.sections.length * 35 + 35 + 44 * rowCounts;
  }
}

class CustomText extends Base<UIView, UiTypes.ViewOptions> {
  private _visible: boolean;
  _defineView: () => UiTypes.ViewOptions;
  constructor({ text, visible, didBeginEditingHandler }: {
    text: string,
    visible: boolean,
    didBeginEditingHandler: (sender: UICodeView) => void
  }) {
    super();
    this._visible = visible;
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("clear"),
        },
        layout: $layout.fill,
        views: [{
          type: "code",
          props: {
            id: this.id + "text",
            smoothCorners: true,
            cornerRadius: 12,
            hidden: !visible,
            text,
          },
          layout: (make, view) => {
            make.left.right.inset(16);
            make.top.bottom.inset(0);
          },
          events: {
            didBeginEditing: (sender) => {
              didBeginEditingHandler(sender);
            }
          }
        }]
      }
    }
  }

  get visible() {
    return this._visible;
  }

  set visible(visible: boolean) {
    this._visible = visible;
    ($(this.id + "text") as UITextView).blur();
    ($(this.id + "text") as UITextView).hidden = !visible;
  }

  set text(text: string) {
    ($(this.id + "text") as UITextView).text = text;
  }

  get text() {
    return ($(this.id + "text") as UITextView).text;
  }

  heightToWidth(width: number) {
    return this._visible ? 300 : 1;
  }
}


class CustomBlankView extends Base<UIView, UiTypes.ViewOptions> {
  private _visible: boolean;
  _defineView: () => UiTypes.ViewOptions;
  constructor({
    visible
  }: {
    visible: boolean
  }) {
    super();
    this._visible = visible;
    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
          bgcolor: $color("clear"),
        },
        layout: $layout.fill,
        views: []
      }
    }
  }

  get visible() {
    return this._visible;
  }

  set visible(visible: boolean) {
    this._visible = visible;
  }

  heightToWidth(width: number) {
    return this._visible ? 350 : 0.1;
  }
}

class AITranslationConfigController extends BaseController {
  private _selectedService: string;
  cviews: {
    navbar: CustomNavigationBar;
    dynamicPreferenceListView: DynamicPreferenceListViewWithoutSectionTitle;
    textView: CustomText;
    list: DynamicRowHeightList;
  }
  constructor(resolveHandler: () => void, rejectHandler: () => void) {
    super({
      props: { bgcolor: $color("insetGroupedBackground") },
      events: {
        didRemove: () => { rejectHandler() }
      }
    });
    // 获取用户选择的AI翻译服务, 默认为用户自定义
    this._selectedService = configManager.selectedAiTranslationService || UserCustom.config.name;
    if (!serviceNames.includes(this._selectedService)) {
      this._selectedService = UserCustom.config.name;
    }

    const navbar = new CustomNavigationBar({
      props: {
        title: "AI翻译设置",
        popButtonEnabled: true,
        rightBarButtonItems: [{
          title: "保存",
          handler: () => {
            resolveHandler();
            $ui.pop();
          }
        }]
      }
    });

    const dynamicPreferenceListView = new DynamicPreferenceListViewWithoutSectionTitle({
      sections: this._generateSections(),
      props: {
        bgcolor: $color("clear")
      },
      layout: $layout.fill,
      events: {
        changed: (values) => {
          const selectedService = serviceNames[values.selectedAiTranslationService];
          if (this._selectedService !== selectedService) {
            this._selectedService = selectedService;
            dynamicPreferenceListView.sections = this._generateSections();
            textView.visible = this._selectedService === "user-custom";
            blankView.visible = this._selectedService === "user-custom";
            list.view.reload();
          }
        }
      }
    });

    const textView = new CustomText({
      text: this._generateDefaultScriptText(),
      visible: this._selectedService === "user-custom",
      didBeginEditingHandler: s => {
        list.view.scrollToOffset($point(0, 44 * 2 + 35 * 2));
      }
    });

    const blankView = new CustomBlankView({
      visible: this._selectedService === "user-custom"
    });

    const list = new DynamicRowHeightList({
      rows: [dynamicPreferenceListView, textView, blankView],
      props: {
        separatorHidden: true,
        bgcolor: $color("clear")
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.inset(0);
      },
      events: {}
    })
    this.cviews = {
      navbar,
      dynamicPreferenceListView,
      textView,
      list
    }
    this.rootView.views = [navbar, list]
  }

  private _showIntroduction() {
    const config = getDefaultConfig(this._selectedService);
    showIntroduction(config.description, config.title);
  }

  private _generateDefaultScriptText() {
    const defaultText = `async (imageData) => {
  // 在此处编写自定义翻译的逻辑
  // 此函数将使用eval()直接运行，请只修改函数内的部分
  return newImageData;
}`;
    const userConfig = configManager.aiTranslationServiceConfig;
    if (!userConfig || !("user-custom" in userConfig)) {
      return defaultText;
    }
    const userConfigForService = userConfig["user-custom"];
    if (userConfigForService.scriptText) {
      return userConfigForService.scriptText;
    } else {
      return defaultText;
    }
  }

  private _mergeConfigWithDefaults() {
    // 先获取默认配置
    const defaultRows = getDefaultConfig(this._selectedService).rows;
    // 获取用户配置
    const userConfig = configManager.aiTranslationServiceConfig;
    if (!userConfig || !(this._selectedService in userConfig)) {
      return defaultRows;
    }
    const userConfigForService = userConfig[this._selectedService];
    // 合并配置
    // 1. 拷贝默认配置
    const newRows = defaultRows.map(row => ({ ...row }));
    // 2. 替换默认配置
    for (const row of newRows) {
      if (row.key && (row.key in userConfigForService)) {
        row.value = userConfigForService[row.key];
      }
    }
    return newRows;
  }

  private _getUserCustomAllowConcurrentRequests() {
    const userConfig = configManager.aiTranslationServiceConfig;
    if (!userConfig || !("user-custom" in userConfig)) {
      return false;
    }
    const userConfigForService = userConfig["user-custom"];
    if (userConfigForService.allowConcurrentRequests) {
      return userConfigForService.allowConcurrentRequests as boolean;
    } else {
      return false;
    }
  }

  private _generateSections(): PreferenceSection[] {
    if (this._selectedService === "user-custom") {
      return [{
        title: "",
        rows: [
          {
          type: "list",
          title: "服务",
          key: "selectedAiTranslationService",
          items: serviceTitles,
          value: serviceNames.indexOf(this._selectedService),
        },
        {
          type: "action",
          title: "查看指南",
          value: () => { this._showIntroduction() }
        },
        {
          type: "boolean",
          title: "允许并发请求",
          key: "allowConcurrentRequests",
          value: this._getUserCustomAllowConcurrentRequests()
        }
        ]
      }];
    } else {
      const section0: PreferenceSection = {
        title: "",
        rows: [
          {
            type: "list",
            title: "服务",
            key: "selectedAiTranslationService",
            items: serviceTitles,
            value: serviceNames.indexOf(this._selectedService),
          },
          {
            type: "link",
            title: "链接",
            value: getDefaultConfig(this._selectedService).link
          },
          {
            type: "action",
            title: "查看指南",
            value: () => { this._showIntroduction() }
          },
          {
            type: "info",
            title: "并发请求",
            value: getDefaultConfig(this._selectedService).allowConcurrentRequests ? "允许" : "不允许"
          }
        ]
      }

      const section1: PreferenceSection = {
        title: "",
        rows: this._mergeConfigWithDefaults()
      }

      return [section0, section1];
    }
  }

  getValues() {
    // 从当前页面中获取用户设置的值
    const values = this.cviews.dynamicPreferenceListView.values;
    // 如果是用户自定义，还需要获取用户自定义的脚本
    if (this._selectedService === "user-custom") {
      values.scriptText = this.cviews.textView.text;
    } else {
      // 获取默认配置中的allowConcurrentRequests
      const defaultConfig = getDefaultConfig(this._selectedService);
      values.allowConcurrentRequests = defaultConfig.allowConcurrentRequests;
    }
    // 删除selectedAiTranslationService
    delete values.selectedAiTranslationService;
    return values;
  }

  get selectedService() {
    return this._selectedService;
  }
}


function showIntroduction(text: string, title: string) {
  const navbar = new CustomNavigationBar({
    props: {
      title,
      rightBarButtonItems: [{
        cview: new SymbolButton({
          props: {
            symbol: "xmark"
          },
          events: {
            tapped: () => {
              sheet.dismiss();
            }
          }
        })
      }]
    }
  });
  const markdown = new Markdown({
    props: {
      content: text
    },
    layout: (make, view) => {
      make.top.equalTo(view.prev.bottom);
      make.left.right.bottom.equalTo(view.super.safeArea);
    }
  });
  const sheet = new Sheet<ContentView, UIView, UiTypes.ViewOptions>({
    cview: new ContentView({
      layout: $layout.fill,
      views: [navbar.definition, markdown.definition]
    })
  });
  sheet.present();
}

export function setAITranslationConfig() {
  return new Promise<boolean>((resolve, reject) => {
    const controller = new AITranslationConfigController(() => {
      const selectedService = controller.selectedService;
      const values = controller.getValues();
      const config = configManager.aiTranslationServiceConfig || {};
      config[selectedService] = values;
      configManager.selectedAiTranslationService = selectedService;
      configManager.saveAiTranslationServiceConfig(config);
      resolve(true);
    }, () => { reject(false) });
    controller.uipush({
      navBarHidden: true,
      statusBarStyle: 0
    });
  });
}