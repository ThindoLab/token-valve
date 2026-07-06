# Validation: Recipe / Playbook MVP

## 自动化检查

| 命令 | 期望结果 |
| --- | --- |
| `pnpm install` | 依赖安装成功，无 lockfile 异常。 |
| `pnpm build` | 所有 package 构建成功。 |
| `pnpm typecheck` | TypeScript 检查通过。 |
| `pnpm test` | 全部 Vitest 测试通过。 |
| `pnpm lint` | lint 通过。 |
| `node packages/cli/dist/index.js recipe list --help` | 显示 recipe list 帮助。 |
| `node packages/cli/dist/index.js recipe show --help` | 显示 recipe show 帮助。 |
| `node packages/cli/dist/index.js recipe test --help` | 显示 recipe test 帮助。 |

## 场景验证

### 场景 1：保存 Recipe 不包含 secret

步骤：

1. 调用 `RecipeStore.save`。
2. 输入包含 provider/profile/workspace/capability/risk rules。

期望：

- `recipes.yaml` 创建。
- 文件中不出现 secret-like 明文字段。
- 状态默认为 `draft`。

### 场景 2：验证通过后变为 verified

步骤：

1. 保存 Recipe。
2. 配置中存在对应 workspace/profile。
3. 调用 `RecipeStore.test`。

期望：

- 状态变为 `verified`。
- 有 `lastVerifiedAt`。
- validation result 为脱敏内容。

### 场景 3：复测失败后变 stale/failed

步骤：

1. verified Recipe 删除对应 profile 或 workspace。
2. 再次 test。

期望：

- 原 verified Recipe 变为 `stale`。
- 非 verified Recipe 失败时变为 `failed`。

### 场景 4：verified Recipe 可给出解析建议

步骤：

1. 保存并验证 Recipe。
2. 使用同一 workspace/capability 调用 lookup。

期望：

- 返回 provider/profile/environment/capability。
- disabled/stale/failed Recipe 不返回。

### 场景 5：CLI 和 MCP 接入

步骤：

1. 运行 `tokenvalve recipe list/show/test`。
2. 调用 MCP `recipe_save` / `recipe_list`。

期望：

- CLI 输出不含 secret。
- MCP result 不含 secret。
- MCP save 拒绝 secret-like 字段。

## 输出文本检查

- CLI 输出只显示 Recipe metadata、状态、脱敏验证结果。
- 错误信息说明缺少 provider/profile/workspace/capability 或包含 secret 字段。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- Recipe / Playbook MVP 实现与本 spec 一致。
- `specs/roadmap.md` Phase 17 可标记为已完成。
- `CHANGELOG.md` 已更新。
