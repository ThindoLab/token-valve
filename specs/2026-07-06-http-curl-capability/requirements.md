# Requirements: HTTP 与 Curl Capability

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 11：HTTP 与 Curl Capability。

它要把 Phase 10 中 provider 特化的 Supabase API 请求抽象为通用结构化 HTTP runner，并提供受控 curl template 执行能力。调用方传入 method、URL、headers/body 模板和 secret 映射；TokenValve 先通过 resolver 校验 workspace、provider、profile、capability、host/path allowlist 和 risk，再从 secret store 读取 secret，仅注入到当前 HTTP 请求或当前 curl 子进程，并对返回值和审计事件脱敏。

包含：

- core 新增通用 `runHttpRequest`。
- core 新增通用 `runCurlTemplate`。
- `http-request` capability 支持 header/query/body secret 注入。
- `curl-template` capability 使用 binary + args array，不拼接 shell string。
- URL host/path 必须匹配 adapter allowlist。
- 未配置 risk rule 的请求 fail closed。
- 非 allowlist host/path 被拒绝。
- 审计只记录脱敏 method、host、path、risk、decision。
- CLI 新增最小 `tokenvalve http request` 和 `tokenvalve curl run`，用于验证结构化入口。

## 范围外

- 不实现通用脚本执行（见后续 script phase）。
- 不实现 SSH/git over SSH（见 Phase 12）。
- 不实现完整 curl DSL；Phase 11 只支持结构化 method/url/header/body 和 secret 注入。
- 不实现 MCP tool 暴露（见 MCP phase）。

## 行为

HTTP 请求：

- 用户或上层工具提供 workspace、provider、method、URL、secret field 到 header/query/body 的映射。
- TokenValve resolver 校验 provider binding、adapter allowlist 和 risk。
- risk 为 read 时执行；write/dangerous/unknown 默认 blocked。
- runner 从 secret store 读取 profile secret。
- secret 只注入当前请求。
- response body 返回前脱敏。

Curl template：

- 用户运行 `tokenvalve curl run --workspace <path> --provider github --method GET --url https://api.github.com/user --secret-header Authorization='Bearer {{token}}'`。
- TokenValve resolver 将请求视为 `curl-template` capability。
- runner 生成 `curl` binary + args array，不使用 shell string。
- secret 只出现在当前子进程 args/env 中；审计和输出脱敏。

失败路径：

- host/path 不在 allowlist 时 blocked。
- risk rule 缺失时 blocked。
- secret store 中找不到 secret 时 blocked。
- 非 read risk 没有人类意图时 blocked。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| HTTP 执行 | `HttpRunner` 可注入 | 测试不依赖真实网络。 |
| curl 执行 | `ProcessRunner` + args array | 避免 shell string 和命令注入。 |
| Secret template | `{{field}}` 占位 | 简单、可审计，后续 Recipe 可复用。 |
| 默认风险 | 只执行 read | 写请求需要后续 human intent/policy。 |
| 审计 | 只记录 method/host/path | 避免泄露完整 header/body。 |

## 背景

`tech-stack.md` 要求 HTTP/curl capability 必须结构化表达，不拼 shell string，且 host/path 必须匹配 adapter allowlist。Phase 11 是把 provider API 从特化 runner 推向通用 execution gateway 的关键一步。

## 未决问题

- 更丰富的 body schema、query allowlist 和 response shaping 留给后续 Recipe/MCP 阶段。
- human intent 授权后的 write HTTP 请求留给后续 policy phase。
