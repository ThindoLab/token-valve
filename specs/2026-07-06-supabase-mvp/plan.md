# Plan: Supabase MVP

## Group 1 — Supabase Runner 模型

1.1 定义 Supabase CLI runner input/result。

1.2 定义最小 Supabase API runner input/result。

1.3 复用 Phase 9 的 `ProcessRunner`，新增可注入 HTTP runner。

1.4 定义内置 Supabase adapter，覆盖 CLI/API capability 和 risk rules。

---

## Group 2 — 风险与执行策略

2.1 `projects list` 识别为 read。

2.2 `db push` 识别为 write。

2.3 `db reset` 和 `secrets set` 识别为 dangerous。

2.4 production 写操作默认 blocked。

2.5 全局 auth 命令 blocked，不启动子进程。

---

## Group 3 — 凭证注入与脱敏审计

3.1 CLI 只向子进程 env 注入 `SUPABASE_ACCESS_TOKEN`。

3.2 API 只向当前请求注入 Authorization header。

3.3 stdout/stderr/API body 返回前脱敏。

3.4 audit event 不包含 token。

---

## Group 4 — CLI 命令

4.1 添加 `tokenvalve supabase run --workspace --config-dir -- <supabase args...>`。

4.2 支持 session/profile override。

4.3 输出 redacted stdout/stderr、exitCode 和决策摘要。

---

## Group 5 — 测试

5.1 测试 staging read CLI 命令执行。

5.2 测试 API GET 请求执行并注入 Authorization。

5.3 测试 production write 和 dangerous 命令 blocked。

5.4 测试 risk 规则支持 flag/参数顺序变化。

5.5 测试审计和输出不泄露 token。

---

## Group 6 — 验证

6.1 跑 `pnpm install`。

6.2 跑 `pnpm build`。

6.3 跑 `pnpm typecheck`。

6.4 跑 `pnpm test`。

6.5 跑 `pnpm lint`。

6.6 检查 dist CLI `supabase run --help`。
