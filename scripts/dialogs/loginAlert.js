const {
  UIAlertActionStyle,
  UIAlertControllerStyle,
  UIAlertAction,
  UIAlertController
} = require("./UIAlert");

function loginAlert({ title = "", message, placeholder1, placeholder2 } = {}) {
  return new Promise((resolve, reject) => {
    const alertVC = new UIAlertController(
      title,
      message,
      UIAlertControllerStyle.Alert
    );

    alertVC.addTextField({
      placeholder: placeholder1
    });

    alertVC.addTextField({
      placeholder: placeholder2,
      secure: true,
      events: {
        shouldReturn: () => {
          const username = alertVC.getText(0);
          const password = alertVC.getText(1);
          const isValid = username.length > 0 && password.length > 0;
          return isValid;
        }
      }
    });

    alertVC.addAction(
      new UIAlertAction("Cancel", UIAlertActionStyle.Destructive, cancelEvent)
    );
    alertVC.addAction(
      new UIAlertAction("OK", UIAlertActionStyle.Default, confirmEvent)
    );
    alertVC.present();

    function confirmEvent() {
      const username = alertVC.getText(0);
      const password = alertVC.getText(1);
      resolve({
        username,
        password
      });
    }
    function cancelEvent() {
      reject("cancel");
    }
  });
}

module.exports = loginAlert;
