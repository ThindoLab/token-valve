# Requirements: Global Switch Compatibility

## 范围

本 phase 交付显式 opt-in 的 global-switch compatibility layer，用于极少数无法通过 env injection 或 isolated config 工作的 provider CLI。

它包含：

- adapter 必须显式声明支持 `global-switch`。
- provider 级互斥锁。
- 短 TTL。
- 执行前状态快照。
- 执行后恢复，失败时返回明确修复建议。
- 所有 global switch 操作产出审计事件。
- 默认 GitHub/Supabase/Vercel runner 不使用 global switch。

## 范围外

- 不把 GitHub/Supabase/Vercel 默认路径改成 global switch。
- 不实现排队等待；锁冲突时 fail closed。
- 不执行真实 provider 的 `auth switch` 命令；本 phase 提供可测试的兼容抽象和 handler 契约。
- 不在锁文件中保存 secret。

## 行为

调用方必须传入声明 `executionModes: ["global-switch"]` 的 adapter，并提供 global switch handler。执行开始前 TokenValve 获取 provider 锁并保存状态快照；执行结束后调用 restore。若执行或 restore 失败，结果中必须包含修复建议并写入 audit。

如果 adapter 没有显式支持 global-switch，直接拒绝。

如果同 provider 锁仍在 TTL 内，直接拒绝。

## 决策

- global-switch 作为独立 core 模块，不接入默认 runner，避免误把兼容策略变成默认策略。
- 锁文件放在 `runtime/global-switch-locks/`，只保存 provider、holder、expiresAt、snapshot 摘要，不保存 secret。
- TTL 默认 30 秒，调用方可以传更短或更长，但必须显式。

## 背景

`mission.md` 和 `tech-stack.md` 都强调全局账号切换只能作为兼容策略，且必须有锁、TTL、审计和恢复。Phase 21 的目标是把这个边界落成代码，而不是鼓励使用全局切换。
