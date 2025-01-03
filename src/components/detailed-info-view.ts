import { Base, DialogSheet } from "jsbox-cview";
import { MarkedTag, TranslationData } from "../types";
import { TagNamespace } from "ehentai-parser";

const htmlPath = 'assets/detailed-info.html'

class DetailedInfoView extends Base<UIWebView, UiTypes.WebOptions> {
  _defineView: () => UiTypes.WebOptions;

  constructor({
    namespace,
    name,
    translation,
    intro,
    links,
    marked,
    watched,
    hidden,
    weight
  }: {
    namespace: string;
    name: string;
    translation: string;
    intro: string;
    links: string;
    marked: boolean;
    watched: boolean;
    hidden: boolean;
    weight: number;
  }) {
    super()
    const themeMode = $device.isDarkMode ? "dark" : "light";
    this._defineView = () => {
      return {
        type: "web",
        props: {
          id: this.id,
          html: $file.read(htmlPath).string,
          transparent: true,
          allowsLinkPreview: false,
          allowsNavigation: false,
          showsProgress: false,
          inlineMedia: false,
          script: `document.documentElement.setAttribute('data-theme', '${themeMode}');`
        },
        layout: this._layout,
        events: {
          updateWeight: ({ weight }: { weight: number }) => {
            $input.text({
              type: $kbType.nap,
              text: weight.toString(),
              placeholder: "范围: -99 ~ 99",
              handler: text => {
                if (!text) return;
                const weight = parseInt(text);
                if (isNaN(weight) || weight < -99 || weight > 99) {
                  $ui.error("请输入范围 -99 ~ 99 的整数");
                  return;
                }
                this.view.notify({
                  event: "updateWeightText",
                  message: { weight }
                })
              }
            })
          },
          themeChanged: (sender, isDarkMode) => {
            sender.notify({
              event: "toggleTheme",
              message: { isDarkMode }
            })
          },
          didFinish: sender => {
            sender.notify({
              event: "init",
              message: {
                namespace,
                name,
                translation,
                intro,
                links,
                marked,
                watched,
                hidden,
                weight
              }
            })
          },
          decideNavigation: (sender, action) => {
            if (action.type === -1) return true;
            $ui.alert({
              title: "跳转至默认浏览器",
              message: action.requestURL,
              actions: [
                {
                  title: "取消"
                },
                {
                  title: "打开",
                  handler: () => {
                    $app.openURL(action.requestURL);
                  }
                }
              ]
            })
            return false;
          }
        }
      }
    }
  }
}

export function showDetailedInfoView(namespace: TagNamespace, name: string, translationData?: TranslationData[0], markedTag?: MarkedTag) {
  const cview = new DetailedInfoView({
    namespace: namespace,
    name: name,
    translation: translationData?.translation || "",
    intro: translationData?.intro || "",
    links: translationData?.links || "",
    marked: Boolean(markedTag),
    watched: markedTag?.watched || false,
    hidden: markedTag?.hidden || false,
    weight: markedTag?.weight || 10
  })
  const sheet = new DialogSheet({
    title: "详细信息",
    bgcolor: $color("backgroundColor"),
    cview,
    doneHandler: async () => {
      const { result, error } = await cview.view.exec("getData()");
      return result;
    }
  })
  return new Promise<{
    watched: boolean;
    weight: number;
    marked: boolean;
    hidden: boolean;
  }>((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}