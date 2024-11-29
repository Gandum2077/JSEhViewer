// 此文件中只定义类型

import {
  EHCategory,
  EHFavoriteSearchOptions,
  EHFavoritesList,
  EHFrontPageList,
  EHListExtendedItem,
  EHPopularList,
  EHPopularSearchOptions,
  EHSearchedCategory,
  EHSearchOptions,
  EHSearchTerm,
  EHTagListItem,
  EHTopList,
  EHTopListSearchOptions,
  EHUploadList,
  EHWatchedList,
  TagNamespace
} from "ehentai-parser";

export type TagList = {
  namespace: TagNamespace;
  tags: string[];
}[]

export type CompleteTagListItem = {
  namespace: TagNamespace;
  namespaceTranslated: string;
  tags: {
    name: string;
    namespace: TagNamespace;
    translation?: string;
    selected: boolean;
    marked: boolean;
    watched: boolean;
    hidden: boolean;
  }[];
};

export type TranslationData = {
  namespace: TagNamespace;
  name: string;
  translation: string;
  intro: string;
  links: string;
}[]

export type TranslationDict = Record<TagNamespace, Record<string, string>>

export type MarkedTag = {
  tagid: number;
  namespace: TagNamespace;
  name: string;
  watched: boolean;
  hidden: boolean;
  color?: string;
  weight: number;
};

export type MarkedTagDict = Record<TagNamespace, Record<string, MarkedTag>>

export type WebDAVService = {
  id: number;
  name: string;
  url: string;
  username: string;
  password: string;
};

export type DBSearchBookmarks = {
  id: number;
  sort_order: number;
  sorted_fsearch: string;
  searchTerms: EHSearchTerm[];
}[];

export type DBSearchHistory = {
  id: number;
  last_access_time: string;
  sorted_fsearch: string;
  searchTerms: EHSearchTerm[];
}[];

export type DBArchiveItem = {
  gid: number;
  readlater: boolean;
  downloaded: boolean;
  first_access_time: string;
  last_access_time: string;
  token: string;
  title: string;
  english_title: string;
  japanese_title: string;
  thumbnail_url: string;
  category: EHCategory;
  posted_time: string;
  visible: boolean;
  rating: number;
  is_my_rating: boolean;
  length: number;
  torrent_available: boolean;
  favorited: boolean;
  favcat?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  uploader?: string;
  disowned: boolean;
  taglist: EHTagListItem[];
  last_read_page: number;
}

export type ArchiveSearchOptions = { 
  page: number, 
  pageSize: number,
  type?: "readlater" | "has_read" | "download" | "all", 
  sort?: "first_access_time" | "last_access_time" | "posted_time",
  searchTerms?: EHSearchTerm[];
  filteredCategories?: EHSearchedCategory[];
  minimumPages?: number;
  maximumPages?: number;
  minimumRating?: number;
};

export type StatusTabType = "front_page" | "watched" | "popular" | "favorites" | "toplist" | "upload" | "archive";

export type StatusTabOptions = FrontPageTabOptions | WatchedTabOptions | PopularTabOptions | FavoritesTabOptions | ToplistTabOptions | UploadTabOptions | ArchiveTabOptions;

export type FrontPageTabOptions = {
  type: "front_page";
  options: EHSearchOptions;
}

export type WatchedTabOptions = {
  type: "watched";
  options: EHSearchOptions;
}

export type PopularTabOptions = {
  type: "popular";
  options: EHPopularSearchOptions;
}

export type FavoritesTabOptions = {
  type: "favorites";
  options: EHFavoriteSearchOptions;
}

export type ToplistTabOptions = {
  type: "toplist";
  options: EHTopListSearchOptions;
}

export type UploadTabOptions = {
  type: "upload";
}

export type ArchiveTabOptions = {
  type: "archive";
  options: ArchiveSearchOptions;
}

export type StatusTab = FrontPageTab | WatchedTab | PopularTab | FavoritesTab | ToplistTab | UploadTab | ArchiveTab;

export type FrontPageTab = {
  type: "front_page";
  options: EHSearchOptions;
  pages: EHFrontPageList[];
};

export type WatchedTab = {
  type: "watched";
  options: EHSearchOptions;
  pages: EHWatchedList[];
};

export type PopularTab = {
  type: "popular";
  options: EHPopularSearchOptions;
  pages: EHPopularList[];
};

export type FavoritesTab = {
  type: "favorites";
  options: EHFavoriteSearchOptions;
  pages: EHFavoritesList[];
};

export type ToplistTab = {
  type: "toplist";
  options: EHTopListSearchOptions;
  pages: EHTopList[];
};

export type UploadTab = {
  type: "upload";
  pages: EHUploadList[];
};

export type ArchiveList = {
  type: "archive";
  all_count: number;
  items: EHListExtendedItem[];
}

export type ArchiveTab = {
  type: "archive";
  options: ArchiveSearchOptions;
  pages: ArchiveList[];
};