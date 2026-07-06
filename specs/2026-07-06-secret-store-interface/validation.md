# Validation: Secret Store Interface

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功，lockfile 与 package 声明一致。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |
| 明文泄露检查 | `rg "tv_test_secret_value_123456" . -g '!specs/**' -g '!packages/core/src/secret-store.test.ts'` | 不应找到结果。 |

## 场景验证

### 场景 1：Memory store CRUD

步骤：

1. 用 `MemorySecretStore` 写入 secret。
2. 读取同一个 ref。
3. 更新 value。
4. 再次读取。
5. 删除 ref。
6. 再次读取。

期望：

- 初次读取返回原 value。
- 更新后返回新 value。
- 删除返回 `true`。
- 删除后读取返回 `null`。

### 场景 2：metadata 与 value 分离

步骤：

1. 写入带 metadata 的 secret。
2. 调用 `listSecretRefs`。

期望：

- list 结果包含 store/key/profileId/field/metadata。
- list 结果不包含 secret value。

### 场景 3：Keychain backend command shaping

步骤：

1. 使用 fake command runner 创建 `MacOSKeychainSecretStore`。
2. 调用 write/read/delete。

期望：

- write 使用 `security add-generic-password`。
- read 使用 `security find-generic-password -w`。
- delete 使用 `security delete-generic-password`。
- 测试不调用真实 `security` 命令。

### 场景 4：错误不泄露 secret

步骤：

1. 让 fake command runner 在写入时失败。
2. 写入一个测试 secret。

期望：

- 抛出 `SecretStoreError`。
- error message 不包含原始 secret value。

## 输出文本检查

- 错误文本说明哪个 store operation 失败。
- 错误文本不包含 secret value。
- 代码和测试里不要把测试 secret 放进 YAML/profile metadata fixture。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- 自动测试不依赖真实 macOS Keychain。
- Secret value 与 metadata 分离。
- Feature spec 与实现一致。
- `specs/roadmap.md` 中 Phase 5 可被标记完成。
- `CHANGELOG.md` 已更新。
