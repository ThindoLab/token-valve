# Plan: Dashboard / TUI

## Group 1 — Dashboard 渲染内核

1.1 在 `packages/dashboard` 定义 dashboard snapshot 类型。

1.2 实现 `renderDashboard` 纯函数。

1.3 确保 profile 输出脱敏，不显示 secretLength 或任何 secret-like 字符串。

---

## Group 2 — CLI dashboard 展示

2.1 新增 `tokenvalve dashboard` 命令。

2.2 从 `ProfileInventory`、`HumanIntentStore`、`RecipeStore`、`CustomProviderStore` 读取 snapshot。

2.3 展示 workspace binding、profile status、active intent、recipe、custom provider 和 doctor 状态。

---

## Group 3 — 安全切换默认 profile

3.1 新增 `tokenvalve dashboard use`。

3.2 复用 `ProfileInventory.setDefaultProfile`。

3.3 输出切换后的脱敏确认，不显示 secret。

---

## Group 4 — 测试

4.1 覆盖 dashboard 渲染纯函数。

4.2 覆盖 CLI dashboard 输出。

4.3 覆盖 dashboard use 切换 workspace 默认 profile。

4.4 覆盖 secret-like 文本不出现在 dashboard 输出中。

---

## Group 5 — 验证

5.1 跑 `pnpm install`。

5.2 跑 `pnpm build`。

5.3 跑 `pnpm typecheck`。

5.4 跑 `pnpm test`。

5.5 跑 `pnpm lint`。

5.6 跑 `node packages/cli/dist/index.js dashboard --help` 和 `node packages/cli/dist/index.js dashboard use --help`。
