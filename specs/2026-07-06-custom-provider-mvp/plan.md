# Plan: Custom Provider MVP

## Group 1 — Custom provider 数据模型

1.1 定义 `custom-providers.yaml` 的 TypeScript 类型。

1.2 实现 `CustomProviderStore`，支持保存、读取、列出 provider mapping。

1.3 实现从 custom mapping 生成 `AdapterDefinition[]` 的转换函数。

1.4 增加 secret-like guard，拒绝把明文 secret 写入 mapping。

---

## Group 2 — HTTP 和 script template

2.1 为 HTTP mapping 定义 header、query、body、secret field 模板。

2.2 为 script mapping 定义允许脚本和 env 模板。

2.3 提供按 provider/capability 查找 mapping 的 helper。

---

## Group 3 — 受控 script runner

3.1 新增 `runScriptCommand`，使用 resolver 校验 workspace/provider/profile/capability/risk。

3.2 只允许执行 mapping 声明过的 script。

3.3 只在子进程 env 中注入模板渲染后的 secret。

3.4 输出和 audit 使用现有 redactor 脱敏。

---

## Group 4 — CLI custom provider 入口

4.1 新增 `tokenvalve custom add-http`。

4.2 新增 `tokenvalve custom add-script`。

4.3 新增 `tokenvalve custom list`。

4.4 让 `tokenvalve http request` 优先使用 custom provider mapping。

4.5 新增 `tokenvalve custom script run` 受控执行入口。

---

## Group 5 — 测试

5.1 覆盖 custom provider mapping 保存和 secret-like 拒绝。

5.2 覆盖 custom HTTP token 注入、resolver、redactor、audit。

5.3 覆盖 custom script env 注入只作用于子进程。

5.4 覆盖缺少 risk rules 时 fail closed。

5.5 覆盖 CLI add/list/http/script 主流程。

---

## Group 6 — 验证

6.1 跑 `pnpm install`。

6.2 跑 `pnpm build`。

6.3 跑 `pnpm typecheck`。

6.4 跑 `pnpm test`。

6.5 跑 `pnpm lint`。
