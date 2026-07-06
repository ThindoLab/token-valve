# Plan: Scenario Init

## Group 1 — Init 类型与检测

1.1 在 core 或 cli 中定义 init options、detected context、generated config 类型。

1.2 检测 workspace 是否存在并 canonicalize。

1.3 检测 git remote。

1.4 检测 Supabase/Vercel 常见配置文件是否存在。

1.5 检测常见 CLI binary 是否可用。

---

## Group 2 — 配置生成

2.1 生成 `config.yaml`。

2.2 生成 `profiles.yaml`。

2.3 生成 `bindings.yaml`。

2.4 生成 `policies.yaml`。

2.5 增量模式读取已有 YAML 并追加 provider。

2.6 保证 YAML 不包含 secret value。

---

## Group 3 — Dry-run Matrix

3.1 为 GitHub 生成 `gh repo view` 预览。

3.2 为 Supabase 生成 staging read/write 预览。

3.3 为 Vercel 生成 preview/prod 预览。

3.4 为 LLM key 生成 metadata 预览。

3.5 展示未选择 provider 不会被接管。

---

## Group 4 — CLI 命令

4.1 添加 `tokenvalve init` command。

4.2 支持 `--workspace`、`--config-dir`、`--provider`、`--add-provider`、`--llm-key`、`--yes`、`--dry-run`。

4.3 未传 `--yes` 时给出非交互提示。

4.4 provider 不支持时返回错误。

---

## Group 5 — 测试

5.1 测试 init 写入四个 YAML 文件。

5.2 测试 dry-run 不写文件。

5.3 测试增量 provider 追加。

5.4 测试未选择 provider 不出现在配置中。

5.5 测试 YAML 不包含 secret-like value。

---

## Group 6 — 验证

6.1 跑 `pnpm build`。

6.2 跑 `pnpm typecheck`。

6.3 跑 `pnpm test`。

6.4 跑 `pnpm lint`。

6.5 手动运行 CLI init 场景，检查输出和文件。
