# Requirements: Public MVP

## 范围

本 phase 交付公开可安装的 macOS MVP 文档与示例，让外部用户能理解、安装、配置并安全试用 TokenValve。

它包含：

- 根目录 `README.md`。
- 安装说明。
- 快速开始。
- GitHub、Supabase、Vercel、LLM、custom provider 示例。
- MCP client 配置说明。
- Skill onboarding 示例。
- Recipe 示例。
- Threat model 和安全边界说明。
- 已知限制和 Backlog。

## 范围外

- 不发布 npm 包或 Homebrew tap。
- 不实现 Web UI。
- 不承诺 Linux/Windows 可用。
- 不把 TokenValve 描述为完整团队 vault 或恶意 Agent 沙箱。

## 行为

公开用户打开 README 后，应该能看到：

1. TokenValve 是什么、不是什么。
2. macOS 上如何安装依赖、构建 CLI、运行 doctor。
3. 如何配置多套 LLM key、GitHub、Supabase、Vercel 和一个 custom provider。
4. 如何通过 MCP/Skill onboarding 新增密钥并沉淀 Recipe。
5. 如何让 Agent 安全运行 CLI、HTTP/curl、SSH/git-over-SSH 和 custom script。
6. 为什么 production 写操作需要 human intent。
7. 如何通过 dashboard 解释当前密钥状态。

## 决策

- Public MVP 文档以 repo 内 Markdown 为主，不依赖外部站点。
- 示例放在 `recipes/examples/`，便于用户复制思路但不包含明文 secret。
- Threat model 单独放在 `docs/threat-model.md`，避免 README 过长。
- MCP/Skill 说明单独放在 `docs/mcp-and-skills.md`，对应 Agent 集成场景。

## 背景

Phase 23 是“等用户确认前”的最后阶段。目标不是再扩功能，而是确保公开用户能安装、理解安全边界，并按成功标准走通核心场景。

## 未决问题

- 未来是否发布 npm 包或 Homebrew tap 留到 Public MVP 后确认。
- 真实 Codex/Claude/Pi Agent 的最终 Skill 包装格式仍可能随宿主变化调整。
