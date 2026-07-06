# Requirements: Shim Execution

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 14：Shim Execution。

它要把 `packages/shims` 从占位包推进为可复用的 PATH shim 转发层。TokenValve 可以为 `gh`、`supabase`、`vercel` 这三个命令提供 shim 入口：当 shim 位于 PATH 前面时，它能找到 PATH 中后面的真实 binary，避免递归调用自己，并用 binary + args array 转发执行。转发过程只把凭证或隔离 env 注入当前子进程，stdout/stderr 经过脱敏后返回。

包含：

- 支持 shim 名称 `gh`、`supabase`、`vercel`。
- 根据当前 shim 路径和 PATH 查找下一个真实 binary。
- 避免递归调用 shim 自己。
- 使用 `ProcessRunner` 的 command + args + env，不使用 shell string。
- 支持注入当前子进程 env，不改变父进程环境。
- stdout/stderr 经过 redactor 脱敏。
- 提供 `runShim`、`findRealBinary` 等可测试 API。
- 提供可作为 bin 入口使用的 `main` 函数。

## 范围外

- 不实现完整 PATH 安装器或写入 shell profile。
- 不实现 `tokenvalve exec` 统一命令面；本阶段只做 shim 包能力。
- 不实现 human intent 授权（见 Phase 15）。
- 不实现 MCP 暴露（见 Phase 16）。
- 不实现真实 provider credential 解析；shim 与 direct runner 一致性先通过 provider/env 注入接口和 tests 保证，后续阶段再把 shim 与完整 CLI config 串起来。

## 行为

正常路径：

- 用户的 PATH 中 `~/.tokenvalve/bin/gh` 排在真实 `gh` 前面。
- shim 启动后知道自己正在代理 `gh`。
- shim 从 PATH 中跳过自身所在路径，找到后面的真实 `gh`。
- shim 调用 `ProcessRunner.run({ command: realGhPath, args, env })`。
- 子进程输出被脱敏后返回。

失败路径：

- shim 名称不是 `gh`、`supabase`、`vercel` 时拒绝。
- PATH 中找不到真实 binary 时拒绝，并给出可操作错误。
- PATH 只找到 shim 自己时拒绝，避免递归。
- 子进程输出中出现 token、Authorization、SSH remote 等敏感信息时脱敏。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 支持命令 | 先支持 `gh`、`supabase`、`vercel` | 与 roadmap 和已完成 provider runner 对齐。 |
| 查找真实 binary | 从 PATH 顺序查找，跳过当前 shim 文件和当前 shim 目录中的同名文件 | 解决 shim 在 PATH 前时的递归问题。 |
| 执行方式 | `ProcessRunner` + args array | 避免 shell string 注入风险，并复用现有测试模式。 |
| 输出处理 | 捕获并脱敏 stdout/stderr 后返回 | 当前 ProcessRunner 是 capture 模型；真实流式转发可在同一接口后续扩展。 |
| env 注入 | 只传给子进程，不写父进程 `process.env` | 满足并发 Agent 不污染全局状态的要求。 |

## 背景

`tech-stack.md` 要求 PATH shims 查找真实 binary 时避免递归、使用 args array、不保留 secret 到父进程，并与 direct runner 行为一致。Phase 14 是把直接 CLI runner 进一步接近真实开发者工作流的过渡阶段：用户后续可以把 shim 放到 PATH 前，让普通 `gh`、`supabase`、`vercel` 命令进入 TokenValve 的受控执行路径。

## 未决问题

- shim 安装目录、文件生成和 shell 配置更新留给后续 init/install 体验。
- 真正流式 passthrough 的进度显示和 backpressure 留给 shim runtime 增强。
- shim 如何读取完整本地 config 并路由到 provider runner，可在后续 `tokenvalve exec` / MCP phase 中整合。
