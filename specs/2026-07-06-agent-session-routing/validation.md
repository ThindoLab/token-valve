# Validation: Agent Session Routing

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功，lockfile 与 package 声明一致。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |
| 禁止真实 CLI auth | `rg "gh auth|auth switch|auth status|current account" packages/core/src` | 不应出现真实 CLI auth 调用。 |

## 场景验证

### 场景 1：两个 session 解析到不同 GitHub profile

输入：

- workspace: `/workspaces/token-valve`
- command: `gh`
- args: `["repo", "view"]`
- session A override: GitHub profile `github:personal`
- session B override: GitHub profile `github:client-a`

期望：

- session A decision 为 `allow`，profile 为 `github:personal`。
- session B decision 为 `allow`，profile 为 `github:client-a`。
- 两次解析互不影响。

### 场景 2：无 session 时回退 workspace binding

输入：

- workspace: `/workspaces/token-valve`
- command: `gh`
- args: `["repo", "view"]`
- 不传 session。

期望：

- decision 为 `allow`。
- profile 为 workspace 默认 GitHub profile。

### 场景 3：session override 指向不存在 profile

输入：

- workspace: `/workspaces/token-valve`
- command: `gh`
- args: `["repo", "view"]`
- session override profile: `github:missing`

期望：

- decision 为 `blocked`。
- reason 为 `profile_not_configured`。

### 场景 4：session override 不绕过 risk

输入：

- workspace: `/workspaces/token-valve`
- command: `gh`
- args: `["unknown", "subcommand"]`
- session override profile: `github:personal`

期望：

- decision 为 `blocked`。
- reason 为 `risk_unknown` 或 `capability_not_configured`。
- 不因为 session 存在而猜测为 read。

### 场景 5：同 session 多次解析稳定

输入：

- 使用相同 session id 和 override 连续解析三次。

期望：

- 三次返回相同 provider/profile/environment/capability/risk。

## 输出文本检查

- blocked message 应说明是 session profile/provider 配置缺失，还是 capability/risk 缺失。
- 不出现调试文本、TODO、foo/bar。
- 不出现暗示读取全局 CLI 当前账号的文案。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- Resolver 不依赖全局账号状态。
- Feature spec 与实现一致。
- `specs/roadmap.md` 中 Phase 3 可被标记完成。
- `CHANGELOG.md` 已更新。
