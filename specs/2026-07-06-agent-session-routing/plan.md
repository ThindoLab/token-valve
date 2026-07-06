# Plan: Agent Session Routing

## Group 1 — Session 类型与输入模型

1.1 定义 `AgentSessionContext`。

1.2 在 `ResolveInput` 中加入可选 `session` 字段。

1.3 在 `ResolveResult` 中加入 session metadata。

1.4 更新公共类型导出。

---

## Group 2 — Session Override 解析

2.1 实现 session provider binding 结构。

2.2 让 resolver 在 provider binding 选择时优先使用 session override。

2.3 未覆盖 provider 时回退 workspace binding。

2.4 session 指向不存在 profile 时 fail closed。

2.5 session 指向 workspace 未配置 provider 时 fail closed。

---

## Group 3 — 并发与稳定性测试

3.1 添加包含多个 GitHub profile 的 fixture。

3.2 测试 session A 和 session B 同时解析同一 GitHub 命令时返回不同 profile。

3.3 测试无 session 时使用 workspace 默认 profile。

3.4 测试同一个 session 多次解析结果稳定。

3.5 测试 session override 不会绕过 capability/risk fail-closed。

---

## Group 4 — 验证

4.1 跑 `pnpm build`。

4.2 跑 `pnpm typecheck`。

4.3 跑 `pnpm test`。

4.4 跑 `pnpm lint`。

4.5 检查实现没有调用 `gh auth status`、`gh auth switch` 或其他真实 CLI。
