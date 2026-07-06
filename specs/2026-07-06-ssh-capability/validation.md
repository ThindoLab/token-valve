# Validation: SSH Capability

## 自动化检查

| 命令 | 期望结果 |
| --- | --- |
| `pnpm install` | 依赖安装成功，无 lockfile 异常。 |
| `pnpm build` | 所有 package 构建成功。 |
| `pnpm typecheck` | TypeScript 检查通过。 |
| `pnpm test` | 全部 Vitest 测试通过。 |
| `pnpm lint` | lint 通过。 |
| `node packages/cli/dist/index.js ssh run --help` | 显示 `ssh run` 帮助。 |
| `node packages/cli/dist/index.js git-ssh run --help` | 显示 `git-ssh run` 帮助。 |

## 场景验证

### 场景 1：git over SSH 选择正确 profile

输入：

- workspace 已绑定 provider `github` 和 verified profile。
- adapter 中 `git-ssh` capability allowlist 包含 `github.com`。
- operation 为 `fetch`。

步骤：

1. 调用 core `runGitSsh`，传入 remote URL `git@github.com:ThindoLab/token-valve.git`。
2. 使用 fake `ProcessRunner` 记录 command、args、env。

期望：

- `resolve.decision` 为 `allow`。
- 使用绑定 profile。
- 子进程 command 为 `git`。
- `GIT_SSH_COMMAND` 只存在于该子进程 env。

### 场景 2：未配置 host allowlist 时拒绝

输入：

- adapter capability 不包含目标 host，或 allowlist 为空。
- operation 为 `connect`。

步骤：

1. 调用 `runSshCommand`，host 使用 `unknown.example.com`。

期望：

- `executed` 为 `false`。
- `resolve.decision` 为 `blocked`。
- stderr 明确提示 SSH 操作在执行前被拒绝。

### 场景 3：known_hosts policy 缺失时拒绝

输入：

- workspace、profile、host allowlist 和 risk rule 都配置正确。
- 不传 known_hosts policy。

步骤：

1. 调用 `runSshCommand`。

期望：

- `executed` 为 `false`。
- reason 为 `capability_not_configured`。
- 不调用 fake `ProcessRunner`。

### 场景 4：production SSH 写操作需要 human intent

输入：

- profile environment 为 `production`。
- operation 为 `push`。

步骤：

1. 调用 `runGitSsh`。

期望：

- `executed` 为 `false`。
- reason 为 `human_intent_required`。
- 不执行 git 子进程。

### 场景 5：敏感信息脱敏

输入：

- fake runner 返回包含私钥路径、`SSH_AUTH_SOCK=/tmp/tokenvalve.sock` 和 `git@github.com:ThindoLab/private.git` 的 stdout/stderr。

步骤：

1. 调用 `runSshCommand` 或 `runGitSsh`。
2. 检查返回 stdout/stderr 和 audit。

期望：

- 不出现真实私钥路径。
- 不出现真实 agent socket 路径。
- 不出现完整 remote path。
- 出现 `[REDACTED:ssh-identity-file]`、`[REDACTED:ssh-agent-socket]` 或 `[REDACTED:ssh-remote]`。

## 输出文本检查

- CLI 输出只展示 provider、profile、risk、执行状态和脱敏 stdout/stderr。
- 不出现调试文本、占位文案或明文 secret。
- 拒绝信息说明“为什么拒绝”和“需要配置/授权什么”，语气保持直接、可操作。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- SSH runner 和 CLI 实现与本 spec 一致。
- `specs/roadmap.md` Phase 12 可标记为已完成。
- `CHANGELOG.md` 已更新。
