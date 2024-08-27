import { Base, DynamicItemSizeMatrix, PreferenceListView } from "jsbox-cview";

export function createAdvancedSearchList() {
  const list = new PreferenceListView({
    sections: [
      {
        title: "高级搜索选项",
        rows: [
          {
            type: "boolean",
            title: "只显示已删除的图库",
            key: "browseExpungedGalleries",
            value: false
          },
          {
            type: "boolean",
            title: "只显示有种子的图库",
            key: "requireGalleryTorrent",
            value: false
          },
          {
            type: "integer",
            title: "页数不少于",
            key: "minimumPages",
          },
          {
            type: "integer",
            title: "页数不多于",
            key: "maximumPages",
          },
          {
            type: "list",
            title: "评分不低于",
            key: "minimumRating",
            value: 0,
            items: ["不使用", "2星", "3星", "4星", "5星"]
          },
          {
            type: "boolean",
            title: "禁用自定义过滤器（语言）",
            key: "disableLanguageFilters",
            value: false
          },
          {
            type: "boolean",
            title: "禁用自定义过滤器（上传者）",
            key: "disableUploaderFilters",
            value: false
          },
          {
            type: "boolean",
            title: "禁用自定义过滤器（标签）",
            key: "disableTagFilters",
            value: false
          }
        ]
      }
    ],
    props: {
      
    }
  })
  return list
}