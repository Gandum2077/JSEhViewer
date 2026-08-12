# 云端同步 DB v2 schema 草案

> 草案日期：2026-08-11  
> 状态：可执行结构检查已建立，尚未接入 App 启动流程，`CURRENT_USER_VERSION` 仍为 1。  
> 单一代码定义：`src/utils/database-schema-v2-draft.ts`

## 1. 这一小步做什么

本草案先把已经确认的产品规则落实成真正可以由 SQLite 创建的表结构，但不迁移正式 `assets/database.db`。这样可以先发现主键、外键、删除语义或同步边界的问题，再编写 v1 → v2 数据复制。

运行以下命令可以在内存数据库中创建并验证草案：

```sh
npm run test:database-schema-v2
```

## 2. `archives` 怎样拆分

现有 `archives` 一行同时包含列表信息、阅读状态和本机下载状态。v2 拆成：

| v2 表                 | 保存内容                                                                                  | 是否同步                      |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| `archive_entries`     | 构成图库列表所需的标题、缩略图、标签 JSON、评分/收藏快照等；不是图库目录中的 `infos.json` | 默认同步为 `archive.entry.v1` |
| `reading_state`       | 首次/最后访问时间、read-later、最后阅读页；repository 会把它编码成独立的小实体            | 默认同步                      |
| `local_gallery_state` | 本设备是否已经下载以及下载时间                                                            | 永不同步                      |
| `archive_taglist`     | 从 `taglist_json` 建立的本地搜索索引                                                      | 不单独同步，可重建            |

`reading_state` 和 `local_gallery_state` 不引用 `archive_entries` 外键。远端分页到达顺序不固定，而且本机下载文件不应因为删除一个列表快照而消失。`archive_taglist` 则引用 `archive_entries` 并使用 `ON DELETE CASCADE`，避免留下孤儿索引。

迁移时，旧 `archives` 每行按列复制到前三张表；旧的 NULL 布尔值归一为 0/1，负数页码拒绝迁移。`archive_entries.refreshed_at` 使用本次迁移时间，表示“这是从旧库导入的快照”，不拿它代替同步 HLC。

## 3. 搜索历史和书签

### 3.1 搜索历史

- v1 默认参与同步。
- `history_id` 使用规范化 `sorted_fsearch` 的 UTF-8 字节计算 SHA-256，并保存为小写十六进制值。同一查询在不同设备上得到同一个稳定 ID。
- terms 使用 `(history_id, term_index)` 复合主键，读取时按 `term_index` 排序，不再依赖无顺序保证的 `GROUP_CONCAT`。
- 用户删除单条、旧记录或全部历史时，只删除本机 history/terms，并在同一事务中删除对应的本机 `sync_versions`；`sync_outbox` 通过外键级联取消。它不生成 tombstone，也不回退 cursor。
- 正常增量同步只读取服务端 `changes.seq > sync_profile.cursor`，所以不会重新下载已处理过的旧 change。第一次接入、明确云端恢复或 cursor 过期后的全量 snapshot 仍会重建云端历史。

### 3.2 搜索书签

- `bookmark_id` 同样由规范化 `sorted_fsearch` 的 UTF-8 字节计算稳定的小写 SHA-256；旧 schema 已禁止重复查询，因此不会合并两个原本允许共存的书签。
- `position_key` 是可比较的字符串。迁移、新增和当前全量重排使用集中定义的 12 位小写 base36、间隔 1024 的 key；只为位置实际变化的书签逐项写版本。相同 key 由 `bookmark_id` 打破平局，未来需要任意相邻插入时可在同一模块扩展 fractional 分配或显式重整。
- terms 使用 `(bookmark_id, term_index)` 主键和 `ON DELETE CASCADE`。

书签删除是跨设备用户意图，因此会产生 tombstone；搜索历史删除是已确认的本机例外。

## 4. `marked_tags` 的整表模式

`marked_tags` schema 完全不增加 `origin`：

- 本机 `config.syncMyTags=1`：整表由 E-Hentai My Tags 管理，不生成或应用 D1 标签变更；
- 本机 `config.syncMyTags=0`：整表作为本地标签参与 D1 同步；
- 用户选择重新登录后，在进入登录流程前清空本机 `marked_tags`，不产生 tombstone；这是 `syncMyTags` 唯一允许改变的入口；
- 新登录选择 `0`：从 D1 snapshot 重建本地标签；新登录选择 `1`：停止本地标签同步，由网站返回的数据整表替换。

`syncMyTags` 本身不参与 v1 同步，因此不同设备可以采用不同模式。

## 5. v1 明确保留为本机的数据

以下表在本草案中保持当前 schema，不进行顺便重构：

- `ai_translation_services`：v1 不同步，不处理同名服务、稳定 UUID 或潜在密钥；
- `webdav_services`：v1 不同步，密码仍按现状保存在本机数据库；
- `gallery_reader_config`：每台设备独立设置，永不生成 outbox；
- `config`、`translation_data`、`tag_access_count`、`download_records`、`favorite_images` 和 `favcat_titles`：仅本机或上游数据。

可执行检查会逐条比较 `ai_translation_services`、`webdav_services`、`gallery_reader_config` 等保留对象与 v1 定义，防止草案无意改列或 trigger。

## 6. tombstone 存在哪里

业务表不增加统一的 `deleted` 字段。删除后的业务行直接消失，版本信息放在通用同步表：

| 表              | 作用                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------- |
| `sync_versions` | 每个同步对象在本机见过的最高 HLC；`deleted=1` 就是本机 tombstone                              |
| `sync_outbox`   | 尚未被 Worker 确认的最终操作；同一 `object_key` 最多一条，可合并高频进度                      |
| `sync_clock`    | 持久化本机 HLC 的 wall/logical 部分，避免 App 重启后倒退                                      |
| `sync_profile`  | endpoint、设备、epoch、协议和最后完成的服务端 cursor；token 与主密钥不在表中，保存在 Keychain |

普通跨设备删除在一个事务中删除业务行、把 `sync_versions.deleted` 写为 1，并写入删除 outbox。生产 object key 是不透明 HMAC，因此实体 adapter 会让 tombstone envelope 携带加密后的最小实体身份；新设备只能在客户端解密它，Worker 仍看不到上传者、标签或查询。搜索历史的“仅本机删除”则删除业务行和对应 `sync_versions`；其 outbox 由外键自动取消。因此不需要给每张业务表加 `deleted`。

远端 D1 的 `objects` 保存每个 `object_key` 的当前获胜版本，`changes` 保存按 `seq` 排列的传输流水；它们不属于本地 DB v2 schema。

## 7. 已建立的 v1 → v2 迁移 fixture

`src/utils/database-migration-v2-draft.ts` 已实现一套尚未接入启动流程的迁移函数。调用方必须在安全事务中执行它：

1. 确认 `user_version=1` 且所需 v1 表存在；
2. 检查负数阅读页码和无法解析的 `taglist`，发现后不猜测修复，直接停止；
3. 使用从 v2 单一 schema 定义派生的临时表复制数据；
4. 为 history/bookmark 计算稳定 SHA-256，并按旧 `rowid` 写入 `term_index`；
5. 在全部复制成功后删除旧表并改名；
6. 建立 v2 索引和同步表、运行 `foreign_key_check`、核对行数，最后才写 `user_version=2`。

旧 schema 允许但业务无法使用的孤儿索引/terms、NULL 或空 uploader 会被丢弃，并在迁移结果中返回明确数量。任何其他约束错误或 hash 依赖错误都会使整个事务回滚。

`npm run test:database-migration-v2` 当前覆盖：

- 252 条图库、201 条搜索历史及其 terms 的批量复制；
- v0 先升级到 v1，再迁移到 v2；
- 列表快照、阅读状态与本机下载状态的字段归一；
- history/bookmark 稳定 ID、term 顺序和 bookmark position key；
- `marked_tags`、AI、WebDAV、阅读器设置、图片收藏和 config 内容保持不变；
- 孤儿行与无效 uploader 的可计数清理；
- 负数页码、无效 JSON 拒绝迁移；
- 在临时表已经创建、部分数据已经复制后注入 hash 故障，确认 schema、数据和版本完整回滚。

## 8. JSBox 真机临时库诊断

云端同步诊断页现已提供“检查 DB v2 临时迁移与回滚”。它只操作：

- `assets/cloud-sync-phase1-migration-v2-success.db`；
- `assets/cloud-sync-phase1-migration-v2-rollback.db`；
- 两者可能产生的 `-journal`、`-wal`、`-shm` sidecar。

成功路径会迁移 40 条图库和 24 条历史，关闭数据库后重新打开，核对拆分数据、稳定 ID、书签顺序、本机专属表和外键。故障路径会在临时表与部分数据已经写入后注入错误，确认关闭重开仍保持完整 v1 schema、原数据和 `user_version=1`。两条路径结束后都会删除临时文件。

2026-08-11 JSBox 真机检查已通过（36 ms）：40 条图库、24 条历史完成迁移，关闭重开后数据完整；AI、WebDAV、`marked_tags` 与阅读器设置保持原样，注入故障完整回滚，临时文件已删除。该检查没有打开正式 `assets/database.db`。

## 9. 已建立的共享同步写入内核

`src/repositories/sync-mutation-writer.ts` 已把所有实体共用的版本规则集中到一处：

- 用户操作或首次 seed 在调用方现有事务中推进 `sync_clock`、写 `sync_versions` 并写/合并 `sync_outbox`；
- 同一对象再次改动时更换 `op_id`，迟到的旧 ACK 只按旧 `op_id` 删除，不能误删新操作；
- 远端版本按 `(wall_ms, logical_counter, device_id)` 比较，只有严格获胜才执行调用方提供的业务写入并取消本机待上传项；
- 陈旧和重复 change 不重复修改业务表，但仍作为一次接收事件推进 HLC；
- 跨设备删除使用通用 tombstone；本机历史删除等例外直接删除版本行并级联取消 outbox；
- `object_key`、entity payload 编码和加密由更上层实体 adapter 负责，本内核只保存不透明值。

`npm run test:sync-mutation-writer` 已通过自动故障注入。2026-08-11，云端同步诊断页的独立 v2 临时库检查也已在 JSBox 真机通过（27 ms）：HLC、outbox 合并与旧 ACK 保护、tombstone、本机丢弃、远端版本顺序、故障回滚、关闭重开和临时文件清理均符合预期。该检查没有打开正式数据库或请求 Worker。

实际实体 adapter 目前包括 `V2UploaderRepository`、`V2SearchHistoryRepository`、`V2SearchBookmarkRepository`、`V2MarkedTagRepository` 和 `V2ArchiveRepository`。它们通过 `SyncEntityEnvelopeCodec` 获取 object key，并在 HLC 生成后调用 codec 编码 envelope，使生产实现可以把 object key、版本、删除标志和 profile epoch 纳入 AEAD AAD。搜索历史 adapter 落实本机清理不生成 tombstone 的例外规则；搜索书签和本地标签 adapter 实现跨设备 tombstone；标签 adapter 还隔离 `syncMyTags=1` 的 E-Hentai 镜像，并在重新登录时无 tombstone 地丢弃该实体类型的本机版本/outbox。图库 adapter 把 `archive.entry.v1`、`reading.progress.v1` 与 `reading.read-later.v1` 分成三个版本单元，保持下载状态仅本机，并由列表快照重建标签索引。五个 adapter 均已通过 Node 自动检查和 JSBox 真机隔离临时库检查；图库与阅读检查于 2026-08-12 在真机通过（47 ms）。当前只有 Node 与隔离临时库使用明确命名的明文诊断 codec；正式路径仍没有密码学 codec，也没有连接 Worker。

## 10. 仍未开始的工作

- 没有把草案接入 `initializeDatabase()`，正式数据库版本仍为 1；
- 没有把正式业务实例切到 v2；现有 App 仍读写 `archives` 和数字搜索 ID。`V2ArchiveRepository` 已用兼容 CTE 覆盖图库筛选、排序和分页，但目前只供自动与真机隔离诊断调用；
- 图库、标记上传者、搜索历史、搜索书签与本地标签均已有独立 v2 adapter，但尚未把正式 App Repository 实例切到 v2；
- 没有实现生产用 HMAC object key、AEAD envelope codec、网络 push/pull、ACK/cursor 提交或 Worker change apply 调度；
- 没有把任何现有 Cookie、AI/WebDAV 配置或业务数据上传到 Worker。

启动失败恢复已经通过 Node、production bundle 和 JSBox 真机隔离诊断。v1/v2 正式业务契约、搜索稳定字符串 ID facade 与业务文件直接 SQL 扫描也已通过自动与 2026-08-12 JSBox 真机隔离验证（27 ms）。五类 v2 Repository 现在可由一个集中 runtime 共享数据库、HLC writer 与 codec 完成装配，7 种同步实体和 ConfigManager/StatusManager 关键调用序列已通过自动整库回归与 2026-08-12 JSBox 真机隔离验证（51 ms）。备份/迁移/runtime/seed 状态机也已通过自动故障注入与 2026-08-12 JSBox 真机隔离验证（418 ms）。仍不能立刻更改 `CURRENT_USER_VERSION`：尚需定义未配置同步时的正式 v2 写入模式，并完成正式数据库副本的全 App 回归。
