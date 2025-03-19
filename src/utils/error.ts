let fatalErrorAlerted = false;

export class FatalError extends Error {
  name: string = "FatalError";
  constructor(message: string) {
    super(message);
    if (!fatalErrorAlerted) {
      fatalErrorAlerted = true;
      $ui.alert({
        title: "致命错误",
        message,
        actions: [
          {
            title: "退出应用",
            style: $alertActionType.destructive,
            handler: () => {
              $app.close();
            },
          },
        ],
      });
    }
  }
}
