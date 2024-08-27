import { Base, BaseController, ContentView, CustomNavigationBar, Markdown, Sheet, SymbolButton, formDialog } from "jsbox-cview";
import { webdavIntroductionPath } from "../utils/glv";
import { configManager } from "../utils/config";
import { WebDAVService } from "../types";


class WebDAVSettingsList extends Base<UIListView, UiTypes.ListOptions> {

  _defineView: () => UiTypes.ListOptions;

  constructor() {
    super();
    this._defineView = () => {
      return {
        type: "list",
        props: {
          style: 2,
          id: this.id,
          data: this._map(),
          actions: [
            {
              title: "删除",
              color: $color("red"),
              handler: (sender, indexPath) => {
                const oldService = configManager.webDAVServices[indexPath.row];
                configManager.deleteWebDAVService(oldService.id);
                this.refresh();
              }
            },
            {
              title: "修改",
              color: $color("orange"),
              handler: (sender, indexPath) => {
                const oldService = configManager.webDAVServices[indexPath.row];
                showWebdavServiceEditor(oldService).then(service => {
                  if (service) {
                    configManager.upadteWebDAVService({ id: oldService.id, ...service })
                    this.refresh();
                  }
                })
              }
            }
          ],
          template: {
            views: [
              { // 背景
                type: "view",
                props: {
                  id: "bgview",
                  bgcolor: $color("secondarySurface")
                },
                layout: $layout.fill
              },
              { // 标题，可用于多处
                type: "label",
                props: {
                  id: "title",
                  font: $font(17)
                },
                layout: (make, view) => {
                  make.top.bottom.inset(0);
                  make.left.right.inset(15);
                }
              },
              {
                type: "view",
                props: {},
                layout: (make, view) => {
                  make.top.bottom.inset(0);
                  make.left.right.inset(15);
                },
                views: [
                  {
                    type: "image",
                    props: {
                      id: "checkmark",
                      symbol: "circle.fill",
                      tintColor: $color("systemLink")
                    },
                    layout: (make, view) => {
                      make.centerY.equalTo(view.super);
                      make.left.inset(0);
                      make.width.height.equalTo(10);
                    }
                  },
                  {
                    type: "label",
                    props: {
                      id: "url",
                      font: $font("bold", 14),
                      lines: 2
                    },
                    layout: (make, view) => {
                      make.centerY.equalTo(view.super);
                      make.left.equalTo(view.prev.right).inset(5);
                      make.right.inset(0);
                    }
                  },
                  {
                    type: "switch",
                    props: {
                      id: "switch",
                      onColor: $color("#34C85A"),
                    },
                    layout: (make, view) => {
                      make.centerY.equalTo(view.super);
                      make.right.inset(0);
                    },
                    events: {
                      changed: sender => {
                        const { id } = sender.info;
                        if (id === "webdavEnabled") {
                          configManager.webdavEnabled = sender.on;
                        } else if (id === "autoUpload") {
                          configManager.webdavAutoUpload = sender.on;
                        }
                        this.refresh();
                      }
                    }
                  }
                ]
              }
            ]
          },
        },
        layout: (make, view) => {
          make.top.equalTo(view.prev.bottom);
          make.left.right.bottom.equalTo(view.super.safeArea);
        },
        events: {
          swipeEnabled: (sender, indexPath) => {
            return indexPath.section === 1 && indexPath.row < configManager.webDAVServices.length - 1;
          },
          didSelect: (sender, indexPath, data) => {
            if (indexPath.section === 0 && indexPath.row === 0) {
              showWebdavIntroduction();
            } else if (indexPath.section === 0 && indexPath.row === 3) {
              // TODO: 立即上传
            } else if (indexPath.section === 1 && indexPath.row === configManager.webDAVServices.length - 1) {
              showWebdavServiceEditor().then(service => {
                if (service) {
                  configManager.addWebDAVService(service)
                  this.refresh();
                }
              })
            } else if (indexPath.section === 1 && indexPath.row < configManager.webDAVServices.length - 1) {
              configManager.selectedWebdavService = configManager.webDAVServices[indexPath.row].id;
              this.refresh();
            }
          }
        }
      };
    }
  }

  _map() {
    const rowEnableWebDAV = {
      title: {
        hidden: false,
        text: "启用WebDAV",
        align: $align.left,
        textColor: $color("primaryText")
      },
      switch: {
        hidden: false,
        on: configManager.webdavEnabled,
        info: { id: "webdavEnabled" },
      },
      bgview: { hidden: false },
      checkmark: { hidden: true },
      url: { hidden: true }
    }

    const rowReadIntroduction = {
      title: {
        hidden: false,
        text: "阅读使用说明",
        align: $align.center,
        textColor: $color("systemLink")
      },
      bgview: { hidden: true },
      switch: { hidden: true },
      checkmark: { hidden: true },
      url: { hidden: true }
    }

    const rowAutoUpload = {
      title: {
        hidden: false,
        text: "自动上传",
        align: $align.left,
        textColor: $color("primaryText")
      },
      switch: {
        hidden: false,
        on: configManager.webdavAutoUpload,
        info: { id: "autoUpload" },
      },
      bgview: { hidden: false },
      checkmark: { hidden: true },
      url: { hidden: true }
    }

    const rowUploadNow = {
      title: {
        hidden: false,
        text: "立即上传",
        align: $align.left,
        textColor: $color("systemLink")
      },
      switch: { hidden: true },
      bgview: { hidden: true },
      checkmark: { hidden: true },
      url: { hidden: true }
    }

    const rowAddService = {
      title: {
        hidden: false,
        text: "添加WebDAV服务端",
        align: $align.center,
        textColor: $color("systemLink")
      },
      bgview: { hidden: true },
      switch: { hidden: true },
      checkmark: { hidden: true },
      url: { hidden: true }
    }

    const createWebdavServiceRow = (service: WebDAVService) => {
      const selected = service.id === configManager.selectedWebdavService;
      return {
        checkmark: {
          hidden: !selected,
        },
        url: {
          hidden: false,
          text: service.name || service.url,
          textColor: selected ? $color("systemLink") : $color("primaryText")
        },
        title: { hidden: true },
        bgview: { hidden: true },
        switch: { hidden: true },
      }
    }

    if (!configManager.webdavEnabled) {
      return [{
        title: "",
        rows: [rowReadIntroduction, rowEnableWebDAV]
      }]
    } else {
      return [
        {
          title: "",
          rows: [rowReadIntroduction, rowEnableWebDAV, rowAutoUpload, rowUploadNow]
        },
        {
          title: "",
          rows: [...configManager.webDAVServices.map(s => createWebdavServiceRow(s)), rowAddService]
        }
      ]
    }
  }

  refresh() {
    this.view.data = this._map();
  }
}

function showWebdavIntroduction() {
  const text = $file.read(webdavIntroductionPath).string || "";
  const navbar = new CustomNavigationBar({
    props: {
      title: "WebDAV 使用指南",
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

async function showWebdavServiceEditor(oldService?: WebDAVService) {
  const r = await formDialog({
    title: oldService ? "修改WebDAV服务端" : "添加WebDAV服务端",
    sections: [
      {
        title: "",
        rows: [
          {
            type: "string",
            title: "名称",
            key: "name",
            value: oldService ? oldService.name : ""
          },
          {
            type: "string",
            title: "URL",
            key: "url",
            value: oldService ? oldService.url : ""
          },
          {
            type: "string",
            title: "用户名",
            key: "username",
            value: oldService ? oldService.username : ""
          },
          {
            type: "string",
            title: "密码",
            key: "password",
            value: oldService ? oldService.password : ""
          }
        ]
      }
    ]
  }) as Omit<WebDAVService, "id">;
  const test = $detector.link(r.url)
  if (!test || test.length === 0) {
    $ui.alert({
      title: "URL格式错误",
      message: "请填写正确的 URL 地址"
    });
    return
  }
  return r
}

export class WebDAVSettingsController extends BaseController {
  constructor() {
    super({
      events: {
        didAppear: () => {
          if (!configManager.webdavIntroductionFirstRead) {
            showWebdavIntroduction();
            configManager.webdavIntroductionFirstRead = true;
          }
        }
      }
    })
    const navbar = new CustomNavigationBar({
      props: {
        title: "WebDAV设置",
        popButtonEnabled: true
      }
    })
    const list = new WebDAVSettingsList();
    this.cviews = {navbar, list};
    this.rootView.views = [navbar, list];
  }
}