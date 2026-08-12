import { EHSearchTerm } from "ehentai-parser";
import { DBSearchBookmarks, DBSearchHistory, SearchEntityId } from "../types";
import { MutationOrigin } from "./mutation-origin";
import { V2SearchBookmarkRepository } from "./search-bookmark-repository-v2";
import { V2SearchHistoryRepository } from "./search-history-repository-v2";

function requireStableSearchId(id: SearchEntityId, name: string): string {
  if (typeof id !== "string" || !/^[0-9a-f]{64}$/u.test(id)) {
    throw new Error(`${name}必须是 v2 64 位小写 SHA-256 稳定 ID`);
  }
  return id;
}

/**
 * 把已拆分的 v2 搜索历史/书签实体 Adapter 重新组合成 ConfigManager 需要的单一业务接口。
 * 这里仅转换 UI 字段名与稳定 ID，不绕过实体 Adapter 写业务表或 outbox。
 */
export class V2SearchRepositoryFacade {
  constructor(
    private readonly history: V2SearchHistoryRepository,
    private readonly bookmarks: V2SearchBookmarkRepository,
  ) {}

  queryHistory(): DBSearchHistory {
    return this.history.queryHistory().map((item) => ({
      id: item.historyId,
      last_access_time: item.lastAccessTime,
      sorted_fsearch: item.sortedFsearch,
      searchTerms: item.searchTerms,
    }));
  }

  upsertHistory(
    sortedFsearch: string,
    searchTerms: EHSearchTerm[],
    origin: MutationOrigin,
    lastAccessTime = new Date().toISOString(),
  ): DBSearchHistory[number] {
    const item = this.history.upsertHistory(sortedFsearch, searchTerms, origin, lastAccessTime).item;
    return {
      id: item.historyId,
      last_access_time: item.lastAccessTime,
      sorted_fsearch: item.sortedFsearch,
      searchTerms: item.searchTerms,
    };
  }

  deleteHistoryLocally(id: SearchEntityId): void {
    this.history.deleteHistoryLocally(requireStableSearchId(id, "搜索历史 ID"));
  }

  deleteHistoryBeforeLocally(before: string): number {
    return this.history.deleteHistoryBeforeLocally(before);
  }

  getSomeLastAccessSearchTerms(limit = 20): EHSearchTerm[] {
    return this.history.getSomeLastAccessSearchTerms(limit);
  }

  queryBookmarks(): DBSearchBookmarks {
    return this.bookmarks.queryBookmarks().map((item, sortOrder) => ({
      id: item.bookmarkId,
      sort_order: sortOrder,
      sorted_fsearch: item.sortedFsearch,
      searchTerms: item.searchTerms,
    }));
  }

  addBookmark(sortedFsearch: string, searchTerms: EHSearchTerm[], origin: MutationOrigin): boolean {
    return this.bookmarks.addBookmark(sortedFsearch, searchTerms, origin).inserted;
  }

  deleteBookmark(id: SearchEntityId, origin: MutationOrigin): void {
    this.bookmarks.deleteBookmark(requireStableSearchId(id, "搜索书签 ID"), origin);
  }

  reorderBookmarks(ids: SearchEntityId[], origin: MutationOrigin): void {
    this.bookmarks.reorderBookmarks(
      ids.map((id) => requireStableSearchId(id, "搜索书签 ID")),
      origin,
    );
  }
}
