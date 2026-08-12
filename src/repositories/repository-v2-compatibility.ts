import { ArchiveRepository } from "./archive-repository";
import { V2ArchiveRepository } from "./archive-repository-v2";
import { MarkedTagRepository } from "./marked-tag-repository";
import { V2MarkedTagRepository } from "./marked-tag-repository-v2";
import {
  ArchiveRepositoryContract,
  MarkedTagRepositoryContract,
  SearchRepositoryContract,
  UploaderRepositoryContract,
} from "./repository-contracts";
import { SearchRepository } from "./search-repository";
import { V2SearchRepositoryFacade } from "./search-repository-v2-facade";
import { UploaderRepository } from "./uploader-repository";
import { V2UploaderRepository } from "./uploader-repository-v2";

type RequireContract<Implementation extends Contract, Contract> = true;

// 这些类型别名没有运行时代码；任一公共业务签名偏离时，TypeScript 会阻止构建。
type ArchiveV1Contract = RequireContract<ArchiveRepository, ArchiveRepositoryContract>;
type ArchiveV2Contract = RequireContract<V2ArchiveRepository, ArchiveRepositoryContract>;
type SearchV1Contract = RequireContract<SearchRepository, SearchRepositoryContract>;
type SearchV2Contract = RequireContract<V2SearchRepositoryFacade, SearchRepositoryContract>;
type UploaderV1Contract = RequireContract<UploaderRepository, UploaderRepositoryContract>;
type UploaderV2Contract = RequireContract<V2UploaderRepository, UploaderRepositoryContract>;
type MarkedTagV1Contract = RequireContract<MarkedTagRepository, MarkedTagRepositoryContract>;
type MarkedTagV2Contract = RequireContract<V2MarkedTagRepository, MarkedTagRepositoryContract>;

export type RepositoryV2CompatibilityAssertions = [
  ArchiveV1Contract,
  ArchiveV2Contract,
  SearchV1Contract,
  SearchV2Contract,
  UploaderV1Contract,
  UploaderV2Contract,
  MarkedTagV1Contract,
  MarkedTagV2Contract,
];
