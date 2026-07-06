# Plan: SSH Capability

## Group 1 — SSH 执行模型

1.1 新增 core SSH runner 输入/输出类型，覆盖 workspace、provider、host、user、port、operation、known_hosts policy、credential mode 和 session。

1.2 定义内置最小 SSH adapter，包含 `ssh-command` 与 `git-ssh` capability、host allowlist、operation 和 risk rule。

1.3 复用 resolver 的 `host-operation` 路径校验 provider/profile/capability/host/operation/risk。

---

## Group 2 — Credential 注入与执行

2.1 支持 identity file path：从 secret store 读取字段并通过 `ssh -i` 或 `GIT_SSH_COMMAND -i` 注入。

2.2 支持 agent socket：从 secret store 读取字段并只写入当前子进程 `SSH_AUTH_SOCK`。

2.3 支持临时 key 内容：从 secret store 读取字段，创建权限受限的临时文件，执行后清理。

2.4 对 `known_hosts` policy 做显式校验，并转为当前子进程参数，不写全局 known_hosts。

---

## Group 3 — CLI 入口

3.1 新增 `tokenvalve ssh run`，接收结构化 host/user/port/operation/known_hosts/credential 参数和远端命令。

3.2 新增 `tokenvalve git-ssh run`，接收 remote URL、operation、known_hosts/credential 参数和 git args。

3.3 输出执行状态、解析 profile 和脱敏后的 stdout/stderr，不显示明文 secret。

---

## Group 4 — 测试

4.1 新增 core 单元测试，覆盖正确 profile 选择、host allowlist 拒绝、known_hosts 缺失拒绝、production 写拒绝。

4.2 新增 credential 注入测试，验证 identity file、agent socket、`GIT_SSH_COMMAND` 只进入子进程输入。

4.3 新增脱敏测试，验证私钥路径、agent socket 和 remote URL 不出现在 stdout/stderr/audit。

4.4 新增 CLI 测试，验证 `ssh run --help` 与 `git-ssh run --help` 可用。

---

## Group 5 — 验证

5.1 运行 `pnpm install`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`。

5.2 运行 dist CLI help 检查：`node packages/cli/dist/index.js ssh run --help` 与 `node packages/cli/dist/index.js git-ssh run --help`。

5.3 若实现发现 spec 缺失，同步更新 `requirements.md`、`plan.md`、`validation.md`。
