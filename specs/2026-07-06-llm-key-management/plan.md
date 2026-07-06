# Plan: LLM Key 管理 MVP

## Group 1 — LLM Metadata 与 Binding

1.1 扩展 profile metadata，支持 LLM base URL、organization、project、default model、client labels。

1.2 扩展 workspace provider binding，支持 `clientProfiles` 和 `capabilityProfiles`。

1.3 在 profile inventory 中支持写入 LLM metadata。

---

## Group 2 — Resolver 解析默认 LLM Key

2.1 LLM execution 根据 provider 找到 workspace binding。

2.2 优先按 Agent client 匹配 `clientProfiles`。

2.3 其次按 capability/use-case 匹配 `capabilityProfiles`。

2.4 回退到 provider 默认 profile。

2.5 保持结果不包含明文 key。

---

## Group 3 — CLI `llm` 命令

3.1 添加 `tokenvalve llm add`。

3.2 添加 `tokenvalve llm list`。

3.3 添加 `tokenvalve llm use`。

3.4 添加 `tokenvalve llm resolve`。

3.5 校验 provider、profile 存在性、非交互写入确认。

---

## Group 4 — 测试

4.1 测试添加两套 LLM key profile。

4.2 测试 YAML 和 CLI 输出不包含明文 key。

4.3 测试 workspace 默认 LLM key 绑定。

4.4 测试 client/use-case override 解析。

4.5 测试 unsupported provider、缺少 `--yes`、缺失 profile 的失败路径。

---

## Group 5 — 验证

5.1 跑 `pnpm install`。

5.2 跑 `pnpm build`。

5.3 跑 `pnpm typecheck`。

5.4 跑 `pnpm test`。

5.5 跑 `pnpm lint`。

5.6 手动运行 LLM add/list/use/resolve 场景，确认无明文 key 泄漏。
