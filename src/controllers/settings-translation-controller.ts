import { BaseController, CustomNavigationBar, DynamicItemSizeMatrix, setLayer } from "jsbox-cview";
import { configManager } from "../utils/config";
import { editAITranslationService } from "./settings-translation-editor-controller";
import { showIntroductionSheet } from "../components/show-introduction-sheet";
import { aiTranslationIntroductionPath } from "../utils/glv";
import { DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT } from "../ai-translations/preset";
import { buildAITranslationSummary } from "../ai-translations/config-form-utils";

function getNextCustomScriptName(names: string[]): string {
  let index = 1;
  while (true) {
    const candidate = index === 1 ? "自定义脚本" : `自定义脚本${index}`;
    if (!names.includes(candidate)) {
      return candidate;
    }
    index += 1;
  }
}

export class AITranslationConfigPickerController extends BaseController {
  cviews: {
    navbar: CustomNavigationBar;
    matrix: DynamicItemSizeMatrix;
  };

  constructor() {
    super({
      props: {
        bgcolor: $color("insetGroupedBackground"),
      },
    });

    const navbar = new CustomNavigationBar({
      props: {
        title: "AI翻译设置",
        popButtonEnabled: true,
      },
    });

    const matrix = new DynamicItemSizeMatrix({
      props: {
        spacing: 20,
        maxColumns: 3,
        minItemWidth: 320,
        fixedItemHeight: 16 + 34 + 4 + 38 + 16 + 22 + 22 + 31,
        bgcolor: $color("clear"),
        header: {
          type: "view",
          props: {
            height: 96,
            bgcolor: $color("clear"),
          },
          views: [
            {
              type: "button",
              props: {
                title: "查看说明",
                titleColor: $color("primaryText"),
                bgcolor: $color("primarySurface", "tertiarySurface"),
                font: $font("bold", 18),
              },
              layout: (make, view) => {
                make.right.equalTo(view.super.centerX).offset(-10);
                make.left.greaterThanOrEqualTo(view.super.left).inset(20).priority(1000);
                make.width.equalTo(250).priority(999);
                make.top.inset(30);
                make.height.equalTo(56);
              },
              events: {
                tapped: () => {
                  showIntroductionSheet(aiTranslationIntroductionPath, "自定义 AI 翻译");
                },
              },
            },
            {
              type: "button",
              props: {
                title: "新增服务",
                titleColor: $color("white"),
                bgcolor: $color("#c1522b"),
                font: $font("bold", 18),
              },
              layout: (make, view) => {
                make.left.equalTo(view.super.centerX).offset(10);
                make.right.lessThanOrEqualTo(view.super.right).inset(20).priority(1000);
                make.width.equalTo(250).priority(999);
                make.top.inset(30);
                make.height.equalTo(56);
              },
              events: {
                tapped: async () => {
                  const name = getNextCustomScriptName(
                    configManager.aiTranslationServices.map((service) => service.name),
                  );
                  const service = await editAITranslationService({
                    name,
                    selected: false,
                    scriptText: DEFAULT_CUSTOM_AI_TRANSLATION_SCRIPT,
                  });
                  configManager.addAITranslationService(service);
                  this.refresh();
                },
              },
            },
          ],
        },
        template: {
          props: {
            bgcolor: $color("clear"),
          },
          views: [
            {
              type: "view",
              props: {
                bgcolor: $color("clear"),
              },
              layout: (make, view) => {
                setLayer(view, {
                  cornerRadius: 15,
                  shadowRadius: 10,
                  shadowOpacity: 0.1,
                  shadowOffset: $size(2, 5),
                  shadowColor: $color("#222"),
                });
                make.left.right.top.bottom.inset(0);
              },
              views: [
                {
                  type: "view",
                  props: {
                    id: "bgview",
                    smoothCorners: true,
                    cornerRadius: 22,
                    bgcolor: $color("primarySurface", "tertiarySurface"),
                  },
                  layout: $layout.fill,
                },
                {
                  // 上半部分
                  type: "view",
                  props: {},
                  layout: (make) => {
                    make.left.right.inset(22);
                    make.top.inset(16);
                    make.height.equalTo(34 + 4 + 38);
                  },
                  views: [
                    {
                      type: "label",
                      props: {
                        id: "title",
                        font: $font("bold", 20),
                        textColor: $color("primaryText"),
                      },
                      layout: (make, view) => {
                        make.left.right.top.inset(0);
                        make.height.equalTo(34);
                      },
                    },
                    {
                      type: "label",
                      props: {
                        id: "summary",
                        font: $font(14),
                        textColor: $color("secondaryText"),
                        lines: 2,
                      },
                      layout: (make, view) => {
                        make.left.right.inset(0);
                        make.top.equalTo(view.prev.bottom).offset(4);
                        make.height.equalTo(38);
                      },
                    },
                  ],
                },
                {
                  // separator line
                  type: "view",
                  props: {
                    bgcolor: $color("separator"),
                  },
                  layout: (make, view) => {
                    make.left.right.inset(22);
                    make.bottom.inset(31 + 22 + 22);
                    make.height.equalTo(1 / $device.info.screen.scale);
                  },
                },
                {
                  // 下半部分
                  type: "view",
                  props: {},
                  layout: (make, view) => {
                    make.left.right.inset(22);
                    make.height.equalTo(31);
                    make.bottom.inset(22);
                  },
                  views: [
                    {
                      type: "switch",
                      props: {
                        id: "switch",
                        onColor: $color("#34C85A"),
                      },
                      layout: (make, view) => {
                        make.centerY.equalTo(view.super);
                        make.height.equalTo(view.super);
                        make.right.inset(0);
                      },
                      events: {
                        changed: (sender) => {
                          const index = sender.info.index as number;
                          const service = configManager.aiTranslationServices[index];
                          const on = sender.on;
                          if (on) {
                            configManager.selectedAiTranslationServiceName = service.name;
                          } else {
                            configManager.selectedAiTranslationServiceName = undefined;
                          }
                          this.refresh();
                        },
                      },
                    },
                    {
                      type: "button",
                      props: {
                        id: "editButton",
                        font: $font("bold", 14),
                        title: "编辑",
                        titleColor: $color("white"),
                        smoothCorners: true,
                        cornerRadius: 10,
                        bgcolor: $color("#777"),
                      },
                      layout: (make, view) => {
                        make.centerY.equalTo(view.super);
                        make.height.equalTo(view.super);
                        make.left.inset(0);
                        make.width.equalTo(70);
                      },
                      events: {
                        tapped: async (sender) => {
                          const index = sender.info.index as number;
                          const service = configManager.aiTranslationServices[index];
                          const newService = await editAITranslationService(service);
                          configManager.editAITranslationService(newService);
                          this.refresh();
                        },
                      },
                    },
                    {
                      type: "button",
                      props: {
                        id: "deleteButton",
                        font: $font("bold", 14),
                        title: "删除",
                        titleColor: $color("white"),
                        smoothCorners: true,
                        cornerRadius: 10,
                        bgcolor: $rgba(255, 0, 0, 0.6),
                      },
                      layout: (make, view) => {
                        make.centerY.equalTo(view.super);
                        make.height.equalTo(view.super);
                        make.left.equalTo(view.prev.right).inset(12);
                        make.width.equalTo(70);
                      },
                      events: {
                        tapped: (sender) => {
                          $ui.alert({
                            title: "确认删除吗？",
                            actions: [
                              {
                                title: "取消",
                                handler: () => {},
                              },
                              {
                                title: "删除",
                                handler: () => {
                                  const index = sender.info.index as number;
                                  const service = configManager.aiTranslationServices[index];
                                  configManager.deleteAITranslationService(service.name);
                                  this.refresh();
                                },
                              },
                            ],
                          });
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        data: this._map(),
      },
      layout: (make, view) => {
        make.top.equalTo(view.prev.bottom);
        make.left.right.bottom.inset(0);
      },
      events: {
        highlighted: (sender) => {
          return;
        },
      },
    });

    this.cviews = {
      navbar,
      matrix,
    };
    this.rootView.views = [navbar, matrix];
  }

  _map() {
    return configManager.aiTranslationServices.map((service, index) => ({
      title: { text: service.name },
      summary: { text: buildAITranslationSummary(service) },
      switch: {
        on: service.selected,
        info: { index: index },
      },
      editButton: {
        info: { index: index },
      },
      deleteButton: {
        info: { index: index },
      },
    }));
  }

  refresh() {
    this.cviews.matrix.data = this._map();
  }
}
