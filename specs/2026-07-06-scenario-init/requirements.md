# Requirements: Scenario Init

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 6：场景化 Init。

它要交付一个可脚本化的 `tokenvalve init` 向导，能够检测当前 workspace 的基础上下文，按用户明确选择的 provider 生成本地配置文件，并输出 dry-run 矩阵。Phase 6 只建立配置和可解释预览，不写入真实 secret，不安装 shims，不配置真实 MCP client。

包含：

- CLI 新增 `tokenvalve init`。
- 支持 `--workspace <path>`，默认当前目录。
- 支持 `--config-dir <path>`，默认 `.tokenvalve`，便于测试不写用户 HOME。
- 支持 `--provider <name>` 可重复传入。
- 支持 `--add-provider <name>` 增量追加 provider。
- 支持 `--llm-key <provider:profile>` 记录 LLM key profile metadata。
- 支持 `--yes` 使用默认策略生成配置，避免交互测试卡住。
- 支持 `--dry-run` 只输出矩阵，不写文件。
- 检测 git remote、常见 provider 配置文件和本机 CLI 是否可用。
- 生成 `config.yaml`、`profiles.yaml`、`bindings.yaml`、`policies.yaml`。
- 输出 dry-run 矩阵，展示 GitHub/Supabase/Vercel/LLM 常见场景的 allow/block 预览。

## 范围外

- 不要求真实交互式 prompt；可脚本化向导先满足 MVP 流程。
- 不写真实 secret，不调用 Keychain（见 Phase 7）。
- 不安装 PATH shims（见 Phase 14）。
- 不写 MCP client 配置（见 Phase 16）。
- 不执行真实 provider CLI 命令。
- 不自动接管未选择 provider。
- 不实现完整 provider detection 生态，只做 Git remote、Supabase config、Vercel config、binary availability 的最小检测。

## 行为

正常路径：

- 用户运行 `tokenvalve init --workspace . --provider github --provider supabase --llm-key openai:work --yes`。
- CLI 创建 `.tokenvalve/`。
- CLI 写入四个 YAML 文件。
- YAML 只包含 profile id、provider、environment、binding、policy metadata，不包含 secret value。
- CLI 输出 detection summary 和 dry-run matrix。

增量路径：

- 用户运行 `tokenvalve init --add-provider vercel --workspace . --yes`。
- CLI 读取已有配置，追加 Vercel binding 和 profile metadata。
- 未选择 provider 不被自动加入。

dry-run 路径：

- 用户运行 `tokenvalve init --provider github --dry-run --yes`。
- CLI 只输出将要写入的摘要和 dry-run matrix，不创建配置文件。

失败路径：

- 未传 `--yes` 且没有交互输入时，CLI 返回明确提示，要求使用 `--yes` 或后续交互模式。
- workspace 路径不存在时返回错误。
- provider 不在 Phase 6 支持列表时返回错误。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 配置目录默认值 | workspace 下 `.tokenvalve` | Phase 6 便于本地验证，避免过早写 `~/.tokenvalve`。 |
| YAML 文件 | `config.yaml`、`profiles.yaml`、`bindings.yaml`、`policies.yaml` | 与 roadmap 和 tech-stack 对齐。 |
| 交互模式 | Phase 6 先支持 `--yes` 非交互 | 自动化验证稳定，后续可扩展 prompt。 |
| Provider 支持 | GitHub、Supabase、Vercel、OpenAI/LLM metadata | 与 Phase 6 验收矩阵对齐。 |
| Dry-run | 复用 core resolver fixtures/logic 生成预览 | 展示配置效果，而不是只打印静态文本。 |

## 背景

`mission.md` 要求 init 一次性理解用户真实工作场景，生成确定性的 workspace / provider / environment / LLM key 映射，并让未覆盖场景 fail closed。

`tech-stack.md` 约束 secret 不能写入 YAML。Phase 6 生成的 YAML 必须只保存 metadata。

Phase 6 是后续 profile 管理、provider MVP、shim 和 MCP 的入口基础，因此要优先可解释、可重复、可测试。

## 未决问题

- 默认配置目录后续是否切换到 `~/.tokenvalve`，留到 Phase 7/Init 体验迭代。
- 真正的交互式 prompt 细节留给后续 CLI UX 加固。
- 真实 provider profile 命名策略会在各 provider MVP 中继续细化。
