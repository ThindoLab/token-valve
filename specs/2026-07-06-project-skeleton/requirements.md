# Requirements: Project Skeleton

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 1：项目骨架。

它要交付一个可运行的 pnpm TypeScript monorepo，为后续 resolver、secret store、MCP、shim、dashboard 和 skill 阶段提供稳定工程基础。

包含：

- 创建 `packages/cli`、`packages/core`、`packages/mcp-server`、`packages/shims`、`packages/dashboard`、`packages/skills`。
- 建立 TypeScript + ESM 基础配置。
- 建立 `pnpm` workspace。
- 建立 build、test、typecheck、lint 基础命令。
- 使用 Vitest 建立最小单元测试。
- 使用 tsup 为各 package 建立构建出口。
- 使用 commander 建立最小 CLI。
- 建立 adapter fixtures 目录。
- 实现 `tokenvalve --version` 和 `tokenvalve doctor` 占位。

## 范围外

- 不实现真实 resolver、policy、adapter loading 或 risk 识别（见 Phase 2）。
- 不实现 Agent session routing（见 Phase 3）。
- 不实现 redaction、audit event shaping（见 Phase 4）。
- 不接入 macOS Keychain 或其他 secret store（见 Phase 5）。
- 不实现真实 MCP tools（见 Phase 16）。
- 不实现真实 shim 转发（见 Phase 14）。
- 不实现 dashboard UI 或 TUI 交互（见 Phase 20）。
- 不实现 Skill onboarding 流程（见 Phase 18）。

## 行为

首次 checkout 后，开发者可以运行：

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

CLI 可以通过 workspace 脚本运行：

```bash
pnpm --filter @tokenvalve/cli start -- --version
pnpm --filter @tokenvalve/cli start -- doctor
```

`--version` 输出当前包版本。

`doctor` 只做占位检查，说明项目骨架可运行，并提示后续 phase 会补齐真实诊断。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 包管理 | `pnpm` workspace | 与 `specs/tech-stack.md` 一致，适合 monorepo。 |
| 语言 | TypeScript + ESM | 与技术栈一致，便于 CLI/MCP/Core 共享类型。 |
| CLI 框架 | `commander` | 简洁稳定，适合安全敏感 CLI 的显式命令。 |
| 测试 | Vitest | 轻量，适合 core/CLI 单元测试。 |
| 构建 | tsup | 简化 ESM package 构建，适合多 package 初始骨架。 |
| lint | TypeScript compiler + ESLint | Phase 1 只建立基础质量门槛，不引入复杂规则。 |

Package 命名使用 `@tokenvalve/<name>`。CLI 命令名使用 `tokenvalve`。

`dashboard` 和 `skills` 本阶段只提供 package 壳和占位 API，不引入 Ink、Vue、React 或 Web 依赖。

## 背景

`mission.md` 要求 TokenValve 成为本地密钥管理器、凭证中转与执行网关。Phase 1 不交付产品能力，但必须让后续能力能以清晰 package 边界增量实现。

`tech-stack.md` 指定 TypeScript + Node.js、pnpm monorepo、CLI/Core/MCP/Shim/Dashboard/Skill 多入口。本 feature 只实现这些入口的工程形态和最小可运行路径。

当前仓库已有 PRD、mission、tech-stack、roadmap 和 templates。Phase 1 应避免重写产品文档，只添加 feature spec 和工程骨架。

## 未决问题

- Node.js 最低版本暂定为 22+，如果后续分发需要支持更低 LTS，可在 Public MVP 前重新评估。
- ESLint 规则暂用基础推荐配置；安全相关自定义规则等 core 行为稳定后再补。
- Dashboard 的最终形态是 TUI 还是 Local Web UI 留给 Phase 20 和后续 Backlog 决策。
