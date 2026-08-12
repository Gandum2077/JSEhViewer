# DB v2 Repository 集中装配与整库回归

> 实施日期：2026-08-12
> 状态：Node 自动整库回归与 JSBox 隔离真机检查均已通过。正式数据库和正式 Repository 仍为 v1。

## 1. 为什么增加集中装配层

此前五个 v2 Adapter 已分别通过测试，但正式 App 不能在四个业务模块里各自判断数据库版本，否则人工调整时很容易出现图库用了 v2、搜索仍用了 v1，或者不同 Adapter 使用不同 codec/HLC 运行时的情况。

新增 `repository-runtime.ts`，把需要人工审查和最终切换的装配集中到一处：

- `createV1RepositoryRuntime(database)`：当前正式启动使用；
- `createV2RepositoryRuntime(options)`：统一创建图库、搜索历史、搜索书签、上传者、本地标签五个 Adapter；
- v2 的五个 Adapter 共享同一个 `RepositoryDatabase`、`SyncMutationWriter` 和 `SyncEntityEnvelopeCodec`；
- 搜索历史与书签由 `V2SearchRepositoryFacade` 重新组合成 ConfigManager 已有的单一搜索接口；
- 普通 UI 只能看到四个公共 Repository 契约；迁移 seed 和远端 apply 才能访问 `runtime.adapters`。

正式 `src/repositories/index.ts` 现在也经过该装配层导出 Repository，但仍明确调用 v1 工厂。`CURRENT_USER_VERSION` 仍为 1。

## 2. 为什么诊断不直接创建 ConfigManager

`ConfigManager` 构造函数除 Repository 外，还会读取正式 `config`、翻译、AI/WebDAV、本机文件目录等数据。为了测试 v2 而直接创建它，会扩大隔离诊断的权限范围并可能碰到真实用户数据。

本次采用更窄的整库回归：使用 ConfigManager/StatusManager 实际依赖的公共 Repository 契约，按照它们真实的调用顺序执行写入、重查缓存、重排和维护性清理。编译期契约保证正式调用签名一致，集中工厂保证测试与未来正式装配使用同一组对象。仍属于本机表的 config、AI/WebDAV 与 reader config 不在本次同步运行时测试范围内。

## 3. 自动整库回归覆盖

运行：

```sh
npm run test:repository-runtime-v2
```

单个 v2 数据库中会执行：

- 对迁移后已有的图库列表、阅读进度、稍后阅读、搜索历史、搜索书签、标记上传者、本地标签共 7 个对象做可重入 seed；
- 图库计数、标签筛选、元数据、低页码阅读进度、用户删除 tombstone；
- 本机下载状态更新，并确认不增加 outbox；
- 搜索历史新增、最近搜索词和本机删除，并确认使用稳定字符串 ID；
- 搜索书签新增、逐项重排、删除与 tombstone；
- 标记上传者新增/删除，以及上游屏蔽列表清理冲突项；
- 本地标签写入、重新登录整表清空、网站镜像模式、再次清空并返回本地模式；
- 所有剩余 outbox 都与 `sync_versions` 的 object key、HLC、设备、删除标志和 op ID 一致；
- 五类 Adapter 共享的 HLC 版本没有重复。

Node 自动检查已经通过。

2026-08-12，同一整库装配也已在 JSBox 真机隔离临时库通过（51 ms）。

## 4. JSBox 隔离诊断

云端同步诊断页增加“检查五类 v2 Repository 整库装配”。它只创建：

```text
assets/cloud-sync-phase1-repository-runtime-v2.db
```

及 SQLite sidecar。检查会关闭数据库、重新打开并复核所有最终业务状态和同步元数据，然后删除临时文件。它不读取或修改 `assets/database.db`，不连接 Worker，也不使用用户的连接包、恢复包或业务内容。

## 5. 本步仍未解决的事项

- 尚未把 `initializeDatabase()` 的正式 schema/version 提升到 2；
- 尚未决定“备份 → 迁移 → 创建 v2 runtime → 可重入 seed → 正式启动”的失败恢复状态机；
- 诊断仍使用明确命名的明文 codec，生产 HMAC/AEAD codec 尚未实现；
- 尚未接入 Worker push/pull、ACK、cursor 或远端 apply 调度；
- 尚未在正式数据库副本上运行完整 App UI 回归。

因此本步的结论是“v2 Repository 可以作为一个整体工作”，不是“现在可以迁移用户数据库”。
