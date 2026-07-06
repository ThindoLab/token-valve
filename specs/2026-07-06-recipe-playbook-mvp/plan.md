# Plan: Recipe / Playbook MVP

## Group 1 — Recipe schema 与 store

1.1 定义 Recipe 类型、状态、binding、risk rule、validation step/result。

1.2 实现 `RecipeStore`，读写 `recipes.yaml`。

1.3 保存时拒绝 secret-like 字段。

---

## Group 2 — Recipe 验证与解析建议

2.1 实现 `save/list/show/test`。

2.2 验证通过时状态变为 `verified`。

2.3 verified Recipe 复测失败时变为 `stale`。

2.4 实现按 workspace/capability 查找 verified Recipe。

---

## Group 3 — CLI 入口

3.1 新增 `tokenvalve recipe list`。

3.2 新增 `tokenvalve recipe show <id>`。

3.3 新增 `tokenvalve recipe test <id>`。

---

## Group 4 — MCP 接入

4.1 `recipe_save` 使用 `RecipeStore.save`。

4.2 `recipe_list` 使用 `RecipeStore.list`。

4.3 MCP result 不返回 secret。

---

## Group 5 — 测试

5.1 core 测试 Recipe 保存不含 secret。

5.2 core 测试验证通过、复测失败、disabled/failed 不参与建议。

5.3 CLI 测试 list/show/test。

5.4 MCP 测试 recipe_save/list 持久化且拒绝 secret。

---

## Group 6 — 验证

6.1 运行 `pnpm install`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`。

6.2 运行 dist CLI help：`recipe list/show/test`。

6.3 若实现发现 spec 缺失，同步更新本 feature 的 requirements、plan、validation。
