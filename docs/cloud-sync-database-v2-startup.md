# DB v2 启动状态机草案

> 状态：自动 fixture 与 JSBox 真机隔离验证均已通过。正式 `assets/database.db` 仍为 v1，本模块尚未接入正式启动。

## 目的

这一步把以前分别验证过的能力按真实启动顺序串起来：

1. 创建并验证一次性 v1 备份；
2. 打开数据库并识别 `user_version`；
3. 在单个 SQLite 事务中执行 v1 → v2 迁移；
4. 集中创建五类 v2 Repository runtime；
5. 分别 seed 图库、历史、书签、上传者和本地标签；
6. 复核数据库完整性、outbox/version 对应关系和 seed 可重入性后，才允许进入正式业务页面。

草案集中在 `src/utils/database-v2-startup-draft.ts`。调用方只负责提供文件备份、数据库 session、加密 codec、设备 HLC writer 和 SHA-256 等平台依赖，阶段顺序和就绪条件不再分散到页面或各 Repository。

## 为什么不新增迁移进度表

启动进度已经由三个持久化事实表示：

| 持久化事实                    | 表示的进度                    |
| ----------------------------- | ----------------------------- |
| 一次性备份文件存在且是可读 v1 | 迁移前原件已经安全保留        |
| `PRAGMA user_version=1/2`     | 迁移事务尚未提交 / 已完整提交 |
| 某对象存在 `sync_versions` 行 | 该对象已经完成初始 seed       |

迁移本身是单个事务，所以不会出现“半张表是 v1、半张表是 v2”的已提交状态。各类 seed 也分别在自己的事务中执行；若应用在历史 seed 后被杀掉，重启会看到数据库已经是 v2，并只为仍缺少 `sync_versions` 的书签、上传者或标签补 seed。

额外的进度表反而可能出现“标记写了但真实操作没完成”或相反的分叉，因此当前设计不采用它。

## 阶段与中断恢复

当前阶段依次为：

```text
backup → database-open → migration → runtime
       → seed-archives → seed-history → seed-bookmarks
       → seed-uploaders → seed-local-tags → ready
```

自动 fixture 在每个阶段的 `before` 和 `after` 各模拟一次进程退出，共 20 个边界。每次随后重新打开同一数据库，必须满足：

- 升级前备份仍为可读 v1，且不会被重启覆盖；
- 迁移前失败仍是 v1，迁移提交后失败会从 v2 继续；
- 已 seed 对象不生成第二个版本或重复 outbox；
- 最终 `sync_versions` 与 `sync_outbox` 的 object key、HLC、device、deleted 和 op ID 一致；
- 完全恢复后的再次启动，迁移和 seed 数均为 0。

另有一次迁移事务内部故障注入，确认临时表、表替换、同步表和 `user_version=2` 会一起回滚。

## `syncMyTags` 边界

状态机直接读取本机 `config.syncMyTags`：

- `false` 或 `0`：`marked_tags` 是本地标签，执行 `marked.tag.local.v1` seed；
- `true` 或 `1`：整张表是 E-Hentai My Tags 网站镜像，保留业务行但跳过本地标签 seed；
- 缺失：按当前默认值作为本地模式；
- 无效 JSON 或其他类型：停止启动，不猜测来源。

fixture 中本地模式会 seed 7 个对象：一个图库列表快照、一个阅读进度、一个稍后阅读 membership、一个历史、一个书签、一个上传者和一个本地标签。网站镜像模式只 seed 前 6 个，`marked_tags` 行仍保留，但不会出现 `marked.tag.local.v1` 版本。

## 自动验证

运行：

```sh
npm run test:database-startup-v2
```

该命令使用 Node 临时目录中的真实 SQLite 文件验证 20 个中断边界、迁移内部回滚、一次性备份不覆盖、重复启动零 seed，以及 My Tags 镜像隔离。

## JSBox 真机隔离检查

开发版进入“其他 → 云端同步”，点击“检查 v2 启动状态机与中断恢复”。诊断只使用：

- `assets/cloud-sync-phase1-database-startup-v2-template.db`
- `assets/cloud-sync-phase1-database-startup-v2.db`
- `assets/cloud-sync-phase1-database-startup-v2.backup.db`
- 上述文件可能产生的 journal/WAL/SHM 和备份临时文件

诊断会逐个模拟阶段退出、关闭并重新打开临时库，结束后删除全部文件。它不会读取或修改正式 `assets/database.db`，不会读取用户 Cookie/搜索/图库数据，也不会连接 Worker。

预期结果：

`v2 启动状态机临时库检查通过（… ms）：20 个阶段边界均可重启恢复，迁移内部故障完整回滚，一次性备份保持可读 v1；本地模式 seed 7 个对象，My Tags 镜像模式只 seed 6 个对象且不上传网站标签；完全恢复后再次启动不重复迁移或 seed，临时文件已删除。`

2026-08-12 JSBox 真机隔离检查已通过（418 ms），结果与上述预期一致。

## 尚未做的事

- 没有把草案接入 `DBManager` 或 `bootstrap`；
- 没有提升正式 `CURRENT_USER_VERSION`；
- 没有实例化生产 E2EE codec 或连接 Worker；
- 没有在用户正式数据库副本上运行全 App 业务回归。

真机隔离检查通过后，下一步是在不触碰原件的正式数据库副本上验证完整 App 启动和核心业务路径，再决定是否切换正式版本。
