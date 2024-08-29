import { login } from "./controllers/login";
import {
  SplitViewController,
  TabBarController
} from 'jsbox-cview'
import { HomepageController } from "./controllers/homepage-controller";
import { ArchiveController } from "./controllers/archive-controller";
import { TagManagerController } from "./controllers/tag-manager-controller";
import { MoreController } from "./controllers/more-controller";
import { createSidebarTabController } from "./controllers/sidebar-tab-controller";
import { SidebarBookmarkController } from "./controllers/sidebar-bookemark-controller";
import { SidebarHistoryController } from "./controllers/sidebar-history-controller";
import { configManager } from "./utils/config";
import { api } from "./utils/api";
import { appLog } from "./utils/tools";
import { EHMyTags } from "ehentai-parser";
import { imagePath, thumbnailPath } from "./utils/glv";

async function init() {
  if (!$file.exists(imagePath)) $file.mkdir(imagePath);
  if (!$file.exists(thumbnailPath)) $file.mkdir(thumbnailPath);
  const homepageController = new HomepageController()
  const archiveController = new ArchiveController()
  const tagManagerController = new TagManagerController()
  const moreViewController = new MoreController()
  const sideBarTabController = createSidebarTabController()
  const sidebarBookmarkController = new SidebarBookmarkController()
  const sidebarHistoryController = new SidebarHistoryController()
  const primaryViewController = new TabBarController({
    props: {
      bgcolor: $color("primarySurface"),
      items: [
        {
          symbol: "photo.on.rectangle",
          title: "主页",
          controller: homepageController
        },
        {
          symbol: "archivebox",
          title: "存档",
          controller: archiveController
        },
        {
          symbol: "tag.fill",
          title: "标签",
          controller: tagManagerController
        },
        {
          symbol: "ellipsis",
          title: "其他",
          controller: moreViewController
        }
      ]
    },
    events: {
      doubleTapped: (controller, index) => {
        switch (index) {
          case 0:
            homepageController.cviews.list.matrix.view.scrollToOffset($point(0, 0))
            break;
          case 1:
            archiveController.cviews.list.matrix.view.scrollToOffset($point(0, 0))
            break;
          case 2:
            tagManagerController.cviews.list.view.scrollToOffset($point(0, 0))
            break;
          case 3:
            moreViewController.cviews.list.matrix.view.scrollToOffset($point(0, 0))
            break;
          default:
            break;
        }
      }
    }
  })
  const secondaryViewController = new TabBarController({
    props: {
      bgcolor: $color("backgroundColor", "secondarySurface"),
      items: [
        {
          symbol: "square.on.square",
          controller: sideBarTabController
        },
        {
          symbol: "bookmark.fill",
          controller: sidebarBookmarkController
        },
        {
          symbol: "clock.arrow.circlepath",
          controller: sidebarHistoryController
        }
      ]
    }
  })
  const splitViewController = new SplitViewController({
    props: {
      id: "splitViewController",
      items: [
        { controller: primaryViewController, bgcolor: $color("clear") },
        { controller: secondaryViewController, bgcolor: $color("clear") }
      ]
    }
  })
  splitViewController.uirender()
  if (!configManager.cookie) {
    await login()
    console.info("login done")
  } else {
    api.cookie = configManager.cookie
    api.exhentai = configManager.exhentai
    api.mpvAvailable = configManager.mpvAvailable
  }

  // 此时可以加载archiveController了
  $delay(0.3, () => archiveController.startLoad())

  // 检查配置
  let config: {[key: string]: string } | undefined
  let ehMyTags: EHMyTags | undefined
  try {
    config = await api.getConfig()
    if (configManager.syncMyTags) {
      ehMyTags = await api.getMyTags()
      // 如果没有启用我的标签，就启用
      if (!ehMyTags.enabled) {
        ehMyTags = await api.enableTagset({tagset: 1})
      }
    }
  } catch (e: any) {
    appLog(e, "error")
    $ui.alert({
      title: "更新配置失败",
      message: e.name + ": " + e.message
    })
  }
  if (config) {
    if (config.dm !== "2" || config.ts !== "1") {
      config.dm = "2"
      config.ts = "1"
      await api.postConfig(config)
    }
    // 同步被禁止的上传者
    if (config.xu) {
      const bannedUploaders = config.xu.split("\n")
      configManager.updateAllBannedUploaders(bannedUploaders)
    }
    // 同步favcat
    configManager.updateAllFavcatTitles([
      config.favorite_0,
      config.favorite_1,
      config.favorite_2,
      config.favorite_3,
      config.favorite_4,
      config.favorite_5,
      config.favorite_6,
      config.favorite_7,
      config.favorite_8,
      config.favorite_9
    ])
  }
  if (ehMyTags) {
    configManager.updateAllMarkedTags(ehMyTags.tags)
  }
  homepageController.cviews.list.footerText = "";
  homepageController.cviews.list.isLoading = false;
  
  //$delay(0.3, () => homepageController.startRefresh({
  //  type: "front_page",
  //  options: {}
  //}))
  $delay(0.3, () => sidebarHistoryController.appear())
  $delay(0.3, () => sidebarBookmarkController.appear())
}
if ($app.env === $env.app) {
  init().then().catch(e => console.error(e))
} else {
  $ui.error("请在JSBox主程序中运行")
}