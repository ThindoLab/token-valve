# Validation: LLM Key 管理 MVP

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |

## 场景验证

### 场景 1：添加两套 LLM key

步骤：

1. 创建临时目录 `<tmp>`。
2. 运行 `tokenvalve llm add --config-dir <tmp>/.tokenvalve --workspace <tmp> --profile openai:work --provider openai --api-key sk_openai_example --base-url https://api.openai.com/v1 --model gpt-4.1 --use-case code-generation --yes`。
3. 运行 `tokenvalve llm add --config-dir <tmp>/.tokenvalve --workspace <tmp> --profile anthropic:work --provider anthropic --api-key sk_ant_example --model claude-sonnet --use-case review --yes`。
4. 运行 `tokenvalve llm list --config-dir <tmp>/.tokenvalve`。

期望：

- 两条 add 命令成功。
- list 输出包含两个 profile、provider、status、model 和 fingerprint。
- 输出不包含 `sk_openai_example` 或 `sk_ant_example`。
- YAML 不包含任何明文 key。

### 场景 2：设置 workspace/client/use-case 默认 key

步骤：

1. 接续场景 1。
2. 运行 `tokenvalve llm use openai:work --config-dir <tmp>/.tokenvalve --workspace <tmp> --provider openai --client codex --use-case code-generation --yes`。
3. 运行 `tokenvalve llm resolve --config-dir <tmp>/.tokenvalve --workspace <tmp> --provider openai --client codex --use-case code-generation`。

期望：

- use 命令成功。
- resolve 输出 decision 为 `allow`。
- resolve 输出 profile 为 `openai:work`。
- 输出不包含明文 key。

### 场景 3：client override 高于 provider 默认

步骤：

1. 添加 `openai:personal` 和 `openai:codex` 两个 profile。
2. 设置 provider 默认为 `openai:personal`。
3. 设置 client `codex` override 为 `openai:codex`。
4. 分别运行不带 client 和带 `--client codex` 的 resolve。

期望：

- 不带 client 解析到 `openai:personal`。
- 带 `--client codex` 解析到 `openai:codex`。

### 场景 4：失败路径

步骤：

1. 使用 unsupported provider 运行 `llm add`。
2. 写操作不传 `--yes`。
3. `llm use` 指向不存在 profile。

期望：

- 每个失败路径返回非 0。
- 错误信息可读。
- 不产生半写入 metadata。

## 输出文本检查

- 输出使用 `TokenValve llm` 前缀。
- 不出现 TODO、foo、bar 或调试文本。
- CLI 和 YAML 不显示明文 API key。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- `requirements.md`、`plan.md`、`validation.md` 与实现一致。
- `specs/roadmap.md` 中 Phase 8 可被标记完成。
- `CHANGELOG.md` 已更新。
