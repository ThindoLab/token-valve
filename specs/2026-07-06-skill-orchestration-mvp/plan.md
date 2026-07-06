# Plan: Skill 编排 MVP

## Group 1 — 定义编排契约

1.1 在 `packages/skills` 中定义 onboarding 输入、provider 类型、capability、risk、verification、MCP 调用草案和编排结果类型。

1.2 明确状态：`needs_input`、`ready`、`verified`、`failed`。

1.3 为脱敏和危险值检测建立本地 guard，防止 prompt、调用草案或 recipe metadata 中出现明文 secret。

---

## Group 2 — 内置 provider onboarding 模板

2.1 实现 GitHub key onboarding 默认模板，覆盖 CLI、HTTP API、git-over-HTTPS 相关 capability。

2.2 实现 Supabase key onboarding 默认模板，覆盖 CLI、Management API、HTTP/curl capability。

2.3 实现 LLM key onboarding 默认模板，覆盖 OpenAI、Anthropic、Gemini、OpenRouter 和 custom/internal LLM metadata。

2.4 实现 Custom secret onboarding 默认模板，只生成 metadata 和后续 mapping 提示，不提前承诺完整执行能力。

---

## Group 3 — MCP 调用计划生成

3.1 根据输入生成 `secret_profile_create` 调用草案，参数只包含 metadata、本地输入指令和验证意图。

3.2 根据 provider 模板生成 `secret_profile_test` 调用草案。

3.3 当验证通过时生成 `recipe_save` 调用草案，状态为 `verified`。

3.4 当验证失败、缺失或未执行时，不生成 verified Recipe 保存调用，并返回修复建议。

---

## Group 4 — 对外 API 与文本输出

4.1 导出 `createOnboardingPlan` 和 `continueOnboardingWithVerification` 之类的稳定 API。

4.2 输出面向 Agent 的简短中文引导文案，避免出现“把密钥贴到聊天里”这类不安全提示。

4.3 让 API 可以被后续 CLI、MCP 或真实 Skill wrapper 调用，而不绑定某个宿主。

---

## Group 5 — 测试

5.1 覆盖 GitHub 主流程：输入 workspace/profile/capability 后生成本地输入、测试和 verified recipe 保存计划。

5.2 覆盖 Supabase、LLM、Custom secret 的 provider 模板。

5.3 覆盖缺失信息路径：返回 `needs_input` 和具体问题。

5.4 覆盖验证失败路径：不生成 verified Recipe，并给出修复建议。

5.5 覆盖 secret 安全：输入或 metadata 中出现疑似 token / private key 时拒绝或脱敏。

---

## Group 6 — 验证

6.1 跑 `pnpm install`。

6.2 跑 `pnpm build`。

6.3 跑 `pnpm typecheck`。

6.4 跑 `pnpm test`。

6.5 跑 `pnpm lint`。
