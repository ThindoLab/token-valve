# Requirements: GitHub MVP

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 9：GitHub MVP。

它要交付 GitHub 多 profile 的第一条受控执行路径：TokenValve 根据 workspace、session context 和 resolver 配置选择 GitHub profile，从 secret store 读取该 profile 的 token，只给当前 `gh` 子进程注入 `GH_TOKEN` / `GITHUB_TOKEN`，执行低风险 GitHub CLI 命令，并对 stdout/stderr 和审计事件脱敏。

包含：

- core 新增 GitHub CLI runner。
- 支持 `gh api user`、`gh repo view`、`gh repo list`。
- 根据 workspace binding 和 session override 解析 profile。
- 从 `SecretStore` 读取 GitHub token。
- 只在子进程 env 中注入 `GH_TOKEN` 和 `GITHUB_TOKEN`。
- 不调用 `gh auth switch`、`gh auth login` 或任何全局账号切换命令。
- 对 stdout/stderr 做 known-secret 和 GitHub token pattern 脱敏。
- 返回结构化 execution result 和审计事件。
- CLI 新增最小 `tokenvalve github run -- ...`，用于手动验证受控执行。

## 范围外

- 不实现 PATH shim 拦截（见 shims phase）。
- 不实现 Supabase/Vercel/HTTP/SSH 执行（见后续 phase）。
- 不实现 production/dangerous human intent 授权。
- 不实现真实 GitHub API 深度验证；Phase 9 只保证低风险 gh 命令的受控执行模型。
- 不修改或读取全局 `gh auth` 状态。

## 行为

正常路径：

- 用户已有 `profiles.yaml`、`bindings.yaml`，并通过 Phase 7 添加了 GitHub token profile。
- 用户运行 `tokenvalve github run --workspace <path> --config-dir <dir> -- gh repo view`。
- TokenValve resolver 判定 provider/profile/capability/risk。
- risk 为 `read` 时继续执行。
- runner 从 secret store 读取 profile token。
- runner 启动 `gh` 子进程，只在该子进程 env 中注入 `GH_TOKEN` / `GITHUB_TOKEN`。
- 返回 redacted stdout/stderr、exitCode 和 audit event。

并发/session 路径：

- 两个 Agent session 分别传入不同 GitHub profile override。
- 两次 execution 独立解析 profile，独立注入 token。
- 不使用任何全局账号切换，因此不会互相覆盖。

失败路径：

- workspace 未配置、profile 未配置、capability/risk 不匹配时 fail closed。
- 命令不是允许的低风险命令时 blocked。
- secret store 中找不到 token 时 blocked。
- `gh` 子进程输出中出现 token 时返回前必须脱敏。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 执行入口 | core runner + CLI `github run` | core 可被后续 MCP/shim 复用，CLI 方便 Phase 9 验证。 |
| 子进程执行 | 使用可注入 `ProcessRunner` | 自动化测试不依赖真实 `gh`。 |
| Token 注入 | `GH_TOKEN` 与 `GITHUB_TOKEN` 同时注入 | 兼容 GitHub CLI 和常见生态。 |
| 允许命令 | `api user`、`repo view`、`repo list` | 对齐 roadmap 的低风险验证命令。 |
| 全局切换 | 禁止 | 多 Agent 并发时避免 `gh auth switch` 竞态。 |

## 背景

`mission.md` 的核心场景之一是两个 Agent 在相近时间向不同 GitHub 账号执行操作，不能互相污染全局 CLI 状态。Phase 9 是该场景的第一条真实执行路径。

`tech-stack.md` 要求默认采用 per-execution credential brokering，而不是全局账号切换。GitHub MVP 必须证明 token 只进入当前子进程 env，并且输出、错误、审计都不会泄露 token。

## 未决问题

- 真实 `git push` over HTTPS/SSH 留给后续 GitHub/SSH phase。
- 高风险 GitHub 命令的 human intent 流程留给后续 policy phase。
