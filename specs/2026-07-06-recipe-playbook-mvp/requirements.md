# Requirements: Recipe / Playbook MVP

## 范围

本 feature 对应 `specs/roadmap.md` 的 Phase 17：Recipe / Playbook MVP。

它要实现可验证、可复用的 Recipe。Recipe 是经过验证的结构化配置方案，保存 provider、profile、capability、workspace binding、risk rules、验证步骤和脱敏验证结果；不保存明文 secret。后续 Skill 可以基于 Recipe 引导新增密钥，本阶段先交付 core schema/store、CLI `recipe list/show/test`，并让 MCP `recipe_save` / `recipe_list` 使用同一套持久化存储。

包含：

- core 新增 Recipe schema。
- core 新增 `RecipeStore`，读写 `recipes.yaml`。
- Recipe 状态：`draft`、`verified`、`failed`、`stale`、`disabled`。
- 支持保存 provider/profile/capability/workspace binding/risk rules。
- 支持保存验证步骤和脱敏验证结果。
- CLI 新增 `tokenvalve recipe list/show/test`。
- MCP `recipe_save` / `recipe_list` 改为持久化实现。
- 未验证 Recipe 不能用于自动写操作。
- verified Recipe 可用于相同 workspace/capability 的 profile 解析建议。

## 范围外

- 不实现 Skill 编排（见 Phase 18）。
- 不实现真实 provider 验证脚本 DSL；本阶段验证步骤是结构化 metadata，测试执行为最小本地规则。
- 不自动改写用户 workspace binding，Recipe 只提供 verified binding 建议。
- 不把 Recipe 作为绕过 resolver/policy 的后门。

## 行为

保存 Recipe：

- 用户或 MCP 保存 Recipe metadata。
- 如果 payload 中包含 `secretValue`、`token`、`apiKey`、`privateKey` 等明文字段，拒绝。
- 新 Recipe 默认 `draft`。
- Recipe 写入 `recipes.yaml`。

验证 Recipe：

- `tokenvalve recipe test <id>` 读取 Recipe。
- 如果 Recipe 指向的 provider/profile/workspace/capability 存在，状态变为 `verified`。
- 保存脱敏验证结果、`lastVerifiedAt`。
- 如果复测失败，原 verified Recipe 状态变为 `stale`，draft/failed Recipe 状态变为 `failed`。

解析建议：

- core 可以按 workspace/capability 查找 verified Recipe。
- 找到时返回 provider/profile/capability/environment/risk rules。
- 未 verified/disabled/stale/failed Recipe 不参与自动写操作建议。

## 决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 存储 | `recipes.yaml` | 与本地配置模型一致，且可审计。 |
| 状态 | draft/verified/failed/stale/disabled | 满足 roadmap，区分未验证、验证失败和复测失效。 |
| 验证方式 | MVP 做 metadata 验证 | 不提前发明脚本 DSL，Phase 18 Skill 可补真实流程。 |
| 自动使用 | 只返回 verified Recipe 建议 | 不绕过 resolver，也避免未验证 Recipe 自动写。 |
| Secret | 明文 secret 字段直接拒绝 | Recipe 只能保存映射和脱敏结果。 |

## 背景

`mission.md` 要求新增密钥后沉淀 verified Recipe，下次相同 workspace/capability 可自动使用验证过的方案。`tech-stack.md` 要求 Recipe 不保存明文 secret，且未验证 Recipe 不能提升为自动执行方案。

Phase 17 是 Phase 18 Skill 编排的地基。

## 未决问题

- 真实验证步骤如何调用 provider runner 留给 Skill/Recipe 迭代。
- Recipe 与 adapter YAML 的长期合并策略留给 Public MVP 前 replan。
