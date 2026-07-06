# Requirements: Human Intent

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 15：Human Intent。

它要实现一个本地、TTL-bound 的 active intent 授权机制，让 production 写操作和危险操作在没有授权时继续 fail closed，在用户通过本地 CLI 明确授权后，只在授权 scope 和 TTL 内放行。授权 scope 包含 workspace、provider、profile、environment 和 risk。授权创建、使用和撤销都要留下脱敏审计事件。

包含：

- core 新增 active intent 类型、scope 匹配和过期判断。
- resolver 支持接收 active intents，并在 `dangerous` / `production_deploy` 以及 production `write` 匹配授权时放行。
- CLI 新增 `tokenvalve use` 创建本地授权。
- CLI 新增 `tokenvalve revoke` 撤销本地授权。
- active intent 存储在本地配置目录的 `intents.yaml`，不包含 secret。
- 授权必须有 TTL，过期后自动不再匹配。
- 审计事件记录授权创建、使用和撤销。
- MCP 当前阶段不能激活授权；只预留 request/pending 状态，实际 MCP tool 在 Phase 16 暴露。

## 范围外

- 不实现 MCP server tool（见 Phase 16）。
- 不实现 GUI/TUI 确认窗口。
- 不实现队列式等待授权。
- 不实现云端同步或团队共享授权。
- 不实现复杂审批流；Phase 15 只做本地单用户 TTL 授权。

## 行为

创建授权：

- 用户运行 `tokenvalve use --workspace <path> --provider vercel --profile vercel:team --environment production --risk production_deploy --ttl 10m --yes`。
- CLI 写入 `intents.yaml`，状态为 `active`，包含 `expiresAt`。
- CLI 输出授权 id、scope 和过期时间，不显示 secret。
- core 生成授权创建审计事件。

使用授权：

- runner 调用 resolver 时传入 active intents。
- resolver 解析出 workspace、provider、profile、environment、risk 后检查授权。
- scope 完全匹配且未过期时，原本需要 human intent 的操作返回 `allow`。
- 如果授权 risk 是 `production_deploy`，只放行 production deploy；不放行其他 provider/profile/environment。

撤销授权：

- 用户运行 `tokenvalve revoke <intent-id>`。
- CLI 将该授权标记为 `revoked`。
- 后续 resolver 不再匹配它。
- core 生成撤销审计事件。

失败路径：

- TTL 缺失或格式无效时拒绝创建。
- `--yes` 缺失时拒绝非交互式授权创建。
- scope 缺少 workspace/provider/profile/environment/risk 时拒绝创建。
- 授权过期、撤销、scope 不匹配时仍返回 `human_intent_required`。
- MCP 或 Agent-facing 输入不能直接创建 active intent。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 存储 | `intents.yaml` | 与现有本地 YAML 配置模型一致，且不保存 secret。 |
| TTL | CLI 必填 `--ttl`，支持 `30s`、`10m`、`2h` | 避免长期授权静默存在。 |
| Scope | workspace/provider/profile/environment/risk 全部匹配 | 防止授权被其他项目、账号或环境复用。 |
| MCP | Phase 15 不允许 MCP 激活 active intent | 符合 roadmap：MCP 只能创建待确认请求。 |
| 过期处理 | 解析时忽略过期授权，CLI list 可见状态 | 不需要后台任务，行为确定。 |

## 背景

前面 Phase 10、12、13 已经把 production 写操作和危险操作默认挡住。Phase 15 是把“用户明确允许一次高风险操作”的缺口补上，但仍保持本地、短 TTL、scope 精确匹配和审计可见。

`mission.md` 要求 production 写操作必须经过本地 human intent；`tech-stack.md` 要求测试覆盖 human intent scope 匹配和 TTL 过期。

## 未决问题

- 待确认请求的 UI、MCP 工具和 Skill 编排在 Phase 16 以后实现。
- 是否支持按 capability 或 command args 进一步收窄授权 scope，留给真实使用反馈后再扩展。
