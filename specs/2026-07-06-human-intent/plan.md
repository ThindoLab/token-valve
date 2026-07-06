# Plan: Human Intent

## Group 1 — Active intent 模型

1.1 在 core types 中定义 `HumanIntentGrant`、status、scope 和 source。

1.2 新增 `human-intent.ts`，实现 TTL 解析、scope 匹配、过期判断。

1.3 resolver 支持 `activeIntents` 输入，高风险命中授权时返回 allow。

---

## Group 2 — 本地 intent 存储与审计

2.1 实现 `HumanIntentStore`，读写 `intents.yaml`。

2.2 支持 create/list/revoke。

2.3 创建、使用、撤销授权时生成审计事件。

---

## Group 3 — Runner 接入

3.1 Supabase runner 支持传入 active intents，production write 授权后允许。

3.2 Vercel runner 支持传入 active intents，production deploy 授权后允许。

3.3 SSH/git-ssh runner 支持传入 active intents，production write 授权后允许。

---

## Group 4 — CLI 入口

4.1 新增 `tokenvalve use`，创建 active intent。

4.2 新增 `tokenvalve revoke <intent-id>`，撤销 active intent。

4.3 CLI 输出只展示 id、scope、expiresAt 和状态。

---

## Group 5 — 测试

5.1 core 测试授权匹配后放行 production deploy。

5.2 core 测试 TTL 过期后不再匹配。

5.3 core 测试 scope 不匹配不放行。

5.4 CLI 测试 `use` / `revoke` 写入并撤销本地授权。

5.5 runner 测试授权后 Vercel/Supabase/SSH 对应高风险操作可以进入 fake runner。

---

## Group 6 — 验证

6.1 运行 `pnpm install`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`。

6.2 运行 `node packages/cli/dist/index.js use --help` 和 `node packages/cli/dist/index.js revoke --help`。

6.3 若实现发现 spec 缺失，同步更新本 feature 的 requirements、plan、validation。
