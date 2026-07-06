# Plan: HTTP 与 Curl Capability

## Group 1 — 通用 HTTP Runner

1.1 抽出可复用 `HttpRunner` / `FetchHttpRunner`。

1.2 实现 `runHttpRequest`，使用 resolver 校验 `http-request` capability。

1.3 支持 header/query/body secret template 注入。

1.4 输出和 audit 脱敏。

---

## Group 2 — Curl Template Runner

2.1 实现 `runCurlTemplate`，使用 resolver 校验 `curl-template` capability。

2.2 将结构化 method/url/header/body 转成 `curl` args array。

2.3 不使用 shell string。

2.4 输出和 audit 脱敏。

---

## Group 3 — Adapter 与 Risk

3.1 添加测试用 GitHub/Supabase HTTP adapter。

3.2 添加测试用 curl-template capability。

3.3 未匹配 host/path/risk 时 fail closed。

3.4 非 read risk 默认 blocked。

---

## Group 4 — CLI 命令

4.1 添加 `tokenvalve http request`。

4.2 添加 `tokenvalve curl run`。

4.3 输出决策、profile、risk、status/exitCode 和脱敏返回。

---

## Group 5 — 测试

5.1 测试 GitHub/Supabase API allowlist 请求。

5.2 测试 secret 注入到 header/query/body。

5.3 测试非 allowlist host 被拒绝。

5.4 测试 risk rule 缺失 fail closed。

5.5 测试 curl 使用 args array，输出和 audit 不泄露 secret。

---

## Group 6 — 验证

6.1 跑 `pnpm install`。

6.2 跑 `pnpm build`。

6.3 跑 `pnpm typecheck`。

6.4 跑 `pnpm test`。

6.5 跑 `pnpm lint`。

6.6 检查 dist CLI `http request --help` 和 `curl run --help`。
