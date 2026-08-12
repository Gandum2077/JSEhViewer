# 云端同步 Phase 1：本地数据库与 Repository 进展

> 开始日期：2026-08-11
> 当前状态：进行中。SQLite 安全层、数据库初始化、DB v2 schema 与 v1 → v2 迁移均已通过自动验证和 JSBox 真机临时库验证；图库、搜索历史与书签、标记与屏蔽上传者、marked tags Repository 兼容层以及共享 HLC / `sync_versions` / `sync_outbox` 原子写入内核也已通过真机验证。图库、标记上传者、搜索历史、搜索书签和本地标签五个实际 v2 adapter 均已通过自动与真机隔离临时库验证。正式数据库尚未迁移，也未上传业务数据。

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
- 图库、标记上传者、搜索历史、搜索书签和本地标签已有独立的 v2 adapter，但正式 App 仍使用 v1 兼容 Repository；本次新增的图库 v2 adapter 只由 Node fixture 和隔离真机诊断调用。
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

## 已完成：第七小步（搜索历史与书签 Repository 兼容层）

- 新增 `SearchRepository`，把搜索历史、历史 terms、搜索书签、书签 terms、最近使用词和书签重排集中管理；`ConfigManager` 不再直接访问这四张表。
- v1 Repository 仍向现有 UI 返回本机数字 ID。跨设备稳定字符串 ID 已由 v2 schema 和迁移 fixture 验证，等正式切换 v2 adapter 时在 Repository 内部替换，不要求列表组件同时改表结构。
- parent 与 terms 的新增、替换和删除现在位于同一个 callback transaction；同一条历史再次访问时会原子更新时间并重建完整 terms。
- 删除单条历史和清理旧历史使用名称明确的 `deleteHistoryLocally` / `deleteHistoryBeforeLocally`，只删除本机业务行，不创建 tombstone。正式接入 v2 后，这两个事务还会取消相应本机 `sync_versions` 和未发送 outbox，但仍不会向云端发送删除。
- 搜索书签属于用户创建内容：新增、删除和重排都携带 `MutationOrigin.user`。以后删除书签会生成 tombstone，与搜索历史的本机删除语义不同。
- 不再使用无顺序保证的 `GROUP_CONCAT` 和 `;`/`|` 分隔解析。terms 逐行按旧表 `rowid` 读取，因此顺序固定，词文本包含这两个字符时也不会损坏。
- terms 与图库列表元数据按最多 400 个 parent ID 分批查询，避免历史或图片收藏较多时超过 SQLite 单语句绑定参数上限。
- 书签删除与剩余项重排合并为一个事务；主动重排必须且只能包含全部现有书签，缺项、重复项或陌生 ID 会完整拒绝。
- 普通增量同步将按服务端 cursor 拉取“本设备尚未处理的 change”，而不是比较本机最后一条历史时间；设备时钟和本机删除不会导致旧 change 反复下载。只有首次接入、cursor 过期后的 snapshot 或用户主动全量恢复才重建云端历史。
- 新增 `npm run test:search-repository`，覆盖特殊字符、term 顺序、同查询更新、parent/terms 故障回滚、本机历史删除、旧历史清理、最近使用词、书签重复拒绝、重排与非法重排回滚。
- 云端同步诊断页新增“检查搜索历史与书签 Repository”，只使用 `assets/cloud-sync-phase1-search-repository.db` 临时库，并验证关闭重开与临时文件清理。

## 已完成：第八小步（标记与屏蔽上传者 Repository 兼容层）

- 新增 `UploaderRepository`，集中管理可同步的 `marked_uploaders` 与仅作为 E-Hentai 上游镜像的 `banned_uploaders`；`ConfigManager` 不再直接访问这两张表。
- 标记、取消标记显式使用 `MutationOrigin.user`；未来 Worker change 使用同一入口和 `MutationOrigin.remote`。屏蔽名单整表刷新只接受 `MutationOrigin.upstreamMirror`，避免以后错误地产生 D1 tombstone。
- 屏蔽名单的删除、去重写入、查找重叠标记和本机冲突清理位于同一个 callback transaction；任何一项失败都会恢复刷新前的两张表。
- 本机已经屏蔽的上传者不能被本地或远端入口重新写入 `marked_uploaders`。这是本机上游镜像约束；当前兼容层不会把这种拒绝或冲突清理上传到 D1。
- 修复上游屏蔽名单刷新后只更新 `_bannedUploaders`、没有刷新 `_markedUploaders`，导致界面在重启前仍显示已被数据库删除标记的问题。
- 修复 E-Hentai 屏蔽名单变为空时启动流程跳过刷新、旧本机镜像永久残留的问题；现在空名单也会原子清空本机 `banned_uploaders`。
- 新增 `npm run test:uploader-repository`，覆盖用户/远端/上游来源、重复操作幂等、错误来源拒绝、镜像故障回滚、名单去重、标记与屏蔽冲突清理。
- 云端同步诊断页新增“检查标记与屏蔽上传者 Repository”，只使用 `assets/cloud-sync-phase1-uploader-repository.db` 临时库，并验证关闭重开与临时文件清理。

## 已完成：第九小步（marked tags 双模式 Repository）

- 新增 `MarkedTagRepository`。本地同步模式只接受 `user`、`remote` 和 `migrationSeed` 的逐项 UPSERT/删除；E-Hentai 镜像模式只接受 `upstreamMirror` 的整表替换或单项服务器结果更新。
- `ConfigManager` 不再直接访问 `marked_tags`，每次操作都根据本机 `syncMyTags` 选择模式；本地模式和镜像模式互相拒绝不属于自己的写入，避免以后误生成 outbox 或把 D1 数据混入 My Tags。
- E-Hentai 整表刷新改为 callback transaction。删除旧表后任一新标签写入失败，会完整恢复刷新前的镜像；本地逐项更新改为明确的 `ON CONFLICT DO UPDATE`，数据库和内存字典不会再因 UPDATE 未命中而分叉。
- `syncMyTags` 仍只在登录成功时写入。启动发现没有 Cookie、即将进入登录流程时，会先调用 `prepareMarkedTagsForRelogin()` 清空整张表；这覆盖初次安装和所有“重新登录”入口。
- 重新登录清理固定使用 `MutationOrigin.localMaintenance`，不产生 D1 tombstone。登录后选择 `syncMyTags=0` 时由 D1 snapshot 重建；选择 `1` 时由 E-Hentai My Tags 整表重建。
- 新增 `npm run test:marked-tag-repository`，覆盖两种模式隔离、用户/远端/迁移/上游来源、重新登录整表清空、镜像故障回滚、远端重建及非法数据拒绝。
- 云端同步诊断页新增“检查本地与 My Tags 双模式 Repository”，只使用 `assets/cloud-sync-phase1-marked-tag-repository.db` 临时库，并验证关闭重开与临时文件清理。

## 已完成：第十小步（共享同步写入内核）

- 新增 `SyncMutationWriter`，它只接受调用方已经计算好的 `object_key` 和加密 envelope，不在这一层耦合图库、书签或标签结构，也不自行实现密码学。
- Repository 可以在自己的 callback transaction 中先写业务表，再调用该内核推进 HLC、更新 `sync_versions` 并写入 `sync_outbox`；任一步失败都会连同业务写、逻辑时钟和 outbox 一起回滚。
- 本地 HLC 的 wall/logical 部分持久化在 `sync_clock`。同毫秒连续操作增加 logical counter；设备时间倒退或先收到未来版本时，后续本地版本仍严格递增。
- 同一 `object_key` 只有一条未确认 outbox。新的本地改动会产生新的 `op_id` 并覆盖旧最终状态，同时清零重试次数；Worker 的迟到 ACK 只按 `op_id` 删除，因此不会误删后来合并出的新操作。
- 远端 change 只在 `(wall_ms, logical_counter, device_id)` 严格大于本机已见版本时执行业务 apply。获胜远端版本会取消该对象的旧 outbox；陈旧或重复 change 不改业务表，也不制造回声 outbox。
- 普通跨设备删除仍写 `sync_versions.deleted=1` 和删除 outbox。搜索历史的仅本机删除以及重新登录清理可删除 `sync_versions`，由外键级联取消 outbox，不生成 tombstone。
- 首次启用同步的 seed 与用户操作都可以创建 outbox；`remote`、`upstreamMirror` 和普通本机维护不能误走该入口。
- 新增 `npm run test:sync-mutation-writer`，覆盖同毫秒与倒退时钟、outbox 合并、迟到 ACK、tombstone、本机丢弃、远端胜负/重复、entity type 冲突、payload 约束和本地/远端故障完整回滚。
- 云端同步诊断页新增“检查 HLC、版本与 outbox 原子写入”，只使用 `assets/cloud-sync-phase1-mutation-writer.db` 临时库，不读取正式数据库，也不连接 Worker。

## 已完成：第十一步（标记上传者 v2 Adapter）

- 新增 `V2UploaderRepository` 作为第一个真正以 v2 schema 和共享写入内核工作的实体 adapter；现有 `UploaderRepository` 仍服务正式 v1 数据库，因此本次不会提前切换用户路径。
- 用户标记/取消标记在同一个 callback transaction 中写 `marked_uploaders`、推进 HLC、更新 `sync_versions` 并写入 upsert/tombstone outbox。重复操作没有业务变化时不会推进时钟或制造新 outbox。
- 增加可重入 `seedExistingMarkedUploaders()`：只为尚无 `sync_versions` 的迁移已有行创建初始版本与 outbox，重跑不会重复 seed，已被本机上游屏蔽的上传者不会上传。
- 远端 change 必须携带完整版本和 envelope；adapter 解码实体身份后重新派生 object key，拒绝 payload/key 不匹配、HLC/AAD 绑定不匹配和错误 entity type。陈旧或重复版本不重复改业务表，获胜版本不产生回声 outbox。
- tombstone 的 envelope 保存最小且加密的实体身份。原因是生产 `object_key` 是 HMAC 后的不透明值；新设备或本机已有数据 join 时，必须能在客户端解密出要删除的上传者。Worker 仍只能看到密文。
- 新增唯一的 `SyncEntityEnvelopeCodec` 边界。未来生产 HMAC/HKDF/AEAD 实现只需集中替换这一接口，并把 object key、HLC、删除标志和 profile epoch 纳入 AAD；Repository 不自行拼密钥、nonce 或密文。明文 `CloudSyncDiagnosticEntityCodec` 名称和位置均明确限定为 Node/隔离临时库验证，不得用于正式同步。
- E-Hentai 屏蔽名单仍是本机约束：若冲突对象存在尚未发送的本机 outbox，清理会同时丢弃这笔未发布版本；已由远端或 ACK 确认的版本则保留。两种情况都不生成云端 tombstone；较新的远端“标记”版本可以被记录，但在本设备保持不可见。
- 新增 `npm run test:uploader-repository-v2`，覆盖可重入 seed、版本感知 envelope、用户 upsert/delete、带身份 tombstone、远端新旧/重复版本、payload/key 与 HLC 绑定、上游屏蔽隔离以及业务/outbox 故障回滚。
- 云端同步诊断页新增“检查上传者 v2 业务与同步原子写入”，只使用 `assets/cloud-sync-phase1-uploader-repository-v2.db`，不打开正式数据库、不连接 Worker。

## 已完成：第十二步（搜索历史 v2 Adapter）

- 新增 `V2SearchHistoryRepository`，使用规范化查询的 SHA-256 作为稳定 `history_id`，并以 `search.history.v1` 作为独立同步实体；parent、按 `term_index` 排序的完整 terms、HLC、`sync_versions` 与合并后的 outbox 位于同一个事务。
- 同一规范化查询再次访问时复用同一个稳定 ID。内容和访问时间完全相同不会推进 HLC；有变化时替换完整 terms 并把尚未发送的 outbox 合并为最终版本。
- 增加可重入 `seedExistingHistory()`，只为迁移后尚无版本的历史创建初始 outbox；稳定 ID 与规范化查询不一致会停止，不能静默把损坏数据上传。
- 远端 change 的 envelope 必须同时通过 entity type、object key、HLC、稳定 ID 与规范化查询校验。获胜版本原子重建 parent/terms，陈旧或重复版本不修改业务表，也不产生回声 outbox。
- 用户删除单条、按时间清理或以后执行“清空历史”时，只删除本机 history/terms 和对应本机 `sync_versions`；外键级联取消未发送 outbox，绝不生成 tombstone。正常增量是否下载由尚未实现的同步引擎按服务端 cursor 决定，不由 Adapter 比较 `last_access_time`。
- 本机已清除的旧历史在没有新 change 时不会被普通增量重新取得；另一设备后来再次使用同一查询会形成新版本并可重新出现。首次接入、明确云端恢复或 cursor 过期后的 snapshot 会按云端现状重建。
- 新增 `npm run test:search-history-repository-v2`，覆盖稳定 ID、term 顺序与特殊字符、可重入 seed、相同查询 outbox 合并、本机单条/批量清理无 tombstone、远端新旧/重复版本、显式全量重建、payload/key/HLC 绑定和故障回滚。
- 云端同步诊断页新增“检查搜索历史 v2 远端版本与本机清理”，只使用 `assets/cloud-sync-phase1-search-history-repository-v2.db`，不打开正式数据库、不连接 Worker；该检查验证 Adapter 接收 change 的规则，不宣称网络 cursor 已经实现。

## 已完成：第十三步（搜索书签 v2 Adapter）

- 新增 `V2SearchBookmarkRepository`，以规范化查询 SHA-256 作为稳定 `bookmark_id`，单个书签是独立冲突单元；payload 包含完整 terms 与 `position_key`，而不是把整个书签数组作为一个同步对象。
- 新增集中的 `bookmark-position-key.ts`。迁移、新增和重排共同使用 12 位小写 base36、间隔 1024 的 key；查询固定按 `(position_key, bookmark_id)` 排序，所以两台设备并发分配同一位置时也不会丢项目，且结果确定。
- 现有 UI 提交的是完整书签顺序，Adapter 会在一个事务中只更新位置实际变化的项目；每个变化项目分别推进 HLC、更新版本并合并 outbox。任一项失败时，整批位置、版本和 outbox 全部回滚。
- 用户删除书签是跨设备意图：业务 parent/terms 删除和 tombstone 同事务提交，tombstone envelope 保留加密后的书签身份。陈旧远端 upsert 不能复活；较新 upsert 可以恢复，较新 tombstone 再删除。
- 新增和可重入 seed 会校验稳定 ID、规范化查询和 position key；远端 change 还必须通过 entity type、object key、HLC/AAD 与 payload 一致性校验。并发相同 position key 使用稳定 ID 打破平局。
- 当前 key 空间足以覆盖普通用户；若未来插入任意相邻位置或 key 接近安全整数上限，应在同一模块实现 fractional 分配或显式重整。该调整不改变 D1 envelope 和书签业务表接口。
- 新增 `npm run test:search-bookmark-repository-v2`，覆盖稳定 ID、可重入 seed、特殊字符与 term 顺序、追加位置、逐项重排、非法/中途失败回滚、带身份 tombstone、远端新旧/重复版本、无本机行 tombstone、并发相同位置及 payload/key/HLC 校验。
- 云端同步诊断页新增“检查搜索书签 v2 删除、重排与并发位置”，只使用 `assets/cloud-sync-phase1-search-bookmark-repository-v2.db`，不打开正式数据库、不连接 Worker。

## 已完成：第十四步（本地标签 v2 Adapter）

- 新增 `V2MarkedTagRepository`，只在本机 `syncMyTags=0` 的 `localSync` 模式处理 `marked.tag.local.v1`；`syncMyTags=1` 时继续使用继承的 E-Hentai My Tags 整表镜像方法，镜像写入不创建 `sync_versions` 或 outbox。
- 单个本地标签以无歧义的 `[namespace, name]` 作为稳定实体身份。payload 只包含 namespace、name、watched、hidden、color 和 weight；网站 `tagid` 是本机/上游镜像字段，不进入 object key 或云端 payload，单独变化也不会推进 HLC。
- 用户新增、更新和删除在同一事务中写业务行、HLC、版本和合并后的 outbox。用户删除产生携带加密标签身份的 tombstone；陈旧远端 upsert 不能复活，较新 upsert 可以恢复，较新 tombstone 可以再次删除。
- 增加可重入 `seedExistingLocalTags()`，仅在本地模式为尚无版本的迁移旧行生成初始 outbox；镜像模式调用 seed、本地入口接收 remote 来源、远端 apply 处于镜像模式时都会明确拒绝。
- `clearForRelogin(localMaintenance)` 现在在一个事务中清空整张 `marked_tags`，并按 entity type 删除全部本地标签版本；`sync_outbox` 通过外键级联取消。该动作不生成 tombstone，失败时业务表、版本和 outbox 一起回滚。登录后模式为 0 时由 D1 snapshot 重建，为 1 时由 E-Hentai 镜像重建。
- 新增 `npm run test:marked-tag-repository-v2`，覆盖可重入 seed、payload 排除 tagid、仅 tagid 变化不产生新版本、用户写入/删除、带身份 tombstone、远端新旧/重复版本、My Tags 隔离、重新登录清理、云端重建以及故障完整回滚。
- 云端同步诊断页新增“检查本地标签 v2 双模式、删除与重新登录”，只使用 `assets/cloud-sync-phase1-marked-tag-repository-v2.db`，不打开正式数据库、不连接 Worker。

## 已完成：第十五步（图库列表快照与阅读状态 v2 Adapter）

- 新增 `V2ArchiveRepository`，将同一个 `gid` 拆成三个独立冲突单元：`archive.entry.v1` 保存构成图库列表所需的快照，`reading.progress.v1` 保存页码与访问时间，`reading.read-later.v1` 保存稍后阅读 membership。某台设备刷新标题或评分快照时不会顺带覆盖另一台设备的阅读页码。
- 图库列表快照包含标题、token、缩略图、分类、页数、标签和 E-Hentai 收藏/评分等上游状态快照；它不是图库目录中的 `infos.json`。`downloaded` 只写 `local_gallery_state`，`archive_taglist` 由快照中的标签重建，二者均不进入云端 payload；`gallery_reader_config` 仍是每台设备独立设置。
- Adapter 使用一个名为 `archives` 的兼容 CTE 从 v2 三张表重建旧列表行形状，并复用现有筛选、排序、分页 SQL，因此后续正式切换不需要同时重写所有图库列表查询。
- 用户保存或更新时，业务表、标签索引、三个实体各自的 HLC/版本和合并 outbox 位于同一个 callback transaction；任一写入失败会完整回滚。阅读进度使用 LWW，小页码可以覆盖大页码，不能用 `max(page)` 猜测用户意图。
- 可重入 `seedExistingArchives()` 只为尚无版本的迁移旧数据生成初始 outbox。当前 v2 schema 没有单独的“加入稍后阅读时间”，因此 seed 暂以 `first_access_time` 作为 `addedAt`；以后若产品需要展示精确加入时间，应新增明确字段，而不是从 HLC 反推。
- 用户明确删除图库记录会为三个同步对象都写 tombstone，即使其中某个本机业务片段当前不存在，也能阻止尚未拉取的旧云端对象稍后复活。缓存清理、旧记录清理和本机“全部清除”则删除本机业务行与对应版本/outbox，不生成云端 tombstone。
- 三种远端 change 分别按 HLC 应用。`reading_state` 虽是共享物理表，删除 progress 时会保留 read-later，删除 read-later 时也会保留 progress；只有两种阅读状态都已删除才清理共享行。远端列表快照不会恢复本机下载状态或阅读状态。
- 新增 `npm run test:archive-repository-v2`，覆盖三对象可重入 seed、兼容查询、低页码 LWW、本机下载隔离、用户 tombstone、维护性丢弃、共享阅读行清理、远端重建、payload/key/HLC 校验和故障回滚。
- 云端同步诊断页新增“检查图库列表、阅读状态与本机下载隔离”，只使用 `assets/cloud-sync-phase1-archive-repository-v2.db`，不打开正式数据库、不连接 Worker。

## 自动验证结果

- `npm run test:sqlite-safe`：通过。
- `npm run test:database-init`：通过。
- `npm run test:database-migration-v2`：通过。
- `npm run test:database-schema-v2`：通过。
- `npm run test:archive-repository`：通过。
- `npm run test:archive-repository-v2`：通过。
- `npm run test:marked-tag-repository`：通过。
- `npm run test:marked-tag-repository-v2`：通过。
- `npm run test:search-repository`：通过。
- `npm run test:search-history-repository-v2`：通过。
- `npm run test:search-bookmark-repository-v2`：通过。
- `npm run test:sync-mutation-writer`：通过。
- `npm run test:uploader-repository`：通过。
- `npm run test:uploader-repository-v2`：通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过；仅保留既有的 webpack 包体积提示。
- 2026-08-11 JSBox 真机数据库初始化临时库检查：通过（26 ms）。fresh、v0、v1 最终 schema 一致，旧数据完整迁移，v1 重启不覆盖用户设置，未知版本在零 schema 写入下停止，临时文件已删除。
- 2026-08-11 JSBox 真机 DB v2 临时迁移检查：通过（36 ms）。40 条图库、24 条历史完成拆分和稳定 ID 迁移，关闭重开后数据完整；AI、WebDAV、`marked_tags` 与阅读器设置保持原样，注入故障完整回滚，临时文件已删除。
- 2026-08-11 JSBox 真机图库 Repository 临时库检查：通过（25 ms）。6 条图库完成原子保存、标签故障回滚、筛选分页和维护性删除检查；关闭重开后数据完整，临时文件已删除。
- 2026-08-11 JSBox 真机搜索 Repository 临时库检查：通过（31 ms）。8 条历史、4 条书签完成 parent/terms 原子回滚、特殊字符与顺序、本机历史删除和书签重排检查；关闭重开后数据完整，临时文件已删除。
- 2026-08-11 JSBox 真机上传者 Repository 临时库检查：通过（24 ms）。4 条标记、2 条屏蔽完成用户/远端/上游来源检查、镜像故障回滚和冲突清理；关闭重开后数据完整，临时文件已删除。
- 2026-08-11 JSBox 真机标签 Repository 临时库检查：通过（25 ms）。4 条本地标签、3 条 My Tags 镜像完成双模式隔离、重新登录整表清空、镜像故障回滚和 D1 远端重建；关闭重开后数据完整，临时文件已删除。
- 2026-08-11 JSBox 真机同步写入内核临时库检查：通过（27 ms）。HLC 单调推进、outbox 合并与旧 ACK 保护、tombstone、本机丢弃、远端版本顺序和故障回滚均正确；关闭重开后数据完整，临时文件已删除。
- 2026-08-12 JSBox 真机上传者 v2 Adapter 临时库检查：通过（30 ms）。1 条旧数据完成可重入 seed，用户新增/删除与版本/outbox 原子提交，envelope 绑定 HLC，tombstone 可恢复实体身份；远端顺序、上游屏蔽隔离和故障回滚正确，关闭重开后数据完整，临时文件已删除。
- 2026-08-12 JSBox 真机搜索历史 v2 Adapter 临时库检查：通过（36 ms）。1 条旧数据完成可重入 seed，parent/terms/版本/outbox 原子提交且 envelope 绑定 HLC；本机单条及按时间清理均不生成 tombstone，远端版本顺序、重复 apply、显式全量恢复和故障回滚正确，关闭重开后数据完整，临时文件已删除。
- 2026-08-12 JSBox 真机搜索书签 v2 Adapter 临时库检查：通过（36 ms）。3 条旧数据完成可重入 seed，parent/terms/position/版本/outbox 原子提交；逐项重排、带身份 tombstone、远端版本顺序和故障回滚正确，并发相同位置未丢书签且顺序确定，关闭重开后数据完整，临时文件已删除。
- 2026-08-12 JSBox 真机本地标签 v2 Adapter 临时库检查：通过（33 ms）。2 条旧数据完成可重入 seed，用户更新/删除与版本/outbox 原子提交，payload 排除网站 tagid，tombstone 可恢复标签身份；远端版本、My Tags 镜像隔离、重新登录无 tombstone 清理、云端重建和故障回滚正确，关闭重开后数据完整，临时文件已删除。
- 2026-08-12 JSBox 真机图库与阅读 v2 Adapter 临时库检查：通过（47 ms）。2 条旧图库完成列表快照、阅读进度、稍后阅读三对象可重入 seed；兼容查询、低页码 LWW、本机下载隔离、用户 tombstone 与维护性丢弃、共享阅读行清理、远端重建和故障回滚正确，关闭重开后数据完整，临时文件已删除。

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

## 搜索 Repository 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查搜索历史与书签 Repository”。
- [x] 确认结果显示 8 条历史、4 条书签完成 parent/terms 原子回滚、特殊字符与顺序、本机历史删除和书签重排检查。
- [x] 确认结果显示关闭重开后数据完整、临时文件已删除。
- [x] 回传“最近结果”；结果只包含数量、耗时和检查结论，不包含真实搜索内容。

该检查只创建 `assets/cloud-sync-phase1-search-repository.db` 及其 sidecar，不读取或修改正式 `assets/database.db`。

## 上传者 Repository 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查标记与屏蔽上传者 Repository”。
- [x] 确认结果显示 4 条标记、2 条屏蔽完成用户/远端/上游来源检查、镜像故障回滚和冲突清理。
- [x] 确认结果显示关闭重开后数据完整、临时文件已删除。
- [x] 回传“最近结果”；结果只包含数量、耗时和检查结论，不包含真实上传者名称。

该检查只创建 `assets/cloud-sync-phase1-uploader-repository.db` 及其 sidecar，不读取或修改正式 `assets/database.db`。

## 标签 Repository 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查本地与 My Tags 双模式 Repository”。
- [x] 确认结果显示 4 条本地标签、3 条 My Tags 镜像完成双模式隔离、重新登录整表清空、镜像故障回滚和 D1 远端重建。
- [x] 确认结果显示关闭重开后数据完整、临时文件已删除。
- [x] 回传“最近结果”；结果只包含数量、耗时和检查结论，不包含真实标签内容。

该检查只创建 `assets/cloud-sync-phase1-marked-tag-repository.db` 及其 sidecar，不读取或修改正式 `assets/database.db`。

## 同步写入内核真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查 HLC、版本与 outbox 原子写入”。
- [x] 确认结果显示 HLC、outbox 合并与旧 ACK 保护、tombstone、本机丢弃、远端版本顺序和故障回滚均正确。
- [x] 确认结果显示关闭重开后数据完整、临时文件已删除。
- [x] 回传“最近结果”；结果只包含耗时和检查结论，不包含真实业务数据、密钥或同步 payload。

该检查只创建 `assets/cloud-sync-phase1-mutation-writer.db` 及其 sidecar，不读取或修改正式 `assets/database.db`，也不会向 Worker 发请求。

## 上传者 v2 Adapter 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查上传者 v2 业务与同步原子写入”。
- [x] 确认结果显示 1 条旧数据完成可重入 seed，用户新增/删除与版本/outbox 原子提交，envelope 绑定 HLC，tombstone 可恢复实体身份。
- [x] 确认远端版本顺序、上游屏蔽隔离和故障回滚正确。
- [x] 确认关闭重开后数据完整、临时文件已删除，并回传“最近结果”。

该检查只创建 `assets/cloud-sync-phase1-uploader-repository-v2.db` 及其 sidecar。使用的 object key 和 envelope 是专供 fixture 的明文诊断格式，不包含真实用户内容，也不会发送到 Worker。

## 搜索历史 v2 Adapter 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查搜索历史 v2 远端版本与本机清理”。
- [x] 确认结果显示 1 条旧数据完成可重入 seed，parent/terms/版本/outbox 原子提交且 envelope 绑定 HLC。
- [x] 确认本机单条及按时间清理不生成 tombstone，远端版本顺序、重复 apply、显式全量恢复和故障回滚正确。
- [x] 确认关闭重开后数据完整、临时文件已删除，并回传“最近结果”。

该检查只创建 `assets/cloud-sync-phase1-search-history-repository-v2.db` 及其 sidecar。object key 和 envelope 是专供 fixture 的明文诊断格式；没有真实搜索内容，不连接 Worker，也尚未验证网络 cursor。

## 搜索书签 v2 Adapter 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查搜索书签 v2 删除、重排与并发位置”。
- [x] 确认结果显示 3 条旧数据完成可重入 seed，parent/terms/position/版本/outbox 原子提交。
- [x] 确认逐项重排、带身份 tombstone、远端版本顺序和故障回滚正确，并发相同位置未丢书签且顺序确定。
- [x] 确认关闭重开后数据完整、临时文件已删除，并回传“最近结果”。

该检查只创建 `assets/cloud-sync-phase1-search-bookmark-repository-v2.db` 及其 sidecar。object key 和 envelope 是 fixture 专用明文格式，不包含真实书签，也不会连接 Worker。

## 本地标签 v2 Adapter 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查本地标签 v2 双模式、删除与重新登录”。
- [x] 确认结果显示 2 条旧数据完成可重入 seed，用户更新/删除与版本/outbox 原子提交，payload 排除网站 tagid，tombstone 可恢复标签身份。
- [x] 确认远端版本、My Tags 镜像隔离、重新登录无 tombstone 清理、云端重建和故障回滚正确。
- [x] 确认关闭重开后数据完整、临时文件已删除，并回传“最近结果”。

该检查只创建 `assets/cloud-sync-phase1-marked-tag-repository-v2.db` 及其 sidecar。object key 和 envelope 是 fixture 专用明文格式，不包含真实标签，也不会连接 Worker。

## 图库与阅读状态 v2 Adapter 真机检查

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查图库列表、阅读状态与本机下载隔离”。
- [x] 确认结果显示 2 条旧图库完成列表快照、阅读进度、稍后阅读三个对象的可重入 seed。
- [x] 确认兼容查询、低页码 LWW、本机下载隔离、用户 tombstone 与维护性丢弃、共享阅读行清理、远端重建和故障回滚正确。
- [x] 确认关闭重开后数据完整、临时文件已删除，并回传“最近结果”。

该检查只创建 `assets/cloud-sync-phase1-archive-repository-v2.db` 及其 sidecar。object key 和 envelope 是 fixture 专用明文格式，不包含真实图库数据，也不会连接 Worker。

## 下一小步

1. 增加启动失败时面向普通用户的备份恢复说明与诊断导出；
2. 审计正式业务入口与五个 v2 adapter 的签名兼容性，补齐启动切换前的整库回归；
3. 所有业务读写和回归测试适配 v2 后，才把 `CURRENT_USER_VERSION` 提升为 2 并接入正式启动迁移。
