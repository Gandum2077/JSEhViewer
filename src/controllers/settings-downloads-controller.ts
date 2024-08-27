import { BaseController, CustomNavigationBar, PreferenceListView } from "jsbox-cview";

export function createSettingsDownloadsController() {
  const navbar = new CustomNavigationBar({
    props: {
      title: "下载管理",
      popButtonEnabled: true,
    },
  });
  const controller = new BaseController();
  controller.rootView.views = [navbar]
  return controller;
}