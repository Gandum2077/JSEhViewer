export function popoverWithSymbol({
  sourceView,
  sourceRect,
  directions,
  width = 200,
  items,
}: {
  sourceView: AllUIView;
  sourceRect: JBRect;
  directions: number;
  width?: number;
  items: {
    symbol: string;
    title: string;
    autoDismiss?: boolean;
    handler: () => void;
  }[];
}) {
  const popover = $ui.popover({
    sourceView,
    sourceRect,
    directions,
    size: $size(width, 44 * items.length - 0.5),
    views: [
      {
        type: "list",
        props: {
          scrollEnabled: false,
          separatorInset: $insets(0, 54, 0, 0),
          rowHeight: 44,
          data: items.map((item) => ({
            symbol: {
              symbol: item.symbol,
            },
            title: {
              text: item.title,
            },
          })),
          template: {
            views: [
              {
                type: "image",
                props: {
                  id: "symbol",
                  tintColor: $color("primaryText"),
                },
                layout: (make, view) => {
                  make.centerY.equalTo(view.super);
                  make.left.inset(15);
                  make.width.height.equalTo(24);
                },
              },
              {
                type: "label",
                props: {
                  id: "title",
                  tintColor: $color("primaryText"),
                  font: $font("bold", 17),
                },
                layout: (make, view) => {
                  make.centerY.equalTo(view.super);
                  make.left.equalTo($("symbol").right).inset(15);
                },
              },
            ],
          },
        },
        layout: (make, view) => {
          make.left.right.inset(0);
          make.bottom.inset(-0.5);
          make.height.equalTo(44 * items.length);
        },
        events: {
          didSelect: (sender, indexPath) => {
            if (
              items[indexPath.row].autoDismiss === undefined ||
              items[indexPath.row].autoDismiss === true
            ) {
              popover.dismiss();
            }
            items[indexPath.row].handler();
          },
        },
      },
    ],
  });
}

export async function popoverWithSymbolAsync({
  sourceView,
  sourceRect,
  directions,
  width = 200,
  items,
}: {
  sourceView: AllUIView;
  sourceRect: JBRect;
  directions: number;
  width?: number;
  items: { symbol: string; title: string; autoDismiss?: boolean }[];
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const popover = $ui.popover({
      sourceView,
      sourceRect,
      directions,
      size: $size(width, 44 * items.length - 0.5),
      views: [
        {
          type: "list",
          props: {
            scrollEnabled: false,
            separatorInset: $insets(0, 54, 0, 0),
            rowHeight: 44,
            data: items.map((item) => ({
              symbol: {
                symbol: item.symbol,
              },
              title: {
                text: item.title,
              },
            })),
            template: {
              views: [
                {
                  type: "image",
                  props: {
                    id: "symbol",
                    tintColor: $color("primaryText"),
                  },
                  layout: (make, view) => {
                    make.centerY.equalTo(view.super);
                    make.left.inset(15);
                    make.width.height.equalTo(24);
                  },
                },
                {
                  type: "label",
                  props: {
                    id: "title",
                    tintColor: $color("primaryText"),
                    font: $font("bold", 17),
                  },
                  layout: (make, view) => {
                    make.centerY.equalTo(view.super);
                    make.left.equalTo($("symbol").right).inset(15);
                  },
                },
              ],
            },
          },
          layout: (make, view) => {
            make.left.right.inset(0);
            make.bottom.inset(-0.5);
            make.height.equalTo(44 * items.length);
          },
          events: {
            didSelect: (sender, indexPath) => {
              if (
                items[indexPath.row].autoDismiss === undefined ||
                items[indexPath.row].autoDismiss === true
              ) {
                popover.dismiss();
              }
              resolve(indexPath.row);
            },
          },
        },
      ],
    });
  });
}
