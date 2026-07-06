# Validation: Supabase MVP

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |

## 场景验证

### 场景 1：staging read CLI 受控执行

步骤：

1. 准备 `supabase:staging` profile 和 token。
2. workspace binding 指向 staging profile。
3. 执行 runner 或 CLI fake runner 场景：`supabase projects list`。

期望：

- decision 为 `allow`。
- 子进程 env 包含 `SUPABASE_ACCESS_TOKEN`。
- 输出和 audit 不包含 token。

### 场景 2：Supabase API GET 受控执行

步骤：

1. 准备 staging profile/token。
2. 执行 `GET https://api.supabase.com/v1/projects`。

期望：

- request 包含 Authorization header。
- response 返回前脱敏。
- audit 只记录 method/host/path/risk/decision。

### 场景 3：production 写操作 blocked

步骤：

1. workspace binding 指向 production profile。
2. 执行 `supabase db push`。

期望：

- 不启动子进程。
- decision 为 blocked。
- reason 为 human intent 或 equivalent policy reason。

### 场景 4：危险命令与全局 auth blocked

步骤：

1. 执行 `supabase db reset`。
2. 执行 `supabase secrets set KEY=value`。
3. 执行 `supabase login`。

期望：

- 三者都 blocked。
- 不启动子进程。

## 输出文本检查

- 输出使用 `TokenValve supabase` 前缀。
- 不出现 TODO、foo、bar 或调试文本。
- 不出现明文 Supabase token。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- `requirements.md`、`plan.md`、`validation.md` 与实现一致。
- `specs/roadmap.md` 中 Phase 10 可被标记完成。
- `CHANGELOG.md` 已更新。
