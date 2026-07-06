# Validation: 密钥库存与 Profile 管理

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |

## 场景验证

### 场景 1：新增并列出 profile

步骤：

1. 创建临时目录 `<tmp>`。
2. 运行 `tokenvalve secret add --config-dir <tmp>/.tokenvalve --workspace <tmp> --profile github:work --provider github --environment development --use-case cli --secret-value ghp_example_secret --yes`。
3. 运行 `tokenvalve secret list --config-dir <tmp>/.tokenvalve`。
4. 检查 `<tmp>/.tokenvalve/profiles.yaml` 和 `<tmp>/.tokenvalve/bindings.yaml`。

期望：

- add 命令成功。
- list 输出包含 `github:work`、`github`、`development`、`unverified`。
- list 输出不包含 `ghp_example_secret`。
- YAML 不包含 `ghp_example_secret`。
- bindings 中当前 workspace 的 github provider 指向 `github:work`。

### 场景 2：测试 profile 后变为 verified

步骤：

1. 接续场景 1。
2. 运行 `tokenvalve secret test github:work --config-dir <tmp>/.tokenvalve`。
3. 再次运行 `tokenvalve secret list --config-dir <tmp>/.tokenvalve`。

期望：

- test 命令成功。
- 输出说明 profile verified。
- list 输出显示 `verified`。
- `profiles.yaml` 有 `lastVerifiedAt`，但仍不含明文 secret。

### 场景 3：更新 secret 后默认回到 unverified

步骤：

1. 接续场景 2。
2. 运行 `tokenvalve secret update github:work --config-dir <tmp>/.tokenvalve --secret-value ghp_replaced_secret --yes`。
3. 运行 `tokenvalve secret list --config-dir <tmp>/.tokenvalve`。

期望：

- update 命令成功。
- profile 状态回到 `unverified`。
- 输出和 YAML 都不包含 `ghp_replaced_secret`。
- masked fingerprint 发生变化。

### 场景 4：删除 profile

步骤：

1. 接续场景 3。
2. 运行 `tokenvalve secret delete github:work --config-dir <tmp>/.tokenvalve --yes`。
3. 运行 `tokenvalve secret list --config-dir <tmp>/.tokenvalve`。
4. 检查 bindings。

期望：

- delete 命令成功。
- list 不再显示 `github:work`。
- workspace binding 中不再引用 `github:work`。

### 场景 5：失败路径

步骤：

1. 运行不带 `--yes` 的 `secret add`。
2. 重复添加同一个 profile 且不传 `--replace`。
3. 对不存在的 profile 运行 `secret update`、`secret delete`、`secret test`。
4. 添加空 secret value。

期望：

- 每个失败路径都返回非 0。
- 错误信息可读，指出需要 `--yes`、profile 已存在、profile 不存在或 secret 为空。
- 不产生半写入 metadata。

### 场景 6：未验证 profile 不用于自动写操作

步骤：

1. 创建只包含 `unverified` profile 的配置。
2. 运行 resolver 或对应测试场景模拟 write risk 命令。

期望：

- 写操作被 blocked。
- 原因说明 profile 未验证或状态不可用于该风险。

## 输出文本检查

- 输出使用 `TokenValve secret` 前缀或等价清晰标题。
- 不出现 TODO、foo、bar 或调试文本。
- 所有命令输出不得显示明文 secret。
- 对危险写入说明需要 `--yes`。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- `requirements.md`、`plan.md`、`validation.md` 与实现一致。
- `specs/roadmap.md` 中 Phase 7 可被标记完成。
- `CHANGELOG.md` 已更新。
