# Plan: 密钥库存与 Profile 管理

## Group 1 — Profile Inventory 模型

1.1 扩展或复用 `ProfileMetadata`，明确 status、use cases、绑定信息、脱敏指纹、验证时间字段。

1.2 新增 profile inventory 读写 API，负责读取/写入 `profiles.yaml` 和 `bindings.yaml`。

1.3 实现 secret fingerprint 生成，确保只保存短哈希和长度。

1.4 实现写操作确认规则，非交互模式下缺少 `--yes` 时拒绝。

---

## Group 2 — Secret Store 连接

2.1 让 inventory API 接收 `SecretStore`，写入和删除真实 secret value。

2.2 `add` 写入 secret store 并创建 metadata，重复 profile 默认拒绝。

2.3 `update` 支持 metadata 修改和 secret value 替换。

2.4 `delete` 同时删除 metadata、workspace binding 和 secret store value。

2.5 `test` 确认 secret store 中存在非空 value，并更新 verified 状态和 `lastVerifiedAt`。

---

## Group 3 — CLI Secret 命令

3.1 新增 `tokenvalve secret add`。

3.2 新增 `tokenvalve secret list`。

3.3 新增 `tokenvalve secret update`。

3.4 新增 `tokenvalve secret delete`。

3.5 新增 `tokenvalve secret test`。

3.6 所有输出只展示脱敏 metadata，不展示 secret value。

---

## Group 4 — Resolver 安全约束

4.1 确认 resolver 不会把 `draft`、`unverified`、`expired`、`disabled` profile 用于自动写操作。

4.2 为未验证 profile 的写操作增加测试覆盖。

4.3 保持读操作行为可解释：如果 profile 存在但状态不适合当前风险，返回 blocked 和原因。

---

## Group 5 — 测试

5.1 测试 add/list/update/delete/test 的 core API。

5.2 测试 YAML 不包含明文 secret。

5.3 测试 CLI 列表输出不包含明文 secret。

5.4 测试重复 profile、缺少 `--yes`、缺失 profile、空 secret 的失败路径。

5.5 测试未验证 profile 不用于自动写操作。

---

## Group 6 — 验证

6.1 跑 `pnpm install`。

6.2 跑 `pnpm build`。

6.3 跑 `pnpm typecheck`。

6.4 跑 `pnpm test`。

6.5 跑 `pnpm lint`。

6.6 手动运行 CLI secret 管理闭环，检查输出和 YAML。
