import { dbManager } from "../utils/database";
import { ArchiveRepository } from "./archive-repository";
import { SearchRepository } from "./search-repository";
import { UploaderRepository } from "./uploader-repository";

export { MutationOrigin } from "./mutation-origin";

export const archiveRepository = new ArchiveRepository(dbManager);
export const searchRepository = new SearchRepository(dbManager);
export const uploaderRepository = new UploaderRepository(dbManager);
