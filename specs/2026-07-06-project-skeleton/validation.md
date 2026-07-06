# Validation: Project Skeleton

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功，生成 lockfile。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |
| CLI version | `pnpm --filter @tokenvalve/cli start -- --version` | 输出 CLI 版本号。 |
| CLI doctor | `pnpm --filter @tokenvalve/cli start -- doctor` | 输出工程骨架可运行的诊断占位文本。 |

## 场景验证

### 场景 1：干净 checkout 后安装和构建

步骤：

1. 运行 `pnpm install`。
2. 运行 `pnpm build`。
3. 运行 `pnpm test`。

期望：

- 依赖安装成功。
- 所有 package 可构建。
- 测试全部通过。

### 场景 2：CLI 可以启动

步骤：

1. 运行 `pnpm --filter @tokenvalve/cli start -- --version`。
2. 运行 `pnpm --filter @tokenvalve/cli start -- doctor`。

期望：

- version 输出 semver 风格版本号。
- doctor 输出包含 `TokenValve doctor` 和 `project skeleton is runnable`。
- doctor 不声称已经支持真实 resolver、secret store 或 MCP tools。

### 场景 3：Package 边界清楚

步骤：

1. 检查 `packages/cli/package.json`。
2. 检查 `packages/core/package.json`。
3. 检查其他 package 的 `package.json`。

期望：

- CLI 依赖 `@tokenvalve/core`。
- 其他 package 不互相引入不必要依赖。
- 每个 package 都有 build/typecheck/test 脚本。

### 场景 4：Adapter fixtures 目录存在

步骤：

1. 检查 `adapters/fixtures/README.md`。

期望：

- 文件存在。
- 内容说明 Phase 1 不定义真实 adapter schema。

## 输出文本检查

- CLI 输出使用 `TokenValve` 作为产品名。
- 输出文本简洁、确定，不使用调试占位如 `TODO`、`foo`、`bar`。
- doctor 文本明确这是 Phase 1 骨架检查，不误导用户以为真实诊断已完成。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- 规格文件和实现一致。
- `specs/roadmap.md` 中 Phase 1 可被标记完成。
- `CHANGELOG.md` 已更新。
