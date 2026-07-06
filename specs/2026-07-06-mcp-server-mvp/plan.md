# Plan: MCP Server MVP

## Group 1 — Tool registry 与统一结果

1.1 定义 `McpToolName`、`McpToolDefinition`、`McpToolResult`。

1.2 实现 `TokenValveMcpServer`，支持 `listTools` 和 `callTool`。

1.3 未知 tool 返回结构化错误。

---

## Group 2 — Context/Profile tools

2.1 实现 `profiles_list`，只返回 profile metadata。

2.2 实现 `context_resolve`，调用 resolver 并支持 session context。

2.3 实现 `llm_profile_resolve`，复用 resolver 的 LLM path。

---

## Group 3 — Execution tools

3.1 实现 `exec_with_secrets`，按 provider 分派到 GitHub/Supabase/Vercel runner。

3.2 实现 `http_request_with_secrets`，调用通用 HTTP runner。

3.3 实现 `ssh_with_secrets`，支持 ssh-command 与 git-ssh。

3.4 执行工具拒绝 shell string 字段。

---

## Group 4 — Intent / onboarding / recipe / audit tools

4.1 `intent_request` 创建 pending request，不激活授权。

4.2 `revoke` 调用 HumanIntentStore revoke。

4.3 `secret_profile_create` 创建 draft metadata，拒绝 secret 参数。

4.4 `secret_profile_test` 调用 ProfileInventory test。

4.5 `recipe_save`、`recipe_list`、`ui_open`、`audit_list` 交付安全占位实现，不返回 secret。

---

## Group 5 — 测试

5.1 测试工具列表包含 roadmap 要求的全部 tool。

5.2 测试 profile/context tools 不返回 secret。

5.3 测试 execution tools 拒绝 shell string。

5.4 测试 `intent_request` 只创建 pending，不放行 production。

5.5 测试并发 session/workspace 独立解析。

---

## Group 6 — 验证

6.1 运行 `pnpm install`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`。

6.2 若实现发现 spec 缺失，同步更新本 feature 的 requirements、plan、validation。
