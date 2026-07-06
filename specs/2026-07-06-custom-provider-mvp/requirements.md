# Requirements: Custom Provider MVP

## 范围

本 phase 交付数据驱动 custom provider mapping，让用户可以把非内置 provider 的密钥映射到受控 HTTP 请求和受控脚本执行中，并继续走统一 resolver、redactor、audit。

它包含：

- 在本地配置目录保存 `custom-providers.yaml`。
- 定义 custom provider capability mapping：HTTP request、curl template、script command、SSH context、LLM profile。
- 支持 secret field 映射到 HTTP header、query、body 和 script env。
- 支持 custom risk rules。
- 支持验证步骤元数据。
- CLI 新增 custom provider mapping 的创建和查看入口。
- HTTP 请求可以读取 custom provider mapping，并使用对应 secret template。
- 受控 script command 可以读取 custom provider mapping，并以子进程 env 注入 secret。
- 缺少 risk rules 时 fail closed。

## 范围外

- 不实现完整 custom provider 图形化编辑器（见 Phase 20 Dashboard / TUI）。
- 不实现任意 shell string 执行；script command 必须是 mapping 中声明过的脚本路径。
- 不把明文 secret 写入 custom provider mapping。
- 不实现完整 SSH/custom LLM 执行链路；本 phase 只把 SSH/LLM mapping 纳入数据模型，真实执行继续由后续阶段扩展。
- 不做团队共享或云端 provider marketplace。

## 行为

用户可以先用 `tokenvalve secret add` 创建 custom provider 的 profile 和 secret field，再用 custom provider 命令声明 capability mapping。

HTTP mapping 声明 allowed host、path prefix、method、risk rule 和 secret header/query/body template。执行 `tokenvalve http request` 时，如果 provider/capability 命中 custom mapping，TokenValve 使用该 mapping 的 adapter 和 secret template，而不是临时放宽请求范围。

Script mapping 声明允许执行的 script、risk rule 和 env template。执行 custom script 时，TokenValve 只运行 mapping 中声明过的 script，并只在子进程 env 中注入对应 secret，不修改父进程环境。

如果 custom provider 没有 risk rule，resolver 返回 `risk_unknown` 并拒绝执行。

所有输出和 audit 都必须脱敏，不展示原始 token、API key、private key 或 Bearer credential。

## 决策

- custom provider mapping 放在 `packages/core`，因为 resolver、runner、CLI 和未来 MCP 都需要复用同一份数据模型。
- 本 phase 使用 YAML 文件 `custom-providers.yaml`，和现有 `profiles.yaml`、`bindings.yaml`、`recipes.yaml` 保持一致。
- mapping 只保存 secret field 名和 template，不保存 secret value。
- HTTP / script 是本 phase 的真实执行闭环；SSH / LLM 先作为 mapping schema 保留，避免把 Phase 19 扩大成多个 runner 的重写。
- CLI 入口命名为 `tokenvalve custom ...`，把 provider mapping 管理和 secret profile 管理分开。
- risk rules 由用户显式声明；没有规则时一律 fail closed。

## 背景

`mission.md` 要求 TokenValve 不只服务 GitHub、Supabase、Vercel，也要能成为通用凭证中转层，覆盖 Supabase curl、内部 API、脚本、SSH 和 LLM key 等场景。

`tech-stack.md` 要求 adapter 尽量数据驱动，让新增 provider 不需要改 resolver 主控制流；custom provider 应能把 secret field 映射到 env、HTTP header、request template、SSH context 或 LLM provider profile。

因此本 phase 的核心不是“内置更多 provider”，而是把 provider 扩展点落成可保存、可审计、可验证的本地配置。

## 未决问题

- SSH 和 LLM custom mapping 的真实执行细节留到后续 phase 或 replanning；本 phase 先保证 schema 能表达。
- Web/TUI 的可视化编辑留给 Phase 20。
- Script path 的安全策略本 phase 采用显式白名单，后续可增加 hash 校验或签名。
