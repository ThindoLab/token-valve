# Validation: Human Intent

## 自动化检查

| 命令 | 期望结果 |
| --- | --- |
| `pnpm install` | 依赖安装成功，无 lockfile 异常。 |
| `pnpm build` | 所有 package 构建成功。 |
| `pnpm typecheck` | TypeScript 检查通过。 |
| `pnpm test` | 全部 Vitest 测试通过。 |
| `pnpm lint` | lint 通过。 |
| `node packages/cli/dist/index.js use --help` | 显示 `use` 帮助。 |
| `node packages/cli/dist/index.js revoke --help` | 显示 `revoke` 帮助。 |

## 场景验证

### 场景 1：授权前 production deploy 被拒绝

输入：

- Vercel production profile 已配置。
- args 为 `["deploy", "--prod"]`。
- active intents 为空。

步骤：

1. 调用 `runVercelCli`。

期望：

- `executed` 为 `false`。
- reason 为 `human_intent_required`。

### 场景 2：授权后 production deploy 放行

输入：

- active intent scope 匹配 workspace/provider/profile/environment/risk。
- intent 未过期。

步骤：

1. 调用 `runVercelCli`，传入 active intents。
2. 使用 fake process runner。

期望：

- `resolve.decision` 为 `allow`。
- risk 为 `production_deploy`。
- fake runner 被调用。
- audit 不包含 secret。

### 场景 3：TTL 过期后恢复拒绝

输入：

- active intent 的 `expiresAt` 早于当前时间。

步骤：

1. 调用 resolver 或 runner。

期望：

- decision 为 `blocked`。
- reason 为 `human_intent_required`。

### 场景 4：scope 不匹配不放行

输入：

- intent provider/profile/environment/risk 中至少一项与请求不匹配。

步骤：

1. 调用 resolver 或 runner。

期望：

- decision 为 `blocked`。
- fake runner 不被调用。

### 场景 5：CLI use/revoke

输入：

- 临时 config dir。

步骤：

1. 运行 `tokenvalve use --config-dir <tmp> --workspace <workspace> --provider vercel --profile vercel:team --environment production --risk production_deploy --ttl 5m --yes`。
2. 检查 `intents.yaml`。
3. 运行 `tokenvalve revoke <intent-id> --config-dir <tmp> --yes`。
4. 再次检查 `intents.yaml`。

期望：

- use 输出 intent id 和 expiresAt。
- `intents.yaml` 不包含 secret。
- revoke 后状态为 `revoked`。

## 输出文本检查

- CLI 输出不出现 secret。
- 授权创建/撤销文案明确显示 scope 和 TTL。
- 拒绝信息保留 `human_intent_required`，便于 Agent 判断下一步。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- Human intent 实现与本 spec 一致。
- `specs/roadmap.md` Phase 15 可标记为已完成。
- `CHANGELOG.md` 已更新。
