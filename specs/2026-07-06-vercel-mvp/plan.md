# Plan: Vercel MVP

## Group 1 — Vercel runner 与 adapter

1.1 新增 `packages/core/src/vercel-runner.ts`。

1.2 定义 `VERCEL_ADAPTER`，包含 `vercel-cli` capability。

1.3 将 `deploy` 解析为 `write`，将 `deploy --prod` 解析为 `production_deploy`。

---

## Group 2 — 子进程凭证注入

2.1 从 secret store 读取 `token`。

2.2 可选读取 `org_id` 和 `project_id`。

2.3 只在当前子进程 env 注入 `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`。

2.4 拒绝 `vercel login`、`logout` 等全局 auth 命令。

---

## Group 3 — CLI 入口

3.1 新增 `tokenvalve vercel run`。

3.2 支持 workspace、config-dir、session/profile/environment override。

3.3 输出 decision、reason、provider、profile、environment、risk、executed、exitCode 和脱敏 stdout/stderr。

---

## Group 4 — 测试

4.1 core 测试 preview deploy 可执行且 env 注入正确。

4.2 core 测试 production deploy 被拒绝。

4.3 core 测试缺失 token 与全局 auth 命令被拒绝。

4.4 CLI 测试 `vercel run` 可以调用 fake process runner 且不输出 token。

---

## Group 5 — 验证

5.1 运行 `pnpm install`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`。

5.2 运行 `node packages/cli/dist/index.js vercel run --help`。

5.3 若实现发现 spec 缺失，同步更新本 feature 的 requirements、plan、validation。
