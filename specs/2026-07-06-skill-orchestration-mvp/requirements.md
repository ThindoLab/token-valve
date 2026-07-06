# Requirements: Skill 编排 MVP

## 范围

本 phase 交付内置 TokenValve Skill 编排流程，让 Agent 在用户说“新增一个 GitHub key / Supabase key / LLM key / custom secret”时，能够生成一条安全、结构化、可继续执行的 onboarding 路径。

它包含：

- 四类内置 onboarding：GitHub、Supabase、LLM、Custom secret。
- 根据用户输入和上下文识别 provider 类型、用途、profile 命名、workspace binding、capability、risk 和验证方式。
- 生成 MCP 调用计划，而不是让 Skill 直接读取或写入 secret store。
- 通过 MCP 的 `secret_profile_create`、`secret_profile_test`、`recipe_save` 等能力沉淀已验证方案。
- 失败时返回修复建议，并明确不会把失败配置保存为可自动执行的 verified Recipe。
- 提供可测试的 TypeScript API，后续 Codex / Claude Code / Pi Agent 的 Skill 包装层可以复用。

## 范围外

- 不实现完整 Codex Skill 安装包或 marketplace 发布。
- 不实现 Web / TUI 密钥编辑界面（见 Phase 20 Dashboard / TUI）。
- 不接收、缓存、打印或转发明文 secret。
- 不绕过 MCP 直接调用 Keychain 或 secret store。
- 不实现 custom provider 的完整数据驱动 mapping（见 Phase 19）。
- 不实现真实 Agent 自然语言插件注册协议；本 phase 先沉淀可被包装的编排内核。

## 行为

当用户表达新增密钥意图时，Skill 编排器会根据 provider 类型生成 onboarding plan。计划会说明需要的 metadata、建议的 profile id、workspace 绑定、capability、risk policy 和验证步骤。

如果上下文足够，编排器会生成一组 MCP 调用草案：

1. 创建或更新 secret profile metadata。
2. 触发本地受控 secret 输入或测试流程。
3. 只有验证成功时才保存 `verified` Recipe。

如果缺少必要信息，编排器返回 `needs_input` 状态和具体问题，而不是猜测 profile 或 workspace。

如果验证失败，编排器返回 `failed` 状态和修复建议，并生成一个不会保存 verified Recipe 的结果。

所有返回内容必须是脱敏的：不得包含看起来像 token、API key、private key、Bearer token 或 SSH key 的值。

## 决策

- Skill 编排内核放在 `packages/skills`，因为该包已经在 monorepo 中预留，且 tech-stack 明确它负责内置 Skill 的编排逻辑和提示模板。
- 本 phase 实现 TypeScript 编排 API，不实现具体宿主 Skill 包装。这样可以先验证安全边界和流程，再在后续按 Codex / Claude Code / Pi Agent 适配。
- 编排输出使用“计划 + MCP 调用草案 + 状态”的结构，方便测试，也避免在本 phase 引入真实 MCP transport。
- MCP 调用草案只包含 metadata 和本地输入指令，不包含明文 secret。
- Recipe 只有在 `verification.status === "passed"` 时才允许生成 `verified` 保存调用；失败或未知状态只给修复建议。
- Custom secret 在本 phase 只做 generic onboarding plan，不承诺可执行 mapping；完整 mapping 留给 Phase 19。

## 背景

`mission.md` 要求 TokenValve 像本地密钥管理器、凭证中转与执行网关，而不是让 Agent 获得明文密钥。新增密钥的核心场景必须通过 Skill 引导用户定位 provider、用途、风险和验证方式，并沉淀可复用 Recipe。

`tech-stack.md` 明确 MCP 是能力边界，Skill 是编排层。Skill 可以问问题、打开本地 UI、调用 MCP、触发测试、保存 Recipe，但不能接收明文 secret，也不能绕过 Core policy。

因此本 phase 的重点不是“让用户多一个命令”，而是把 Agent 可复用的 onboarding 语义做成稳定、可测试、脱敏的编排内核。

## 未决问题

- 具体 Codex Skill / Claude Code command / Pi Agent tool 的包装格式尚未定稿。本 phase 暂以 TypeScript API 和测试作为内核契约。
- 本地 secret 输入最终由 CLI、Dashboard 还是系统弹窗承载尚未定稿。本 phase 仅生成 `local-secret-input` 指令，不承诺 UI 形态。
- Custom secret 的 mapping DSL 会在 Phase 19 细化；本 phase 只保留能力和风险的元数据入口。
