# 路线图

路线图按“TokenValve 什么时候变得可用、更安全、更像一个产品”排序，而不是按包边界排序。

每个阶段都必须留下一个小而独立、可以演示、可以验收的交付能力。本文不是 Jira 任务清单，但每个 Phase 都要清楚说明交付物、范围和验收标准。

---

## Milestone 0: Product Baseline

目标：把产品定位、技术边界和实现路线收束成可执行规格。

### Phase 0: 需求与规格基线（已完成）

交付物：PRD 与 specs 文档基线。

范围：

- 明确 TokenValve 是本地密钥管理器、凭证中转与执行网关。
- 明确 MVP 覆盖 GitHub、Supabase、Vercel、LLM API key、HTTP/curl、SSH、custom provider。
- 明确默认采用 per-execution credential brokering，不依赖全局账号切换。
- 明确 MCP 是安全能力边界，Skill 是编排层，Recipe 是验证后的可复用配置方案。
- 明确 MVP 不做云端同步、团队 vault、完整 Web 控制台和 hostile-agent 完整沙箱。
- 建立 `specs/mission.md`、`specs/tech-stack.md`、`specs/roadmap.md`。

验收：

- PRD 能解释产品定位、核心场景、MVP 范围和非目标。
- specs 能解释使命、技术栈和高层实现顺序。
- 用户能基于文档判断下一步应进入工程实现。

---

## Milestone 1: Local Core

目标：先把本地配置、解析、密钥存储、脱敏和可验证 profile 管理做稳。此阶段结束时，TokenValve 可以安全管理密钥和解析上下文，但不要求完整代执行所有工具。

### Phase 1: 项目骨架（已完成）

交付物：可运行的 pnpm TypeScript monorepo。

范围：

- 创建 `packages/cli`、`packages/core`、`packages/mcp-server`、`packages/shims`、`packages/dashboard`、`packages/skills`。
- 建立 TypeScript、ESM、lint、test、build 基础配置。
- 建立 adapter fixtures 目录。
- 建立最小 CLI 入口，例如 `tokenvalve --version`、`tokenvalve doctor` 占位。
- 建立单元测试运行命令。

验收：

- `pnpm install` 后可以运行 build/test。
- CLI 可以在本地启动并输出版本。
- monorepo package 依赖边界清楚。
- CI 或本地检查命令可以重复执行。

### Phase 2: Core Resolution Model（已完成）

交付物：不接触真实 secret 的 core resolver。

范围：

- 加载 YAML 配置和 adapter 定义。
- canonicalize workspace path。
- 解析 provider、profile、environment、capability、risk。
- 返回结构化 allow/block 决策。
- 支持缺失配置时 fail closed。
- 提供 test fixtures 覆盖 GitHub、Supabase、Vercel、LLM 和 custom provider。

验收：

- 给定 workspace、command/request metadata，可以解析到预期 profile。
- 未知 workspace/provider/environment 会拒绝执行并返回可操作建议。
- resolver 不读取、不返回真实 secret。
- 单元测试覆盖 read/write/dangerous/unknown risk。

### Phase 3: Agent Session Routing（已完成）

交付物：并发 Agent session 路由模型。

范围：

- 定义 Agent session context。
- 支持按 session、workspace、capability、command/request metadata 独立解析 profile。
- 建立两个并发 session 使用不同 GitHub profile 的测试。
- 明确 resolver 不依赖机器上的“当前账号”。

验收：

- 两个 session 在相同时间解析到不同 profile 时互不覆盖。
- session 缺失时仍能按 workspace binding 做确定性解析。
- 测试证明不依赖 `gh auth status` 或全局 CLI 当前状态。

### Phase 4: 脱敏与审计事件（已完成）

交付物：redaction 与 audit event shaping。

范围：

- 脱敏已知 secret 值。
- 脱敏常见 token-like patterns。
- 生成结构化 audit event。
- 审计事件记录 provider、profile、capability、risk、decision、source、timestamp。
- 输出、错误和 MCP tool result 使用统一 redactor。

验收：

- audit event 不包含原始 secret。
- stdout/stderr/error 中出现 secret 时会被脱敏。
- 无法可靠脱敏的输出会被截断或标记为不可安全返回。
- 单元测试覆盖 token、header、URL、SSH remote、agent socket 等场景。

### Phase 5: Secret Store Interface（已完成）

交付物：后端无关的 secret storage interface 与 macOS Keychain 实现。

范围：

- 定义 secret store interface。
- 实现 macOS Keychain backend。
- 实现 test double。
- 明确 YAML 只保存 profile metadata，不保存明文 secret。
- 支持 secret create/read/update/delete 的内部 API。

验收：

- 可以写入并读取一条测试 secret。
- profile metadata 与 secret value 分离。
- 测试环境不依赖真实 Keychain。
- 明文 secret 不出现在 repo 文件、配置 YAML 或日志中。

### Phase 6: 场景化 Init（已完成）

交付物：`tokenvalve init` 场景化向导。

范围：

- 检测当前 workspace、git remote、常见 provider 配置文件。
- 检测已安装 CLI 和 MCP client。
- 询问要覆盖哪些 provider、LLM key、Agent/client 默认偏好和 production 策略。
- 创建 `config.yaml`、`profiles.yaml`、`bindings.yaml`、`policies.yaml`。
- 输出 dry-run 矩阵，展示常见命令会选择哪个 profile、哪些会被拒绝。
- 支持 `tokenvalve init --add-provider ...` 增量配置。

验收：

- 初始化后生成可读配置文件。
- 未选择的 provider 不被自动接管。
- dry-run 能展示 GitHub/Supabase/Vercel/LLM 的解析结果。
- production 写操作默认需要 human intent。

### Phase 7: 密钥库存与 Profile 管理（已完成）

交付物：本地 secret profile 管理能力。

范围：

- 实现 `tokenvalve secret add/list/update/delete`。
- profile 保存 provider、environment、用途、绑定状态和脱敏元数据。
- 新增 profile 默认 `unverified`。
- 支持 `tokenvalve secret test <profile>` 触发验证。
- 支持 profile 状态：`draft`、`unverified`、`verified`、`expired`、`disabled`。

验收：

- 可以添加、列出、更新、删除 profile。
- 明文只进入 secret store，不进入 YAML。
- CLI 列表只显示脱敏状态。
- 未验证 profile 不用于自动写操作。

### Phase 8: LLM Key 管理 MVP（已完成）

交付物：多套 LLM API key 管理与默认绑定。

范围：

- 支持 OpenAI、Anthropic、Gemini、OpenRouter、custom/internal LLM。
- 管理 LLM key profile。
- 支持 workspace / Agent client / capability 默认 key。
- 支持 base URL、organization/project metadata 和用途标签。
- 查询时只返回脱敏 metadata。

验收：

- 可以添加至少两套 LLM key profile。
- 可以为当前 workspace 设置默认 LLM key。
- MCP/CLI 查询不会返回明文 key。
- resolver 可以按 workspace/client/capability 解析 LLM key profile。

---

## Milestone 2: Execution Gateway

目标：把 TokenValve 从“密钥管理器”推进到“受控执行网关”。此阶段结束时，真实 CLI、HTTP/curl、SSH 和 high-risk intent 都能走同一套解析、注入、审计和脱敏。

### Phase 9: GitHub MVP（已完成）

交付物：GitHub 多 profile 执行能力。

范围：

- 配置多个 GitHub profile。
- 根据 workspace、git remote、session context 解析 profile。
- 为 `gh` 子进程注入 `GH_TOKEN` / `GITHUB_TOKEN`。
- 支持 `gh api user`、`gh repo view`、`gh repo list` 等低风险验证命令。
- 避免默认调用 `gh auth switch`。

验收：

- 两个 Agent 可在相近时间使用不同 GitHub profile。
- `gh` 命令只在当前子进程获得 token。
- 输出和错误中的 token 被脱敏。
- 未匹配 workspace/repo 时 fail closed。

### Phase 10: Supabase MVP（已完成）

交付物：Supabase staging/production 区分与基础 CLI/API 执行。

范围：

- 配置 Supabase staging 和 production profiles。
- 解析 project ref 与 environment。
- 支持低风险 staging CLI/API 请求。
- production 写操作必须要求 human intent。
- 识别 `db push`、`db reset`、`secrets set` 等风险命令。

验收：

- staging 只读/低风险命令可以执行。
- production 写操作没有 human intent 时被拒绝。
- risk 规则支持参数顺序和 flag 变化。
- 审计日志记录脱敏后的 provider/profile/environment/risk。

### Phase 11: HTTP 与 Curl Capability（已完成）

交付物：结构化 HTTP request 和受控 curl template。

范围：

- 定义 `http-request` 与 `curl-template` capability。
- 支持 header/query/body secret 注入。
- URL host/path 必须匹配 adapter allowlist 或 template。
- HTTP 请求不拼接 shell string。
- 审计只记录脱敏 method、host、path、risk、decision。

验收：

- 可以受控调用 GitHub/Supabase API。
- secret 不出现在审计、错误和 MCP 返回值中。
- 未配置 risk rules 的写请求 fail closed。
- 非 allowlist host 被拒绝。

### Phase 12: SSH Capability（已完成）

交付物：SSH 与 git over SSH credential brokering。

范围：

- 定义 `ssh-command` 与 `git-ssh` capability。
- 支持 identity file、临时 key file、`SSH_AUTH_SOCK`、`GIT_SSH_COMMAND`。
- host、user、port、operation 结构化表示。
- known_hosts policy 必须显式配置。
- 默认不修改用户全局 `~/.ssh/config`、known_hosts 或 ssh-agent 状态。

验收：

- 可以为 git over SSH 选择正确 profile。
- 私钥路径、agent socket 和 remote URL 在日志中脱敏。
- 未配置 host allowlist 的 SSH 操作被拒绝。
- production SSH 写操作需要 human intent。

### Phase 13: Vercel MVP（已完成）

交付物：Vercel preview/production 执行策略。

范围：

- 注入 Vercel token、org id、project id。
- 将普通 `vercel deploy` 视为 preview。
- 将 `vercel deploy --prod` 视为 production deploy。
- production deploy 需要 human intent。

验收：

- preview deploy 可以按配置执行。
- production deploy 没有授权时被拒绝。
- Vercel token 不出现在输出或审计中。

### Phase 14: Shim Execution

交付物：PATH shims 与真实 binary 转发。

范围：

- 实现 `gh`、`supabase`、`vercel` shims。
- 查找真实 binary，避免递归调用 shim 自己。
- 使用 binary + args array 执行，不使用 shell string。
- 将注入 env 限定在子进程。
- 流式返回脱敏输出。

验收：

- PATH 中 shim 在前时命令可正常转发到真实 binary。
- 递归调用被避免。
- 子进程结束后父进程环境不保留 secret。
- shims 与 direct `tokenvalve exec` 行为一致。

### Phase 15: Human Intent

交付物：TTL-bound 本地授权机制。

范围：

- 实现 `tokenvalve use` 和 `tokenvalve revoke`。
- 授权范围包含 workspace、provider、profile、environment、risk。
- 支持 TTL 过期。
- MCP 只能创建待确认请求，不能直接激活授权。
- 审计记录授权创建、使用和撤销。

验收：

- production 写操作在授权前被拒绝，授权后在范围内允许。
- TTL 过期后自动恢复拒绝。
- 超出授权 scope 的命令仍被拒绝。
- Agent 无法通过 MCP 自授权 production 写操作。

---

## Milestone 3: Agent Product Loop

目标：让 Agent 不只是“调用工具”，而是能引导用户新增密钥、验证方案、沉淀 Recipe，并在下次自动使用验证过的配置。

### Phase 16: MCP Server MVP

交付物：Agent-facing MCP server。

范围：

- Profile/context tools：`profiles_list`、`context_resolve`、`llm_profile_resolve`。
- Execution tools：`exec_with_secrets`、`http_request_with_secrets`、`ssh_with_secrets`。
- Intent tools：`intent_request`、`revoke`。
- Onboarding tools：`secret_profile_create`、`secret_profile_test`。
- Recipe/UI tools：`recipe_save`、`recipe_list`、`ui_open`。
- Audit tools：`audit_list`。

验收：

- MCP tools 不返回原始 secret。
- 执行类工具只接受结构化参数，不接受 shell string。
- `secret_profile_create` 不接受明文 secret 参数。
- `intent_request` 不能直接激活 production 写权限。
- 并发 MCP 请求按 session/workspace 独立解析。

### Phase 17: Recipe / Playbook MVP

交付物：可验证、可复用的 Recipe。

范围：

- 定义 Recipe schema。
- 保存 provider、profile、capability、workspace binding、risk rules。
- 保存验证步骤和脱敏验证结果。
- 支持 Recipe 状态：`draft`、`verified`、`failed`、`stale`、`disabled`。
- 支持 `tokenvalve recipe list/show/test`。
- 未验证 Recipe 不能用于自动写操作。

验收：

- 验证通过后可保存 Recipe。
- Recipe 不包含明文 secret。
- Recipe 复测失败后状态变为 stale/failed。
- 相同 workspace/capability 可基于 verified Recipe 自动解析 profile。

### Phase 18: Skill 编排 MVP

交付物：内置 TokenValve Skill 编排流程。

范围：

- GitHub key onboarding Skill。
- Supabase key onboarding Skill。
- LLM key onboarding Skill。
- Custom secret onboarding Skill。
- Skill 引导 provider 类型、用途、profile 命名、workspace binding、capability、risk 和验证方式。
- Skill 调用 MCP，不直接读取 secret store。
- Skill 失败时给出修复建议，不保存失败 Recipe 为可自动执行方案。

验收：

- 用户说“新增一个 GitHub key”时，Skill 能完成引导、输入、测试、Recipe 保存。
- 用户无需把明文 secret 粘贴进 Agent 对话。
- 验证失败不会产生 verified Recipe。
- Skill 生成的配置可被下一次 Agent 执行复用。

### Phase 19: Custom Provider MVP

交付物：数据驱动 custom provider mapping。

范围：

- 用户可以定义 custom provider。
- 支持 secret field 到 env、HTTP header、request template、SSH context、LLM profile 的映射。
- 支持 custom risk rules。
- 支持验证步骤。
- 缺少 risk rules 时 fail closed。

验收：

- 可以新增一个 custom API token 并用于受控 HTTP 请求。
- 可以新增一个 custom env secret 并用于受控 script/command。
- 未配置风险规则的写操作被拒绝。
- custom provider 走统一 resolver、redactor、audit。

### Phase 20: Dashboard / TUI

交付物：`tokenvalve dashboard` 轻量可视化入口。

范围：

- 展示 provider/profile/LLM key 库存。
- 展示 workspace 默认绑定。
- 展示 active intent 和 TTL。
- 展示最近审计摘要。
- 展示 doctor 状态。
- 支持安全切换默认 profile。
- 不显示明文 secret。

验收：

- 用户可在 dashboard 查看当前 workspace 会使用哪些 profile。
- 用户可看到哪些 profile 未验证、过期或失败。
- 用户可看到最近被允许/拒绝的执行。
- dashboard 不提供复制明文 key 的能力。

---

## Milestone 4: Public MVP

目标：补齐兼容策略、诊断能力、文档和发布路径，让外部 macOS 用户可以真实使用。

### Phase 21: Global Switch Compatibility

交付物：显式 opt-in 的 global-switch execution mode。

范围：

- 仅 provider adapter 显式声明时启用。
- provider 级互斥锁。
- 短 TTL。
- 执行前后状态快照。
- 失败恢复策略。
- 审计日志。

验收：

- 默认执行路径不使用 global switch。
- 同 provider 锁冲突时 fail closed 或按明确策略排队。
- 执行失败后能恢复原状态或给出明确修复建议。
- 所有 global switch 操作可审计。

### Phase 22: Doctor 与加固

交付物：`tokenvalve doctor` 诊断与修复建议。

范围：

- 诊断缺失 binary。
- 诊断损坏 mapping。
- 诊断过期、未验证或 disabled profile。
- 诊断 shim path 问题。
- 诊断全局切换锁冲突。
- 诊断不安全配置和未支持场景。
- 输出可操作修复建议。

验收：

- 常见安装和配置问题能被检测。
- doctor 输出不包含明文 secret。
- 每个问题都有下一步建议。
- Public MVP 前所有关键失败路径都有诊断入口。

### Phase 23: Public MVP

交付物：公开可安装的 macOS MVP。

范围：

- 安装说明。
- 快速开始。
- GitHub/Supabase/Vercel/LLM/custom provider 示例。
- MCP client 配置说明。
- Skill onboarding 示例。
- Recipe 示例。
- Threat model 和安全边界说明。
- 已知限制和 Backlog。

验收：

- 公开 macOS 用户可以安装 TokenValve。
- 用户可以配置多套 LLM key、GitHub、Supabase、Vercel 和一个 custom provider。
- 用户可以通过 Skill 新增并验证密钥、沉淀 Recipe。
- Agent 可以安全运行 CLI 命令、受控 API 请求和 SSH 操作。
- production 写操作需要 human intent。
- dashboard 可以解释当前密钥状态。

---

## Later / Backlog

- Local Web UI，用于“打开密钥管理器”的完整可视化编辑体验。
- Linux Secret Service 和 Windows Credential Manager。
- 1Password 和 Bitwarden adapters。
- GUI 或原生确认提示。
- 团队 policy templates。
- 针对低风险环境的使用习惯建议。
- 有清晰 root key 方案的加密 SQLite。
- 面向 hostile-agent 场景的更强沙箱。
- 更多内置 provider adapters，例如 Stripe、Cloudflare 和内部工具。
