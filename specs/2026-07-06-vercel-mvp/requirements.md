# Requirements: Vercel MVP

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 13：Vercel MVP。

它要让 TokenValve 支持 Vercel CLI 的最小受控执行：普通 `vercel deploy` 作为 preview deploy，可以在配置和 profile 验证通过后执行；`vercel deploy --prod` 作为 production deploy，在 Phase 15 human intent 完成前默认拒绝。TokenValve 只为当前 Vercel 子进程注入 token、org id 和 project id，不调用 `vercel login`，不修改全局 Vercel 认证状态。

包含：

- core 新增 `runVercelCli`。
- 定义 Vercel adapter，覆盖 `vercel deploy` 与 `vercel deploy --prod` risk。
- 从 secret store 读取 `token`、`org_id`、`project_id`。
- 通过当前子进程 env 注入 `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`。
- 禁止 `vercel login`、`logout` 等全局认证命令。
- preview deploy 可执行。
- production deploy 没有 human intent 时拒绝。
- stdout、stderr、audit 不出现 Vercel token。
- CLI 新增 `tokenvalve vercel run`，用于验证结构化入口。

## 范围外

- 不实现 PATH shim 转发 `vercel`（见 Phase 14）。
- 不实现 human intent TTL 授权放行 production deploy（见 Phase 15）。
- 不实现 Vercel REST API 或项目发现。
- 不写入或修改 `.vercel/project.json`。
- 不实现 dashboard 展示（见后续 dashboard phase）。

## 行为

preview deploy：

- 用户运行 `tokenvalve vercel run --workspace <path> -- deploy`。
- TokenValve resolver 根据 workspace 选择 Vercel profile。
- risk 解析为 `write`。
- profile 必须为 `verified`。
- runner 从 secret store 读取 token/org/project，注入当前 `vercel` 子进程。
- 输出返回前脱敏。

production deploy：

- 用户运行 `tokenvalve vercel run --workspace <path> -- deploy --prod`。
- risk 解析为 `production_deploy`。
- 当前阶段没有 human intent 授权机制，因此拒绝执行。

失败路径：

- 未配置 workspace/provider/profile 时 fail closed。
- 未验证 profile 执行 preview deploy 时拒绝。
- token 缺失时拒绝。
- 全局 auth 命令拒绝。
- production deploy 拒绝并提示需要 human intent。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 执行方式 | `ProcessRunner` + args array | 避免 shell string 和命令注入。 |
| 凭证注入 | 当前子进程 env | 不污染全局 Vercel 认证状态，支持多 Agent 并发。 |
| Project metadata | `org_id` 和 `project_id` 作为 secret store 字段读取 | Vercel CLI 可通过 env 获得项目上下文，避免写 `.vercel`。 |
| production deploy | 当前阶段始终拒绝 | Phase 15 才实现本地 human intent。 |
| 全局登录 | 拒绝 `login/logout` | 避免改变机器上的全局认证状态。 |

## 背景

Vercel 是 MVP 内置 provider 之一。`mission.md` 要求普通开发命令可以继续运行，但凭证只在单次执行期间打开；`tech-stack.md` 明确不得调用 `vercel login` 这类全局 auth 状态变更命令。

Phase 13 把 Execution Gateway 从 GitHub、Supabase、HTTP/curl、SSH 扩展到部署类 CLI，并为 Phase 15 human intent 留出明确接口。

## 未决问题

- Vercel API token 的验证方式留给后续 Skill/Recipe 阶段沉淀。
- production deploy 的临时授权、TTL 和撤销留给 Phase 15。
- 真实项目发现与 `.vercel/project.json` 兼容策略留给后续增量配置。
