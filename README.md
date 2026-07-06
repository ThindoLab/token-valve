# TokenValve

默认语言：中文 | [English](README.en.md)

TokenValve 是一个面向 AI 编程 Agent 和开发者 CLI 的本地密钥管理器、凭证中转层和执行网关。

它帮助 Codex、Claude Code、Pi Agent、本地脚本、HTTP 请求、SSH 和 provider CLI 在当前 workspace 使用正确的本地凭证，同时避免把原始密钥交给 Agent、把 `.env` 写进项目目录，或依赖容易冲突的全局登录状态。

## 它是什么

- macOS-first 的本地 CLI 和 TypeScript library，用于按 workspace/profile 路由凭证。
- GitHub、Supabase、Vercel、HTTP/curl、SSH/git-over-SSH、LLM API key 和 custom provider 的单次执行凭证中转层。
- 对 production 写操作提供本地 human intent 授权。
- 提供脱敏 dashboard 和 doctor，用于解释本地密钥状态与配置问题。
- 为 MCP tools 和 Skill onboarding 流程提供基础能力。

## 它不是什么

- 不是云端密钥库或团队密钥共享服务。
- 不是 1Password、Bitwarden、Vault 或 macOS Keychain 的完整替代品。
- 不是针对恶意 Agent 任意本地命令执行的沙箱。
- MVP 阶段不提供完整 Web UI。

## 环境要求

- macOS
- Node.js 22+
- pnpm
- 根据工作流可选安装 provider CLI：`gh`、`supabase`、`vercel`、`ssh`、`git`、`curl`

## 从源码安装

```bash
git clone https://github.com/ThindoLab/token-valve.git
cd token-valve
pnpm install
pnpm build
node packages/cli/dist/index.js doctor --workspace "$PWD" --config-dir "$PWD/.tokenvalve"
```

本地开发时可以直接通过构建后的 CLI 运行：

```bash
node packages/cli/dist/index.js --help
```

## 快速开始

显式初始化 workspace 和 provider：

```bash
node packages/cli/dist/index.js init \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --provider github \
  --provider supabase \
  --provider vercel \
  --llm-key openai-work \
  --yes
```

添加一个 GitHub profile。真实 token 只应进入 CLI 或本地受控输入路径，不要粘贴进 Agent 对话：

```bash
node packages/cli/dist/index.js secret add \
  --config-dir "$PWD/.tokenvalve" \
  --workspace "$PWD" \
  --profile github-personal \
  --provider github \
  --environment development \
  --secret-value "<github-token>" \
  --yes
```

验证 profile：

```bash
node packages/cli/dist/index.js secret test github-personal \
  --config-dir "$PWD/.tokenvalve"
```

使用单次执行凭证注入运行安全的 GitHub 命令：

```bash
node packages/cli/dist/index.js github run \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  -- repo view
```

打开脱敏 dashboard：

```bash
node packages/cli/dist/index.js dashboard \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve"
```

遇到配置或执行问题时运行 doctor：

```bash
node packages/cli/dist/index.js doctor \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve"
```

## Provider 示例

查看 [docs/provider-examples.md](docs/provider-examples.md)，里面包含 GitHub、Supabase、Vercel、LLM、HTTP/curl、SSH 和 custom provider 示例。

## MCP 与 Skills

查看 [docs/mcp-and-skills.md](docs/mcp-and-skills.md)，了解 MCP 工具边界和 Skill onboarding 示例。

简短版本：

- MCP 是能力边界。
- Skill 是编排层。
- Secret 应通过本地受控输入进入系统，不应进入 Agent chat。
- 已验证 Recipe 的元数据可以被后续 Agent 复用。

## Recipes

示例位于 [recipes/examples](recipes/examples)。

Recipe 文件描述 provider、profile、capability、workspace、risk 和 validation 元数据。它们绝不能包含原始 secret。

## Production 写操作

Production 写操作和危险操作需要显式本地 human intent：

```bash
node packages/cli/dist/index.js use \
  --workspace "$PWD" \
  --provider vercel \
  --profile vercel-prod \
  --environment production \
  --risk production_deploy \
  --ttl 10m \
  --yes
```

## 安全边界

阅读 [docs/threat-model.md](docs/threat-model.md)。

TokenValve 用来降低误泄露、错误 profile 执行、全局 auth 状态竞态和未经确认的 production 写操作风险。它不声称能封住一个可以任意执行本地命令的恶意 Agent。

## 已知限制与 Backlog

阅读 [docs/known-limitations.md](docs/known-limitations.md)。

重点限制：

- MVP macOS-first。
- 当前只提供源码安装。
- 暂无完整 Web UI。
- 不是团队云端 vault。
- 不是 hostile-agent sandbox。

## 开发

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```
