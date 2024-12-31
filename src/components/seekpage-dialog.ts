import { dateToString, DynamicPreferenceListView, PreferenceSection } from "jsbox-cview";

import { DialogSheet } from "jsbox-cview";

export function getJumpRangeDialogForHomepage({
  minimumGid,
  maximumGid,
  prev_page_available,
  next_page_available
}: {
  minimumGid: number;
  maximumGid: number;
  prev_page_available: boolean;
  next_page_available: boolean;
}) {
  if (!prev_page_available && !next_page_available) {
    throw new Error("No page available");
  }
  let method = 0;
  const methodItems = ["范围", "日期", "偏移"];
  let directionItems = ["向前", "向后"];
  if (!prev_page_available) {
    directionItems = ["向后"];
  } else if (!next_page_available) {
    directionItems = ["向前"];
  }
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
        value: 1
      }]
    },
    {
      title: "",
      rows: [
        {
          type: "date",
          title: "日期",
          key: "date",
          mode: 1,
          value: new Date()
        },
        {
          type: "list",
          title: "跳页方向",
          key: "direction",
          items: directionItems,
          value: directionItems.length - 1
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
        value: 2
      }]
    },
    {
      title: "",
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
          type: "list",
          title: "跳页方向",
          key: "direction",
          items: directionItems,
          value: directionItems.length - 1
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
      }
    }
  })
  const sheet = new DialogSheet({
    title: "跳页",
    bgcolor: $color("backgroundColor"),
    cview: view,
    doneHandler: () => {
      const values = view.values;
      let direction = 0;
      if (!prev_page_available) {
        direction = 1;
      } else if (!next_page_available) {
        direction = 0;
      } else {
        direction = values.direction;
      }
      if (values.method === 0) {
        return {
          range: values.range
        };
      } else if (values.method === 1) {
        return {
          seek: dateToString(1, values.date),
          minimumGid: direction === 0 ? minimumGid : undefined,
          maximumGid: direction === 1 ? maximumGid : undefined
        }
      } else if (values.method === 2) {
        return {
          jump: {
            value: values.num,
            unit: ["d", "w", "m", "y"].at(values.unit) as "d" | "w" | "m" | "y"
          },
          minimumGid: direction === 0 ? minimumGid : undefined,
          maximumGid: direction === 1 ? maximumGid : undefined
        }
      } else {
        throw new Error("Invalid method");
      }
    }
  });
  return new Promise<{
    range?: number; // 范围是1-99的整数，它和下面的搜索参数都不兼容
    minimumGid?: number; // 对应搜索参数prev，从表现来看就是往前翻页
    maximumGid?: number; // 对应搜索参数next，从表现来看就是往后翻页
    jump?: {
      value: number;
      unit: "d" | "w" | "m" | "y";
    }; // 必须和prev或next一起使用，基点是prev或next的图库的日期
    seek?: string; // 2024-03-04
  }>((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}

export function getJumpRangeDialogForFavorites({
  minimumGid,
  minimumFavoritedTimestamp,
  maximumGid,
  maximumFavoritedTimestamp,
  prev_page_available,
  next_page_available
}: {
  minimumGid: number;
  minimumFavoritedTimestamp?: number; // 本页面上第一个项目被收藏的时间戳，用于翻页的参数（向前翻页），仅用于favorited_time排序
  maximumGid: number;
  maximumFavoritedTimestamp?: number; // 本页面上最后一个项目被收藏的时间戳，用于翻页的参数（向后翻页），仅用于favorited_time排序
  prev_page_available: boolean;
  next_page_available: boolean;
}) {
  if (!prev_page_available && !next_page_available) {
    throw new Error("No page available");
  }
  let method = 0;
  const methodItems = ["日期", "偏移"];
  let directionItems = ["向前", "向后"];
  if (!prev_page_available) {
    directionItems = ["向后"];
  } else if (!next_page_available) {
    directionItems = ["向前"];
  }
  const sectionForDate: PreferenceSection[] = [
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
          type: "date",
          title: "日期",
          key: "date",
          mode: 1,
          value: new Date()
        },
        {
          type: "list",
          title: "跳页方向",
          key: "direction",
          items: directionItems,
          value: directionItems.length - 1
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
        value: 1
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
          type: "list",
          title: "跳页方向",
          key: "direction",
          items: directionItems,
          value: directionItems.length - 1
        }
      ]
    }
  ]
  const view = new DynamicPreferenceListView({
    sections: sectionForDate,
    props: {
      scrollEnabled: false
    },
    events: {
      changed: values => {
        if (values.method === method) return;
        method = values.method;
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
  })
  const sheet = new DialogSheet({
    title: "跳页",
    bgcolor: $color("backgroundColor"),
    cview: view,
    doneHandler: () => {
      const values = view.values;
      let direction = 0;
      if (!prev_page_available) {
        direction = 1;
      } else if (!next_page_available) {
        direction = 0;
      } else {
        direction = values.direction;
      }
      if (values.method === 0) {
        return {
          seek: dateToString(1, values.date),
          minimumGid: direction === 0 ? minimumGid : undefined,
          minimumFavoritedTimestamp: direction === 0 ? minimumFavoritedTimestamp : undefined,
          maximumGid: direction === 1 ? maximumGid : undefined,
          maximumFavoritedTimestamp: direction === 1 ? maximumFavoritedTimestamp : undefined
        }
      } else if (values.method === 1) {
        return {
          jump: {
            value: values.num,
            unit: ["d", "w", "m", "y"].at(values.unit) as "d" | "w" | "m" | "y"
          },
          minimumGid: direction === 0 ? minimumGid : undefined,
          minimumFavoritedTimestamp: direction === 0 ? minimumFavoritedTimestamp : undefined,
          maximumGid: direction === 1 ? maximumGid : undefined,
          maximumFavoritedTimestamp: direction === 1 ? maximumFavoritedTimestamp : undefined
        }
      } else {
        throw new Error("Invalid method");
      }
    }
  });
  return new Promise<{
    minimumGid?: number; // 对应搜索参数prev，从表现来看就是往前翻页
    minimumFavoritedTimestamp?: number; // 本页面上第一个项目被收藏的时间戳，用于翻页的参数（向前翻页），仅用于favorited_time排序
    maximumGid?: number; // 对应搜索参数next，从表现来看就是往后翻页
    maximumFavoritedTimestamp?: number; // 本页面上最后一个项目被收藏的时间戳，用于翻页的参数（向后翻页），仅用于favorited_time排序
    jump?: {
      value: number;
      unit: "d" | "w" | "m" | "y";
    }; // 如果和prev或next一起使用，基点是prev或next的图库的日期
    seek?: string; // 2024-03-04
  }>((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}

export function getJumpPageDialog(max: number) {
  const view = new DynamicPreferenceListView({
    sections: [
      {
        title: "",
        rows: [
          {
            type: "slider",
            title: "页码",
            key: "page",
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
    doneHandler: () => {
      const values = view.values;
      return {
        page: values.page - 1  // 注意转换为从0开始的页码
      };
    }
  });
  return new Promise<{ page: number }>((resolve, reject) => {
    sheet.promisify(resolve, reject);
    sheet.present();
  });
}