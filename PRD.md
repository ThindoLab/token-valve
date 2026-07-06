# TokenValve PRD

## 1. 产品定位

TokenValve 是一个面向 AI Agent、开发者 CLI、本地脚本、HTTP 请求和 SSH 操作的本地密钥管理器、凭证中转与执行网关。

它的目标不是把密钥交给 Agent，也不是替代 1Password、Bitwarden、Vault 这类通用密钥管理器，而是提供一个面向 Agent 工作流的本地密钥管理层：用户可以管理多套 LLM API key、GitHub/Supabase/Vercel 凭证、SSH credential 和自定义 provider secret，并在本地根据当前 workspace、用户一次性配置的使用场景、命令/请求语义和安全策略，把一次执行中转到正确认证上下文。

它类似 `cc switch` 的方向，但范围更宽：既能管理和切换多套 LLM API key，也能临时为 `gh`、`supabase`、`vercel` 等 CLI 切换认证方式或注入 env，为 `curl` / HTTP 请求注入 header/body/query，为 `ssh`、`git ssh`、内部脚本或工具选择正确私钥、agent socket 或其他凭证。

单次执行结束后，凭证随子进程、受控请求或 SSH 执行上下文消失。TokenValve 默认不上传云端，不写入项目仓库，不调用全局账号切换命令。

一句话：

> Agent 正常执行命令，TokenValve 在本地判断该用哪把钥匙，并只在这一次命令里打开阀门。

## 2. 背景问题

开发者经常同时拥有多组账号和环境：

- GitHub：`personal`、`work`、`client-a`
- Supabase：`thindo:staging`、`thindo:production`
- Vercel：`team-a`、`personal`、`preview`
- 其他 CLI / API / SSH：OpenAI、Stripe、Cloudflare、自定义内部工具、通过 `curl` 调用的 HTTP API、SSH host 或 git over SSH
- LLM API key：OpenAI、Anthropic、Gemini、OpenRouter、本地网关、公司内部模型代理

在 Claude Code、Codex 等 Agent 环境中，这些问题更明显：

- 多个 Agent 或 CLI 工具需要在不同 LLM provider/key 之间切换，但用户不想把 key 散落在 shell profile、项目 `.env` 或各工具自己的配置里。
- 不希望把真实 token 明文暴露给 Agent。
- 不希望把 `.env`、token、账号配置上传到云端或提交到 git。
- 不希望用 `gh auth switch` 这类全局切换影响其他项目。
- 多项目、多 Agent、多终端并发时，全局账号状态容易混乱。
- 两个正在运行的 Agent 可能前后相差几分钟分别向不同 GitHub 账号提交代码，不能因为全局账号状态被覆盖而串号。
- staging 和 production 需要明确区分，但 production 写操作不能全自动执行。
- 一旦每次执行都要人工选择 profile，Agent 体验会被打断。

## 3. 产品原则

### 3.1 场景优先

TokenValve 的核心体验不是让用户每次手动选择凭证，而是在 `init` 阶段一次性理解用户的主要使用场景，完成针对性配置。后续大部分常见命令应自动走正确 profile。

MVP 只覆盖用户在初始化时明确选择和配置过的场景。不在配置范围内的场景默认不猜测、不兜底执行，而是拒绝并提示如何增量配置。

### 3.1.1 可见、可选、可解释

TokenValve 也是一个密钥管理工具。用户需要能看见本机有哪些 provider、profile、environment、LLM key 和 active intent，能安全地切换默认 profile，也能理解某次执行为什么选了某把钥匙。

MVP 应提供轻量可视化呈现，可以先从 TUI / rich CLI dashboard 开始，而不是一开始做完整 Web 控制台。

### 3.2 确定性优先

MVP 优先使用确定性规则：

- workspace binding
- provider/project id binding
- 已配置 environment mapping
- 人工确认过的短 TTL intent
- adapter 中声明的命令风险规则

MVP 不依赖“用户习惯学习”自动选择生产凭证，也不把 branch name、历史行为、provider 默认账号作为高风险命令的授权依据。

### 3.3 安全边界清晰

MVP 的主要目标是减少误泄露、误切账号、误操作 production，以及防止密钥出现在普通 MCP 返回值、审计日志和项目文件中。

MVP 不承诺抵御一个可以执行任意本地命令的恶意 Agent。如果 Agent 能任意控制带密钥的子进程，它仍可能尝试通过命令副作用、网络侧信道或恶意参数窃取凭证。高安全模式需要更严格的 command allowlist 和 MCP 代执行限制。

### 3.4 Fail closed

当 TokenValve 无法确定 profile、environment、命令风险或授权状态时，默认拒绝执行，并返回可操作的配置建议。

### 3.5 并发隔离优先

TokenValve 必须假设同一台机器上会同时运行多个 Agent、多个终端或多个 MCP session。

默认执行策略是 per-execution credential brokering：每次 CLI 命令、HTTP 请求、SSH 操作或脚本执行，都根据 workspace、session、provider metadata、命令参数、request metadata、SSH host 和 policy 独立解析 profile，并只把凭证注入当前执行上下文。

`gh auth switch`、`supabase login`、`vercel login` 这类全局账号切换不能作为默认路径。全局切换只能作为明确 opt-in 的兼容策略，并且必须有 provider 级互斥锁、短 TTL、审计日志和失败恢复。

## 4. 核心目标

### 4.1 用户体验目标

- 用户运行一次 `tokenvalve init`，完成主要项目、provider、profile、environment、风险策略和 shim/MCP 配置。
- 用户可以本地管理多套 LLM API key，并按 Agent、workspace 或命令选择默认 key。
- 用户可以通过轻量 dashboard 查看 provider/profile 状态、默认映射、active intent、最近审计和需要处理的问题。
- Agent 仍然执行普通命令、受控请求或 SSH 操作，例如 `gh repo view`、`supabase projects list`、`vercel deploy`、`curl https://api.supabase.com/...`、`ssh user@host` 或 `git push` over SSH。
- 多个 Agent 可同时调用 MCP 或 shim，并根据 init 阶段的映射各自选择正确账号，不互相污染全局 CLI 状态。
- staging、preview、development 等低风险环境可在配置明确时自动选择。
- production 写操作必须要求本地人工授权或短 TTL human intent。
- 未覆盖场景不自动猜测，但支持用户后续用增量命令添加 provider、profile、workspace binding 和策略。

### 4.2 安全目标

- 密钥只存本地安全存储。
- 默认不把明文密钥返回给 Agent 或 MCP client。
- 默认不把密钥写入项目目录。
- 默认不修改全局 CLI 登录状态。
- 临时注入只作用于当前子进程。
- 命令 stdout、stderr、错误、审计日志和 MCP 返回值统一脱敏。
- 所有带凭证执行和敏感决策都有本地审计日志。

## 5. 核心概念

### 5.1 Provider

服务类型，例如：

- `github`
- `supabase`
- `vercel`
- `openai`
- `custom`

### 5.2 Profile

某个 provider 下的一组身份或凭证。

示例：

- `github:work`
- `github:personal`
- `supabase:thindo:staging`
- `supabase:thindo:production`
- `vercel:team-a`

Profile id 统一使用 `<provider>:<name>` 或 `<provider>:<project>:<environment>` 格式。CLI 示例和配置文件必须使用同一套格式。

### 5.2.1 LLM Key Profile

LLM key profile 是面向模型 provider 的特殊 profile，用于管理多套 AI API key。

示例：

- `openai:personal`
- `openai:work`
- `anthropic:claude-code`
- `openrouter:backup`
- `internal-llm:production`

LLM key profile 可以绑定到 workspace、Agent client、命令或默认用途，例如 code generation、review、embedding、fallback。TokenValve 只向受控执行上下文注入对应 key，不应把 key 明文返回给 Agent。

### 5.2.2 Capability

某个 provider 下需要凭证的可执行能力。

示例：

- `cli-command`：`gh repo view`、`supabase projects list`
- `http-request`：GitHub REST API、Supabase Management API、Stripe API
- `curl-template`：受控 `curl` 请求模板
- `ssh-command`：`ssh user@host`、`scp`、`rsync -e ssh`
- `git-ssh`：`git push` / `git fetch` over SSH
- `script-command`：用户显式配置的本地脚本或内部工具

Capability 与 provider/profile/environment/risk 一起参与解析。TokenValve 不应把所有能力都等同于 CLI 命令。

### 5.3 Environment

环境层级，主要用于风险策略：

- `production`
- `staging`
- `preview`
- `development`
- `unknown`

`unknown` 不能用于自动通过高风险写操作。

### 5.4 Workspace

一个本地项目根目录。TokenValve 必须对 workspace path 做 canonicalize，处理相对路径、symlink、子目录执行、git worktree 和嵌套 repo。

### 5.5 Workspace Binding

当前 workspace 到 provider/profile/environment 的绑定关系。

示例：

```yaml
workspace: /Users/xing/VScode_workspace/Thindo
providers:
  github:
    defaultProfile: github:work
    remotes:
      - host: github.com
        owner: Bonday-Tech
        profile: github:work
  supabase:
    defaultEnvironment: staging
    environments:
      staging:
        profile: supabase:thindo:staging
        projectRef: thindo-stg-ref
      production:
        profile: supabase:thindo:production
        projectRef: thindo-prod-ref
        writes: requireHumanIntent
  vercel:
    defaultEnvironment: preview
    environments:
      preview:
        profile: vercel:team-a
      production:
        profile: vercel:team-a
        writes: requireHumanIntent
```

### 5.6 Scenario Pack

`init` 阶段生成的一组配置模板，用于覆盖用户明确选择的使用场景。

示例：

- 单项目 GitHub 多账号
- Supabase staging/production 分离
- Vercel preview/production 分离
- Agent 只读 GitHub 查询
- 自定义 provider 环境变量、HTTP header、请求模板或 SSH credential 注入
- LLM API key 管理与切换

Scenario Pack 不是动态智能推断，而是初始化时把用户需求转成具体 binding、policy、adapter 和验收矩阵。

### 5.6.1 Recipe / Playbook

Recipe 是一次新增或修复密钥流程沉淀下来的可验证配置方案。它不是 Agent 的聊天记忆，而是 TokenValve 保存的结构化结果，用于让下次相同场景可以可靠自动执行。

Recipe 至少包含：

- provider、profile、capability 和 workspace binding。
- 需要哪些 secret field，以及这些 field 如何注入 env、HTTP header、SSH context 或 LLM provider profile。
- 风险规则和 human intent 策略。
- 验证命令或验证请求，例如 `gh api user`、`gh repo view owner/repo`、Supabase Management API 只读请求。
- 最近一次验证时间、验证结果和脱敏后的诊断信息。

Recipe 只能保存配置、测试和脱敏元数据，不能保存明文 secret。

### 5.6.2 Skill Orchestration

Skill 是面向 Agent 的工作流编排层。它负责把用户的自然语言需求转成 TokenValve 的结构化操作，例如“新增一个 GitHub key 给当前项目提交代码”或“配置 Supabase production key，但写操作必须确认”。

Skill 可以：

- 识别 provider 类型、用途、capability 和风险级别。
- 引导用户选择 profile 命名、workspace 绑定、默认用途和 production 策略。
- 调用 MCP 创建 profile、打开本地输入界面、执行验证、保存 Recipe。
- 在验证失败时给出下一步修复建议。

Skill 不可以：

- 接收、保存、打印或转发明文 secret。
- 绕过 MCP/Core 的 policy、redaction、audit 和 human intent。
- 把未经验证的猜测沉淀为自动执行配置。

### 5.7 Active Intent

短 TTL 的临时授权，允许某个 workspace 在指定时间内使用某个 profile 或执行某类风险操作。

MVP 中 active intent 必须来自 human intent。

示例：

```bash
tokenvalve use supabase:thindo:production --workspace . --ttl 10m --allow write
```

含义：当前 workspace 在 10 分钟内允许对 `supabase:thindo:production` 执行已配置范围内的写操作。

### 5.8 Human Intent 与 Agent Request

Human intent 是用户在本地 TTY、系统确认框、Touch ID 或客户端人工 approval 中确认的授权。

Agent request 是 Agent 通过 MCP 提出的授权请求。Agent request 不能直接激活 production 写权限，只能创建待确认请求或返回需要用户执行的本地命令。

### 5.9 Agent Session

Agent session 表示一次 Agent 运行上下文，例如 Codex、Claude Code、Pi Agent 或其他 MCP client 的一个会话。

TokenValve 不应依赖机器上唯一的“当前账号”。Resolver 必须能在同一时间处理多个 session 的请求，并基于 session、cwd、workspace binding、git remote、命令参数和 policy 做独立决策。

同一 provider 的两个 session 如果解析到不同 profile，默认应通过子进程 env 注入、HTTP header 注入、SSH credential 选择或隔离配置目录并行执行，而不是互相切换全局账号。

## 6. 产品形态

TokenValve 包含六部分：

### 6.1 Init Wizard

`tokenvalve init` 是首要入口，用于一次性采集用户主要使用场景并生成针对性配置。

它应该完成：

- 检测操作系统、shell、PATH、已安装 CLI、MCP client。
- 检测当前 workspace、git remote、常见 provider 配置文件。
- 询问用户要覆盖哪些 provider 和场景。
- 询问是否要管理 LLM API key，以及每套 key 对应的 Agent/client/workspace 默认用途。
- 交互式添加 profile 和 token。
- 建立 workspace binding 和 environment mapping。
- 配置 production 写操作策略。
- 安装 shim。
- 输出 dry-run 矩阵，展示常见命令会使用哪个 profile、哪些命令会被拒绝。

### 6.1.1 Dashboard / TUI

MVP 需要一个轻量可视化入口，用于查看和切换本地密钥状态。可以先做 TUI 或 rich CLI dashboard。

它至少展示：

- provider/profile 列表和脱敏状态。
- LLM key profiles 及其默认绑定。
- 当前 workspace binding。
- active intent 和 TTL。
- 最近审计日志。
- doctor 发现的问题。

Dashboard 不显示明文 secret，不负责团队共享，也不需要云端登录。

### 6.2 CLI

用户直接管理密钥、profile、绑定、策略、授权和审计。

示例命令：

```bash
tokenvalve init
tokenvalve init --add-provider supabase --workspace .
tokenvalve secret add github:work
tokenvalve secret add supabase:thindo:staging
tokenvalve secret add supabase:thindo:production
tokenvalve secret add openai:work
tokenvalve llm use openai:work --workspace .
tokenvalve dashboard
tokenvalve bind github:work --workspace .
tokenvalve bind supabase:thindo:staging --workspace . --environment staging
tokenvalve use supabase:thindo:production --workspace . --ttl 10m --allow write
tokenvalve resolve -- supabase db push
tokenvalve audit list
```

### 6.3 MCP Server

供 Claude Code、Codex 等 Agent 调用。

MCP 是安全能力边界，不做开放式推理。它不默认返回明文密钥，也不允许 Agent 直接激活 production 写权限。MCP 提供：

- 解析当前 workspace 应该使用哪个 profile。
- 创建、更新、测试和查询脱敏 secret profile metadata。
- 保存或读取已验证 Recipe。
- 创建需要人工确认的授权请求。
- 查询可用 provider/profile 脱敏元数据。
- 在受限策略下执行带密钥的本地命令。
- 打开本地 UI，让用户输入或编辑密钥。
- 撤销临时授权。
- 查看脱敏审计记录。

### 6.3.1 Skill / Agent 编排层

Skill 负责把自然语言需求编排成可验证的 TokenValve 配置流程。它可以问问题、调用 MCP、打开 UI、触发测试、总结验证结果，并把成功方案沉淀为 Recipe。

典型流程：

```text
用户：给这个项目新增一个 GitHub key，用 ThindoLab 账号提交代码
Skill：识别 provider=github、capability=cli-command/git、risk=write
Skill -> MCP：创建脱敏 profile 草案
Skill -> MCP：打开本地密钥输入 UI
用户：在本地 UI 输入 token
MCP/Core：写入 Keychain，执行验证命令
Skill -> MCP：保存通过验证的 Recipe 和 workspace binding
下次 Agent：直接按 Recipe 解析并执行；高风险操作仍走 human intent
```

Skill 的价值是“引导配置、知道如何测试、沉淀可复用方案”。MCP 的价值是“安全执行结构化操作”。两者边界必须清楚。

### 6.3.2 Local Web UI

正式产品形态应支持本地 Web UI。用户可以说“打开密钥管理器”，Agent 通过 MCP 调用 `ui_open`，TokenValve 在 `127.0.0.1` 启动短生命周期本地页面，用于查看、编辑、输入和验证密钥。

Local Web UI 适合：

- 新增或编辑 secret profile。
- 查看 provider/profile/LLM key、workspace binding、active intent、audit 和 doctor 状态。
- 运行 init 或 add-secret 向导。
- 展示某次执行为什么被允许或拒绝。

MVP 可先使用 TUI / rich CLI dashboard；完整 Web UI 作为后续正式形态，不做云端账号系统，不默认监听局域网，不显示明文 secret。

### 6.4 Shim

放在 PATH 前面的轻量命令中转器。

示例路径：

```text
~/.tokenvalve/bin/gh
~/.tokenvalve/bin/supabase
~/.tokenvalve/bin/vercel
```

当 Agent 执行：

```bash
gh repo list
```

实际流程：

```text
Agent -> ~/.tokenvalve/bin/gh -> TokenValve resolve -> 临时注入凭证 -> real gh
```

shim 必须避免递归调用自己。真实 binary 查找应移除 `~/.tokenvalve/bin` 后再解析 PATH，或在 init 阶段记录真实 binary path。

## 7. Init 阶段需求

### 7.1 Init 的产品目标

`tokenvalve init` 要把用户的主要使用场景一次性配置好，使后续大部分常见命令无需反复询问。

它不是简单创建空目录，而是一个场景化配置向导。

### 7.2 Init 询问内容

MVP 需要至少询问：

- 当前是否为要配置的 workspace。
- 要接管哪些 CLI：`gh`、`supabase`、`vercel`、custom。
- 用户是否有多账号、多团队或多环境。
- 是否存在 production 环境。
- 哪些命令允许自动执行，哪些命令必须人工确认。
- 是否启用 MCP server。
- 是否安装 PATH shim。
- 是否为当前 workspace 生成 dry-run 验收矩阵。

### 7.3 Init 自动检测

MVP 可以检测但不能静默信任：

- `git remote -v` 中的 GitHub owner/repo。
- `supabase/config.toml` 或本地 Supabase project ref。
- `.vercel/project.json` 中的 org/project id。
- 当前 shell 和 PATH。
- 已安装的真实 CLI binary path。

检测结果必须展示给用户确认后才写入配置。

### 7.4 Init 输出文件

MVP 创建：

```text
~/.tokenvalve/
  config.yaml
  profiles.yaml
  bindings.yaml
  policies.yaml
  audit.log
  runtime/
  bin/
    gh
    supabase
    vercel
```

密钥不写入这些 YAML 文件，只写入系统安全存储。YAML 中只保存 profile id、provider、environment、project id、policy 和脱敏元数据。

### 7.5 Init Dry-run 矩阵

初始化结束前必须展示类似结果：

```text
Workspace: /Users/xing/VScode_workspace/Thindo

Command                         Profile                         Result
gh repo view                    github:work                     allow
supabase projects list          supabase:thindo:staging         allow
supabase db push                supabase:thindo:staging         allow
supabase db push --prod         supabase:thindo:production      blocked: human intent required
vercel deploy                   vercel:team-a                   allow as preview
vercel deploy --prod            vercel:team-a                   blocked: human intent required
```

### 7.6 增量配置

不在 init 覆盖范围内的场景默认不处理。用户后续可以增量添加：

```bash
tokenvalve init --add-provider vercel --workspace .
tokenvalve config add-workspace /path/to/project
tokenvalve config add-environment supabase:thindo:production --workspace .
tokenvalve config add-risk-rule supabase -- db push
tokenvalve secret add custom:stripe:production
tokenvalve doctor --workspace .
```

当 Agent 触发未覆盖场景时，TokenValve 应返回拒绝原因和建议命令，而不是自行猜测。

## 8. 核心流程

### 8.1 初始化配置流程

```text
1. 用户运行 tokenvalve init
2. TokenValve 检测当前 workspace、git remote、已安装 CLI 和本地 provider 配置
3. 用户选择要覆盖的场景和 provider
4. 用户交互式添加 profile/token
5. TokenValve 写入安全存储和脱敏配置
6. 用户确认 workspace binding、environment mapping 和 production 策略
7. TokenValve 安装 shim 和可选 MCP server 配置
8. TokenValve 输出 dry-run 矩阵
9. 用户确认后启用
```

### 8.2 普通 GitHub 命令

```text
1. Agent 执行 gh repo view
2. PATH 命中 ~/.tokenvalve/bin/gh
3. shim 读取当前 cwd 并解析 workspace
4. TokenValve 根据 workspace binding 和 git remote 选择 github profile
5. shim 从本地密钥库取出 token
6. shim 设置 GitHub adapter 声明的环境变量，仅对子进程有效
7. shim exec 真实 gh，不经过 shell
8. stdout/stderr 流式脱敏后返回
9. 记录本地审计日志
```

### 8.3 Supabase staging 自动选择

```text
1. Agent 在 Thindo 项目下执行 supabase projects list
2. TokenValve 识别 workspace = Thindo
3. workspace binding 指向 supabase:thindo:staging
4. 命令风险为 read 或 low
5. 临时注入 SUPABASE_ACCESS_TOKEN
6. 执行真实 supabase CLI
```

### 8.4 Supabase production 写操作保护

```text
1. Agent 执行 supabase db push
2. TokenValve 识别这是写操作
3. TokenValve 根据 workspace/environment mapping 判断目标是否 production
4. 如果目标是 production，检查是否存在未过期 human intent
5. 没有 human intent，则拒绝执行并提示 tokenvalve use ...
6. 有 human intent，则临时注入 production 凭证并执行
```

### 8.5 MCP 请求 production 授权

```text
1. Agent 调用 MCP intent_request，请求 production 写操作
2. TokenValve 返回 pending confirmation，不激活凭证
3. 用户在本地 TTY 或客户端 approval 中确认
4. TokenValve 创建 scoped human intent
5. Agent 再次执行命令时通过授权检查
```

### 8.6 未覆盖场景

```text
1. Agent 执行 cloudflare deploy
2. TokenValve 未找到 cloudflare provider adapter 或 workspace binding
3. TokenValve 拒绝执行
4. 返回建议：tokenvalve init --add-provider custom --workspace .
```

## 9. Profile 选择与风险决策

### 9.1 MVP 选择优先级

```text
1. 当前命令显式指定的 profile，且来源为本地 CLI/TTY，并通过策略校验
2. 未过期 human intent，且 scope 匹配 workspace/provider/profile/risk
3. 当前 workspace 的显式 binding
4. 已确认 provider metadata，例如 GitHub owner、Supabase projectRef、Vercel projectId
5. init 阶段确认过的 environment mapping
```

以下内容在 MVP 中只能作为提示，不能独立决定 production 写操作：

- git branch 名称
- 命令语义推测
- 用户历史习惯
- provider 默认账号
- 未确认的本地配置文件

### 9.2 决策结果

Resolver 必须返回结构化结果：

```json
{
  "provider": "supabase",
  "profile": "supabase:thindo:production",
  "environment": "production",
  "capability": "cli-command",
  "risk": "write",
  "decision": "blocked",
  "reason": "human_intent_required",
  "suggestedCommand": "tokenvalve use supabase:thindo:production --workspace . --ttl 10m --allow write"
}
```

### 9.3 Fail closed 规则

必须拒绝执行的情况：

- workspace 未配置。
- provider 未配置。
- 多个 profile 匹配但无法消歧。
- 写操作目标 environment 为 `unknown`。
- production 写操作没有 human intent。
- 命令被 adapter 标记为 dangerous，且 policy 未授权。
- 真实 CLI binary 无法可靠定位。

## 10. Environment 解析

### 10.1 通用规则

Environment 解析必须尽量来自用户确认过的配置，而不是运行时猜测。

优先级：

```text
1. 命令参数中明确指定的环境，例如 --prod
2. workspace binding 中配置的 environment mapping
3. provider 项目 id 与 environment 的映射
4. init 阶段用户确认过的本地配置文件信息
5. unknown
```

当写操作目标为 `unknown` 时，MVP 必须拒绝执行。

### 10.2 GitHub

GitHub 的主要风险不是 staging/production，而是账号、组织和危险操作。

MVP 通过以下信息选择 profile：

- workspace binding
- git remote owner/repo
- init 阶段确认的 owner 到 profile 映射

危险操作例如 `repo delete`、`secret set`、`api` 写请求，需要 adapter 风险规则和 policy 校验。

### 10.3 Supabase

Supabase environment 必须来自：

- workspace binding 中的 environment mapping
- projectRef 到 environment 的显式映射
- init 阶段用户确认过的 `supabase/config.toml` 信息

如果 `supabase db push`、`db reset`、`migration up` 等写操作无法确定目标 projectRef/environment，必须拒绝。

### 10.4 Vercel

Vercel environment 规则：

- `vercel deploy --prod` 视为 production。
- `vercel deploy` 默认视为 preview，前提是 workspace binding 已配置。
- org id 和 project id 必须来自 binding 或 init 阶段确认过的 `.vercel/project.json`。
- production deploy 必须要求 human intent。

## 11. 安全策略

### 11.1 威胁模型

MVP 防护目标：

- 防止 Agent 直接从 MCP tool 返回值拿到明文密钥。
- 防止密钥写入项目目录。
- 防止错误账号或错误环境被自动选择。
- 防止 production 高风险写操作无人工确认执行。
- 防止普通 stdout/stderr、错误和审计日志泄露已知密钥。

MVP 不保证：

- 防止恶意 Agent 通过任意命令窃取环境变量。
- 防止带凭证 CLI 自身存在漏洞或恶意插件。
- 防止本机已被入侵后的密钥读取。
- 防止所有网络侧信道。

### 11.2 密钥存储

MVP：

- macOS：Keychain。

后续支持：

- Linux Secret Service。
- Windows Credential Manager。
- 1Password CLI adapter。
- Bitwarden CLI adapter。
- 本地加密 SQLite。

本地加密 SQLite 不作为 MVP 默认方案，除非密钥加密根密钥有清晰来源，例如 OS keyring 或用户主密码。

### 11.3 明文密钥原则

- 默认不通过 MCP 返回明文密钥。
- 默认不把密钥写入项目目录。
- 默认不持久写入 shell profile。
- 仅在子进程环境变量中短暂出现。
- 审计日志只记录 profile id、provider、risk、decision 和脱敏元数据。

### 11.4 Human Intent

Production 写操作必须使用 human intent。

human intent 必须包含：

```yaml
workspace: /Users/xing/VScode_workspace/Thindo
provider: supabase
profile: supabase:thindo:production
environment: production
allowedRisk: write
expiresAt: 2026-07-05T12:10:00+08:00
source: local_tty
```

MCP 不能直接创建已生效的 production human intent，只能创建待确认请求。

### 11.5 子进程与真实 CLI 副作用

TokenValve 必须避免使用 shell string 执行命令。所有执行使用 binary path + args array。

adapter 需要声明：

- 真实 CLI 查找方式。
- 要注入的 env。
- 是否需要隔离配置目录，例如 `GH_CONFIG_DIR`、`XDG_CONFIG_HOME`。
- 哪些命令可能写入项目目录或全局 CLI 配置。
- 哪些命令必须拒绝或要求额外确认。

MVP 默认不调用 `gh auth switch`、`supabase login`、`vercel login` 这类全局登录状态变更命令。

### 11.5.1 HTTP / Curl 请求

TokenValve 也需要支持受控 HTTP 请求场景，例如 Agent 通过 MCP 请求调用 Supabase Management API，或执行一个配置过的 `curl` 请求模板。

要求：

- HTTP 请求必须结构化表示 method、url、headers、body，不能拼接 shell string。
- secret 可以注入为 `Authorization` header、query 参数、body 字段或 adapter 声明的其他位置。
- 审计日志默认只记录 method、host、path、provider、profile、environment、risk、decision，不记录原始 header/body。
- production 写请求必须和 CLI 写操作一样走 human intent。
- 未配置 riskRules 的 HTTP capability 必须 fail closed。

### 11.5.2 SSH / Git over SSH 执行

TokenValve 需要支持受控 SSH 场景，例如 `ssh user@host`、`scp`、`rsync -e ssh`、`git push` over SSH 或内部部署脚本。

要求：

- SSH capability 必须结构化声明 host、user、port、operation 和允许的命令形态。
- secret 可以映射为 identity file、临时 key file、`SSH_AUTH_SOCK`、`GIT_SSH_COMMAND` 或 adapter 声明的其他 SSH credential context。
- 默认不修改用户全局 `~/.ssh/config`、known_hosts 或 ssh-agent 状态。
- known_hosts 策略必须显式配置，不能静默关闭 host key checking。
- 审计日志不得记录私钥内容、完整私钥路径、agent socket 细节或未脱敏 remote URL。
- production SSH 操作或部署操作必须和 CLI 写操作一样走 human intent。
- 未配置 riskRules 的 SSH capability 必须 fail closed。

### 11.6 输出脱敏

Redactor 必须统一应用于：

- stdout
- stderr
- thrown error
- MCP tool result
- audit log
- debug log

脱敏对象：

- 已知 token 完整值。
- 已知 token 的常见编码变体。
- token 前后缀特征。
- 常见格式，例如 `ghp_`、`github_pat_`、`sbp_`、`sk-`、`vercel_`。
- 命令参数中被标记为 secret 的字段。

如果输出无法可靠脱敏，MVP 可以截断输出并提示用户本地查看原始命令结果，但不能把疑似 secret 原样返回给 MCP client。

### 11.7 审计日志

审计日志字段：

```json
{
  "timestamp": "2026-07-05T12:00:00+08:00",
  "workspace": "/Users/xing/VScode_workspace/Thindo",
  "provider": "supabase",
  "profile": "supabase:thindo:production",
  "environment": "production",
  "command": "supabase",
  "argsRedacted": ["db", "push"],
  "risk": "write",
  "decision": "blocked",
  "reason": "human_intent_required",
  "source": "shim",
  "exitCode": null
}
```

审计日志需要文件权限限制、轮转策略和 `tokenvalve audit list --redacted` 默认展示。

### 11.8 危险命令识别

provider adapter 定义写操作和危险操作。

示例：

```yaml
supabase:
  riskyCommands:
    - match: ["db", "push"]
      risk: write
    - match: ["db", "reset"]
      risk: dangerous
    - match: ["migration", "up"]
      risk: write
    - match: ["secrets", "set"]
      risk: secret_write
vercel:
  riskyCommands:
    - match: ["deploy", "--prod"]
      risk: production_deploy
github:
  riskyCommands:
    - match: ["repo", "delete"]
      risk: dangerous
    - match: ["secret", "set"]
      risk: secret_write
```

风险规则必须支持参数顺序、flag 组合和 provider-specific 子命令解析，不能只做简单字符串包含。

## 12. MCP Tools MVP

### 12.1 `profiles_list`

列出本地可用 profile 的脱敏元数据。

返回示例：

```json
{
  "profiles": [
    {"id": "github:work", "provider": "github"},
    {"id": "supabase:thindo:staging", "provider": "supabase", "environment": "staging"}
  ]
}
```

### 12.2 `context_resolve`

根据 workspace、command、args 解析将使用哪个 profile 和执行决策。

输入：

```json
{
  "cwd": "/Users/xing/VScode_workspace/Thindo",
  "command": "supabase",
  "args": ["db", "push"]
}
```

输出：

```json
{
  "provider": "supabase",
  "profile": "supabase:thindo:staging",
  "environment": "staging",
  "risk": "write",
  "decision": "allow"
}
```

### 12.3 `intent_request`

Agent 请求用户授权，但不直接生效。

输入：

```json
{
  "profile": "supabase:thindo:production",
  "cwd": "/Users/xing/VScode_workspace/Thindo",
  "ttlSeconds": 600,
  "allow": "write",
  "reason": "Run production migration requested by user"
}
```

输出：

```json
{
  "status": "needs_human_confirmation",
  "suggestedCommand": "tokenvalve use supabase:thindo:production --workspace /Users/xing/VScode_workspace/Thindo --ttl 10m --allow write"
}
```

### 12.4 `exec_with_secrets`

由 MCP 代执行命令。适合最高安全模式，Agent 不直接调用 CLI。

约束：

- 只能执行已注册 provider adapter 的 command。
- command 和 args 必须结构化传入，不能是 shell string。
- cwd 必须在已配置 workspace 内。
- 必须有 timeout、输出大小限制和进程清理。
- production 写操作仍然需要 human intent。
- 输出必须脱敏。

输入：

```json
{
  "cwd": "/Users/xing/VScode_workspace/Thindo",
  "command": "gh",
  "args": ["repo", "view"]
}
```

### 12.5 `http_request_with_secrets`

由 MCP 发起受控 HTTP 请求。适合 Supabase、GitHub、Stripe、Cloudflare 或内部 API。

约束：

- 只能调用已注册 provider adapter 的 HTTP capability。
- request 必须结构化传入，不能传 shell string 或完整未解析 curl 命令。
- URL host/path 必须匹配 adapter allowlist 或配置过的 template。
- production 写请求仍然需要 human intent。
- headers/body/query 中的 secret 必须脱敏后再进入日志和 MCP 返回值。

输入：

```json
{
  "cwd": "/Users/xing/VScode_workspace/Thindo",
  "provider": "supabase",
  "capability": "management-api",
  "request": {
    "method": "GET",
    "url": "https://api.supabase.com/v1/projects"
  }
}
```

### 12.6 `ssh_with_secrets`

由 MCP 发起受控 SSH 或 git over SSH 执行。

约束：

- 只能调用已注册 provider adapter 的 SSH capability。
- host、user、port、operation 必须结构化传入，不能传完整 shell string。
- SSH host 必须匹配 adapter allowlist 或配置过的 template。
- production SSH 写操作或部署操作仍然需要 human intent。
- 私钥路径、agent socket、remote URL 和命令输出必须脱敏。

输入：

```json
{
  "cwd": "/Users/xing/VScode_workspace/Thindo",
  "provider": "github",
  "capability": "git-ssh",
  "operation": {
    "type": "git-push",
    "remote": "git@github.com:Bonday-Tech/thindo.git",
    "branch": "main"
  }
}
```

### 12.7 `revoke`

撤销当前 workspace、provider、profile 或 session 的临时授权。

### 12.8 `audit_list`

查看本地审计日志，默认脱敏。

### 12.9 `secret_profile_create`

创建 secret profile 草案或写入已通过本地输入的密钥。

约束：

- MCP 不接收明文 secret 参数。
- 如果需要输入 secret，必须返回 `needs_local_input` 或调用 `ui_open`。
- profile 创建后默认处于 `unverified` 状态，不能直接用于高风险自动执行。

### 12.10 `secret_profile_test`

执行 adapter 或 Recipe 声明的验证步骤。

约束：

- 测试命令或请求必须来自 adapter/Recipe allowlist。
- 测试输出必须脱敏。
- 测试通过后才能把 profile 标记为 `verified`。

### 12.11 `recipe_save`

保存一次经过验证的配置方案。

保存内容包括 provider、profile、capability、workspace binding、risk rules、验证步骤和脱敏验证结果，不包括明文 secret。

### 12.12 `recipe_list`

列出可复用 Recipe，供 Skill 判断是否已有可靠方案可以直接执行。

### 12.13 `ui_open`

打开本地 UI 或 dashboard。

输入示例：

```json
{
  "view": "add-secret",
  "providerHint": "github",
  "workspace": "/Users/xing/VScode_workspace/token-valve"
}
```

约束：

- UI 只监听 loopback。
- UI session 必须短 TTL。
- UI 只能把 secret 写入 Core 管理的本地 secret store，不能把明文返回给 MCP client 或 Skill。

## 13. CLI MVP

### 13.1 初始化

```bash
tokenvalve init
```

支持参数：

```bash
tokenvalve init --workspace .
tokenvalve init --add-provider supabase --workspace .
tokenvalve init --mcp
tokenvalve init --no-shim
```

### 13.2 添加密钥

```bash
tokenvalve secret add github:work
tokenvalve secret add supabase:thindo:staging
tokenvalve secret add supabase:thindo:production
tokenvalve secret test github:work
```

交互式输入密钥，写入系统钥匙串。新增密钥默认需要测试，测试通过后才能成为 verified profile。

### 13.3 绑定项目

```bash
tokenvalve bind github:work --workspace .
tokenvalve bind supabase:thindo:staging --workspace . --environment staging
tokenvalve bind supabase:thindo:production --workspace . --environment production --writes require-human-intent
```

### 13.4 临时授权

```bash
tokenvalve use supabase:thindo:production --workspace . --ttl 10m --allow write
```

该命令必须在本地交互环境中运行。MCP 不能绕过人工确认直接创建 production 写授权。

### 13.5 预览解析结果

```bash
tokenvalve resolve -- gh repo view
tokenvalve resolve -- supabase db push
tokenvalve resolve -- vercel deploy --prod
```

### 13.6 执行命令

```bash
tokenvalve exec -- gh repo view
tokenvalve exec -- supabase projects list
```

### 13.7 诊断

```bash
tokenvalve doctor
tokenvalve doctor --workspace .
tokenvalve audit list
tokenvalve revoke --workspace .
```

### 13.8 Recipe 管理

```bash
tokenvalve recipe list
tokenvalve recipe show github:thindolab-token-valve
tokenvalve recipe test github:thindolab-token-valve
```

Recipe 命令用于查看、复测和调试已沉淀的配置方案。Recipe 不包含明文 secret。

## 14. Provider Adapter MVP

### 14.1 Adapter schema

每个 adapter 至少声明：

```yaml
provider: supabase
capabilities:
  - id: supabase-cli
    type: cli-command
    commands:
      - supabase
  - id: management-api
    type: http-request
    allowedHosts:
      - api.supabase.com
  - id: deploy-ssh
    type: ssh-command
    allowedHosts:
      - deploy.thindo.internal
env:
  SUPABASE_ACCESS_TOKEN: token
headers:
  Authorization: "Bearer {{token}}"
ssh:
  identityFile: deploy_key
  knownHostsPolicy: strict
projectResolvers:
  - type: configFile
    path: supabase/config.toml
riskRules:
  - match: ["db", "push"]
    risk: write
  - match:
      capability: management-api
      method: POST
      pathPrefix: /v1/projects
    risk: write
sideEffects:
  writesProjectFiles:
    - ["link"]
  writesGlobalAuth:
    - ["login"]
```

### 14.2 GitHub

环境变量：

```text
GH_TOKEN
GITHUB_TOKEN
```

真实 CLI：

```text
gh
```

可选隔离：

```text
GH_CONFIG_DIR
```

MVP 验证重点：

- 不调用 `gh auth switch`。
- 不把 token 写入项目目录。
- 根据 workspace binding 或 remote owner 选择 profile。

### 14.3 Supabase

环境变量：

```text
SUPABASE_ACCESS_TOKEN
```

后续可支持：

```text
SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_REF
```

MVP 验证重点：

- staging profile 可自动执行低风险命令。
- production 写操作必须 human intent。
- 未知 projectRef 的写操作拒绝执行。

### 14.4 Vercel

环境变量：

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

MVP 验证重点：

- `vercel deploy` 默认 preview。
- `vercel deploy --prod` 必须 human intent。
- org/project id 来自已确认 binding。

### 14.5 Generic

允许用户自定义 env、HTTP header 和请求模板映射。

示例：

```yaml
custom:
  openai:
    env:
      OPENAI_API_KEY: api_key
    headers:
      Authorization: "Bearer {{api_key}}"
    capabilities:
      - id: responses-api
        type: http-request
        allowedHosts:
          - api.openai.com
```

Generic provider 默认不允许执行 production 写操作，除非用户显式配置 riskRules 和 policy。

### 14.6 LLM Providers

MVP 需要把 LLM API key 当作一等 provider 管理。

内置 LLM provider：

- `openai`
- `anthropic`
- `gemini`
- `openrouter`
- `custom-llm`

能力：

- 添加、更新、删除、列出 LLM key profile。
- 为 workspace / Agent client / capability 设置默认 LLM key。
- 为受控执行注入 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GOOGLE_API_KEY` 或自定义 env/header。
- 查看脱敏状态、默认绑定和最近使用记录。

非目标：

- 不在 MVP 中代理完整模型请求流量，除非该请求被定义为受控 HTTP capability。
- 不把 LLM key 明文返回给 Agent。

## 15. 后续能力

MVP 先不做自动学习，只保留数据结构。

后续可以支持：

- 记录 workspace + command + selected profile。
- 统计最近 N 次选择。
- 仅对 staging/development 等低风险环境启用习惯建议。
- production 只允许习惯提供建议，不能直接授权写操作。
- GUI 确认窗口。
- 团队策略模板。

## 16. 非目标

MVP 不做：

- 云端同步密钥。
- 团队共享密钥。
- 完整 Web 控制台。
- 自动读取所有 `.env` 并导入。
- 在 MCP 中直接返回明文 secret。
- 无确认执行 production 高危写操作。
- 自动覆盖未在 init 或增量配置中声明的 provider/场景。
- 抵御可执行任意本地命令的恶意 Agent。

## 17. MVP 验收标准

### 17.1 Init

- `tokenvalve init` 可以识别当前 workspace、已安装的 `gh`/`supabase`/`vercel` 和 git remote。
- init 会询问用户选择 provider、profile、environment、LLM key profile 和 production 策略。
- init 完成后输出 dry-run 矩阵。
- init 不把密钥写入 YAML 或项目目录。
- 未选择的 provider 不自动接管。

### 17.2 GitHub

- 可以添加 `github:work` 和 `github:personal`。
- 可以为不同 repo 绑定不同 GitHub profile。
- Agent 执行 `gh repo view` 时自动使用当前 repo 绑定 profile。
- 不调用 `gh auth switch`。
- `gh repo delete` 等危险命令按 policy 拦截或要求确认。

### 17.3 Supabase

- 可以添加 `supabase:thindo:staging` 和 `supabase:thindo:production`。
- Thindo 项目默认使用 staging。
- `supabase projects list` 可直接执行。
- `supabase db push` 如果目标 production 且没有 human intent，应拒绝。
- `tokenvalve use supabase:thindo:production --ttl 10m --allow write` 后允许已配置范围内的 production 写操作。
- 写操作目标 environment 为 `unknown` 时拒绝执行。

### 17.4 Vercel

- 可以添加 `vercel:team-a`。
- 可以为 workspace 注入 `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`。
- `vercel deploy` 默认按 preview 处理。
- `vercel deploy --prod` 需要 human intent 或策略确认。

### 17.5 MCP

- `profiles_list` 不返回明文密钥。
- `context_resolve` 返回 profile、environment、risk、decision 和 reason。
- `intent_request` 不能直接激活 production 写权限。
- `exec_with_secrets` 只能执行 adapter 注册命令，且不接受 shell string。
- `http_request_with_secrets` 只能调用 adapter 注册的 HTTP capability，且必须脱敏 headers/body/query。
- `ssh_with_secrets` 只能调用 adapter 注册的 SSH capability，且必须脱敏 identity、agent socket、remote URL 和输出。

### 17.6 安全

- 密钥不出现在 MCP tool 返回值中。
- stdout、stderr、错误和审计日志脱敏。
- 子进程结束后，父进程环境不保留密钥。
- 项目目录不生成含密钥文件。
- 未配置 workspace/provider/profile 的命令 fail closed。

### 17.7 增量配置

- 未覆盖 provider 命令被拒绝，并返回建议配置命令。
- 用户可以通过 `tokenvalve init --add-provider ...` 增量添加 provider。
- 用户可以通过 `tokenvalve bind ...` 增量添加 workspace/environment binding。
- 增量配置后 dry-run 矩阵更新。

### 17.8 LLM Key 管理与可视化

- 可以添加至少两套 LLM API key profile，例如 `openai:personal` 和 `openai:work`。
- 可以为 workspace 设置默认 LLM key profile。
- Agent 通过 MCP 请求 LLM key metadata 时只能看到脱敏信息。
- `tokenvalve dashboard` 可以展示 provider/profile、LLM key 绑定、active intent、最近审计和 doctor 状态。
- dashboard 不显示明文 secret。

### 17.9 Skill 与 Recipe

- 用户说“新增一个 GitHub/Supabase/LLM key”时，内置 Skill 可以引导完成 provider 类型、profile 命名、workspace 绑定、capability、风险策略和验证方式选择。
- Skill 不要求用户把明文 secret 粘贴进 Agent 对话。
- `secret_profile_create` 不接受明文 secret 参数，只能创建草案或触发本地输入。
- `secret_profile_test` 可以执行 adapter/Recipe 声明的验证步骤，并返回脱敏结果。
- 验证通过后可以保存 Recipe；Recipe 不包含明文 secret。
- 未验证或验证失败的 Recipe 不能用于自动执行写操作。
- 下次相同 workspace/capability 请求可以基于已验证 Recipe 自动解析 profile；production 写操作仍需要 human intent。

## 18. 建议技术栈

推荐 TypeScript / Node.js：

- MCP server 生态成熟。
- CLI 和 shim 易实现。
- 跨平台分发方便。
- 可以用 `execa` 管理子进程。
- 可以用 `commander` 或 `clipanion` 做 CLI。

推荐目录结构：

```text
token-valve/
  packages/
    cli/
    mcp-server/
    core/
    shims/
  adapters/
    github.yaml
    supabase.yaml
    vercel.yaml
  docs/
    architecture.md
    threat-model.md
  PRD.md
```

## 19. 命名

产品名：

```text
TokenValve
```

英文定位：

```text
Local secret manager, credential broker, and execution gateway for AI agents.
```

中文定位：

```text
面向 AI Agent 的本地密钥管理、凭证中转与执行网关。
```
