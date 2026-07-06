# Validation: Core Resolution Model

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功，lockfile 与 package 声明一致。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |

## 场景验证

### 场景 1：GitHub 只读命令允许

输入：

- workspace: `/workspaces/token-valve`
- command: `gh`
- args: `["repo", "view"]`

期望：

- decision 为 `allow`。
- provider 为 `github`。
- profile 为 fixture 中绑定的 GitHub profile。
- risk 为 `read`。
- 输出不包含 secret value。

### 场景 2：Supabase staging 写命令允许

输入：

- workspace: `/workspaces/token-valve`
- command: `supabase`
- args: `["db", "push"]`

期望：

- decision 为 `allow`。
- provider 为 `supabase`。
- environment 为 `staging`。
- risk 为 `write`。

### 场景 3：Vercel production deploy 阻止

输入：

- workspace: `/workspaces/token-valve`
- command: `vercel`
- args: `["deploy", "--prod"]`

期望：

- decision 为 `blocked`。
- provider 为 `vercel`。
- risk 为 `production_deploy` 或 `dangerous`。
- reason 说明当前没有 human intent。

### 场景 4：LLM key profile metadata 解析

输入：

- workspace: `/workspaces/token-valve`
- capability: `llm-api-key`
- provider: `openai`
- useCase: `code-generation`

期望：

- decision 为 `allow`。
- provider 为 `openai`。
- profile 为 fixture 中绑定的 LLM profile。
- risk 为 `read`。
- 不返回明文 API key。

### 场景 5：未知 workspace fail closed

输入：

- workspace: `/unknown/workspace`
- command: `gh`
- args: `["repo", "view"]`

期望：

- decision 为 `blocked`。
- reason 为 `workspace_not_configured`。
- message 给出配置 workspace binding 的建议。

### 场景 6：未知风险 fail closed

输入：

- workspace: `/workspaces/token-valve`
- command: `gh`
- args: `["unknown", "subcommand"]`

期望：

- decision 为 `blocked`。
- reason 为 `risk_unknown` 或 `capability_not_configured`。
- 不猜测为 read。

## 输出文本检查

- Resolver message 使用确定、可操作的措辞。
- 不出现调试文本、TODO、foo/bar。
- blocked message 应说明缺失什么配置或为什么拒绝。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- Resolver 不读取、不返回真实 secret。
- Feature spec 与实现一致。
- `specs/roadmap.md` 中 Phase 2 可被标记完成。
- `CHANGELOG.md` 已更新。
