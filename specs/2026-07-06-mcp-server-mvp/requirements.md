# Requirements: MCP Server MVP

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 16：MCP Server MVP。

它要把 `packages/mcp-server` 从占位包推进为 Agent-facing MCP tool 层。MCP 是安全能力边界：Agent 只能调用结构化 tool，不能拿到明文 secret，不能提交 shell string，不能通过 MCP 自行激活 production 写授权。本阶段先实现可测试的 tool registry 和 handler；真实 MCP SDK 进程绑定可以在后续 packaging/文档阶段包装这层 API。

包含工具：

- Profile/context tools：`profiles_list`、`context_resolve`、`llm_profile_resolve`。
- Execution tools：`exec_with_secrets`、`http_request_with_secrets`、`ssh_with_secrets`。
- Intent tools：`intent_request`、`revoke`。
- Onboarding tools：`secret_profile_create`、`secret_profile_test`。
- Recipe/UI tools：`recipe_save`、`recipe_list`、`ui_open`。
- Audit tools：`audit_list`。

核心要求：

- 所有 tool result 都经过脱敏或只返回 metadata。
- 执行类工具只接受结构化参数，不接受 shell string。
- `secret_profile_create` 不接受明文 secret 参数，只能创建 draft metadata 或指向本地输入流程。
- `intent_request` 只创建 pending request，不创建 active intent。
- `revoke` 可以撤销已有 active intent。
- 并发请求必须按 session/workspace 独立解析。

## 范围外

- 不实现完整 stdio MCP SDK server。
- 不实现 Recipe 的完整 schema 和验证执行（见 Phase 17）。
- 不实现 Skill 编排（见 Phase 18）。
- 不实现 Dashboard/TUI 打开后的真实 UI（见后续 dashboard phase）。
- 不实现新的 secret 输入 UI；明文 secret 仍只通过 CLI/local store 路径进入。

## 行为

工具调用：

- 上层 MCP runtime 将 tool name 和 JSON 参数交给 `TokenValveMcpServer.callTool`。
- server 根据 tool name 分发到对应 handler。
- handler 调用 core resolver、runner、profile inventory 或 human intent store。
- 返回统一 `McpToolResult`：`ok`、`data`、可选 `audit`、可选 `error`。

执行工具：

- `exec_with_secrets` 接收 `{ provider, command, args }`，根据 provider 走 GitHub/Supabase/Vercel runner。
- `http_request_with_secrets` 接收 method/url/header templates 等结构化参数。
- `ssh_with_secrets` 接收 host/user/operation/known_hosts/remoteUrl 等结构化参数。
- 如果参数包含 `shell`、`commandLine` 或类似 shell string 字段，直接拒绝。

Intent：

- `intent_request` 创建 pending intent request metadata，状态为 `pending`，source 为 `mcp-request`。
- pending request 不会被 resolver 视为 active intent。
- `revoke` 只能撤销已存在 intent。

Onboarding：

- `secret_profile_create` 接受 provider/profile/environment/displayName/useCases/workspace 等 metadata。
- 如果参数包含 `secretValue`、`token`、`apiKey` 等明文字段，拒绝。
- 本阶段创建 draft/unverified metadata，不写入 secret store 明文。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 实现形态 | 先实现 tool registry + handler API | 便于测试安全边界，后续可薄包装成真实 MCP stdio server。 |
| Result | 统一 `McpToolResult` | Agent 端易解析，错误可结构化。 |
| 执行参数 | 只接受结构化 args/request/host fields | 阻止 shell string 和 prompt 注入变成命令注入。 |
| Intent request | pending only | 符合 roadmap：MCP 不能自授权 production 写。 |
| Secret onboarding | metadata only | Agent 不应看到或传递明文 secret。 |

## 背景

`mission.md` 明确 MCP 是能力边界，Skill 是编排层。`tech-stack.md` 要求 MCP tools 不返回原始 secret、`intent_request` 不能激活 production 权限、`exec_with_secrets` 只接受注册 capability 和结构化参数。

Phase 16 让 Codex、Claude Code、Pi Agent 等 Agent 能通过同一组安全 tool 使用前面 Phase 1-15 的能力。

## 未决问题

- 真正的 MCP stdio/server transport、client 配置和发布说明留给 Public MVP packaging。
- Recipe 的真实 schema/验证/状态流转在 Phase 17 完成。
- Skill 如何引导新增密钥并沉淀 Recipe 在 Phase 18 完成。
