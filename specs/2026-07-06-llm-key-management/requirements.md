# Requirements: LLM Key 管理 MVP

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 8：LLM Key 管理 MVP。

它要把 Phase 7 的通用 secret profile 管理扩展成 LLM key 的专属工作流：用户可以添加多套 LLM API key profile，保存 base URL、organization/project、默认 model、用途标签等 metadata，并为 workspace、Agent client 或 use-case 设置默认 key。查询和解析只返回脱敏 metadata，不返回明文 key。

包含：

- CLI 新增 `tokenvalve llm add/list/use/resolve`。
- 支持 provider：OpenAI、Anthropic、Gemini、OpenRouter、custom/internal。
- `llm add` 写入 secret store，YAML 只保存 profile metadata 和脱敏指纹。
- `llm list` 只展示脱敏 metadata。
- `llm use` 为 workspace 设置默认 LLM profile，并支持按 Agent client 或 use-case override。
- `llm resolve` 展示当前 workspace/client/use-case 会解析到哪个 LLM profile。
- core resolver 支持按 workspace / Agent client / capability 或 use-case 解析 LLM key profile。
- LLM profile metadata 支持 base URL、organization、project、default model、use cases、client labels。

## 范围外

- 不调用真实 LLM provider API 验证 key；Phase 8 仍复用本地存在性验证。
- 不实现受控 SDK/HTTP 注入执行（见后续 execution gateway）。
- 不实现 MCP tool 暴露（见 MCP phase）。
- 不实现 dashboard 视图（见后续 dashboard phase）。
- 不支持从 `.env` 自动导入 key。

## 行为

新增 LLM key：

- 用户运行 `tokenvalve llm add --profile openai:work --provider openai --api-key <value> --base-url https://api.openai.com/v1 --model gpt-4.1 --use-case code-generation --workspace <path> --yes`。
- CLI 写入 secret store 字段 `api_key`。
- `profiles.yaml` 保存 provider、status、base URL、model、use cases、脱敏指纹。
- 如果传入 workspace，`bindings.yaml` 将该 workspace 的 provider 默认 LLM profile 设为新增 profile。
- 输出不包含明文 key，并提示新增 profile 默认为 `unverified`。

设置默认：

- 用户运行 `tokenvalve llm use openai:work --workspace <path> --provider openai --client codex --use-case code-generation --config-dir <dir> --yes`。
- CLI 更新 workspace binding：默认 profile、client override、use-case override。
- 未传 client/use-case 时只更新 provider 默认 profile。

解析：

- 用户运行 `tokenvalve llm resolve --workspace <path> --provider openai --client codex --use-case code-generation --config-dir <dir>`。
- CLI 调用 resolver，输出 selected profile、provider、capability、risk、decision。
- 输出不包含明文 key。

列表：

- 用户运行 `tokenvalve llm list --config-dir <dir>`。
- CLI 只列出 LLM profile，展示 provider、status、base URL、model、use cases、client labels、fingerprint。

失败路径：

- unsupported provider 返回明确错误。
- 写操作未传 `--yes` 时拒绝。
- `llm use` 指向不存在或非 LLM profile 时拒绝。
- `llm resolve` 找不到 workspace/provider/profile/capability 时 fail closed，并返回 resolver reason。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| LLM key 存储 | 复用 `ProfileInventory` + `SecretStore` | 避免和 Phase 7 平行维护两套密钥系统。 |
| Secret field | `api_key` | 明确区分普通 token 和 LLM API key。 |
| 默认绑定 | 扩展 `ProviderBinding` 的 `clientProfiles` 与 `capabilityProfiles` | 最小改动支持 workspace/client/use-case 默认 key。 |
| Provider 名称 | 内置校验 openai/anthropic/gemini/openrouter/custom/internal | 覆盖 roadmap 要求，同时保留 custom/internal。 |
| 解析输出 | 使用 resolver 决策，不读取 secret value | 保持 MCP/CLI 查询不返回明文 key。 |

## 背景

`mission.md` 把多套 LLM API key 作为核心场景之一。用户需要让 Codex、Claude Code、Pi Agent 或内部 Agent 在不同 workspace/use-case 下自动选择正确 key，但 Agent 不应拿到明文。

`tech-stack.md` 要求 LLM provider 是一等 adapter，profile metadata 可以包含 base URL、organization/project、默认 use-case，并且只在受控执行上下文中注入真实 key。Phase 8 先完成配置、库存和解析，为后续 MCP/执行注入打基础。

## 未决问题

- 真实 provider key 验证留到 adapter/Recipe 阶段。
- `custom` 与 `internal` provider 的 header/env 映射细节留到受控执行阶段。
