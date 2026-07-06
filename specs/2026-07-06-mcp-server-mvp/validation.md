# Validation: MCP Server MVP

## 自动化检查

| 命令 | 期望结果 |
| --- | --- |
| `pnpm install` | 依赖安装成功，无 lockfile 异常。 |
| `pnpm build` | 所有 package 构建成功。 |
| `pnpm typecheck` | TypeScript 检查通过。 |
| `pnpm test` | 全部 Vitest 测试通过。 |
| `pnpm lint` | lint 通过。 |

## 场景验证

### 场景 1：工具列表完整

步骤：

1. 创建 `TokenValveMcpServer`。
2. 调用 `listTools()`。

期望：

- 返回 roadmap 中列出的 14 个工具。
- 每个工具有 name、description 和 inputSchema。

### 场景 2：profiles_list 不返回 secret

输入：

- profile metadata 和 secret store 中有 token。

步骤：

1. 调用 `profiles_list`。

期望：

- 返回 profile id/provider/environment/status。
- 不返回 token、api key、secret value。

### 场景 3：执行工具拒绝 shell string

输入：

- `exec_with_secrets` 参数包含 `commandLine: "gh repo view"`。

步骤：

1. 调用 tool。

期望：

- `ok` 为 `false`。
- error 说明执行工具只接受结构化参数。
- runner 没有被调用。

### 场景 4：intent_request 不激活 production 权限

步骤：

1. 调用 `intent_request` 请求 Vercel production deploy。
2. 再调用 `context_resolve` 或 runner 解析同一 production deploy。

期望：

- intent request 状态为 `pending`。
- production deploy 仍然 `human_intent_required`。

### 场景 5：并发 session 独立解析

输入：

- 两个 session 对 GitHub provider 使用不同 profile override。

步骤：

1. 并发调用两次 `context_resolve`。

期望：

- 两次结果分别解析到不同 profile。
- session metadata 中 `usedOverride` 为 true。

## 输出文本检查

- MCP result 不出现明文 secret。
- 错误信息直接说明缺少字段、拒绝 shell string 或不允许 MCP 自授权。
- 占位 tool 明确标记为 metadata-only / pending，不假装已经完成后续 phase。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- MCP Server MVP 实现与本 spec 一致。
- `specs/roadmap.md` Phase 16 可标记为已完成。
- `CHANGELOG.md` 已更新。
