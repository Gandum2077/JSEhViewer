import { dateToString, DynamicPreferenceListView, PreferenceSection, PrefsRowInfo, PrefsRowList } from "jsbox-cview";

import { DialogSheet } from "jsbox-cview";

export function jumpRangeDialog(rangeMethodAvailable: boolean) {
  let method = 0;
  const methodItems = rangeMethodAvailable ? ["范围", "日期", "天数"] : ["日期", "天数"];
  const sectionForRange: PreferenceSection[] = [
    {
      title: "",
      rows: [{
        type: "tab",
        title: "跳页方式",
        key: "method",
        items: methodItems,
        value: 0
      }]
    },
    {
      title: "",
      rows: [
        {
          type: "slider",
          title: "范围(%)",
          key: "range",
          value: 1,
          min: 1,
          max: 99,
          decimal: 0
        }
      ]
    }
  ]
  const sectionForDate: PreferenceSection[] = [
    {
      title: "",
      rows: [{
        type: "tab",
        title: "跳页方式",
        key: "method",
        items: methodItems,
        value: rangeMethodAvailable ? 1 : 0
      }]
    },
    {
      title: "起始GID如果留空，则从当前页面中自动获取",
      rows: [
        {
          type: "date",
          title: "日期",
          key: "date",
          mode: 1,
          value: new Date()
        },
        {
          type: "integer",
          title: "起始GID",
          key: "gid"
        },
        {
          type: "list",
          title: "跳页方向",
          key: "direction",
          items: ["向前", "向后"],
          value: 1
        }
      ]
    }
  ]
  const sectionForDays: PreferenceSection[] = [
    {
      title: "",
      rows: [{
        type: "tab",
        title: "跳页方式",
        key: "method",
        items: methodItems,
        value: rangeMethodAvailable ? 2 : 1
      }]
    },
    {
      title: "起始GID如果留空，则从当前页面中自动获取",
      rows: [
        {
          type: "integer",
          title: "请输入数字",
          key: "num",
          value: 1
        },
        {
          type: "list",
          title: "单位",
          items: ["天", "周", "月", "年"],
          key: "unit",
          value: 0
        },
        {
          type: "integer",
          title: "起始GID",
          key: "gid"
        },
        {
          type: "list",
          title: "跳页方向",
          key: "direction",
          items: ["向前", "向后"],
          value: 1
        }
      ]
    }
  ]
  const view = new DynamicPreferenceListView({
    sections: sectionForRange,
    props: {
      scrollEnabled: false
    },
    events: {
      changed: values => {
        if (values.method === method) return;
        method = values.method;
        if (rangeMethodAvailable) {
          switch (values.method) {
            case 0:
              view.sections = sectionForRange;
              break;
            case 1:
              view.sections = sectionForDate;
              break;
            case 2:
              view.sections = sectionForDays;
              break;
            default:
              break;
          }
        } else {
          switch (values.method) {
            case 0:
              view.sections = sectionForDate;
              break;
            case 1:
              view.sections = sectionForDays;
              break;
            default:
              break;
          }
        }
      }
    }
  })
  const sheet = new DialogSheet({
    title: "跳页",
    bgcolor: $color("backgroundColor"),
    cview: view,
    doneHandler: () => {
      const values = view.values;
      if (rangeMethodAvailable && values.method === 0) {
        return {
          type: "range",
          range: values.range
        };
      } else if (rangeMethodAvailable && values.method === 1 || !rangeMethodAvailable && values.method === 0) {
        return {
          type: "date",
          seek: dateToString(1, values.date),
          gid: values.gid,
          direction: values.direction
        }
      } else if (rangeMethodAvailable && values.method === 2 || !rangeMethodAvailable && values.method === 1) {
        return {
          type: "days",
          jump: {
            value: values.num,
            unit: ["d", "w", "m", "y"].at(values.unit) as "d" | "w" | "m" | "y"
          },
          gid: values.gid,
          direction: values.direction
        }
      } else {
        throw new Error("Invalid method");
      }
    }
  });
  return new Promise((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}

export function jumpPageDialog(max: number) {
  const view = new DynamicPreferenceListView({
    sections: [
      {
        title: "",
        rows: [
          {
            type: "slider",
            title: "页码",
            key: "range",
            value: 1,
            min: 1,
            max,
            decimal: 0
          }
        ]
      }
    ],
    props: {
      scrollEnabled: false
    }
  })
  const sheet = new DialogSheet({
    title: "跳页",
    bgcolor: $color("backgroundColor"),
    cview: view,
    doneHandler: () => view.values
  });
  return new Promise((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}