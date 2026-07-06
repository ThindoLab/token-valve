# Plan: Shim Execution

## Group 1 — Shim 模型与真实 binary 查找

1.1 定义支持的 shim 命令集合：`gh`、`supabase`、`vercel`。

1.2 新增 `findRealBinary`，按 PATH 顺序查找真实 binary。

1.3 跳过当前 shim 文件和当前 shim 目录中的同名文件，避免递归。

1.4 找不到真实 binary 时返回结构化错误。

---

## Group 2 — 子进程转发与脱敏

2.1 新增 `runShim`，接收 shim 名称、args、PATH、当前 shim 路径、env 注入和 `ProcessRunner`。

2.2 使用 command + args array 调用真实 binary。

2.3 只把注入 env 传给子进程，不修改父进程环境。

2.4 对 stdout/stderr 使用 redactor 脱敏。

---

## Group 3 — Bin 入口

3.1 新增 `main` 函数，基于 `argv[1]` 推断 shim 名称。

3.2 支持将 `process.argv.slice(2)` 作为原始 args 转发。

3.3 保持库 API 可测试，bin 入口只做薄包装。

---

## Group 4 — 测试

4.1 测试 PATH 中 shim 在前时能找到后面的真实 binary。

4.2 测试 PATH 只有 shim 自己时拒绝递归。

4.3 测试 `gh`、`supabase`、`vercel` 都是支持命令。

4.4 测试 env 只进入 fake 子进程，父进程环境不变。

4.5 测试 stdout/stderr 中的 token 被脱敏。

---

## Group 5 — 验证

5.1 运行 `pnpm install`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`。

5.2 如实现发现 spec 缺失，同步更新本 feature 的 requirements、plan、validation。
