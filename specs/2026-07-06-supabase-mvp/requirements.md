# Requirements: Supabase MVP

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 10：Supabase MVP。

它要交付 Supabase staging/production 的第一条受控执行路径：TokenValve 根据 workspace/session/profile/environment 解析 Supabase profile，从 secret store 读取 access token，只给当前 `supabase` 子进程或结构化 Management API 请求注入凭证，并对输出、错误和审计事件脱敏。

包含：

- core 新增 Supabase CLI runner。
- core 新增最小 Supabase Management API runner，只支持 allowlist 内 GET 请求。
- 支持低风险 `supabase projects list`。
- 支持 Supabase Management API `GET https://api.supabase.com/v1/projects...`。
- 识别 `db push`、`db reset`、`secrets set` 风险。
- production 写操作没有 human intent 时必须 blocked。
- CLI 新增 `tokenvalve supabase run -- ...`。
- 审计记录 provider/profile/environment/risk/decision，且不包含 token。

## 范围外

- 不实现通用 HTTP/curl 模板（见 Phase 11）。
- 不实现 production human intent 授权创建。
- 不执行 `supabase login` 或修改全局 Supabase CLI auth 状态。
- 不实现真实 project ref 自动发现；Phase 10 只保留 profile/environment/project metadata 的扩展点。

## 行为

Supabase CLI：

- 用户运行 `tokenvalve supabase run --workspace <path> --config-dir <dir> -- projects list`。
- resolver 解析 Supabase provider/profile/environment/risk。
- risk 为 `read` 时执行。
- runner 从 secret store 读取 token 字段 `token`。
- 子进程 env 只注入 `SUPABASE_ACCESS_TOKEN`。
- stdout/stderr 返回前脱敏。

Supabase API：

- core API runner 接收 method 和 URL。
- 只允许 Supabase Management API allowlist 内的 GET 请求。
- 只向该请求注入 `Authorization: Bearer <token>`。
- 返回和审计都脱敏。

失败路径：

- 未配置 workspace/provider/profile 时 fail closed。
- `db push` 被识别为 write；production 环境没有 human intent 时 blocked。
- `db reset` 和 `secrets set` 被识别为 dangerous；默认 blocked。
- secret store 找不到 token 时 blocked。
- `supabase login` 等全局认证命令被 blocked，不启动子进程。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| CLI token env | `SUPABASE_ACCESS_TOKEN` | Supabase CLI 支持的非交互 token 注入方式。 |
| Secret field | `token` | 与 Phase 7 通用 provider secret 保持一致。 |
| API 支持 | 只做 Supabase GET allowlist | 覆盖 Phase 10 的 API 验收，不抢 Phase 11 通用 HTTP。 |
| 写操作 | runner 层再次阻止 non-read | 在 resolver 之外形成执行网关的安全兜底。 |
| 全局 auth | 禁止 `login/logout` | 避免污染全局认证状态。 |

## 背景

Supabase 是 MVP 的核心 provider。`tech-stack.md` 要求 CLI 和 HTTP 请求都走结构化 capability、凭证注入和脱敏审计。Phase 10 要证明 Supabase staging 低风险操作可以执行，而 production 写操作会被默认挡住。

## 未决问题

- project ref 自动解析留到后续 provider adapter 深化。
- production human intent 授权留到后续 policy phase。
