# Requirements: Redaction and Audit Events

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 4：脱敏与审计事件。

它要在 `packages/core` 内交付统一 redactor 和 audit event shaping。后续 CLI、MCP、shim、HTTP、SSH 执行层都应复用这套能力，避免 stdout、stderr、错误、MCP result 和审计事件泄露 secret。

包含：

- 脱敏调用方明确传入的已知 secret 值。
- 脱敏常见 token-like patterns。
- 脱敏 HTTP Authorization header、URL query token、SSH remote、agent socket、identity file 等敏感片段。
- 对无法可靠安全返回的输出进行截断，并标记为 `unsafe_truncated`。
- 生成结构化 audit event。
- audit event 记录 provider、profile、capability、risk、decision、source、timestamp、session metadata。
- audit event 默认只保存脱敏后的 command args、HTTP request summary、SSH operation summary、message。

## 范围外

- 不写入 `audit.log` 文件；文件存储和轮转留给后续 CLI/Doctor 阶段。
- 不实现真实命令执行或输出捕获；Phase 4 只提供纯函数。
- 不实现 secret store；已知 secret 值由调用者传入。
- 不实现 MCP tool result 集成；Phase 16 复用 core redactor。
- 不实现完整 hostile-agent 防护；只降低误泄露风险。

## 行为

正常路径：

- 调用 `redactText(text, { knownSecrets })` 时，已知 secret 被替换为 `[REDACTED:known-secret]`。
- 常见 token-like 字符串被替换为对应占位符。
- HTTP `Authorization: Bearer ...` 被脱敏。
- URL query 中的 `token`、`access_token`、`api_key`、`key` 被脱敏。
- SSH remote 和 agent socket 输出中敏感路径被脱敏。
- audit event 只记录脱敏后的 args/request/operation/message。

失败或边界路径：

- 空 secret、过短 secret 不进入 known secret redaction，避免误伤普通文本。
- 输出超过限制时被截断，并返回 `safeToReturn: false`、`truncated: true`。
- 如果 redactor 发现疑似 secret 但无法确信完整处理，调用方可以使用 `redactForReturn` 的安全标记决定不返回原文。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| Redactor 形态 | 纯函数，无全局状态 | 便于 CLI/MCP/shim/runner 复用和测试。 |
| Known secret 最小长度 | 默认 8 个字符 | 降低把普通短词全部替换的误伤风险。 |
| Token pattern | 覆盖 GitHub、OpenAI、Anthropic、JWT、generic bearer-ish token | MVP 先覆盖高频误泄露形态，后续可扩展。 |
| Audit event | 只做 shaping，不落盘 | Phase 4 专注结构与脱敏，存储留给后续。 |
| 长输出 | 默认截断并标记不安全返回 | 符合“无法可靠脱敏时截断”的验收要求。 |

## 背景

`mission.md` 要求 TokenValve 不把原始密钥交给 Agent，不让密钥进入日志、项目文件或 MCP 返回值。

`tech-stack.md` 明确 core 负责 redaction 和 audit event shaping，并要求带 secret 的 HTTP/SSH/命令审计只记录脱敏后的摘要。

Phase 4 是后续 execution gateway 的安全底座。此阶段不负责判断命令能否执行，只负责让后续任何输出与审计都先过统一脱敏层。

## 未决问题

- Token pattern 后续会根据真实 provider 增补。
- `safeToReturn` 的最终策略可能在 MCP/runner 阶段进一步收紧。
- audit event 文件格式和轮转策略留给后续 audit list / doctor 相关阶段。
