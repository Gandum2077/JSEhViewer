import { dbManager } from "../utils/database";
import { ArchiveRepository } from "./archive-repository";
import { SearchRepository } from "./search-repository";
import { UploaderRepository } from "./uploader-repository";
import { MarkedTagRepository } from "./marked-tag-repository";
import {
  ArchiveRepositoryContract,
  MarkedTagRepositoryContract,
  SearchRepositoryContract,
  UploaderRepositoryContract,
} from "./repository-contracts";

export { MutationOrigin } from "./mutation-origin";
export { MarkedTagMode } from "./marked-tag-repository";

export const archiveRepository: ArchiveRepositoryContract = new ArchiveRepository(dbManager);
export const searchRepository: SearchRepositoryContract = new SearchRepository(dbManager);
export const uploaderRepository: UploaderRepositoryContract = new UploaderRepository(dbManager);
export const markedTagRepository: MarkedTagRepositoryContract = new MarkedTagRepository(dbManager);
