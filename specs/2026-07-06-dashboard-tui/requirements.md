# Requirements: Dashboard / TUI

## 范围

本 phase 交付 `tokenvalve dashboard` 轻量可视化入口，用 rich CLI/TUI 风格展示本地 TokenValve 状态，并提供安全切换默认 profile 的入口。

它包含：

- 展示 provider/profile/LLM key 库存。
- 展示当前 workspace 默认绑定。
- 展示 active intent 和剩余 TTL。
- 展示最近审计摘要的占位与当前可用来源。
- 展示 doctor 状态。
- 展示 custom provider mapping 摘要。
- 支持 `dashboard use` 安全切换 workspace 默认 profile。
- 所有显示内容脱敏，不显示 secretLength、原始 secret、Bearer token、private key 或完整 API key。

## 范围外

- 不实现完整 Web UI。
- 不启动本地浏览器或 HTTP server。
- 不提供复制明文 key 的按钮或命令。
- 不实现复杂交互式键盘导航；本 phase 先交付可脚本化、可测试的 rich CLI 输出。
- 不新增独立 audit 持久化存储；如果没有持久 audit 来源，dashboard 明确显示当前没有持久审计摘要。

## 行为

用户运行 `tokenvalve dashboard --workspace <path>` 时，会看到一个脱敏状态面板：

- 当前 workspace。
- 每个 workspace binding 对应的 provider、profile、environment。
- profile 库存和状态，能看出 verified、unverified、expired、disabled 等状态。
- active intent 列表和到期时间。
- Recipe 状态摘要。
- Custom provider capability 摘要。
- Doctor 结果。

用户运行 `tokenvalve dashboard use --workspace <path> --provider <name> --profile <id> --yes` 时，TokenValve 只更新该 workspace/provider 的默认 profile binding，不修改 secret value，不修改全局 CLI auth 状态。

## 决策

- Dashboard 使用 rich CLI 输出，不引入 Ink 等新依赖。当前 monorepo 已有 `packages/dashboard`，先把渲染内核做成纯函数，CLI 调用它。
- CLI 子命令提供安全切换默认 profile，而不是在渲染输出里做复制/编辑。
- Dashboard snapshot 由 CLI 读取 core store 后传给 dashboard 包，dashboard 包不直接读文件系统，便于测试和后续接 TUI/Web。
- 审计摘要本 phase 不伪造；没有持久审计来源时显示 “no persistent audit source yet”。

## 背景

`mission.md` 要求用户能看见本地有哪些 provider/profile/LLM key、当前 workspace 默认选什么、最近哪些执行被允许或拒绝，以及哪里需要修复，但绝不能显示明文 secret。

`tech-stack.md` 明确 MVP 不做完整 Web 控制台，dashboard 可以是 TUI 或 rich CLI，并复用 CLI/core 能力。

## 未决问题

- 真实持久 audit store 留给后续 doctor/加固或 replanning。
- 后续是否升级为 Ink TUI 或 Web，需要等 Public MVP 后基于使用反馈决定。
