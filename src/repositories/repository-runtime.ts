import { V2ArchiveRepository } from "./archive-repository-v2";
import { ArchiveRepository } from "./archive-repository";
import { MarkedTagRepository } from "./marked-tag-repository";
import { V2MarkedTagRepository } from "./marked-tag-repository-v2";
import { RepositoryDatabase } from "./repository-database";
import {
  ArchiveRepositoryContract,
  MarkedTagRepositoryContract,
  SearchRepositoryContract,
  UploaderRepositoryContract,
} from "./repository-contracts";
import { V2SearchBookmarkRepository } from "./search-bookmark-repository-v2";
import { V2SearchHistoryRepository } from "./search-history-repository-v2";
import { SearchRepository } from "./search-repository";
import { V2SearchRepositoryFacade } from "./search-repository-v2-facade";
import { SyncEntityEnvelopeCodec } from "./sync-entity-envelope-codec";
import { SyncMutationWriter } from "./sync-mutation-writer";
import { UploaderRepository } from "./uploader-repository";
import { V2UploaderRepository } from "./uploader-repository-v2";

export interface RepositoryRuntime {
  readonly schemaVersion: 1 | 2;
  readonly archiveRepository: ArchiveRepositoryContract;
  readonly searchRepository: SearchRepositoryContract;
  readonly uploaderRepository: UploaderRepositoryContract;
  readonly markedTagRepository: MarkedTagRepositoryContract;
}

export interface V2RepositoryAdapters {
  readonly archive: V2ArchiveRepository;
  readonly searchHistory: V2SearchHistoryRepository;
  readonly searchBookmark: V2SearchBookmarkRepository;
  readonly uploader: V2UploaderRepository;
  readonly markedTag: V2MarkedTagRepository;
}

export interface V2RepositoryRuntime extends RepositoryRuntime {
  readonly schemaVersion: 2;
  readonly archiveRepository: V2ArchiveRepository;
  readonly searchRepository: V2SearchRepositoryFacade;
  readonly uploaderRepository: V2UploaderRepository;
  readonly markedTagRepository: V2MarkedTagRepository;
  /** 仅供迁移 seed、远端 apply 与诊断使用；普通 UI 只使用上面的四个公共业务接口。 */
  readonly adapters: V2RepositoryAdapters;
}

export interface CreateV2RepositoryRuntimeOptions {
  database: RepositoryDatabase;
  syncWriter: SyncMutationWriter;
  codec: SyncEntityEnvelopeCodec;
  deriveSearchId: (sortedFsearch: string) => string;
  nowIso?: () => string;
}

/** 当前正式启动仍明确调用该 v1 工厂。 */
export function createV1RepositoryRuntime(database: RepositoryDatabase): RepositoryRuntime {
  return {
    schemaVersion: 1,
    archiveRepository: new ArchiveRepository(database),
    searchRepository: new SearchRepository(database),
    uploaderRepository: new UploaderRepository(database),
    markedTagRepository: new MarkedTagRepository(database),
  };
}

/**
 * 在一个位置装配全部 v2 Repository。
 *
 * 所有实体共享调用方提供的 database、HLC writer 与 envelope codec。这里不决定何时迁移、seed、
 * 连接 Worker 或切换正式数据库版本；这些启动顺序必须在后续步骤单独验证。
 */
export function createV2RepositoryRuntime(options: CreateV2RepositoryRuntimeOptions): V2RepositoryRuntime {
  const archive = new V2ArchiveRepository(options.database, options.syncWriter, options.codec, options.nowIso);
  const searchHistory = new V2SearchHistoryRepository(
    options.database,
    options.syncWriter,
    options.codec,
    options.deriveSearchId,
  );
  const searchBookmark = new V2SearchBookmarkRepository(
    options.database,
    options.syncWriter,
    options.codec,
    options.deriveSearchId,
  );
  const uploader = new V2UploaderRepository(options.database, options.syncWriter, options.codec);
  const markedTag = new V2MarkedTagRepository(options.database, options.syncWriter, options.codec);
  return {
    schemaVersion: 2,
    archiveRepository: archive,
    searchRepository: new V2SearchRepositoryFacade(searchHistory, searchBookmark),
    uploaderRepository: uploader,
    markedTagRepository: markedTag,
    adapters: { archive, searchHistory, searchBookmark, uploader, markedTag },
  };
}
