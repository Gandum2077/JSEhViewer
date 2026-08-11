# 云端同步 Phase 1：本地数据库与 Repository 进展

> 开始日期：2026-08-11
> 当前状态：进行中。第一小步已完成；尚未迁移用户表或上传业务数据。

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

## 第一小步尚未包含

- `createDB()` 仍沿用“先尝试创建当前表，再读取 `user_version`”的旧顺序，其中的 DDL 返回值还没有统一纳入错误检查。下一小步会先重构初始化顺序，再启用严格 DDL 检查，避免在旧库上形成半新半旧 schema。
- `CURRENT_USER_VERSION` 仍为 1；尚未建立或迁移 DB v2。
- 尚未拆分 `archives`，也没有建立稳定 ID、外键、同步版本表或 outbox。
- 尚未引入 reading/search/marked uploader 等 domain repository。
- Cookie、WebDAV 与 AI 翻译服务的密钥处理本阶段暂不迁移；按当前产品决定，`ai_translation_services` 和 `webdav_services` 在 v1 不同步。

## 自动验证结果

- `npm run test:sqlite-safe`：通过。
- `npx tsc --noEmit`：通过。
- 完整 App 构建会在本小步提交前再次执行。

## 你目前需要做的事项

- [ ] 暂无。请不要用当前开发版对正式数据库执行人为破坏测试。

下一小步完成“初始化顺序 + fresh/v0/v1 fixture”后，我会把只读或隔离副本上的真机检查加入云端同步诊断页，再请你验证；不会要求直接拿唯一的正式数据库试错。

## 下一小步

1. 把“空数据库首次创建”和“已有数据库逐版迁移”分成两条明确路径；
2. 为迁移建立一次性备份和失败恢复约束；
3. 建立 fresh/v0/v1 fixture，对比最终 `sqlite_schema`，并执行 `foreign_key_check`；
4. 评审 DB v2 的实际表结构后，才开始复制用户数据。
