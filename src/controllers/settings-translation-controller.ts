import { BaseController, CustomNavigationBar, PreferenceListView } from "jsbox-cview";

export function createSettingsTranslationController() {
  const navbar = new CustomNavigationBar({
    props: {
      title: "AI翻译",
      popButtonEnabled: true,
    },
  });
  const controller = new BaseController();
  controller.rootView.views = [navbar]
  return controller;
}