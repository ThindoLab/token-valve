# 使命

TokenValve 的存在，是为了让 AI Agent、开发者 CLI、本地脚本、HTTP 请求和 SSH 操作在正确的时刻使用正确的本地密钥与凭证，而不把原始密钥交给 Agent、不污染全局认证状态，也不依赖项目目录里的 `.env` 文件。

它更像一个本地密钥管理器、凭证中转与执行网关，服务于同时跨多个账号、团队、provider、LLM key 和环境工作的开发者。开发者应该仍然可以执行普通命令、请求或 SSH 操作，例如 `gh repo view`、`supabase projects list`、`vercel deploy`、`curl https://api.supabase.com/...`、`ssh user@host`、`git push` over SSH 或内部脚本；TokenValve 则在本地解析当前 workspace、执行意图、目标环境和安全策略，只为这一次执行打开短暂的凭证通道。

## 服务对象

TokenValve 初期主要服务一个高频使用 AI 编程 Agent 的个人开发者，同时兼容 Codex、Claude Code、Pi Agent 以及类似的本地或半本地 Agent 环境。

这个用户通常同时拥有多组身份和环境：

- GitHub personal、work、client 账号。
- Supabase staging 和 production 项目，包括 Supabase CLI、REST API、Management API 和通过 `curl` 发出的请求。
- Vercel preview 和 production 部署。
- OpenAI、Anthropic、Gemini、OpenRouter、本地模型网关或内部 LLM 代理等多套 LLM API key。
- Stripe、Cloudflare、SSH host、git over SSH 或内部工具等额外 provider credential。

他们的问题不是“没有地方存密钥”，而是 LLM key、Agent、CLI、脚本、临时 HTTP 请求和 SSH 操作让错误账号、错误环境、日志泄露、项目内落盘、production 误操作变得太容易发生。

一个必须成立的核心场景是：两个正在运行的 Agent 都加载了同一个 MCP 或 skill，它们分别在不同 workspace 或任务上下文里工作，前后相差几分钟向两个不同 GitHub 账号提交代码。它们应该都能调用 TokenValve，基于 `tokenvalve init` 已确认的信息解析出对应 GitHub profile，并在不互相污染全局 CLI 状态的前提下完成命令执行。

另一个必须成立的核心场景是：用户让 Agent “新增一个密钥”。Agent 不应该临时猜一串命令，而应通过 TokenValve Skill 引导用户定位 provider 类型、用途、风险和验证方式；密钥输入发生在本地受控界面或 CLI；MCP/Core 负责写入 secret store、执行验证并保存 Recipe。下次相同 workspace 或 capability 再执行时，系统使用这个已验证 Recipe，而不是依赖聊天上下文。

## 价值主张

TokenValve 让凭证使用在初始化时显式，在日常工作中安静。

项目要做到：`tokenvalve init` 能一次性理解用户的真实工作场景，生成确定性的 workspace / provider / environment / LLM key 映射；后续低风险常用命令无需反复询问即可执行，而 production 写操作和危险命令仍然必须经过本地 human intent。

它也要让本地密钥状态变得可见、可选、可解释。用户应该能通过轻量 dashboard 或 rich CLI 看见本机有哪些 provider/profile/LLM key、当前 workspace 默认会选什么、最近哪些执行被允许或拒绝，以及哪里需要修复；但这个可视化入口绝不能显示明文 secret。

## 关键利益相关方

用户需要快速的 Agent 工作流，同时避免全局账号混乱、密钥误泄露和 production 误操作。

AI Agent 需要一种受约束的能力请求方式，而不是默认拿到明文 secret。

Provider CLI、HTTP client、SSH client 和本地脚本需要继续作为普通子进程或受控执行对象工作，只在单次执行期间获得临时凭证。

并发运行的 Agent 需要 TokenValve 以 session / workspace / command 为边界做路由，而不是假设当前机器只有一个“全局当前账号”。

未来贡献者需要清晰的 capability adapter 模型，让新的密钥类型、LLM provider、CLI、HTTP 请求模板、SSH 执行方式和脚本执行方式可以扩展进来，而不是把核心 resolver 写成 GitHub、Supabase、Vercel 的硬编码集合。

Skill 作者需要清晰的编排边界：Skill 可以问问题、打开本地 UI、调用 MCP、触发测试、保存 Recipe，但不能接收明文 secret，也不能绕过 Core policy。

## 边界

TokenValve 不是云端密钥管理器、团队 vault、托管控制台，也不是 1Password、Bitwarden、Vault 或系统凭证存储的完整替代品。它的密钥管理聚焦 Agent 工作流、profile 选择、凭证中转和执行安全，而不是通用团队共享 vault。

MVP 不承诺抵御一个可以执行任意本地命令的恶意 Agent。它的重点是减少误泄露、错误 profile 执行、全局 CLI auth 状态污染，以及未经确认的 production 写操作。

MVP 以 macOS 为第一平台，但架构必须为更多凭证存储和 provider 留出空间。Keychain 是第一个存储后端；provider 和 secret 处理必须从一开始就可扩展，不能只服务 GitHub、Supabase、Vercel 三个内置 provider。

默认执行策略不应依赖全局账号切换。`gh auth switch` 这类全局切换会在多 Agent 并发时造成竞态，只能作为明确 opt-in 的兼容策略，并且需要锁、TTL、审计和失败恢复；MVP 的默认路径应是单命令环境变量注入，必要时配合 provider CLI 的隔离配置目录。

TokenValve 必须 fail closed。当它无法确定 workspace、provider、profile、environment、命令风险或授权状态时，应拒绝执行，并返回可操作的下一步配置建议。

## 成功标准

当一个公开开源用户可以在 macOS 上安装 CLI，针对真实 workspace 运行 `tokenvalve init`，配置多套 LLM API key、GitHub / Supabase / Vercel 加至少一个 custom secret mapping，通过 Skill 引导新增密钥并沉淀已验证 Recipe，并让两个并发 Agent 分别用不同 GitHub profile 安全执行各自命令，同时可通过受控 `curl`/脚本调用 Supabase 等 API、通过受控 SSH credential 执行 SSH/git 操作，通过 dashboard 查看脱敏后的 provider/profile/LLM key 状态，production 写操作需要显式本地授权、所有含密钥输出都被脱敏时，TokenValve 就算达成了 MVP 成功标准。
