# Requirements: Secret Store Interface

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 5：Secret Store Interface。

它要在 `packages/core` 内交付后端无关的 secret storage interface、测试用 in-memory store，以及 macOS Keychain backend 的实现。后续 profile 管理、init、MCP onboarding 和 UI 输入都应通过这个 interface 写入和读取 secret value。

包含：

- 定义 `SecretStore` interface。
- 定义 secret reference、create/read/update/delete/list 操作。
- 定义 secret metadata 与 secret value 的分离模型。
- 实现 `MemorySecretStore` 作为 test double。
- 实现 `MacOSKeychainSecretStore`，通过 macOS `security` 命令封装 Keychain 操作。
- 给 Keychain backend 注入 command runner，便于测试不调用真实 Keychain。
- 单元测试覆盖 CRUD、metadata/value 分离、缺失 secret、Keychain command shaping。

## 范围外

- 不实现 CLI `secret add/list/update/delete`（见 Phase 7）。
- 不把 secret store 接入 resolver；resolver 仍只处理 metadata。
- 不实现 Linux Secret Service、Windows Credential Manager、1Password、Bitwarden 或加密 SQLite。
- 不在自动化测试中写入真实 macOS Keychain。
- 不实现本地数据目录或 YAML metadata 持久化。

## 行为

正常路径：

- 调用者通过 `writeSecret` 写入 secret value，获得一个 `SecretRef`。
- 调用者可以通过 `readSecret` 读取 secret value。
- 调用者可以通过 `updateSecret` 更新 secret value。
- 调用者可以通过 `deleteSecret` 删除 secret value。
- `listSecretRefs` 只返回 reference 与 metadata，不返回 value。

失败路径：

- 读取不存在的 secret 返回 `null`，不抛出未处理异常。
- 删除不存在的 secret 返回 `false`。
- Keychain command 失败时抛出 `SecretStoreError`，错误 message 不包含 secret value。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| Interface 命名 | `SecretStore` | 对后端无关，便于未来替换。 |
| Secret ref | `{ store, key, profileId, field }` | 能表达同一 profile 多个 secret field，且不包含 value。 |
| Test double | `MemorySecretStore` | 自动测试不依赖真实 Keychain。 |
| Keychain 后端 | 封装 macOS `security` 命令 | MVP macOS-first，避免引入原生扩展。 |
| Keychain service | `TokenValve` | 统一服务名，便于后续 doctor 诊断。 |
| Command runner | 依赖注入 | 测试能验证命令形态而不执行真实命令。 |

## 背景

`mission.md` 要求密钥输入发生在本地受控界面或 CLI，MCP/Core 负责写入 secret store，Agent 不应拿到明文 secret。

`tech-stack.md` 明确 MVP 只实现 macOS Keychain，但 credential storage interface 必须支持未来后端。Phase 5 只交付 interface、Memory test double 和 macOS Keychain backend。

Phase 5 之后，Phase 7 的 profile 管理会使用这个 interface 管理真实 secret，而 YAML 仍只保存脱敏 metadata。

## 未决问题

- Keychain item account 命名暂用 `profileId:field`，后续如果支持同 profile 多版本 secret，可再扩展。
- 是否需要 keychain access group 或 Touch ID 策略留到更高安全模式再决定。
- Secret metadata 的完整字段留给 Phase 7 profile 管理补充。
