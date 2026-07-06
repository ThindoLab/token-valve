# Plan: Local Web UI

## Group 1 — Web UI 规格与边界

1.1 创建 feature spec，明确本地 Web UI 的范围、非目标和安全边界。

1.2 保持中文默认文案。

---

## Group 2 — Dashboard Web Server

2.1 在 `packages/dashboard` 新增本地 HTTP server。

2.2 实现 `GET /` HTML 页面。

2.3 实现 `GET /api/snapshot` JSON API。

2.4 实现 `POST /api/default-profile` 安全切换默认 profile。

2.5 HTML/API 均不输出明文 secret。

---

## Group 3 — CLI 启动入口

3.1 新增 `tokenvalve dashboard web` 命令。

3.2 支持 `--workspace`、`--config-dir`、`--host`、`--port`。

3.3 启动后输出 URL。

---

## Group 4 — 测试

4.1 覆盖 HTML 页面包含关键区域。

4.2 覆盖 snapshot API 脱敏。

4.3 覆盖默认 profile 切换。

4.4 覆盖 CLI help。

---

## Group 5 — 验证与部署

5.1 跑 `pnpm install`。

5.2 跑 `pnpm build`。

5.3 跑 `pnpm typecheck`。

5.4 跑 `pnpm test`。

5.5 跑 `pnpm lint`。

5.6 启动本地 Web UI，并给出 URL。
