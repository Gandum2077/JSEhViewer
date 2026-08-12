# DB v2 正式业务入口审计

> 审计日期：2026-08-12
> 状态：签名断层、直接 SQL 扫描与 JSBox 隔离真机检查均已通过。正式 Repository 工厂仍固定使用 v1。

## 1. 审计目的

DB v2 会删除旧 `archives`，并把搜索数字自增 ID 换成 SHA-256 稳定字符串。即使迁移函数和单个 v2 Adapter 都正确，只要某个正式页面仍直接查询旧表或假定搜索 ID 是数字，切换启动版本后就会崩溃或操作错行。

本次把“看起来已经改完”变成两类可执行门禁：

1. TypeScript 公共 Repository 契约同时约束 v1 与 v2 实现；
2. Node 静态扫描阻止正式业务文件绕过 Repository 直接访问同步候选表。

运行：

```sh
npm run test:v2-business-paths
```

2026-08-12，“v2 业务入口与稳定搜索 ID”隔离诊断也已在 JSBox 真机通过（27 ms）。诊断只使用临时 v2 数据库，未读写正式数据库或连接 Worker。

## 2. Repository 契约结果

| 业务域     | v1 实现               | v2 实现                    | 结论                                                                   |
| ---------- | --------------------- | -------------------------- | ---------------------------------------------------------------------- |
| 图库与阅读 | `ArchiveRepository`   | `V2ArchiveRepository`      | `count/query/get/save/update/delete/clear/metadata` 等正式调用签名一致 |
| 上传者     | `UploaderRepository`  | `V2UploaderRepository`     | v2 继承 v1 查询与上游屏蔽接口，并覆写会生成同步操作的用户写入          |
| 标签       | `MarkedTagRepository` | `V2MarkedTagRepository`    | v2 继承 My Tags 镜像接口，并覆写本地标签用户写入与重新登录清理         |
| 搜索       | `SearchRepository`    | `V2SearchRepositoryFacade` | 新 facade 把拆分的历史/书签 Adapter 组合成 ConfigManager 原有单一接口  |

`repository-contracts.ts` 保存正式业务所依赖的最小方法集合，`repository-v2-compatibility.ts` 在编译期断言上述八个实现/契约组合。任何一方以后改名、改参数或改返回形状，`tsc` 会阻止构建。

## 3. 搜索 ID 断层怎样处理

v1 搜索历史和书签使用本机数字自增 ID；v2 使用规范化查询的 64 位小写 SHA-256。UI 不应解析 ID，也不应把它用于排序，所以公共类型现在是：

```ts
type SearchEntityId = number | string;
```

- v1 Repository 查询仍返回数字，并在删除/重排入口拒绝非正整数 ID；
- v2 facade 查询返回稳定字符串，并拒绝数字旧 ID；
- ConfigManager、历史/书签列表、侧栏重排和 `label.info.id` 只透传 `SearchEntityId`；
- v2 facade 把内部 `historyId/lastAccessTime/bookmarkId/positionKey` 映射成现有 UI 需要的 `id/last_access_time/sort_order`，但所有写入仍委托给实体 Adapter，不能绕过 HLC、版本和 outbox；
- v2 历史补齐了“最近使用搜索词”查询，并按 `last_access_time/history_id/term_index` 确定顺序。

这样 v1 用户行为不变，正式切到 v2 后也不需要 UI 同时改一套字段名。混用数据库版本与 Repository 时会明确失败，而不是把字符串强转为错误的数字。

## 4. 直接 SQL 扫描边界

自动检查扫描以下正式业务范围：

- `src/index.ts`；
- `src/utils/config.ts`、`status.ts`、`favorite-image.ts`、`api.ts`；
- 全部 `src/components/**/*.ts` 与 `src/controllers/**/*.ts`。

这些文件不得在 SQL 的 `FROM/JOIN/INTO/UPDATE/DELETE FROM` 后直接出现：

- 图库/阅读三张 v2 表与旧 `archives`；
- 搜索历史、书签及其 terms；
- `marked_uploaders`、`marked_tags`；
- `sync_clock`、`sync_versions`、`sync_outbox`。

当前扫描结果为零违规。Repository、schema/迁移、数据库初始化和隔离诊断可以访问这些表，因为它们正是集中管理表结构和原子写入的边界。

`config`、AI/WebDAV、`gallery_reader_config`、`favorite_images`、`download_records` 等 v1 明确仅本机的表仍可以由现有本机模块访问；本次不会为追求“零 SQL”顺便重构它们。

## 5. 尚未允许正式切换的原因

本次只消除了业务接口和搜索 ID 的签名断层，仍没有：

- 根据数据库版本创建正式 v1/v2 Repository 实例的集中工厂；
- 生产 HMAC/AEAD `SyncEntityEnvelopeCodec`；
- 在成功迁移后可重入 seed 五类同步对象的启动流程；
- push/pull、ACK、cursor 与远端 apply 调度；
- 正式数据库 v2 整库 UI 回归。

因此 `src/repositories/index.ts` 仍导出 v1 Repository，`CURRENT_USER_VERSION` 仍为 1。后续已经增加集中 `RepositoryRuntime`：v2 五类 Adapter 的自动整库装配和 ConfigManager/StatusManager 关键调用序列回归已通过，等待真机隔离检查。之后仍需验证正式启动的备份/迁移/seed 状态机，才能考虑提升数据库版本。
