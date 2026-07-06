# Requirements: SSH Capability

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 12：SSH Capability。

它要让 TokenValve 支持受控 SSH 与 git over SSH credential brokering。调用方提供结构化 host、user、port、operation 和命令意图；TokenValve 先通过 resolver 校验 workspace、provider、profile、capability、host allowlist、operation 和 risk，再从 secret store 读取 SSH credential，只注入到当前 SSH/git 子进程，并对输出、审计和返回值脱敏。

包含：

- core 新增 `ssh-command` runner。
- core 新增 `git-ssh` runner。
- 支持 identity file path 注入。
- 支持临时 key file 内容注入，且执行后清理临时文件。
- 支持 `SSH_AUTH_SOCK` 注入。
- 支持为 git over SSH 生成单次执行的 `GIT_SSH_COMMAND`。
- host、user、port、operation 使用结构化字段表达。
- known_hosts policy 必须由调用方显式给出。
- 默认不修改用户全局 `~/.ssh/config`、known_hosts 或 ssh-agent 状态。
- 未配置 host allowlist 的 SSH 操作 fail closed。
- production SSH 写操作需要 human intent，当前阶段默认拒绝。
- CLI 新增最小 `tokenvalve ssh run` 与 `tokenvalve git-ssh run`，用于验证结构化入口。

## 范围外

- 不实现 PATH shim 转发 `ssh` / `git`（见 Phase 14）。
- 不实现 human intent TTL 授权放行（见 Phase 15）。
- 不实现 MCP tool 暴露（见 Phase 16）。
- 不实现完整 SSH config 生成器、ssh-agent 管理或 known_hosts 自动写入。
- 不实现 scp、rsync、端口转发等扩展命令；本阶段只覆盖最小 `ssh` 命令和 git over SSH。

## 行为

SSH 命令：

- 用户或上层工具提供 workspace、provider、host、user、port、operation、known_hosts policy 和要执行的远端命令。
- TokenValve resolver 校验 workspace binding、provider adapter、host allowlist、operation 和 risk。
- runner 根据 profile 读取 SSH credential。
- credential 只进入当前子进程：identity file 通过 `-i`，agent socket 通过 `SSH_AUTH_SOCK`，临时 key 内容写入一次性临时文件。
- `known_hosts` 策略必须显式：`strict` 需要已给出 known_hosts 文件路径，`accept-new` 仅作为本次命令参数，`off` 只能用于非生产低风险场景。
- 输出和审计必须脱敏私钥路径、agent socket、完整 remote URL 和已知 secret。

git over SSH：

- 用户或上层工具提供 workspace、provider、remote URL、operation 和 git args。
- TokenValve 解析为 `git-ssh` capability。
- runner 通过 `GIT_SSH_COMMAND` 为当前 git 子进程注入 identity、port、known_hosts 策略和 agent socket。
- 不调用全局 `ssh-add`，不写 `~/.ssh/config`。
- `fetch`、`ls-remote` 等读操作可执行；`push` 等写操作在 production 环境需要 human intent，本阶段默认拒绝。

失败路径：

- host 未在 capability allowlist 中时 blocked。
- capability 未配置 host allowlist 时 blocked。
- known_hosts policy 缺失时 blocked。
- secret store 中找不到所需 credential 时 blocked。
- production 写操作没有 human intent 时 blocked。
- risk rule 缺失时 blocked。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 执行方式 | `ProcessRunner` + args array | 避免 shell string 和命令注入。 |
| git over SSH | 使用单次 `GIT_SSH_COMMAND` | 不污染全局 Git/SSH 配置，适合多 Agent 并发。 |
| known_hosts | 调用方必须显式提供 policy | SSH host key 行为是安全边界，不能隐式猜测。 |
| 临时 key | 仅在 secret field 提供 key 内容时创建临时文件并清理 | 支持未来 UI 输入私钥，同时避免落盘残留。 |
| 默认写策略 | production 写操作拒绝 | Phase 15 才实现 TTL-bound human intent。 |
| 审计 | 记录 host alias、operation、risk，不记录完整敏感目标 | 满足可追踪性，同时降低泄露面。 |

## 背景

`mission.md` 明确 TokenValve 是本地密钥管理器、凭证中转与执行网关，必须支持 SSH/git over SSH，同时避免全局状态污染。`tech-stack.md` 要求带 secret 的 SSH 操作不得泄露私钥路径、agent socket 或完整 remote URL，且不得修改用户全局 SSH 配置。

本 feature 是 Execution Gateway 的关键能力：它让 GitHub/Supabase/HTTP 之外的真实开发操作也能走同一套解析、注入、审计和脱敏模型。

## 未决问题

- `known_hosts` 文件的创建、托管和 UI 引导留给后续 Skill/Recipe 阶段。
- human intent 放行 production SSH 写操作留给 Phase 15。
- 更复杂的 SSH 子能力（scp、rsync、端口转发、jump host）留给 custom provider/Recipe 迭代。
