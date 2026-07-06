# Requirements: Core Resolution Model

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 2：Core Resolution Model。

它要在 `packages/core` 内交付一个不接触真实 secret 的 resolver。resolver 根据配置、adapter 定义和执行上下文，解析 provider、profile、environment、capability、risk，并返回结构化 allow/block 决策。

包含：

- 加载 YAML 配置和 adapter fixtures。
- canonicalize workspace path。
- 定义 resolver 输入、输出和错误 reason。
- 解析 workspace binding。
- 解析 provider/profile/environment。
- 解析 capability 类型：`cli-command`、`http-request`、`llm-api-key`、`ssh-command`、`git-ssh`、`script-command`。
- 根据 adapter risk rules 判断 `read`、`write`、`dangerous`、`unknown`。
- 在配置缺失、provider 未知、profile 未知、environment 未知、risk 未知时 fail closed。
- 提供 GitHub、Supabase、Vercel、LLM、custom provider fixtures。
- 提供单元测试覆盖 read/write/dangerous/unknown risk。

## 范围外

- 不读取或注入真实 secret（见 Phase 5、Phase 7）。
- 不执行 CLI、HTTP、SSH 或 script（见 Phase 9-14）。
- 不实现 Agent session routing（见 Phase 3）。
- 不实现 redaction 和 audit event shaping（见 Phase 4）。
- 不实现 human intent TTL 授权（见 Phase 15）。
- 不实现真实 adapter schema 的完整能力，只交付 Phase 2 所需最小 schema。
- 不接入用户目录 `~/.tokenvalve/`，测试使用显式传入的 fixtures。

## 行为

调用者传入：

- workspace 当前路径。
- 配置对象或 YAML 路径。
- adapter 定义对象或 YAML 路径。
- execution context，例如 command/args、HTTP method/url、LLM provider request 或 SSH operation。

resolver 返回：

- `decision: "allow"` 或 `decision: "blocked"`。
- provider、profile、environment、capability、risk。
- reason。
- 可操作的 message。

正常路径：

- GitHub `gh repo view` 在已绑定 workspace 中解析为 GitHub profile，risk 为 `read`，decision 为 `allow`。
- Supabase `db push` 在 staging 中解析为 `write`，decision 为 `allow`。
- Vercel `deploy --prod` 解析为 `production_deploy` 或 `dangerous` 类高风险，当前 Phase 2 没有 human intent，所以 decision 为 `blocked`。
- LLM key request 能按 workspace binding 解析默认 LLM profile，risk 为 `read`。

失败路径：

- 未知 workspace 返回 `blocked`，reason 为 `workspace_not_configured`。
- 未知 provider 返回 `blocked`，reason 为 `provider_not_configured`。
- 找不到匹配 capability 返回 `blocked`，reason 为 `capability_not_configured`。
- 无法判断风险返回 `blocked`，reason 为 `risk_unknown`。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| YAML 解析 | 使用 `yaml` 包 | `tech-stack.md` 指定 YAML 配置，结构化解析比手写解析安全。 |
| Resolver 输入 | 支持对象和文件路径两种加载方式 | 测试可直接传对象，后续 CLI/init 可从文件读取。 |
| 路径处理 | 使用 `node:path` 与 `fs.realpathSync.native` 的容错封装 | workspace canonicalization 必须稳定，但测试中的虚拟路径也要可用。 |
| Risk 默认值 | 未匹配 risk rule 时 `unknown` 并 blocked | 符合 fail-closed 原则。 |
| Profile 解析 | Phase 2 只解析 metadata，不接触 secret value | 保持 resolver 纯粹，避免提前引入 secret store。 |
| Human intent | Phase 2 不支持 active intent | 高风险需要先 blocked，Phase 15 再允许授权放行。 |

## 背景

`mission.md` 要求 TokenValve 在无法确定 workspace、provider、profile、environment、命令风险或授权状态时 fail closed。

`tech-stack.md` 规定 `packages/core` 负责 resolution、policy、adapter loading、redaction、audit event shaping 和 storage interface。本 phase 只覆盖 resolution 与最小 policy decision，其他职责在后续 phase 增量实现。

Phase 2 是后续 Agent session routing、redaction/audit、secret store、init、provider MVP 的基础。实现应保持小而可测试，不提前把 GitHub/Supabase/Vercel 写死进主控制流。

## 未决问题

- 完整 adapter schema 会在后续 provider phases 继续扩展；本 phase 使用最小 schema。
- `production_deploy` 是否作为独立 risk 类型长期保留，后续 Human Intent 阶段可再细化。
- workspace binding 的优先级暂按最长路径匹配，后续 init 阶段可根据真实体验调整。
