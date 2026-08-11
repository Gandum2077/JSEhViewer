import { dbManager } from "../utils/database";
import { ArchiveRepository } from "./archive-repository";

export { MutationOrigin } from "./mutation-origin";

export const archiveRepository = new ArchiveRepository(dbManager);
