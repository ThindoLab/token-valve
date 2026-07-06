# Validation: Doctor 与加固

## 自动化检查

| 命令 | 期望 |
| --- | --- |
| `pnpm install` | 成功完成 |
| `pnpm build` | 所有 package 构建成功 |
| `pnpm typecheck` | TypeScript 检查通过 |
| `pnpm test` | 所有 Vitest 测试通过 |
| `pnpm lint` | ESLint 通过 |
| `node packages/cli/dist/index.js doctor --help` | 显示 doctor 参数 |

## 场景验证

### 场景 1：空配置目录

步骤：对一个不存在或空的 configDir 运行 doctor。

期望：输出 warning/error，建议运行 `tokenvalve init`，命令不崩溃。

### 场景 2：损坏 YAML

步骤：写入非法 `profiles.yaml` 后运行 doctor。

期望：输出 YAML 解析错误和下一步修复建议，不打印文件中的 secret-like 值。

### 场景 3：profile 状态异常

步骤：准备 unverified、expired、disabled profile。

期望：doctor 分别输出可操作建议，例如运行 `secret test`、更新或删除 disabled profile。

### 场景 4：binding 指向缺失 profile

步骤：bindings.yaml 中绑定不存在 profile。

期望：doctor 输出 error，并提示重新绑定或新增 profile。

### 场景 5：custom provider 缺少 risk rules

步骤：custom capability 没有 riskRules。

期望：doctor 输出 error，提示补 risk rule。

### 场景 6：shim path / binary 问题

步骤：传入不包含 shim bin 或 provider binary 的 PATH。

期望：doctor 输出对应 finding 和修复建议。

### 场景 7：global-switch 锁冲突

步骤：写入未过期 global switch lock。

期望：doctor 输出锁冲突和等待/检查建议。

## 输出文本检查

- 不显示明文 token、API key、private key 或 Bearer credential。
- 每条 warning/error 都有 next step。
- 不出现 TODO、debug 或占位文案。

## 完成条件

- 自动化检查全部通过。
- 常见安装和配置问题均有测试覆盖。
- doctor 输出脱敏有测试覆盖。
- `CHANGELOG.md` 已更新。
- `specs/roadmap.md` 中 Phase 22 已标记完成。
