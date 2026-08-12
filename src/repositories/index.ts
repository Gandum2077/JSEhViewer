import { dbManager } from "../utils/database";
import { createV1RepositoryRuntime } from "./repository-runtime";

export { MutationOrigin } from "./mutation-origin";
export { MarkedTagMode } from "./marked-tag-repository";

// 正式切换 v2 时只允许调整这个集中装配入口；CURRENT_USER_VERSION 在完成启动回归前仍为 1。
export const repositoryRuntime = createV1RepositoryRuntime(dbManager);
export const { archiveRepository, searchRepository, uploaderRepository, markedTagRepository } = repositoryRuntime;
