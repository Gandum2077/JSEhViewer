import {
  UIAlertActionStyle,
  UIAlertControllerStyle,
  UIAlertAction,
  UIAlertController,
  l10n,
} from "jsbox-cview";

export function rateAlert({
  rating,
  title = "评分",
  cancelText = l10n("CANCEL"),
  confirmText = l10n("OK"),
}: {
  rating: number;
  title?: string;
  cancelText?: string;
  confirmText?: string;
}): Promise<number> {
  if (rating < 0.5 || rating > 5) {
    throw new Error("Rating should be between 0.5 and 5");
  }
  return new Promise((resolve, reject) => {
    const view: UiTypes.ViewOptions = {
      type: "view",
      props: {},
      layout: (make, view) => {
        make.left.right.inset(20);
        make.centerY.equalTo(view.super);
        make.height.equalTo(40);
      },
      views: [
        {
          type: "label",
          props: {
            text: rating.toFixed(1),
            align: $align.center,
            font: $font("bold", 16),
          },
          layout: (make, view) => {
            make.right.inset(0);
            make.centerY.equalTo(view.super);
          },
        },
        {
          type: "slider",
          props: {
            value: rating,
            min: 0.5,
            max: 5,
            continuous: true,
          },
          layout: (make, view) => {
            make.left.inset(0);
            make.right.equalTo(view.prev.left).inset(10);
            make.centerY.equalTo(view.super);
          },
          events: {
            changed: (sender) => {
              const v = Math.floor(sender.value * 2) / 2;
              (sender.prev as UILabelView).text = v.toFixed(1);
              rating = v;
            },
          },
        },
      ],
    };
    const alertVC = new UIAlertController(
      title,
      "\n\n\n\n",
      UIAlertControllerStyle.Alert
    );
    alertVC.addAction(
      new UIAlertAction(cancelText, UIAlertActionStyle.Destructive, cancelEvent)
    );
    alertVC.addAction(
      new UIAlertAction(confirmText, UIAlertActionStyle.Default, confirmEvent)
    );
    alertVC.present();
    alertVC.instance.invoke("view").jsValue().add(view);

    function confirmEvent() {
      resolve(rating);
    }
    function cancelEvent() {
      reject("cancel");
    }
  });
}
