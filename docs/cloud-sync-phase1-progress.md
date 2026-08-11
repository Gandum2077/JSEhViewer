# 云端同步 Phase 1：本地数据库与 Repository 进展

> 开始日期：2026-08-11
> 当前状态：进行中。SQLite 安全层、数据库初始化、DB v2 schema 与 v1 → v2 迁移均已通过自动验证和 JSBox 真机临时库验证；图库业务读写已收口到 v1 兼容 repository，等待真机临时库验证。正式数据库尚未迁移，也未上传业务数据。

## 本阶段目标

Phase 1 只改造本地数据层，为以后生成 outbox 做准备。退出 Phase 1 前需要完成：

1. 所有 SQLite 查询与更新都能可靠报告失败；
2. 一次用户操作涉及的业务写入可以和未来的 outbox 写入处于同一事务；
3. 数据库初始化先识别版本，再创建新库或逐版迁移；
4. 完成 DB v2 表结构、一次性备份、数据复制与校验；
5. 同步候选业务写入改走明确的 domain repository；
6. 现有功能和 v0/v1 升级回归通过。

Phase 1 不连接 Worker，不上传阅读记录、搜索历史或图库列表。

## 已完成：第一小步（SQLite 安全包装层）

- 新增 `src/utils/sqlite-safe.ts`，将 SQLite 细节从业务数据库管理器中抽离，便于在 Node mock 和 JSBox 真机分别验证。
- `DBManager` 的查询、单条更新、批量更新、批量插入和多语句事务全部进入同一个 `$sqlite.dbQueue.operations()` 队列，避免并发访问同一连接。
- 事务在队列 callback 内显式执行 `beginTransaction()`、`commit()` 和 `rollback()`；没有使用 Phase 0 真机表现不可靠的 `dbQueue.transaction()`。
- 每条 `db.update()` 都检查 `{ result, error }`。SQLite 以返回值报告约束失败时会立即抛错，并回滚整笔事务。
- 查询现在检查 callback 的 `err`、空结果集和同步完成状态，不再在查询失败后继续调用 `rs.next()`。
- 新增 callback transaction API。后续 repository 可在一次 callback 中写业务表、版本表和 outbox；异步 callback 会被拒绝并回滚。
- 数据库异常不会包含 SQL 参数，避免把 config、Cookie、密码等值写入日志。
- 现有 v0 → v1 AI 翻译服务迁移已改用同一安全事务 API。
- 修复 `favcat_titles` 缺少 `IF NOT EXISTS` 的问题。
- 修复原先无效的 `BEFORE INSERT OR UPDATE` WebDAV trigger SQL，拆为 INSERT 与 UPDATE 两个 trigger。
- 新增 `npm run test:sqlite-safe`，覆盖队列执行、正常提交、`{ result, error }` 约束失败、完整回滚、查询错误、参数脱敏、异步事务拒绝。

## 尚未包含

- `CURRENT_USER_VERSION` 仍为 1；DB v2 目前只是未接入启动流程的可执行草案，尚未迁移正式数据库。
- 正式数据库尚未拆分 `archives`，也没有启用稳定 ID、外键、同步版本表或 outbox；当前图库 repository 仍以 v1 表为底层，目的是先把调用方与表结构解耦。
- 尚未引入 search/marked uploader 等 domain repository；图库 repository 也尚未接入 v2 三表和 outbox。
- Cookie、WebDAV 与 AI 翻译服务的密钥处理本阶段暂不迁移；按当前产品决定，`ai_translation_services` 和 `webdav_services` 在 v1 不同步。

## 已完成：第二小步（初始化顺序与 fixture）

- 删除“先创建所有当前表，再检查版本”的启动路径。现在先读取 `PRAGMA user_version` 和已有业务表，再区分空库、v0、v1 与不支持版本。
- 只有 `user_version=0` 且没有业务表时才按 fresh database 创建；非零版本的空库会作为异常停止，避免把被误删的库静默当成新安装。
- v0 的配置读取、当前 schema 创建、AI 翻译服务迁移、收藏分类初始值和版本提升位于同一个显式事务；任一步失败都会完整回滚。
- v1 启动只补齐兼容 schema 和空的收藏分类，不会在用户主动删除全部 AI 服务后擅自重建默认服务。
- 高于当前 App 支持范围的数据库版本会在任何 schema 写入前停止，并提示使用更新版 App。
- 所有 DDL 现在通过安全包装层检查 `{ result, error }`；初始化失败时会关闭数据库队列。
- 每个连接启用 `PRAGMA foreign_keys=ON`，初始化事务提交前执行 `PRAGMA foreign_key_check`。
- 正式数据库首次进入新初始化路径前，会先创建一次性的 `assets/database.pre-sync-v1.backup.db`。备份先写同目录临时文件再改名，已有备份永不覆盖；新安装没有数据库时不会生成空备份。
- 新增真实 SQLite fixture，覆盖 fresh、v0、稀疏 v1、版本 99、故障中的 v0 和“非零版本空库”；同时验证旧 `archives` 行与 AI 迁移配置保持不变。
- 云端同步诊断页新增“检查数据库初始化与迁移”，在 JSBox 内使用四个隔离临时库重复验证 fresh/v0/v1/未知版本，并在结束后删除数据库及 sidecar 文件。

## 已完成：第三小步（DB v2 可执行 schema 草案）

- 新增集中定义 `src/utils/database-schema-v2-draft.ts`。它可以创建完整的 v2 内存数据库，但刻意不接入 `initializeDatabase()`。
- 把旧 `archives` 拆为可同步列表快照 `archive_entries`、用户阅读状态 `reading_state`、仅本机下载状态 `local_gallery_state`，并让本地 `archive_taglist` 索引通过外键跟随列表快照删除。
- 搜索历史和书签改用稳定字符串 ID；terms 增加 `term_index`、复合主键与 `ON DELETE CASCADE`。
- `marked_tags` 不增加 `origin`；来源仍由本机 `config.syncMyTags` 的整表模式决定。
- `gallery_reader_config`、`ai_translation_services` 和 `webdav_services` 保持 v1 schema，不参与 v1 同步。
- tombstone 只存于 `sync_versions.deleted`，不向每张业务表增加删除标记；`sync_outbox` 外键引用版本行，使搜索历史的本机删除可以同时取消未发送操作。
- 新增 `sync_clock` 持久化 HLC，并补齐 `sync_profile`、`sync_versions`、`sync_outbox` 的约束与索引。
- 新增 [`cloud-sync-db-v2-schema-draft.md`](cloud-sync-db-v2-schema-draft.md)，逐项记录同步范围、删除语义和仍未实施的边界。
- 新增 `npm run test:database-schema-v2`，验证表职责拆分、稳定 ID、terms 顺序/级联、tombstone 边界、同步约束，以及要求保持原样的 v1 表。

## 已完成：第四小步（v1 → v2 迁移与边缘 fixture）

- 新增 `src/utils/database-migration-v2-draft.ts`，从集中 v2 schema 定义派生临时表，在调用方事务中完成复制、旧表替换、行数核对、外键检查和版本更新。
- 图库列表、阅读状态和本机下载状态从旧 `archives` 分别复制；NULL 布尔值和时间有明确归一规则，负数页码或无效标签 JSON 会停止迁移。
- history/bookmark 稳定 ID 使用注入的 UTF-8 SHA-256，既能由 Node fixture 验证，也能在后续 JSBox 真机检查中复用；terms 按旧 `rowid` 生成稳定 `term_index`。
- 书签按旧 `(sort_order, id)` 生成有间隔、可字典序比较的初始 `position_key`。
- 旧 schema 允许但业务无法使用的孤儿 tag/terms、NULL 或空 uploader 会被安全丢弃，丢弃数量进入迁移结果；其他损坏不静默猜测。
- `marked_tags`、config、AI、WebDAV、阅读器设置和图片收藏等要求保留的内容不会被迁移函数改写。
- 新增 `npm run test:database-migration-v2`，使用 252 条图库、201 条历史、v0→v1→v2 路径以及故障注入验证数据复制和完整回滚。
- 迁移仍未接入 `initializeDatabase()`；正式 `CURRENT_USER_VERSION` 保持 1。

## 已完成：第五小步（DB v2 真机临时迁移入口）

- 云端同步 CView 诊断页新增独立的“DB v2 临时迁移”状态和“检查 DB v2 临时迁移与回滚”动作。
- 成功路径创建 40 条图库、24 条搜索历史、书签和本机专属表 fixture，执行 v1 → v2 后关闭重开，验证数据、稳定 ID、顺序、外键与 `user_version=2` 持久化。
- 故障路径在临时表和部分复制已经发生后注入无效 SHA-256，验证事务回滚；关闭重开后仍是原 v1 schema、原数据和 `user_version=1`。
- 诊断明确检查 AI 配置、WebDAV 密码、`marked_tags` 与 `gallery_reader_config` 保持原样，但脱敏摘要只包含通过/失败状态和数量，不包含这些 fixture 值。
- 两条路径只使用 `assets/cloud-sync-phase1-migration-v2-*.db`，结束后删除数据库及 journal/WAL/SHM，不打开正式 `assets/database.db`。
- 沿用现有 `DynamicPreferenceListView` 与 `_perform()` 生命周期，不新增页面、定时器或后台资源。

## 已完成：第六小步（图库 Repository 兼容层）

- 新增 `ArchiveRepository`，把图库列表计数、筛选、分页、单项读取、阅读状态更新、标签索引、旧记录清理和列表元数据读取集中到一个文件。`status.ts`、`config.ts` 和 `favorite-image.ts` 不再直接访问 `archives` 或 `archive_taglist`。
- Repository 当前仍读写 v1 `archives`，没有提前切换正式 schema。以后改为 v2 `archive_entries + reading_state + local_gallery_state` 时，页面和控制器无需再次理解三张表如何拼接。
- 完整保留构成图库列表所需的标题、token、缩略图、分类、页数、标签和上游状态快照；不是只保存打开图库后可重建的 `infos.json`。
- 图库行和 `archive_taglist` 现在位于同一个 callback transaction。标签写入失败时，图库行更新会一起回滚；旧的 `INSERT OR REPLACE` 已改为明确的 `ON CONFLICT DO UPDATE`。
- 所有 repository 写入必须携带 `MutationOrigin`。当前已区分用户删除和 `clearOldReadRecords`/`clearAll` 等本机维护删除，为以后决定是否生成 outbox 留出明确边界。
- `clearOldReadRecords` 保持原语义：保护已下载图库和存在本机图片收藏的图库；E-Hentai 收藏状态本身不阻止本机阅读记录清理。
- 修复图库列表自定义 `pageSize` 时 SQL `LIMIT` 仍固定按 50 计算的问题。
- 图片收藏分组不再跨 repository 直接 JOIN `archives`；先聚合本机收藏页，再通过 repository 批量补齐标题、token 和页数。
- 新增 `npm run test:archive-repository`，覆盖插入不覆盖、显式替换、标签故障原子回滚、状态更新、筛选、分页、维护性删除、列表元数据和变更来源校验。
- 云端同步诊断页新增“检查图库 Repository 业务读写”，只使用 `assets/cloud-sync-phase1-archive-repository.db` 临时库，并检查关闭重开和临时文件清理。
- 首轮真机检查发现持久化哨兵同时符合旧记录清理条件，而诊断没有直接断言它未进入删除集合。诊断现已改为经 Repository 将哨兵标记为本机下载项，并在关闭前、重开后分别检查记录、标题与标签，避免把 fixture 被删除误报为 SQLite 持久化失败。

## 自动验证结果

- `npm run test:sqlite-safe`：通过。
- `npm run test:database-init`：通过。
- `npm run test:database-migration-v2`：通过。
- `npm run test:database-schema-v2`：通过。
- `npm run test:archive-repository`：通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过；仅保留既有的 webpack 包体积提示。
- 2026-08-11 JSBox 真机数据库初始化临时库检查：通过（26 ms）。fresh、v0、v1 最终 schema 一致，旧数据完整迁移，v1 重启不覆盖用户设置，未知版本在零 schema 写入下停止，临时文件已删除。
- 2026-08-11 JSBox 真机 DB v2 临时迁移检查：通过（36 ms）。40 条图库、24 条历史完成拆分和稳定 ID 迁移，关闭重开后数据完整；AI、WebDAV、`marked_tags` 与阅读器设置保持原样，注入故障完整回滚，临时文件已删除。
- 2026-08-11 JSBox 真机图库 Repository 临时库检查：通过（25 ms）。6 条图库完成原子保存、标签故障回滚、筛选分页和维护性删除检查；关闭重开后数据完整，临时文件已删除。

## 真机检查结果

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查数据库初始化与迁移”。
- [x] 确认结果显示 fresh/v0/v1 schema 一致、未知版本被拒绝、临时文件已删除。
- [x] 回传“最近结果”；结果不包含业务数据或密钥。

该检查只创建 `assets/cloud-sync-phase1-init-*.db` 临时库，不会打开或修改正式 `assets/database.db`。请不要对正式数据库执行人为破坏测试。

## DB v2 真机检查结果

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查 DB v2 临时迁移与回滚”。
- [x] 确认 40 条图库、24 条历史迁移完成，关闭重开后数据完整，本机专属表保持原样，注入故障完整回滚，临时文件已删除。
- [x] 回传“最近结果”；结果不包含业务数据或密钥。

该检查只创建 `assets/cloud-sync-phase1-migration-v2-success.db` 和 `assets/cloud-sync-phase1-migration-v2-rollback.db` 及其 sidecar，不会打开或修改正式数据库。

## 图库 Repository 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查图库 Repository 业务读写”。
- [x] 确认结果显示 6 条图库完成原子保存、标签故障回滚、筛选分页和维护性删除检查。
- [x] 确认结果显示关闭重开后数据完整、临时文件已删除。
- [x] 回传“最近结果”；结果只包含数量、耗时和检查结论，不包含真实图库数据。

该检查只创建 `assets/cloud-sync-phase1-archive-repository.db` 及其 sidecar，不读取或修改正式 `assets/database.db`。

## 下一小步

1. 真机通过图库 repository 临时库检查；
2. 把 search history/bookmark 读写迁到独立 repository，并落实“清除历史只清本机、普通增量只接收本机最后记录之后的云端历史”边界；
3. 增加启动失败时面向普通用户的备份恢复说明与诊断导出；
4. 所有业务读写和回归测试适配 v2 后，才把 `CURRENT_USER_VERSION` 提升为 2 并接入正式启动迁移。
