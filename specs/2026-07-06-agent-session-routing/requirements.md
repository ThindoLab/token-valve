# Requirements: Agent Session Routing

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 3：Agent Session Routing。

它要在 Phase 2 resolver 基础上引入 Agent session context，使同一台机器上的多个 Agent / MCP session 可以在相同时间、相同 provider 下解析到不同 profile，而不依赖或修改任何全局 CLI 当前账号。

包含：

- 定义 Agent session context。
- 在 resolver input 中支持可选 session。
- 支持 session-scoped provider/profile/environment/capability override。
- 支持 session metadata 参与决策输出，便于后续审计和 MCP server 使用。
- 支持 session 缺失时回退到 workspace binding 的确定性解析。
- 建立两个并发 session 使用不同 GitHub profile 的测试。
- 建立同 session 多次解析稳定返回相同 profile 的测试。
- 明确测试不调用 `gh auth status`、`gh auth switch` 或任何真实 CLI。

## 范围外

- 不实现真实 MCP server session 生命周期（见 Phase 16）。
- 不实现进程执行、env 注入或 CLI shim 隔离（见 Phase 9、Phase 14）。
- 不实现 global-switch 互斥锁（见 Phase 21）。
- 不实现 audit event shaping（见 Phase 4）。
- 不实现 active intent TTL 存储（见 Phase 15）。
- 不读取或写入真实 secret（见 Phase 5、Phase 7）。

## 行为

正常路径：

- 同一 workspace 默认绑定 `github:thindolab`。
- session A 显式绑定 GitHub profile 为 `github:personal`。
- session B 显式绑定 GitHub profile 为 `github:client-a`。
- 两个 session 同时解析 `gh repo view` 时，分别返回各自 session profile。
- 没有 session 时，返回 workspace 默认 profile。

失败路径：

- session override 指向不存在的 profile 时 fail closed，reason 为 `profile_not_configured`。
- session override 指向 workspace 未配置 provider 时 fail closed，reason 为 `provider_not_configured`。
- session override 不改变 capability/risk 的 fail-closed 规则；未知命令仍然 blocked。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| Session 模型 | `AgentSessionContext` 作为 resolver input 的可选字段 | Phase 3 只需要解析上下文，不需要持久 session store。 |
| Override 粒度 | provider -> profile/environment/capability bindings | 与 workspace binding 结构接近，后续 MCP server 容易复用。 |
| 优先级 | session override 高于 workspace binding | Agent session 是更具体的运行上下文。 |
| 回退策略 | session 缺失或未覆盖某 provider 时回退 workspace binding | 保持非 Agent CLI 使用的确定性。 |
| 并发安全 | resolver 保持纯函数，不使用全局 mutable current account | 避免多个 Agent 互相污染。 |

## 背景

`mission.md` 明确要求两个正在运行的 Agent 加载同一个 MCP 或 skill 时，可以分别向不同 GitHub 账号提交代码，且不污染全局 CLI 状态。

`tech-stack.md` 要求 resolver 根据 cwd、workspace binding、provider metadata、command args、request metadata、SSH host 和 session context 选择 profile。Phase 3 将 session context 接入 Phase 2 的 resolver，但不执行命令、不注入凭证。

## 未决问题

- Session context 的真实来源留给 MCP Server MVP 决定。
- Session override 是否需要持久化留给后续 Recipe/MCP 阶段决定。
- Phase 3 暂不处理 session TTL，TTL 属于 Human Intent 阶段。
