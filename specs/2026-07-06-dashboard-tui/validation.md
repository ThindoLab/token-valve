# Validation: Dashboard / TUI

## 自动化检查

| 命令 | 期望 |
| --- | --- |
| `pnpm install` | 成功完成 |
| `pnpm build` | 所有 package 构建成功 |
| `pnpm typecheck` | TypeScript 检查通过 |
| `pnpm test` | 所有 Vitest 测试通过 |
| `pnpm lint` | ESLint 通过 |
| `node packages/cli/dist/index.js dashboard --help` | 显示 dashboard 帮助 |
| `node packages/cli/dist/index.js dashboard use --help` | 显示 dashboard profile 切换帮助 |

## 场景验证

### 场景 1：查看当前 workspace 默认 profile

步骤：

1. 准备一个包含 profile 和 workspace binding 的 configDir。
2. 执行 `tokenvalve dashboard --workspace <path> --config-dir <dir>`。

期望：

- 输出包含 workspace path。
- 输出包含 provider、profile、environment。
- 输出不包含明文 secret。

### 场景 2：查看 profile 状态

步骤：

1. 准备 verified、unverified、expired、disabled profile。
2. 执行 dashboard。

期望：

- 用户可以看见每个 profile 的状态。
- 不显示 `secretLength`。

### 场景 3：查看 active intent

步骤：

1. 创建一个未过期 intent。
2. 执行 dashboard。

期望：

- 输出包含 intent id、provider、profile、risk 和 expiresAt。
- 不把 pending intent 当成 active intent。

### 场景 4：安全切换默认 profile

步骤：

1. 准备两个同 provider profile。
2. 执行 `tokenvalve dashboard use --workspace <path> --provider <name> --profile <id> --yes`。
3. 再执行 dashboard。

期望：

- workspace binding 切换到目标 profile。
- 不修改 secret value。
- 不修改全局 provider CLI auth 状态。

### 场景 5：dashboard 不提供复制明文 key

步骤：

1. 在 secret store 中保存一个明显 token。
2. 执行 dashboard。

期望：

- 输出不包含 token、Bearer credential、private key。
- 输出不包含“copy secret”或类似复制明文密钥能力。

## 完成条件

- 自动化检查全部通过。
- Dashboard 展示、状态识别、安全切换都有测试覆盖。
- 输出脱敏有测试覆盖。
- `CHANGELOG.md` 已更新。
- `specs/roadmap.md` 中 Phase 20 已标记完成。
