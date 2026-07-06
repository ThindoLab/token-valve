# Plan: Core Resolution Model

## Group 1 — Core 类型与决策模型

1.1 定义 provider、profile、environment、capability、risk、decision、reason 类型。

1.2 定义 resolver input：workspace、execution context、config source、adapter source。

1.3 定义 resolver output：decision、resolved fields、reason、message。

1.4 导出公共 API，保持 `packages/core` 作为纯 TypeScript 库。

---

## Group 2 — YAML 加载与 Workspace Canonicalization

2.1 添加 YAML parser 依赖。

2.2 实现从对象或文件路径加载 config。

2.3 实现从对象或文件路径加载 adapters。

2.4 实现 workspace canonicalization，支持真实路径和测试虚拟路径。

2.5 实现 workspace binding 的最长路径匹配。

---

## Group 3 — Adapter 与 Capability 匹配

3.1 定义最小 adapter schema。

3.2 支持 `cli-command` 根据 command 和 args 匹配。

3.3 支持 `http-request` 根据 method、host、path 匹配。

3.4 支持 `llm-api-key` 根据 provider/use-case 匹配。

3.5 支持 SSH/script 类 capability 的最小结构匹配。

---

## Group 4 — Risk Rules 与 Fail Closed

4.1 实现 risk rule 匹配。

4.2 支持 read/write/dangerous/production_deploy/unknown。

4.3 未匹配 risk rule 时返回 blocked + `risk_unknown`。

4.4 provider/profile/environment/capability 缺失时返回对应 blocked reason。

4.5 Phase 2 没有 human intent，高风险默认 blocked。

---

## Group 5 — Fixtures 与单元测试

5.1 添加 GitHub fixture。

5.2 添加 Supabase fixture。

5.3 添加 Vercel fixture。

5.4 添加 LLM fixture。

5.5 添加 custom provider fixture。

5.6 测试 read/write/dangerous/unknown risk。

5.7 测试未知 workspace/provider/environment/capability 的 fail-closed 行为。

---

## Group 6 — 验证

6.1 跑 `pnpm build`。

6.2 跑 `pnpm typecheck`。

6.3 跑 `pnpm test`。

6.4 跑 `pnpm lint`。

6.5 对照 `validation.md` 检查 resolver 不返回 secret 字段。
