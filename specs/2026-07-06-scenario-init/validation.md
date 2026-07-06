# Validation: Scenario Init

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |

## 场景验证

### 场景 1：初始化写入配置

步骤：

1. 在临时目录运行 `tokenvalve init --workspace <tmp> --config-dir <tmp>/.tokenvalve --provider github --provider supabase --llm-key openai:work --yes`。
2. 检查 `<tmp>/.tokenvalve/`。

期望：

- 生成 `config.yaml`、`profiles.yaml`、`bindings.yaml`、`policies.yaml`。
- 输出包含 detection summary。
- 输出包含 dry-run matrix。
- YAML 不包含明文 secret。

### 场景 2：dry-run 不写文件

步骤：

1. 运行 `tokenvalve init --workspace <tmp> --config-dir <tmp>/.tokenvalve --provider github --dry-run --yes`。
2. 检查 `<tmp>/.tokenvalve/`。

期望：

- 命令成功。
- 输出展示将要生成的 provider 和 dry-run matrix。
- 不创建配置目录或文件。

### 场景 3：增量添加 provider

步骤：

1. 先运行 init，只选择 GitHub。
2. 再运行 `tokenvalve init --workspace <tmp> --config-dir <tmp>/.tokenvalve --add-provider vercel --yes`。
3. 检查 YAML。

期望：

- 第二次运行后 Vercel 被加入。
- GitHub 配置仍保留。
- 未选择 Supabase 不出现。

### 场景 4：未选择 provider 不自动接管

步骤：

1. 运行 init，只选择 GitHub。
2. 检查 profiles/bindings。

期望：

- 只出现 GitHub profile/binding。
- Supabase、Vercel 不出现。

### 场景 5：production 写操作默认需要 human intent

步骤：

1. 运行包含 Vercel 的 init。
2. 查看 dry-run matrix 或 policies。

期望：

- Vercel production deploy 显示 blocked/human intent required。
- policies 中 production writes 默认 require human intent。

## 输出文本检查

- 输出使用 `TokenValve init`。
- 文案说明未选择 provider 不会自动接管。
- 不出现 TODO、foo、bar 或调试文本。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- 生成 YAML 不包含 secret value。
- Feature spec 与实现一致。
- `specs/roadmap.md` 中 Phase 6 可被标记完成。
- `CHANGELOG.md` 已更新。
