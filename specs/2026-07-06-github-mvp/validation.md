# Validation: GitHub MVP

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |

## 场景验证

### 场景 1：低风险 GitHub 命令受控执行

步骤：

1. 用测试 secret store 准备 `github:work` profile。
2. 配置 workspace binding 指向 `github:work`。
3. 执行 `gh repo view` 的 runner 测试或 CLI fake runner 场景。

期望：

- resolver decision 为 `allow`。
- 子进程收到 `GH_TOKEN` 和 `GITHUB_TOKEN`。
- 父进程环境不被修改。
- stdout/stderr 返回前已脱敏。

### 场景 2：两个 session 使用不同 GitHub profile

步骤：

1. 准备 `github:personal` 和 `github:client` 两个 profile/token。
2. 并发执行两次 GitHub runner，每次传不同 session override。

期望：

- 两次执行分别解析到不同 profile。
- 两个子进程 env 中 token 不同。
- 任意返回值和 audit event 都不包含明文 token。

### 场景 3：未知或危险命令 fail closed

步骤：

1. 执行 `gh auth switch`。
2. 执行 `gh repo delete`。

期望：

- 两者都不会启动子进程。
- 返回 blocked。
- reason 为 capability/risk/policy 相关原因。

### 场景 4：缺失 token fail closed

步骤：

1. profile metadata 存在，但 secret store 中没有 token。
2. 执行 `gh repo view`。

期望：

- 不启动子进程。
- 返回 blocked。
- message 指出 secret missing。

## 输出文本检查

- 输出使用 `TokenValve github` 前缀。
- 不出现 TODO、foo、bar 或调试文本。
- 不出现明文 GitHub token。
- 不出现 `gh auth switch` 被执行的痕迹。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- `requirements.md`、`plan.md`、`validation.md` 与实现一致。
- `specs/roadmap.md` 中 Phase 9 可被标记完成。
- `CHANGELOG.md` 已更新。
