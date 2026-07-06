# Requirements: Doctor 与加固

## 范围

本 phase 交付 `tokenvalve doctor` 的真实诊断与修复建议，为 Public MVP 前的关键失败路径提供可操作入口。

它包含：

- 诊断缺失 provider binary：`gh`、`supabase`、`vercel`，以及 TokenValve shim 入口。
- 诊断损坏 mapping：profiles、bindings、recipes、custom provider mapping 解析失败或结构不完整。
- 诊断过期、未验证或 disabled profile。
- 诊断 shim path 问题：`~/.tokenvalve/bin` 或指定 configDir 的 `bin` 不在 PATH，或者 shim 优先级异常。
- 诊断 global-switch provider 锁冲突和过期锁。
- 诊断不安全配置和未支持场景，例如 custom provider 缺少 risk rules、profile 绑定缺失、配置中疑似明文 secret。
- 每个问题输出 severity、message 和 next step。
- doctor 输出脱敏，不显示明文 secret。

## 范围外

- 不自动修复文件或删除锁；本 phase 只诊断和建议。
- 不实现完整交互式修复向导。
- 不扫描整个 home 目录或项目源码查找 secret。
- 不替代 Public MVP 文档；文档说明留给 Phase 23。

## 行为

用户运行 `tokenvalve doctor --workspace <path> --config-dir <dir>` 时，会看到分组诊断结果：

- `ok`：当前检查通过。
- `warning`：配置可用但需要注意，例如 profile 未验证。
- `error`：会阻塞执行的问题，例如 binding 指向不存在 profile、custom provider 缺少 risk rule、YAML 损坏。

如果配置目录为空，doctor 不报崩溃，而是提示运行 `tokenvalve init`。

如果文件中出现疑似 secret，doctor 输出 `[REDACTED]`，并建议移除明文 secret、改用 secret store。

## 决策

- Doctor 诊断逻辑放在 `packages/core`，CLI 只负责读取参数和格式化输出。
- 诊断项统一为 `{ id, severity, message, nextStep }`，便于 dashboard 或 MCP 后续复用。
- YAML 损坏检查直接读取配置文件，避免 ProfileInventory 抛错导致整个 doctor 中断。
- Binary 检查可注入 PATH 和 availability，测试不依赖真实机器安装。

## 背景

Phase 22 是 Public MVP 前的加固阶段。`mission.md` 要求 TokenValve fail closed，并返回可操作建议；`tech-stack.md` 要求未知 provider、未知 environment、shim path、global switch 锁冲突等关键失败路径有诊断入口。

## 未决问题

- 是否提供 `tokenvalve doctor --fix` 留到 Public MVP 后根据真实反馈决定。
- 持久 audit store 仍是后续增强；本 phase 只诊断已有配置与运行时锁。
