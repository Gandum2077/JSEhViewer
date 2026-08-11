# 云端同步 Phase 0：App 端进展与真机清单

> 状态：已完成（2026-08-11）。Phase 1 已在独立进度文档中开始。

## 当前进展

- “其他”页面已增加“云端同步”入口；该入口以后继续作为正式同步设置页，不是一次性脚本。
- 当前页面只做 Phase 0 诊断，不会上传阅读记录、搜索历史、图库列表或任何现有业务表。
- 已支持从文件、剪贴板和二维码导入 `jsehviewer-sync-bootstrap` 连接包。
- 连接包会严格验证格式、HTTPS 地址、UUID v4 和三个 32-byte base64url 秘密。
- 主密钥、恢复凭据、bootstrap secret、设备令牌与待提交请求只保存在 JSBox Keychain，不写 SQLite。
- 已加入 Keychain 读回检查、WebKit 安全随机数检查，以及 HMAC-SHA-256、HKDF-SHA-256、AES-256-GCM 与密文篡改拒绝测试向量。
- 已加入隔离的 SQLite 临时库检查，验证 `dbQueue` 顺序、事务提交、`db.update()` 错误返回、完整回滚和临时文件清理；不会打开正式 `assets/database.db`。
- 已加入 `/v1/info` 检查，可同时验证 Worker、D1 binding、`0001_initial.sql`、协议与 schema 版本。
- 已加入首台设备 `/v1/bootstrap`、断网保留待提交身份、相同请求幂等重放和“模拟丢失成功响应”。
- 诊断摘要只包含 endpoint、版本、布尔状态、检查结果和 device ID，不包含完整秘密或设备令牌。

## 你需要在真机完成

### 1. 导入与本机保存

- [x] 把 `jsehviewer-sync-bootstrap.json` 发送到 iPhone 或 iPad。
- [x] 打开 JSEhViewer → 其他 → 云端同步 → 从文件导入。
- [x] 确认页面只显示 Worker 地址和状态，不显示三个 43 字符秘密。
- [x] 运行“检查 Keychain 与安全随机数”，结果应全部通过。
- [x] 完全关闭再打开 JSBox，确认连接包仍显示“已导入并保存到 Keychain”。

### 2. 密码学与 Worker / D1

- [x] 运行“HMAC / HKDF / AES-GCM 测试向量”，五项应全部通过并显示耗时。
- [x] 运行“检查 SQLite 队列与事务”，应显示队列顺序、正常提交、约束错误返回、完整回滚和临时文件清理全部通过（真机记录：9 ms）。
- [x] 点击“检查 Worker 与 D1”，应显示 Worker 就绪、D1 schema 1，database/migrations 均为通过。
- [x] 若该检查通过，就等价于确认 D1 binding 可读且 `0001_initial.sql` 已经应用；无需先在 Dashboard 中找到迁移文件。

### 3. 首台设备注册

- [x] 在 `/v1/info` 仍为 `initialized=false` 时点击“注册此设备”。
- [x] 成功后再次检查 Worker，状态应变为 `initialized=true`。
- [x] 点击“重放相同注册请求”，应显示“幂等重放通过”，并且远端不能出现第二台设备。
- [x] 重放验证完成后，点击“完成重放验证并删除一次性部署密钥”。
- [x] 在 Cloudflare D1 Studio 检查 `profile.initialized=1`，`devices` 恰好一行。

如果 D1 已出现待注册的 `device_id`，但 App 报“注册结果不完整”，说明服务端事务已提交、旧版 App 没有接受响应。不要删除 D1 行、清除本机凭据或重新生成设备身份。先部署 `0.1.1-phase0` 或更高版本的 Worker，再在 App 中重试同一笔注册；Worker 会核对原 device ID、token hash、epoch 和恢复凭据并返回幂等成功。`0.1.0-phase0` 的首次 HTTP 201 响应没有 `replayed` 字段，新版 App 会兼容该首次成功格式，但它本身不支持已丢失响应后的安全重放。

### 4. 故障恢复（需要另外两套测试部署）

- [x] 部署 A：导入后打开飞行模式，点击注册。页面应提示本机身份已保存；联网后重试成功，device ID 不变。
- [x] 部署 B：开启“模拟丢失注册响应”，点击注册，看到提示后强制关闭 JSBox。
- [x] 重开 JSBox 后进入同一页面，点击“重试同一笔设备注册”，应幂等成功且 D1 仍只有一台设备。

### 5. 脱敏与收尾

- [x] 复制脱敏诊断摘要，确认其中没有 `bootstrap_secret`、`master_key`、`recovery_secret` 或 `device_token` 的值。
- [x] 导出 App 日志并搜索连接包中的三个完整秘密，结果应为零。
- [x] 检查本地 SQLite，同样不应出现这些秘密。
- [x] 测试结束后可点“清除本机 Phase 0 凭据”；该操作不会删除远端 Worker 或 D1。

## Phase 0 退出结论

- 安全随机数、Keychain 持久性、HMAC/HKDF/AES-GCM 与篡改拒绝均已在 JSBox 真机通过；
- Deploy to Cloudflare、D1 自动创建与 migration、Worker 自检和第一台设备 bootstrap 已通过；
- 断网重试、服务端成功响应丢失后的幂等重放和进程重启恢复已通过；
- 隔离 SQLite 临时库验证了 `dbQueue` 顺序、显式 `beginTransaction/commit/rollback`、`db.update()` 错误返回和完整回滚；
- 早期诊断发现真机 `queue.transaction()` 的布尔返回行为不适合作为 Phase 1 的事务边界，因此正式实现统一采用队列内显式事务，并逐条检查 `{ result, error }`。

Phase 0 的风险验证目标已满足，可以开始 Phase 1 的本地 DB v2 与 repository 工作；在 Phase 2 完成前仍不得向测试部署上传真实阅读记录。

后续实施状态见 [`cloud-sync-phase1-progress.md`](./cloud-sync-phase1-progress.md)。

## 尚未进入本阶段的功能

- 业务数据的 outbox、pull cursor、tombstone、冲突合并和正式同步 UI 尚未实现。
- 100/500 个对象的同步性能测试要等同步内核完成后进行；当前页面记录的是密码学测试耗时和检查前后可用内存差，不等同于精确峰值。
- 恢复包导入、第二台设备 QR 配对、设备撤销和 profile reset 尚未实现。
