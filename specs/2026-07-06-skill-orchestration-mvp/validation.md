# Validation: Skill 编排 MVP

## 自动化检查

在仓库根目录执行：

| 命令 | 期望 |
| --- | --- |
| `pnpm install` | 依赖安装成功，lockfile 不出现非预期变化 |
| `pnpm build` | 所有 workspace package 构建成功 |
| `pnpm typecheck` | TypeScript 检查通过 |
| `pnpm test` | 所有 Vitest 测试通过 |
| `pnpm lint` | ESLint 通过 |

## 场景验证

### 场景 1：GitHub key onboarding 主流程

输入：

- provider：`github`
- profile：`github-personal`
- workspace：当前仓库路径
- capability：`cli-command`
- risk：`read`
- verification：passed

步骤：

1. 调用 Skill 编排 API 创建 onboarding plan。
2. 检查返回状态。
3. 检查 MCP 调用草案。
4. 用 passed verification 继续流程。

期望：

- 初始计划提示用户通过本地受控输入提供 secret，而不是粘贴进 Agent 对话。
- 计划包含 `secret_profile_create` 和 `secret_profile_test` 调用草案。
- passed 后生成 `recipe_save` 调用草案。
- `recipe_save` 的 Recipe 状态为 `verified`。
- 输出里没有明文 token。

### 场景 2：缺少必要信息

输入：

- provider：`github`
- 不提供 profile 或 workspace

步骤：

1. 调用 Skill 编排 API 创建 onboarding plan。

期望：

- 返回 `needs_input`。
- 明确列出缺失的 profile / workspace。
- 不生成 `recipe_save` 调用草案。

### 场景 3：验证失败

输入：

- provider：`supabase`
- profile、workspace、capability 齐全
- verification：failed

步骤：

1. 创建 onboarding plan。
2. 用 failed verification 继续流程。

期望：

- 返回 `failed`。
- 输出修复建议。
- 不生成状态为 `verified` 的 Recipe。
- 不声称该配置可自动执行。

### 场景 4：LLM key onboarding

输入：

- provider：`llm`
- llmProvider：`openai`
- profile：`openai-work`
- capability：`llm-api-key`
- workspace：当前仓库路径

步骤：

1. 调用 Skill 编排 API 创建 onboarding plan。

期望：

- 计划包含 LLM provider metadata。
- 计划说明通过本地受控输入录入 API key。
- MCP 参数不包含明文 API key。

### 场景 5：Custom secret onboarding

输入：

- provider：`custom`
- profile：`internal-api`
- capability：`http-request`
- workspace：当前仓库路径

步骤：

1. 调用 Skill 编排 API 创建 onboarding plan。

期望：

- 返回 generic custom secret 计划。
- 明确说明完整 mapping 将作为后续配置项补齐。
- 不生成无法验证的 verified Recipe。

### 场景 6：疑似 secret 被拒绝

输入：

- provider：`github`
- profile metadata 中包含 `ghp_abcdefghijklmnopqrstuvwxyz1234567890`

步骤：

1. 调用 Skill 编排 API 创建 onboarding plan。

期望：

- 返回失败或拒绝结果。
- 错误信息说明不要把明文 secret 放入 Agent 输入。
- 输出不回显原始 secret。

## 输出文本检查

- 用户可见文案使用中文，语气直接、可操作。
- 不出现“请把 key 粘贴到聊天里”等不安全引导。
- 不出现 TODO、debug、placeholder 文案。
- 不显示明文 secret、Bearer token、private key 或完整 API key。

## 完成条件

- 自动化检查全部通过。
- 场景验证可由测试或手动调用证明。
- `packages/skills` 的实现不直接读取 secret store。
- 规格文件和实现一致。
- `CHANGELOG.md` 已更新。
- `specs/roadmap.md` 中 Phase 18 已标记完成。
