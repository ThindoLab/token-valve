# Validation: Global Switch Compatibility

## 自动化检查

| 命令 | 期望 |
| --- | --- |
| `pnpm install` | 成功完成 |
| `pnpm build` | 所有 package 构建成功 |
| `pnpm typecheck` | TypeScript 检查通过 |
| `pnpm test` | 所有 Vitest 测试通过 |
| `pnpm lint` | ESLint 通过 |

## 场景验证

### 场景 1：默认路径不使用 global switch

步骤：运行 GitHub runner 测试或检查 runner 调用。

期望：GitHub CLI 通过 `GH_TOKEN` / `GITHUB_TOKEN` 注入，不调用 global switch helper。

### 场景 2：adapter 未 opt-in

步骤：用没有 `executionModes: ["global-switch"]` 的 adapter 调用 global switch helper。

期望：拒绝执行，reason 为 `capability_not_configured`，不调用 switch/command handler。

### 场景 3：锁冲突

步骤：同 provider 在 TTL 内已有锁时再次执行。

期望：拒绝执行，提示 provider lock 冲突。

### 场景 4：失败恢复

步骤：command handler 抛错或返回失败。

期望：restore handler 被调用；结果包含修复建议；audit 记录 blocked/failed 状态。

### 场景 5：成功审计

步骤：handler 正常 snapshot、switch、command、restore。

期望：执行成功，锁释放，audit 包含 provider/profile/capability/risk，不含 secret。

## 完成条件

- 自动化检查全部通过。
- global switch opt-in、锁冲突、失败恢复、审计均有测试。
- 默认 runner 不使用 global switch。
- `CHANGELOG.md` 已更新。
- `specs/roadmap.md` 中 Phase 21 已标记完成。
