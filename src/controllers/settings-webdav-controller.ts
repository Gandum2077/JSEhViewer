import { Base, BaseController, ContentView, CustomNavigationBar, Markdown, Sheet, SymbolButton, formDialog } from "jsbox-cview";
import { webdavIntroductionPath } from "../utils/glv";
import { configManager } from "../utils/config";
import { WebDAVService } from "../types";

// TODO: 需要对此controller进行重构，改为启动时获取当前的webdav服务器设置并进行渲染，用户设置后需要点击保存按钮，否则不会保存

class WebDAVSettingsList extends Base<UIListView, UiTypes.ListOptions> {
  private _services: WebDAVService[];
  private _webDAVEnabled: boolean;
  private _webDAVAutoUpload: boolean;
  _defineView: () => UiTypes.ListOptions;
  constructor({ services, enabled, webdavAutoUpload }: { services: WebDAVService[], enabled: boolean, webdavAutoUpload: boolean }) {
    super();
    this._services = services;
    this._webDAVEnabled = enabled;
    this._webDAVAutoUpload = webdavAutoUpload;
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
                this._services.splice(indexPath.row, 1);
                this.refresh();
              }
            },
            {
              title: "修改",
              color: $color("orange"),
              handler: async (sender, indexPath) => {
                const oldService = this._services[indexPath.row];
                const newService = await showWebdavServiceEditor("", oldService);
                if (newService) {
                  this._services[indexPath.row] = newService;
                  this.refresh();
                }
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
              { // 标题，也可用于动作
                type: "label",
                props: {
                  id: "title",
                  font: $font(16),
                  align: $align.left
                },
                layout: (make, view) => {
                  make.top.bottom.inset(0);
                  make.left.right.inset(15);
                }
              },
              { // 开关
                type: "switch",
                props: {
                  id: "switch",
                  onColor: $color("#34C85A"),
                },
                layout: (make, view) => {
                  make.centerY.equalTo(view.super);
                  make.right.inset(15);
                },
                events: {
                  changed: sender => {
                    // 将id存储在info中，以便在事件处理程序中使用
                    const { actionName } = sender.info;
                    if (actionName === "webdavEnabled") {
                      this._webDAVEnabled = sender.on;
                    } else if (actionName === "autoUpload") {
                      this._webDAVAutoUpload = sender.on;
                      // TODO: 自动上传
                    }
                    this.refresh();
                  }
                }
              },
              {
                type: "image",
                props: {
                  id: "checkmark",
                  symbol: "checkmark",
                  tintColor: $color("systemLink")
                },
                layout: (make, view) => {
                  make.centerY.equalTo(view.super);
                  make.left.inset(15);
                  make.width.height.equalTo(17.5);
                }
              },
              {
                type: "label",
                props: {
                  id: "url",
                  font: $font(16)
                },
                layout: (make, view) => {
                  make.centerY.equalTo(view.super);
                  make.left.inset(40);
                  make.right.inset(15);
                }
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
            return this._services.length > 0 && indexPath.section === 1
          },
          didSelect: async (sender, indexPath, data) => {
            if (indexPath.section === 0 && indexPath.row === 0) {
              showWebdavIntroduction();
            } else if (
              this._services.length === 0
              && indexPath.section === 1
              || this._services.length > 0
              && indexPath.section === 2
            ) {
              const service = await showWebdavServiceEditor("服务器" + (this._services.length + 1));
              if (service) {
                this._services.push(service);
                // 如果只有一个服务器，自动选择
                if (this._services.length === 1) {
                  this._services[0].enabled = true;
                }
                this.refresh();
              }
            } else if (this._services.length > 0 && indexPath.section === 1) {
              const index = indexPath.row;
              this._services.forEach((s, i) => {
                if (i === index) {
                  s.enabled = !s.enabled;
                } else {
                  s.enabled = false;
                }
              });
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
        textColor: $color("primaryText")
      },
      switch: {
        hidden: false,
        on: this._webDAVEnabled,
        info: { actionName: "webdavEnabled" },
      },
      bgview: { hidden: false },
      checkmark: { hidden: true },
      url: { hidden: true }
    }

    const rowReadIntroduction = {
      title: {
        hidden: false,
        text: "阅读使用说明",
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
        textColor: $color("primaryText")
      },
      switch: {
        hidden: false,
        on: this._webDAVAutoUpload,
        info: { actionName: "autoUpload" },
      },
      bgview: { hidden: false },
      checkmark: { hidden: true },
      url: { hidden: true }
    }

    const rowAddService = {
      title: {
        hidden: false,
        text: "添加WebDAV服务器",
        textColor: $color("systemLink")
      },
      bgview: { hidden: true },
      switch: { hidden: true },
      checkmark: { hidden: true },
      url: { hidden: true }
    }

    const createWebdavServiceRow = (service: WebDAVService) => {
      return {
        checkmark: {
          hidden: !service.enabled,
        },
        url: {
          hidden: false,
          text: service.name,
          textColor: service.enabled ? $color("systemLink") : $color("primaryText")
        },
        title: { hidden: true },
        bgview: { hidden: true },
        switch: { hidden: true },
      }
    }

    if (!this._webDAVEnabled) {
      return [{
        title: "",
        rows: [rowReadIntroduction, rowEnableWebDAV]
      }]
    } else if (this._services.length === 0) {
      return [
        {
          title: "",
          rows: [rowReadIntroduction, rowEnableWebDAV, rowAutoUpload]
        },
        {
          title: "",
          rows: [rowAddService]
        }
      ]
    } else {
      return [
        {
          title: "",
          rows: [rowReadIntroduction, rowEnableWebDAV, rowAutoUpload]
        },
        {
          title: "",
          rows: [...this._services.map(s => createWebdavServiceRow(s))]
        },
        {
          title: "",
          rows: [rowAddService]
        }
      ]
    }
  }

  refresh() {
    this.view.data = this._map();
  }

  getValues() {
    return {
      enabled: this._webDAVEnabled,
      autoUpload: this._webDAVAutoUpload,
      services: this._services
    }
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

function isValidIPAddress(ip: string) {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
}

function isValidDomain(domain: string) {
  const domainRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.(?!-)[A-Za-z]{2,6}$/;
  return domainRegex.test(domain);
}

async function showWebdavServiceEditor(defaultName: string, oldService?: WebDAVService): Promise<WebDAVService> {
  const result = await formDialog({
    title: oldService ? "修改WebDAV服务器" : "添加WebDAV服务器",
    sections: [
      {
        title: "",
        rows: [
          {
            type: "string",
            title: "名称",
            key: "name",
            value: oldService ? oldService.name : defaultName
          },
          {
            type: "string",
            title: "主机",
            key: "host",
            value: oldService ? oldService.host : "192.168.1.1"
          },
          {
            type: "integer",
            title: "端口",
            key: "port",
            value: oldService ? oldService.port : undefined
          },
          {
            type: "string",
            title: "路径",
            key: "path",
            value: oldService ? oldService.path : ""
          },
          {
            type: "boolean",
            title: "HTTPS",
            key: "https",
            value: oldService ? oldService.https : false
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
    ],
    checkHandler: (values: any) => {
      if (!values.name.trim()) {
        $ui.error("请填写名称")
        return false;
      }
      if (!values.host) {
        $ui.error("请填写主机")
        return false;
      }
      if (values.port && (values.port > 65535 || values.port <= 0)) {
        $ui.error("请填写合法的端口号")
        return false;
      }
      if (!isValidIPAddress(values.host) && !isValidDomain(values.host)) {
        $ui.error("请填写合法的主机")
        return false;
      }
      if ((values.username && !values.password) || (!values.username && values.password)) {
        $ui.error("用户名和密码需要同时填写或留空")
        return false;
      }
      return true;
    }
  }) as {
    name: string;
    host: string;
    port: number;
    path: string;
    https: boolean;
    username: string;
    password: string;
  };

  return {
    name: result.name.trim(),
    host: result.host,
    port: result.port || undefined,
    path: result.path || undefined,
    https: result.https,
    username: result.username || undefined,
    password: result.password || undefined,
    enabled: oldService ? oldService.enabled : false
  };
}


class WebDAVSettingsController extends BaseController {
  cviews: {
    navbar: CustomNavigationBar;
    list: WebDAVSettingsList;
  }
  constructor(resolveHandler: () => void, rejectHandler: () => void) {
    super({
      events: {
        didAppear: () => {
          if (!configManager.webdavIntroductionFirstRead) {
            showWebdavIntroduction();
            configManager.webdavIntroductionFirstRead = true;
          }
        },
        didRemove: () => { rejectHandler() }
      }
    })
    const navbar = new CustomNavigationBar({
      props: {
        title: "WebDAV设置",
        popButtonEnabled: true,
        rightBarButtonItems: [{
          title: "保存",
          handler: () => {
            resolveHandler();
            $ui.pop();
          }
        }]
      }
    })
    const list = new WebDAVSettingsList({
      services: configManager.getCopiedWebDAVServices(),
      enabled: configManager.webdavEnabled,
      webdavAutoUpload: configManager.webdavAutoUpload
    });
    this.cviews = { navbar, list };
    this.rootView.views = [navbar, list];
  }
}

export function setWebDAVConfig() {
  return new Promise<{
    enabled: boolean;
    autoUpload: boolean;
    services: WebDAVService[];
  }>((resolve, reject) => {
    const controller = new WebDAVSettingsController(
      () => {
        const values = controller.cviews.list.getValues();
        resolve(values);
      },
      () => { reject("cancel") }
    );
    controller.uipush({
      navBarHidden: true,
      statusBarStyle: 0
    })
  })
}