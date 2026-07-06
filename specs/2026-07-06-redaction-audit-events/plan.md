# Plan: Redaction and Audit Events

## Group 1 — Redactor 类型与基础 API

1.1 定义 redaction options、result、finding 类型。

1.2 实现 `redactText`，支持 known secret 和 token-like pattern。

1.3 实现 `redactForReturn`，支持最大长度、截断和 `safeToReturn` 标记。

1.4 从 `packages/core` 统一导出 redactor API。

---

## Group 2 — 常见敏感片段规则

2.1 添加 known secret redaction。

2.2 添加 Authorization header redaction。

2.3 添加 URL query secret redaction。

2.4 添加 GitHub/OpenAI/Anthropic/JWT/generic token pattern redaction。

2.5 添加 SSH remote、identity file、agent socket 脱敏规则。

---

## Group 3 — Audit Event Shaping

3.1 定义 audit event input 和 output 类型。

3.2 实现 command audit event shaping。

3.3 实现 HTTP audit event shaping。

3.4 实现 SSH/git operation audit event shaping。

3.5 确保 event 中所有可变文本都经过 redactor。

---

## Group 4 — 单元测试

4.1 测试 known secret 不出现在 redacted text。

4.2 测试 token-like patterns。

4.3 测试 header、URL、SSH remote、agent socket。

4.4 测试长输出截断和 `safeToReturn`。

4.5 测试 audit event 不包含原始 secret。

---

## Group 5 — 验证

5.1 跑 `pnpm build`。

5.2 跑 `pnpm typecheck`。

5.3 跑 `pnpm test`。

5.4 跑 `pnpm lint`。

5.5 对照 validation 检查输出中没有真实 secret 样例残留。
