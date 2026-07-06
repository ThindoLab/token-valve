# Plan: Project Skeleton

## Group 1 — Workspace 与根配置

1.1 创建根 `package.json`，声明 package manager、workspace scripts 和 Node 版本要求。

1.2 创建 `pnpm-workspace.yaml`，纳入 `packages/*`。

1.3 创建根 `tsconfig.base.json`、`tsconfig.json`，统一 ESM、strict TypeScript 和 package references。

1.4 创建基础 ESLint 与 Vitest 配置。

---

## Group 2 — Package 壳与构建出口

2.1 创建 `packages/core`，导出版本、package 名称和最小 health API。

2.2 创建 `packages/cli`，依赖 `@tokenvalve/core`，提供 commander CLI。

2.3 创建 `packages/mcp-server`、`packages/shims`、`packages/dashboard`、`packages/skills`，各自提供占位导出和最小测试。

2.4 为每个 package 添加 `package.json`、`tsconfig.json`、`tsup.config.ts`、`src/index.ts`。

---

## Group 3 — 最小 CLI 行为

3.1 实现 `tokenvalve --version`，输出 CLI package 版本。

3.2 实现 `tokenvalve doctor` 占位命令。

3.3 `doctor` 输出应说明工程骨架可运行，并标记真实诊断在后续 phase 实现。

3.4 添加 CLI start 脚本，便于开发期运行。

---

## Group 4 — Adapter Fixtures

4.1 创建 `adapters/fixtures` 目录。

4.2 添加最小 fixture README，说明 Phase 1 只放置 adapter 测试样例目录，不定义真实 adapter schema。

---

## Group 5 — 测试与验证脚本

5.1 添加 core 最小单元测试。

5.2 添加 CLI 行为测试，覆盖 version 和 doctor 命令。

5.3 确保根命令 `pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm lint` 可执行。

5.4 运行 validation 中的自动化检查，按结果修正实现或 spec。

---

## 备注

- 遵守 `specs/tech-stack.md`。
- Phase 1 不新增真实业务逻辑。
- 未经必要不要引入 UI、MCP SDK 或 secret store 依赖。
