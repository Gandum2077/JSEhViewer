//---- Definition ----/

const UIAlertActionStyle = {
  Default: 0,
  Cancel: 1,
  Destructive: 2
};

const UIAlertControllerStyle = {
  ActionSheet: 0,
  Alert: 1
};

class UIAlertAction {
  constructor(title, style = UIAlertActionStyle.Default, handler) {
    this.title = title;
    this.style = style;
    this.instance = $objc("UIAlertAction").$actionWithTitle_style_handler(
      title,
      style,
      $block("void, UIAlertAction *", () => {
        if (handler) {
          handler(this);
        }
      })
    );
  }
}

class UIAlertController {
  constructor(title, message, style = UIAlertControllerStyle.ActionSheet) {
    this.title = title;
    this.message = message;
    this.style = style;
    this.instance = $objc(
      "UIAlertController"
    ).$alertControllerWithTitle_message_preferredStyle(title, message, style);
  }

  addAction(action) {
    this.instance.$addAction(action.instance);
  }

  addTextField(options) {
    this.instance.$addTextFieldWithConfigurationHandler(
      $block("void, UITextField *", textField => {
        textField.$setClearButtonMode(1);

        if (options.type) {
          textField.$setKeyboardType(options.type);
        }
        if (options.placeholder) {
          textField.$setPlaceholder(options.placeholder);
        }
        if (options.text) {
          textField.$setText(options.text);
        }
        if (options.textColor) {
          textField.$setTextColor(options.textColor.ocValue());
        }
        if (options.font) {
          textField.$setFont(options.font.ocValue());
        }
        if (options.align) {
          textField.$setTextAlignment(options.align);
        }
        if (options.secure) {
          textField.$setSecureTextEntry(true);
        }
        if (options.events) {
          const events = options.events;
          textField.$setDelegate(
            $delegate({
              type: "UITextFieldDelegate",
              events: {
                "textFieldShouldReturn:": textField => {
                  if (events.shouldReturn) {
                    return events.shouldReturn();
                  } else {
                    return true;
                  }
                }
              }
            })
          );
        }
      })
    );
  }

  getText(index) {
    const textField = this.instance.$textFields().$objectAtIndex(index);
    const text = textField.$text();
    return text.jsValue();
  }

  present() {
    this.instance.$show();
  }
}

//---- Usage ----/

module.exports = {
  UIAlertActionStyle,
  UIAlertControllerStyle,
  UIAlertAction,
  UIAlertController
};
