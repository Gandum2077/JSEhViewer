import { EHSearchTerm, TagNamespace } from "ehentai-parser";
import {
  ArchiveSearchOptions,
  DBArchiveItem,
  DBSearchBookmarks,
  DBSearchHistory,
  MarkedTag,
  SearchEntityId,
} from "../types";
import { ArchiveMetadata, ArchiveStateUpdate } from "./archive-repository";
import { MarkedTagMode } from "./marked-tag-repository";
import { MutationOrigin } from "./mutation-origin";
import { ReplaceBannedUploadersResult } from "./uploader-repository";

export interface ArchiveRepositoryContract {
  count(options: ArchiveSearchOptions): number;
  query(options: ArchiveSearchOptions): DBArchiveItem[];
  queryGids(options: ArchiveSearchOptions): number[];
  get(gid: number): DBArchiveItem | undefined;
  getLastReadPage(gid: number): number;
  save(item: DBArchiveItem, origin: MutationOrigin, replaceExisting?: boolean): boolean;
  update(gid: number, update: ArchiveStateUpdate, origin: MutationOrigin): void;
  findOldRemovableGids(before: string): number[];
  listDownloadedGids(): number[];
  delete(gid: number, origin: MutationOrigin, deleteReaderConfig?: boolean): void;
  deleteMany(gids: number[], origin: MutationOrigin, deleteReaderConfig?: boolean): void;
  clearAllLocalData(origin: MutationOrigin): void;
  getMetadataByGids(gids: number[]): Map<number, ArchiveMetadata>;
}

export interface SearchRepositoryContract {
  queryHistory(): DBSearchHistory;
  upsertHistory(
    sortedFsearch: string,
    searchTerms: EHSearchTerm[],
    origin: MutationOrigin,
    lastAccessTime?: string,
  ): DBSearchHistory[number];
  deleteHistoryLocally(id: SearchEntityId): void;
  deleteHistoryBeforeLocally(before: string): number;
  getSomeLastAccessSearchTerms(limit?: number): EHSearchTerm[];
  queryBookmarks(): DBSearchBookmarks;
  addBookmark(sortedFsearch: string, searchTerms: EHSearchTerm[], origin: MutationOrigin): boolean;
  deleteBookmark(id: SearchEntityId, origin: MutationOrigin): void;
  reorderBookmarks(ids: SearchEntityId[], origin: MutationOrigin): void;
}

export interface UploaderRepositoryContract {
  queryMarkedUploaders(): string[];
  queryBannedUploaders(): string[];
  addMarkedUploader(uploader: string, origin: MutationOrigin): boolean;
  deleteMarkedUploader(uploader: string, origin: MutationOrigin): boolean;
  replaceBannedUploaders(uploaders: string[], origin: MutationOrigin): ReplaceBannedUploadersResult;
}

export interface MarkedTagRepositoryContract {
  queryMarkedTags(): MarkedTag[];
  replaceUpstreamMirror(tags: MarkedTag[], mode: MarkedTagMode, origin: MutationOrigin): MarkedTag[];
  upsertLocalTag(tag: MarkedTag, mode: MarkedTagMode, origin: MutationOrigin): MarkedTag;
  updateUpstreamTag(tag: MarkedTag, mode: MarkedTagMode, origin: MutationOrigin): MarkedTag;
  deleteLocalTag(namespace: TagNamespace, name: string, mode: MarkedTagMode, origin: MutationOrigin): boolean;
  clearForRelogin(origin: MutationOrigin): number;
}
