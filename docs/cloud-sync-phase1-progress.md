# 云端同步 Phase 1：本地数据库与 Repository 进展

> 开始日期：2026-08-11
> 当前状态：进行中。SQLite 安全层和数据库初始化重构已完成自动验证与 JSBox 真机临时库验证；尚未迁移用户表或上传业务数据。

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

- `CURRENT_USER_VERSION` 仍为 1；尚未建立或迁移 DB v2。
- 尚未拆分 `archives`，也没有建立稳定 ID、外键、同步版本表或 outbox。
- 尚未引入 reading/search/marked uploader 等 domain repository。
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

## 自动验证结果

- `npm run test:sqlite-safe`：通过。
- `npm run test:database-init`：通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过；仅保留既有的 webpack 包体积提示。
- 2026-08-11 JSBox 真机数据库初始化临时库检查：通过（26 ms）。fresh、v0、v1 最终 schema 一致，旧数据完整迁移，v1 重启不覆盖用户设置，未知版本在零 schema 写入下停止，临时文件已删除。

## 真机检查结果

- [x] 安装本次构建的开发版，进入“其他 → 云端同步”。
- [x] 点击“检查数据库初始化与迁移”。
- [x] 确认结果显示 fresh/v0/v1 schema 一致、未知版本被拒绝、临时文件已删除。
- [x] 回传“最近结果”；结果不包含业务数据或密钥。

该检查只创建 `assets/cloud-sync-phase1-init-*.db` 临时库，不会打开或修改正式 `assets/database.db`。请不要对正式数据库执行人为破坏测试。

## 下一小步

1. 把用户已经确认的同步范围落实为 DB v2 schema 草案；
2. 增加 v0/v1 数据量、损坏边缘和备份恢复 fixture；
3. 增加启动失败时面向普通用户的备份恢复说明与诊断导出；
4. 评审 DB v2 的实际表结构后，才开始复制用户数据。
