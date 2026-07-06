# Validation: Vercel MVP

## 自动化检查

| 命令 | 期望结果 |
| --- | --- |
| `pnpm install` | 依赖安装成功，无 lockfile 异常。 |
| `pnpm build` | 所有 package 构建成功。 |
| `pnpm typecheck` | TypeScript 检查通过。 |
| `pnpm test` | 全部 Vitest 测试通过。 |
| `pnpm lint` | lint 通过。 |
| `node packages/cli/dist/index.js vercel run --help` | 显示 `vercel run` 帮助。 |

## 场景验证

### 场景 1：preview deploy 可执行

输入：

- workspace 绑定 Vercel verified profile。
- secret store 中存在 `token`、`org_id`、`project_id`。
- args 为 `["deploy"]`。

步骤：

1. 调用 core `runVercelCli`。
2. 使用 fake `ProcessRunner` 记录 command、args、env。

期望：

- `resolve.decision` 为 `allow`。
- risk 为 `write`。
- command 为 `vercel`。
- env 包含 `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`。
- 返回 stdout/stderr/audit 不包含 token。

### 场景 2：production deploy 被拒绝

输入：

- workspace 绑定 Vercel verified profile。
- args 为 `["deploy", "--prod"]`。

步骤：

1. 调用 `runVercelCli`。

期望：

- `executed` 为 `false`。
- reason 为 `human_intent_required`。
- fake runner 没有被调用。

### 场景 3：全局 auth 命令被拒绝

输入：

- args 为 `["login"]` 或 `["logout"]`。

步骤：

1. 调用 `runVercelCli`。

期望：

- `executed` 为 `false`。
- reason 为 `capability_not_configured`。
- 提示全局 auth 命令不允许。

### 场景 4：缺失 token 被拒绝

输入：

- workspace/profile 配置存在。
- secret store 中没有 `token`。

步骤：

1. 调用 `runVercelCli`，args 为 `["deploy"]`。

期望：

- `executed` 为 `false`。
- reason 为 `profile_not_configured`。
- 不调用 fake runner。

## 输出文本检查

- CLI 输出不出现 Vercel token。
- production deploy 拒绝信息明确指向 human intent。
- 没有调试残留、占位文案或完整 secret。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- Vercel runner 和 CLI 实现与本 spec 一致。
- `specs/roadmap.md` Phase 13 可标记为已完成。
- `CHANGELOG.md` 已更新。
