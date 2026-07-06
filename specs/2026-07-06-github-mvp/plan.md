# Plan: GitHub MVP

## Group 1 — GitHub Runner 模型

1.1 定义 GitHub execution input/result 类型。

1.2 定义可注入 `ProcessRunner`，测试中替代真实 `gh`。

1.3 定义内置 GitHub adapter，覆盖 `gh api user`、`gh repo view`、`gh repo list`。

---

## Group 2 — Resolver 与 Secret 注入

2.1 用现有 resolver 解析 workspace/session/profile/risk。

2.2 risk 不是 `read` 时拒绝执行。

2.3 从 `SecretStore` 读取 profile token。

2.4 仅对子进程 env 注入 `GH_TOKEN` / `GITHUB_TOKEN`。

2.5 禁止执行 `gh auth switch/login/logout` 等全局认证命令。

---

## Group 3 — 输出脱敏与审计

3.1 stdout/stderr 使用 known secret 和 GitHub token pattern 脱敏。

3.2 生成 audit event，记录 provider/profile/capability/risk/decision/command。

3.3 audit event 不包含原始 token。

---

## Group 4 — CLI 命令

4.1 添加 `tokenvalve github run --workspace --config-dir -- <gh args...>`。

4.2 支持 `--session-id`、`--client`、`--profile` session override。

4.3 输出 redacted stdout/stderr、exitCode 和决策摘要。

---

## Group 5 — 测试

5.1 测试低风险命令执行并注入 env。

5.2 测试两个 session 并发使用不同 profile/token。

5.3 测试不允许的命令 fail closed。

5.4 测试缺失 secret fail closed。

5.5 测试 stdout/stderr/audit 不泄露 token。

---

## Group 6 — 验证

6.1 跑 `pnpm install`。

6.2 跑 `pnpm build`。

6.3 跑 `pnpm typecheck`。

6.4 跑 `pnpm test`。

6.5 跑 `pnpm lint`。

6.6 手动运行 CLI dry scenario 或 fake runner 覆盖，确认不调用全局 `gh auth switch`。
