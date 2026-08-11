import { EHQualifier, EHSearchTerm, TagNamespace } from "ehentai-parser";
import { DBSearchBookmarks, DBSearchHistory } from "../types";
import { SqliteTransactionContext } from "../utils/sqlite-safe";
import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";

type SearchHistoryItem = DBSearchHistory[number];
const PARENT_ID_BATCH_SIZE = 400;

interface SearchTermRow {
  parent_id: number;
  namespace: string | null;
  qualifier: string | null;
  term: string;
  dollar: number | null;
  subtract: number | null;
  tilde: number | null;
}

function mapSearchTerm(row: SearchTermRow): EHSearchTerm {
  return {
    namespace: row.namespace ? (row.namespace as TagNamespace) : undefined,
    qualifier: row.qualifier ? (row.qualifier as EHQualifier) : undefined,
    term: row.term,
    dollar: Boolean(row.dollar),
    subtract: Boolean(row.subtract),
    tilde: Boolean(row.tilde),
  };
}

function groupTerms(rows: SearchTermRow[]): Map<number, EHSearchTerm[]> {
  const result = new Map<number, EHSearchTerm[]>();
  for (const row of rows) {
    const parentId = Number(row.parent_id);
    const terms = result.get(parentId) ?? [];
    terms.push(mapSearchTerm(row));
    result.set(parentId, terms);
  }
  return result;
}

function insertTerms(
  transaction: SqliteTransactionContext,
  tableName: "search_history_search_terms" | "search_bookmarks_search_terms",
  parentColumn: "search_history_id" | "search_bookmarks_id",
  parentId: number,
  terms: EHSearchTerm[],
): void {
  for (const term of terms) {
    transaction.update(
      `INSERT INTO ${tableName}
       (${parentColumn}, namespace, qualifier, term, dollar, subtract, tilde)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parentId,
        term.namespace,
        term.qualifier,
        term.term,
        Number(term.dollar),
        Number(term.subtract),
        Number(term.tilde),
      ],
      `写入 ${tableName}`,
    );
  }
}

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  if (leftSet.size !== left.length) return false;
  return right.every((id) => leftSet.has(id));
}

export class SearchRepository {
  constructor(private readonly database: RepositoryDatabase) {}

  queryHistory(): DBSearchHistory {
    const parents = this.database.query(
      `SELECT id, last_access_time, sorted_fsearch
       FROM search_history
       ORDER BY last_access_time DESC, id DESC`,
    ) as { id: number; last_access_time: string; sorted_fsearch: string }[];
    const terms = this.queryTerms(
      "search_history_search_terms",
      "search_history_id",
      parents.map((row) => row.id),
    );
    return parents.map((row) => ({
      id: row.id,
      last_access_time: row.last_access_time,
      sorted_fsearch: row.sorted_fsearch,
      searchTerms: terms.get(row.id) ?? [],
    }));
  }

  upsertHistory(
    sortedFsearch: string,
    searchTerms: EHSearchTerm[],
    origin: MutationOrigin,
    lastAccessTime = new Date().toISOString(),
  ): SearchHistoryItem {
    requireMutationOrigin(origin);
    return this.database.transaction((transaction) => {
      const existing = transaction.query<{ id: number }>("SELECT id FROM search_history WHERE sorted_fsearch = ?", [
        sortedFsearch,
      ])[0];
      let id: number;
      if (existing) {
        id = Number(existing.id);
        transaction.update("UPDATE search_history SET last_access_time = ? WHERE id = ?", [lastAccessTime, id]);
        transaction.update("DELETE FROM search_history_search_terms WHERE search_history_id = ?", [id]);
      } else {
        transaction.update("INSERT INTO search_history (last_access_time, sorted_fsearch) VALUES (?, ?)", [
          lastAccessTime,
          sortedFsearch,
        ]);
        const inserted = transaction.query<{ id: number }>("SELECT id FROM search_history WHERE sorted_fsearch = ?", [
          sortedFsearch,
        ])[0];
        if (!inserted) throw new Error("新增搜索历史后无法取得本机 ID");
        id = Number(inserted.id);
      }
      insertTerms(transaction, "search_history_search_terms", "search_history_id", id, searchTerms);
      return { id, last_access_time: lastAccessTime, sorted_fsearch: sortedFsearch, searchTerms };
    }, "保存搜索历史");
  }

  deleteHistoryLocally(id: number): void {
    this.database.transaction((transaction) => {
      transaction.update("DELETE FROM search_history_search_terms WHERE search_history_id = ?", [id]);
      transaction.update("DELETE FROM search_history WHERE id = ?", [id]);
    }, "仅从本机删除搜索历史");
  }

  deleteHistoryBeforeLocally(before: string): number {
    return this.database.transaction((transaction) => {
      const ids = transaction
        .query<{ id: number }>("SELECT id FROM search_history WHERE last_access_time < ?", [before])
        .map((row) => Number(row.id));
      for (const id of ids) {
        transaction.update("DELETE FROM search_history_search_terms WHERE search_history_id = ?", [id]);
        transaction.update("DELETE FROM search_history WHERE id = ?", [id]);
      }
      return ids.length;
    }, "仅从本机清理旧搜索历史");
  }

  getSomeLastAccessSearchTerms(limit = 20): EHSearchTerm[] {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("最近搜索词数量必须是正整数");
    const rows = this.database.query(
      `SELECT namespace, qualifier, term
       FROM (
         SELECT t.namespace, t.qualifier, t.term, h.last_access_time, t.rowid AS term_rowid,
           ROW_NUMBER() OVER (
             PARTITION BY t.namespace, t.qualifier, t.term
             ORDER BY h.last_access_time DESC, t.rowid DESC
           ) AS row_num
         FROM search_history_search_terms AS t
         JOIN search_history AS h ON t.search_history_id = h.id
       )
       WHERE row_num = 1
       ORDER BY last_access_time DESC, term_rowid DESC
       LIMIT ?`,
      [limit],
    ) as { namespace: string | null; qualifier: string | null; term: string }[];
    return rows.map((row) => ({
      namespace: row.namespace ? (row.namespace as TagNamespace) : undefined,
      qualifier: row.qualifier ? (row.qualifier as EHQualifier) : undefined,
      term: row.term,
      dollar: false,
      subtract: false,
      tilde: false,
    }));
  }

  queryBookmarks(): DBSearchBookmarks {
    const parents = this.database.query(
      `SELECT id, sort_order, sorted_fsearch
       FROM search_bookmarks
       ORDER BY sort_order ASC, id ASC`,
    ) as { id: number; sort_order: number; sorted_fsearch: string }[];
    const terms = this.queryTerms(
      "search_bookmarks_search_terms",
      "search_bookmarks_id",
      parents.map((row) => row.id),
    );
    return parents.map((row) => ({
      id: row.id,
      sort_order: row.sort_order,
      sorted_fsearch: row.sorted_fsearch,
      searchTerms: terms.get(row.id) ?? [],
    }));
  }

  addBookmark(sortedFsearch: string, searchTerms: EHSearchTerm[], origin: MutationOrigin): boolean {
    requireMutationOrigin(origin);
    return this.database.transaction((transaction) => {
      const existing = transaction.query<{ id: number }>("SELECT id FROM search_bookmarks WHERE sorted_fsearch = ?", [
        sortedFsearch,
      ])[0];
      if (existing) return false;
      const maximum = transaction.query<{ maximum: number | null }>(
        "SELECT MAX(sort_order) AS maximum FROM search_bookmarks",
      )[0]?.maximum;
      const sortOrder = maximum === null || maximum === undefined ? 0 : Number(maximum) + 1;
      transaction.update("INSERT INTO search_bookmarks (sort_order, sorted_fsearch) VALUES (?, ?)", [
        sortOrder,
        sortedFsearch,
      ]);
      const inserted = transaction.query<{ id: number }>("SELECT id FROM search_bookmarks WHERE sorted_fsearch = ?", [
        sortedFsearch,
      ])[0];
      if (!inserted) throw new Error("新增搜索书签后无法取得本机 ID");
      insertTerms(
        transaction,
        "search_bookmarks_search_terms",
        "search_bookmarks_id",
        Number(inserted.id),
        searchTerms,
      );
      return true;
    }, "新增搜索书签");
  }

  deleteBookmark(id: number, origin: MutationOrigin): void {
    requireMutationOrigin(origin);
    this.database.transaction((transaction) => {
      transaction.update("DELETE FROM search_bookmarks_search_terms WHERE search_bookmarks_id = ?", [id]);
      transaction.update("DELETE FROM search_bookmarks WHERE id = ?", [id]);
      const remainingIds = transaction
        .query<{ id: number }>("SELECT id FROM search_bookmarks ORDER BY sort_order ASC, id ASC")
        .map((row) => Number(row.id));
      remainingIds.forEach((remainingId, index) => {
        transaction.update("UPDATE search_bookmarks SET sort_order = ? WHERE id = ?", [index, remainingId]);
      });
    }, "删除并重排搜索书签");
  }

  reorderBookmarks(ids: number[], origin: MutationOrigin): void {
    requireMutationOrigin(origin);
    this.database.transaction((transaction) => {
      const existingIds = transaction
        .query<{ id: number }>("SELECT id FROM search_bookmarks ORDER BY id")
        .map((row) => Number(row.id));
      if (!sameIds(ids, existingIds)) throw new Error("书签重排必须且只能包含全部现有书签");
      ids.forEach((id, index) => {
        transaction.update("UPDATE search_bookmarks SET sort_order = ? WHERE id = ?", [index, id]);
      });
    }, "重排搜索书签");
  }

  private queryTerms(
    tableName: "search_history_search_terms" | "search_bookmarks_search_terms",
    parentColumn: "search_history_id" | "search_bookmarks_id",
    parentIds: number[],
  ): Map<number, EHSearchTerm[]> {
    if (!parentIds.length) return new Map();
    const rows: SearchTermRow[] = [];
    for (let index = 0; index < parentIds.length; index += PARENT_ID_BATCH_SIZE) {
      const batch = parentIds.slice(index, index + PARENT_ID_BATCH_SIZE);
      rows.push(
        ...(this.database.query(
          `SELECT ${parentColumn} AS parent_id, namespace, qualifier, term, dollar, subtract, tilde
           FROM ${tableName}
           WHERE ${parentColumn} IN (${batch.map(() => "?").join(", ")})
           ORDER BY ${parentColumn}, rowid`,
          batch,
        ) as SearchTermRow[]),
      );
    }
    return groupTerms(rows);
  }
}
