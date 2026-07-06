# Validation: Custom Provider MVP

## 自动化检查

| 命令 | 期望 |
| --- | --- |
| `pnpm install` | 成功完成 |
| `pnpm build` | 所有 package 构建成功 |
| `pnpm typecheck` | TypeScript 检查通过 |
| `pnpm test` | 所有 Vitest 测试通过 |
| `pnpm lint` | ESLint 通过 |
| `node packages/cli/dist/index.js custom add-http --help` | 显示 custom HTTP mapping 帮助 |
| `node packages/cli/dist/index.js custom add-script --help` | 显示 custom script mapping 帮助 |
| `node packages/cli/dist/index.js custom script run --help` | 显示 custom script 运行帮助 |

## 场景验证

### 场景 1：新增 custom API token 并用于 HTTP 请求

输入：

- custom provider：`internal-api`
- profile：`internal-api:default`
- capability：`internal-status`
- secret field：`token`
- method：`GET`
- host：`internal.example.test`
- path prefix：`/status`
- secret header：`Authorization: Bearer {{token}}`

步骤：

1. 用 `tokenvalve secret add` 保存 profile 和 secret。
2. 用 `tokenvalve custom add-http` 保存 mapping。
3. 用 `tokenvalve http request --provider internal-api --capability internal-status` 执行请求。

期望：

- resolver 允许该 GET 请求。
- HTTP runner 收到 `Authorization` header。
- CLI 输出和 audit 不包含原始 token。

### 场景 2：新增 custom env secret 并用于受控 script

输入：

- provider：`internal-tool`
- profile：`internal-tool:default`
- capability：`internal-script`
- script：一个 mapping 中声明过的脚本路径
- env：`INTERNAL_TOKEN={{token}}`

步骤：

1. 保存 profile 和 mapping。
2. 执行 `tokenvalve custom script run --provider internal-tool --capability internal-script --script <path>`。

期望：

- 子进程 env 包含 `INTERNAL_TOKEN`。
- 父进程环境不被修改。
- 输出和 audit 不包含原始 token。

### 场景 3：缺少 risk rules 时拒绝

输入：

- custom provider 有 capability，但没有 risk rule。

步骤：

1. 调用 resolver 或执行对应 HTTP/script。

期望：

- 返回 blocked。
- reason 为 `risk_unknown`。
- 不执行 HTTP 请求或脚本。

### 场景 4：mapping 中出现疑似 secret

输入：

- header 或 env template 中直接写入 `ghp_...`、`sk-...` 或 Bearer token。

步骤：

1. 调用 custom mapping 保存逻辑。

期望：

- 保存被拒绝。
- 错误信息不回显完整 secret。
- `custom-providers.yaml` 不写入该值。

## 输出文本检查

- CLI 文案说明 custom provider mapping 已保存，不显示明文 secret。
- 失败时给出下一步，例如补 risk rule、补 profile、补 workspace binding。
- 不出现 TODO、debug 或占位文案。

## 完成条件

- 自动化检查全部通过。
- custom provider HTTP 和 script 主流程有测试覆盖。
- 缺少 risk rules 的 fail closed 有测试覆盖。
- 规格文件和实现一致。
- `CHANGELOG.md` 已更新。
- `specs/roadmap.md` 中 Phase 19 已标记完成。
