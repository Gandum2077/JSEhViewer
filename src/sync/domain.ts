// Protocol schema 3; keep in step with cloudflare-d1-sync/DOMAIN_TABLES.md.
export const fields = {
  archive_entries_v2: {
    token: {
      kind: "text",
      max: 4096,
      min: 0,
      nullable: true,
    },
    title: {
      kind: "text",
      max: 4096,
      min: 0,
      nullable: true,
    },
    english_title: {
      kind: "text",
      max: 4096,
      min: 0,
      nullable: true,
    },
    japanese_title: {
      kind: "text",
      max: 4096,
      min: 0,
      nullable: true,
    },
    thumbnail_url: {
      kind: "text",
      max: 8192,
      min: 0,
      nullable: true,
    },
    category: {
      kind: "text",
      max: 200,
      min: 0,
      nullable: true,
    },
    posted_time: {
      kind: "text",
      max: 64,
      min: 0,
      nullable: true,
    },
    visible: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 1,
    },
    length: {
      kind: "integer",
      min: 0,
      max: 9007199254740991,
      nullable: true,
    },
    torrent_available: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    uploader: {
      kind: "text",
      max: 512,
      min: 0,
      nullable: true,
    },
    disowned: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    comment: {
      kind: "text",
      max: 32768,
      min: 0,
      nullable: true,
    },
    taglist_json: {
      kind: "taglist",
      default: "[]",
    },
  },
  archive_read_state_v2: {
    first_access_time: {
      kind: "text",
      max: 64,
      min: 1,
      nullable: false,
    },
    last_access_time: {
      kind: "text",
      max: 64,
      min: 1,
      nullable: false,
    },
    readlater: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    last_read_page: {
      kind: "integer",
      min: 0,
      max: 9007199254740991,
      nullable: false,
      default: 0,
    },
  },
  archive_favorite_state_v2: {
    favorited: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    favcat: {
      kind: "integer",
      min: 0,
      max: 9,
      nullable: true,
    },
  },
  archive_rate_state_v2: {
    average_rating: {
      kind: "real",
      default: 0,
    },
    display_rating: {
      kind: "real",
      default: 0,
    },
    is_my_rating: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
  },
  gallery_reader_config_v2: {
    pageDirection: {
      kind: "text",
      max: 20,
      default: "left_to_right",
      values: ["left_to_right", "right_to_left", "vertical"],
    },
    spreadModeEnabled: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    skipFirstPageInSpread: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    skipLandscapePagesInSpread: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    pagingGesture: {
      kind: "text",
      max: 20,
      default: "tap_and_swipe",
      values: ["tap_and_swipe", "swipe", "tap"],
    },
  },
  global_reader_config_v2: {
    pageDirection: {
      kind: "text",
      max: 20,
      default: "left_to_right",
      values: ["left_to_right", "right_to_left", "vertical"],
    },
    spreadModeEnabled: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    skipFirstPageInSpread: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    skipLandscapePagesInSpread: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    pagingGesture: {
      kind: "text",
      max: 20,
      default: "tap_and_swipe",
      values: ["tap_and_swipe", "swipe", "tap"],
    },
  },
  search_history_v2: {
    last_access_time: {
      kind: "text",
      max: 64,
      min: 1,
      nullable: false,
    },
    search_terms_json: {
      kind: "search_terms",
      default: "[]",
    },
  },
  search_bookmarks_v2: {
    position_key: {
      kind: "text",
      max: 2048,
      min: 1,
      nullable: false,
    },
    search_terms_json: {
      kind: "search_terms",
      default: "[]",
    },
  },
  ai_translation_services_v2: {
    name: {
      kind: "text",
      max: 200,
      min: 1,
      nullable: false,
    },
    selected: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    script_text: {
      kind: "text",
      max: 65536,
      min: 0,
      nullable: false,
    },
    config_form: {
      kind: "text",
      max: 16384,
      min: 0,
      nullable: true,
    },
    config: {
      kind: "text",
      max: 16384,
      min: 0,
      nullable: true,
    },
  },
  webdav_services_v2: {
    name: {
      kind: "text",
      max: 200,
      min: 0,
      nullable: true,
    },
    host: {
      kind: "text",
      max: 2048,
      min: 0,
      nullable: true,
    },
    port: {
      kind: "integer",
      min: 1,
      max: 65535,
      nullable: true,
    },
    https: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
    path: {
      kind: "text",
      max: 4096,
      min: 0,
      nullable: true,
    },
    enabled: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: false,
      default: 0,
    },
  },
  local_marked_tags_v2: {
    namespace: {
      kind: "text",
      max: 512,
      min: 1,
      nullable: false,
    },
    name: {
      kind: "text",
      max: 512,
      min: 1,
      nullable: false,
    },
    watched: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: true,
    },
    hidden: {
      kind: "integer",
      min: 0,
      max: 1,
      nullable: true,
    },
    color: {
      kind: "text",
      max: 64,
      min: 0,
      nullable: true,
    },
    weight: {
      kind: "integer",
      min: -9007199254740991,
      max: 9007199254740991,
      nullable: true,
    },
  },
  marked_uploaders_v2: {},
  tag_access_count_v2: {
    device_id: {
      kind: "text",
      max: 200,
      min: 1,
      nullable: false,
    },
    namespace: {
      kind: "text",
      max: 512,
      default: "",
    },
    qualifier: {
      kind: "text",
      max: 512,
      default: "",
    },
    term: {
      kind: "text",
      max: 2048,
      default: "",
    },
    count: {
      kind: "integer",
      min: 0,
      max: 9007199254740991,
      nullable: false,
      default: 0,
    },
  },
  favorite_images_v2: {
    gid: {
      kind: "integer",
      min: 0,
      max: 9007199254740991,
      nullable: false,
    },
    page_index: {
      kind: "integer",
      min: 0,
      max: 9007199254740991,
      nullable: false,
    },
    favorited_at: {
      kind: "text",
      max: 64,
      min: 1,
      nullable: false,
    },
  },
} as const;
export type Table = keyof typeof fields;
export const tables = Object.keys(fields) as Table[];
export type Entity = { id: string; sync_version: number; deleted: number; [key: string]: any };
export const canonical = (v: any): string =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? "[" + v.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
          .join(",") +
        "}";
export const same = (a: any, b: any) => canonical(a) === canonical(b);
