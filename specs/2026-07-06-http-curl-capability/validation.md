# Validation: HTTP 与 Curl Capability

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |

## 场景验证

### 场景 1：GitHub/Supabase API allowlist 请求

步骤：

1. 准备 provider profile 和 token。
2. 执行 allowlist 内 GET 请求。

期望：

- decision 为 allow。
- secret 注入当前请求。
- response 和 audit 不包含 secret。

### 场景 2：非 allowlist host/path 被拒绝

步骤：

1. 使用相同 provider 执行非 allowlist host 或 path。

期望：

- decision 为 blocked。
- 不启动 HTTP runner。

### 场景 3：curl template 使用 args array

步骤：

1. 执行 `curl run` fake runner 场景。
2. 检查 ProcessRunner input。

期望：

- command 为 `curl`。
- args 是数组。
- 不存在 shell string。
- 返回和 audit 不包含 secret。

### 场景 4：缺失 risk rule fail closed

步骤：

1. capability 匹配但 riskRules 不匹配。

期望：

- blocked。
- reason 为 `risk_unknown`。

## 输出文本检查

- 输出使用 `TokenValve http` 或 `TokenValve curl` 前缀。
- 不出现 TODO、foo、bar 或调试文本。
- 不出现明文 secret。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- `requirements.md`、`plan.md`、`validation.md` 与实现一致。
- `specs/roadmap.md` 中 Phase 11 可被标记完成。
- `CHANGELOG.md` 已更新。
