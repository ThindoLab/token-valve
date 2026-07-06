# Plan: Secret Store Interface

## Group 1 — Secret Store 类型

1.1 定义 `SecretRef`、`SecretMetadata`、`SecretRecord`。

1.2 定义 `SecretStore` interface。

1.3 定义 `SecretStoreError`。

1.4 从 `packages/core` 导出 secret store 类型。

---

## Group 2 — Memory Test Double

2.1 实现 `MemorySecretStore`。

2.2 支持 write/read/update/delete/list。

2.3 确保 list 只返回 ref/metadata，不返回 value。

2.4 为缺失 secret 返回 `null` 或 `false`。

---

## Group 3 — macOS Keychain Backend

3.1 实现 command runner interface。

3.2 实现 `MacOSKeychainSecretStore`。

3.3 使用 `security add-generic-password` 写入 secret。

3.4 使用 `security find-generic-password -w` 读取 secret。

3.5 使用 `security delete-generic-password` 删除 secret。

3.6 测试 Keychain backend 只验证命令形态，不调用真实 Keychain。

---

## Group 4 — Secret Safety Tests

4.1 测试 CRUD。

4.2 测试 metadata/value 分离。

4.3 测试错误 message 不包含 secret value。

4.4 测试 repo fixtures 和 YAML 中不包含测试 secret value。

---

## Group 5 — 验证

5.1 跑 `pnpm build`。

5.2 跑 `pnpm typecheck`。

5.3 跑 `pnpm test`。

5.4 跑 `pnpm lint`。

5.5 用 `rg` 检查测试 secret value 没有出现在配置 YAML 或 specs 之外。
