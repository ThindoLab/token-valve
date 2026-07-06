# 技术栈

TokenValve 是一个本地开发者工具，有四个入口面：

- CLI：负责初始化、检查、执行、策略和审计管理。
- Core resolver：选择 provider / profile / environment，并产出 allow / block 决策。
- PATH shims：拦截 `gh`、`supabase`、`vercel` 等命令。
- MCP server：服务 Codex、Claude Code、Pi Agent 和其他兼容 Agent。
- Skill / orchestration：把用户自然语言需求编排为安全的 MCP/Core 操作，并沉淀 Recipe。
- Dashboard / TUI：以本地、脱敏、只读优先的方式呈现密钥库存、默认绑定、active intent、审计摘要和 doctor 状态。

这些入口不只服务 provider CLI。TokenValve 的核心对象是“需要凭证的 capability”和“可选择的 secret profile”，包括 CLI 命令、HTTP 请求、`curl` 调用、SSH/git over SSH、本地脚本、LLM API key 和未来 SDK runner。

项目会公开开源，因此技术选择应优先考虑可审计、可测试、可解释，而不是隐藏复杂性的“聪明”实现。

## 语言与运行时

使用 TypeScript + Node.js。

Node.js 版本下限使用现代 LTS。除非实现约束另有要求，默认目标为 Node.js 22+，以便使用稳定的 ESM 行为、当前测试工具链和仍在维护的包生态。

使用 `pnpm` 管理 workspace。

## 仓库结构

使用 pnpm monorepo：

```text
token-valve/
  packages/
    cli/
    core/
    mcp-server/
    shims/
    dashboard/
    skills/
  adapters/
    github.yaml
    supabase.yaml
    vercel.yaml
    llm-openai.yaml
    llm-anthropic.yaml
  recipes/
    examples/
  specs/
    mission.md
    tech-stack.md
    roadmap.md
  docs/
    architecture.md
    threat-model.md
```

`packages/core` 负责 resolution、policy、adapter loading、redaction、audit event shaping 和 storage interface。

`packages/cli` 负责用户命令，例如 `init`、`secret add`、`llm use`、`bind`、`use`、`resolve`、`exec`、`dashboard`、`doctor`、`audit list` 和 `revoke`。

`packages/shims` 负责轻量命令中转和真实 binary 查找。

`packages/mcp-server` 负责 Agent-facing tools，并且必须执行和 CLI 相同的策略。

`packages/skills` 负责内置 Skill 的编排逻辑和提示模板。Skill 只能调用 MCP/CLI/Core 暴露的结构化能力，不能直接读取 secret store 或接收明文 secret。

`packages/dashboard` 负责 TUI 或 rich CLI dashboard。MVP 不做完整 Web 控制台；dashboard 可以复用 CLI/core 能力，只显示脱敏元数据、默认映射、当前授权和健康检查结果。

`adapters/` 存放 provider 定义。内置 adapter 应尽量数据驱动，这样新增 provider 不需要改 resolver 的主控制流。

Adapter 不应只描述 CLI。它应描述 provider 下可执行的 capability：

- `cli-command`：例如 `gh repo view`、`supabase projects list`。
- `http-request`：例如 Supabase Management API、GitHub REST API、Stripe API。
- `curl-template`：把用户/Agent 的受控请求转成结构化 `curl` 参数，避免 shell string。
- `ssh-command`：例如 `ssh user@host`、`scp`、`rsync -e ssh`。
- `git-ssh`：例如 `git push`、`git fetch` over SSH。
- `script-command`：用户显式配置过的本地脚本或内部工具。
- `llm-api-key`：例如 OpenAI、Anthropic、Gemini、OpenRouter、本地网关或内部模型代理的 API key profile。

## 并发与执行策略

TokenValve 必须假设同一台机器上可能同时存在多个 Agent session，它们都加载同一个 MCP server 或 skill，并且会在相近时间内执行不同账号、不同 workspace 的命令。

默认执行策略是 per-execution credential brokering：

- resolver 根据 cwd、workspace binding、provider metadata、command args、request metadata、SSH host 和 session context 选择 profile。
- runner 只为当前子进程、受控请求或 SSH 操作注入所需凭证，例如 `GH_TOKEN` / `GITHUB_TOKEN`、`Authorization: Bearer ...` header、adapter 声明的环境变量、`GIT_SSH_COMMAND`、临时 `SSH_AUTH_SOCK` 或受控 identity file。
- 子进程结束后，凭证和 profile 选择不应留在父进程或全局 CLI 状态中。

对需要 CLI 配置状态的 provider，优先使用隔离配置目录，例如 `GH_CONFIG_DIR`、`XDG_CONFIG_HOME` 或 provider adapter 声明的等价机制。隔离目录应按 profile 或 session 作用域管理，避免两个 Agent 共享一个可变全局配置。

全局账号切换是兼容策略，不是默认策略。只有当某个 provider 无法通过 env 注入或隔离配置目录工作时，才允许 adapter 声明 global-switch execution mode。该模式必须具备：

- 显式配置启用。
- provider 级互斥锁。
- 短 TTL。
- 执行前后状态快照。
- 失败恢复策略。
- 审计日志。

如果一个命令需要 global switch，但当前已有另一个 Agent 持有同 provider 锁，TokenValve 应 fail closed 或排队等待明确策略，不能悄悄抢占账号状态。

## 核心选择

| 领域 | 选择 | 原因 |
| --- | --- | --- |
| CLI 框架 | `commander` | 直接、熟悉、低仪式感，适合命令显式且安全敏感的 CLI。 |
| 子进程执行 | `execa` | 支持 binary + args、env 注入、输出捕获、timeout，默认避免 shell string。 |
| 测试 | `Vitest` | 对 TypeScript 友好，适合快速测试 resolver、adapter、redactor 和 policy。 |
| 配置格式 | YAML | 与 PRD 示例一致，适合表达 workspace binding、policy 和 provider adapter。 |
| MVP 密钥存储 | macOS Keychain | 第一个支持平台的原生本地凭证存储。 |
| MCP | TypeScript MCP server package | Agent surface 与 resolver / CLI 保持同一运行时，方便共享策略逻辑。 |
| Dashboard | Ink 或同级 TUI/rich CLI 方案 | 满足轻量可视化需求，不引入 Web app、浏览器登录或本地服务暴露面。 |

## 配置与存储

MVP 配置文件位于 `~/.tokenvalve/`：

```text
~/.tokenvalve/
  config.yaml
  profiles.yaml
  bindings.yaml
  policies.yaml
  recipes.yaml
  audit.log
  runtime/
  bin/
```

secret 不能写入这些 YAML 文件，也不能写入项目目录。YAML 只保存 profile id、provider、environment mapping、project metadata、policy setting、Recipe 和脱敏元数据。

虽然 MVP 只实现 macOS Keychain，但 credential storage interface 必须支持未来后端：

- Linux Secret Service。
- Windows Credential Manager。
- 1Password CLI。
- Bitwarden CLI。
- 本地加密 SQLite，但前提是 root key 管理方案清楚。

## Provider 可扩展性

GitHub、Supabase、Vercel 是 MVP 内置 adapter，但 core model 从第一版就必须支持 custom provider mapping。

LLM provider 也是 MVP 的一等 adapter。OpenAI、Anthropic、Gemini、OpenRouter、custom/internal LLM 至少需要共享同一套 LLM key profile 抽象：profile id、provider、base URL、model/use-case metadata、workspace/client/capability 默认绑定和脱敏展示字段。

Adapter 需要声明：

- provider 名称和 command 名称。
- 环境变量映射。
- HTTP header / query / body credential 映射。
- SSH credential 映射，例如 identity file、agent socket、known_hosts policy、host alias。
- LLM key 映射，例如 API key env var、base URL、organization/project header、default use-case。
- capability 类型，例如 `cli-command`、`http-request`、`curl-template`、`ssh-command`、`git-ssh`、`script-command`。
- project / environment 发现提示。
- read、write、dangerous、secret write、production deploy 等风险规则。
- 已知副作用，例如写项目文件或写全局 auth 状态。
- 可选配置隔离需求，例如 `GH_CONFIG_DIR` 或 `XDG_CONFIG_HOME`。
- 支持的 execution modes，例如 `env-injection`、`isolated-config`、`global-switch`。

Custom provider 应能把一个命名 secret field 映射到环境变量、HTTP header、受控请求模板、SSH 执行上下文或 LLM provider profile，而无需修改 TypeScript 代码。

## Skill 与 Recipe

MCP 是能力边界，Skill 是编排层。新增密钥、修复密钥、配置 workspace 默认值这类自然语言流程应由 Skill 引导，但最终都必须落到 MCP/Core 的结构化操作。

Recipe 是验证通过后的结构化配置方案，至少包含：

- provider、profile、capability、workspace binding。
- secret field 到 env/header/request/SSH/LLM profile 的映射。
- risk rules 和 human intent 策略。
- adapter 声明的验证步骤。
- 最近验证时间、验证结果和脱敏诊断。

Recipe 不保存明文 secret。未经验证的 Recipe 不能用于自动执行写操作。

## 测试与验证

使用 Vitest 做单元测试：

```bash
pnpm test
```

Core 测试应覆盖：

- workspace canonicalization。
- profile 和 environment resolution。
- human intent scope 匹配和 TTL 过期。
- 信息缺失时的 fail-closed 行为。
- 风险规则匹配，包括 flag 和参数顺序变化。
- 已知 token 值和常见 token pattern 的脱敏。
- audit event shaping 不包含原始 secret。

CLI 和 shim 集成测试应验证：

- 命令使用 binary + args array 执行，而不是 shell string。
- 环境变量注入只作用于子进程。
- 受控 HTTP / `curl` 请求使用结构化 URL、method、headers 和 body，不拼接 shell string。
- 受控 SSH / git over SSH 操作只使用 adapter 声明的 host、identity 和 known_hosts 策略，不修改用户全局 SSH 配置。
- LLM key profile 可以按 workspace / Agent client / capability 解析为正确 key，且只注入到受控执行上下文。
- Dashboard 只展示脱敏 provider/profile/LLM key 元数据、默认绑定、active intent、最近审计和 doctor 状态。
- 真实 binary 查找不会递归调用 shim 自己。
- 两个并发 Agent / session 可以分别解析到不同 GitHub profile，且不会通过全局状态互相覆盖。
- 没有 human intent 时阻止 production 写操作。
- 未知 provider 和未知 environment 返回可操作建议。

MCP 测试应验证：

- tools 不返回原始 secret。
- `intent_request` 不能自己激活 production 写权限。
- `exec_with_secrets` 只接受注册 capability、结构化 command args 或结构化 HTTP request。
- `secret_profile_create` 不接受明文 secret 参数，只能创建草案或触发本地输入。
- `secret_profile_test` 只能执行 adapter/Recipe 声明的验证步骤。
- `recipe_save` 不保存明文 secret，且未验证 Recipe 不能提升为自动执行方案。
- MCP server 在并发请求中按 session / workspace / command 独立解析 profile。

Skill 测试应验证：

- 新增密钥流程能正确识别 provider、capability、workspace 和风险策略。
- Skill 不在 prompt、日志、MCP 参数或 Recipe 中保存明文 secret。
- 验证失败时不会沉淀为可自动执行 Recipe。

## 约束

MVP 不添加 web app 或托管服务。

不得把原始 secret 存入 repo 文件、YAML 配置、审计日志、debug log 或 MCP tool result。

Dashboard / TUI 不得显示明文 secret，不得提供绕过 resolver/policy 的“直接复制 key”能力。

Skill 不得直接读取 secret store，不得诱导用户把 secret 粘贴进 Agent 对话，不得绕过 MCP/Core policy。

正常命令执行不得调用 `gh auth switch`、`supabase login`、`vercel login` 这类全局 auth 状态变更命令。全局切换只能作为显式 opt-in 的 adapter execution mode，并且必须有锁、TTL、审计和恢复策略。

不得依赖历史习惯、branch 名称或 provider 默认账号来授权 production 写操作。

带 secret 的命令执行不得使用 shell string。

带 secret 的 HTTP 请求不得把完整 URL/header/body 原样写入审计日志；审计只记录脱敏后的 method、host、path、risk、profile 和 decision。

带 secret 的 SSH 操作不得把私钥路径、私钥内容、agent socket 细节或完整 remote URL 原样写入审计日志；审计只记录脱敏后的 host alias、operation、risk、profile 和 decision。

MVP macOS-first。Linux 和 Windows 需要在设计上留出空间，但等核心行为稳定后再实现。

## 已知空白

第一版不提供团队共享、云同步、完整 Web 控制台、GUI 确认窗口、从 `.env` 自动导入 secret，或针对恶意 Agent 的完整沙箱。

1Password、Bitwarden、Linux Secret Service、Windows Credential Manager 和加密 SQLite 应在核心 adapter / policy 模型经过真实工作流验证后再做。
