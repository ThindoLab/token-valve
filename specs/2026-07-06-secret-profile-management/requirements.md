# Requirements: 密钥库存与 Profile 管理

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 7：密钥库存与 Profile 管理。

它要交付一条本地 CLI profile 管理闭环：用户可以创建、查看、更新、删除 secret profile metadata，并把明文 secret 写入 secret store；列表和配置文件只展示脱敏状态；新增 profile 默认不可自动用于写操作，直到通过 `secret test` 标记为 verified。

包含：

- CLI 新增 `tokenvalve secret add/list/update/delete/test`。
- `secret add` 支持 provider、profile id、environment、用途、绑定到当前 workspace、secret value 输入和 dry-run 友好的非交互参数。
- `secret list` 展示 profile id、provider、environment、status、用途、绑定状态、脱敏指纹，不显示明文。
- `secret update` 支持修改 metadata、status 和替换 secret value。
- `secret delete` 删除 profile metadata，并从 secret store 删除对应 secret。
- `secret test <profile>` 使用 Phase 7 的本地验证规则检查 secret 是否存在，并把 profile 标为 verified。
- profile 状态支持 `draft`、`unverified`、`verified`、`expired`、`disabled`。
- 更新 `profiles.yaml` 和 `bindings.yaml`，但 YAML 只保存 metadata、status、masked fingerprint，不保存 secret value。
- core 提供可测试的 profile inventory API，CLI 只是命令入口。

## 范围外

- 不实现真实 provider API 验证，例如真正调用 GitHub/Supabase/Vercel（后续 provider MVP）。
- 不实现 LLM key 专属管理体验（见 Phase 8）。
- 不实现 dashboard 可视化（见后续 dashboard phase）。
- 不实现 MCP tool 暴露（见 MCP phase）。
- 不实现全局账号切换、shim 或受控执行注入（见后续执行 phase）。
- 不实现复杂加密数据库；Phase 7 继续使用已有 `SecretStore` 接口和测试用 memory store。

## 行为

新增 profile：

- 用户运行 `tokenvalve secret add --profile github:work --provider github --environment development --use-case cli --secret-value <value> --workspace <path> --config-dir <dir> --yes`。
- CLI 写入 secret store。
- `profiles.yaml` 新增一条 metadata，状态默认为 `unverified`。
- 如传入 workspace，`bindings.yaml` 为该 workspace 绑定 provider 到 profile。
- 输出确认 profile 已保存，并提示需要 `secret test` 后才能用于自动写操作。

列表 profile：

- 用户运行 `tokenvalve secret list --config-dir <dir>`。
- CLI 输出表格式摘要。
- 输出包含 profile id、provider、environment、status、use cases、bound workspace 数量和 masked fingerprint。
- 输出不得包含明文 secret。

更新 profile：

- 用户运行 `tokenvalve secret update github:work --status disabled --environment staging --config-dir <dir> --yes`。
- CLI 修改 metadata。
- 如果提供新的 `--secret-value`，CLI 替换 secret store 中的值，并把状态重置为 `unverified`，除非用户显式传入 status。

删除 profile：

- 用户运行 `tokenvalve secret delete github:work --config-dir <dir> --yes`。
- CLI 删除 metadata、workspace binding 中对该 profile 的引用，以及 secret store 中的值。

测试 profile：

- 用户运行 `tokenvalve secret test github:work --config-dir <dir>`。
- Phase 7 的验证只确认 secret store 中存在非空 secret，并写入 `lastVerifiedAt`。
- 验证成功后状态变为 `verified`。
- 验证失败时状态保持不变，并返回可操作错误。

失败路径：

- 未传 `--yes` 且命令会写入时返回明确错误，避免误删或误写。
- profile id 不存在时返回明确错误。
- `secret add` 遇到重复 profile 且未传 `--replace` 时拒绝。
- secret value 为空时拒绝。
- 非法 status 或 provider 缺失时拒绝。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 存储形态 | YAML metadata + SecretStore value | 与 mission/tech-stack 对齐，避免 secret 落入配置文件。 |
| 默认状态 | `unverified` | 新增密钥不能直接用于自动写操作。 |
| Phase 7 验证 | 本地存在性验证 | 真实 provider 验证依赖 adapter/recipe，留给后续阶段。 |
| CLI 写入确认 | 写操作需要 `--yes` | 当前没有交互 prompt，避免非交互误操作。 |
| 指纹 | 只保存短哈希和长度，不保存原文 | 方便用户区分密钥版本，同时不暴露 secret。 |
| 绑定策略 | `secret add --workspace` 可绑定当前 workspace | 贴合 init 后的一次性配置和增量配置。 |

## 背景

`mission.md` 明确 TokenValve 同时是本地密钥管理器、凭证中转和执行网关。Phase 7 是从“只有配置 metadata”走向“真的能管理本地密钥库存”的第一步。

`tech-stack.md` 约束 secret 不得进入 YAML、日志、CLI 输出或 MCP tool result。因此本 feature 的核心不是把 secret 存起来，而是确保 secret value 和 profile metadata 分离，且所有可见输出都是脱敏的。

后续 resolver、MCP、Skill、Dashboard 都会依赖 profile status。未经验证的 profile 不能被自动用于写操作，是后续安全策略的基础。

## 未决问题

- 真实 CLI 默认使用 macOS Keychain；自动化测试通过注入 memory store 避免触碰系统凭证。
- profile id 命名规范后续可能按 provider adapter 收紧；Phase 7 只要求非空、唯一、可读。
- `secret test` 的真实 provider 验证方式留给 provider MVP 和 Recipe。
