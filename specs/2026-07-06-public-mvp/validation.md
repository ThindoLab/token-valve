# Validation: Public MVP

## 自动化检查

| 命令 | 期望 |
| --- | --- |
| `pnpm install` | 成功完成 |
| `pnpm build` | 所有 package 构建成功 |
| `pnpm typecheck` | TypeScript 检查通过 |
| `pnpm test` | 所有 Vitest 测试通过 |
| `pnpm lint` | ESLint 通过 |
| `rg -n "ghp_|github_pat_|sk-[A-Za-z0-9_-]{16,}|BEGIN .*PRIVATE KEY|Bearer [A-Za-z0-9._-]{16,}" README.md docs recipes` | 不出现真实 secret-like 示例 |

## 场景验证

### 场景 1：公开 macOS 用户安装

步骤：阅读 README 的安装部分。

期望：用户知道需要 Node.js 22+、pnpm，如何 build CLI，如何运行 doctor。

### 场景 2：配置多套 key

步骤：阅读 provider examples。

期望：用户能找到 GitHub、Supabase、Vercel、LLM、custom provider 的命令示例，且没有明文 secret。

### 场景 3：Agent 集成

步骤：阅读 MCP / Skill 文档。

期望：用户知道 MCP 是能力边界、Skill 是编排层，新增 key 不应粘贴到 Agent 对话。

### 场景 4：Recipe

步骤：阅读 Recipe 示例。

期望：用户知道 verified Recipe 如何复用，以及失败验证不会沉淀为自动执行方案。

### 场景 5：安全边界

步骤：阅读 threat model。

期望：用户知道 MVP 能降低误用和泄露风险，但不是恶意 Agent 沙箱或团队云 vault。

## 完成条件

- 自动化检查全部通过。
- README/docs/examples 覆盖 roadmap Phase 23 范围。
- 文档不包含真实 secret-like 示例。
- `CHANGELOG.md` 已更新。
- `specs/roadmap.md` 中 Phase 23 已标记完成。
