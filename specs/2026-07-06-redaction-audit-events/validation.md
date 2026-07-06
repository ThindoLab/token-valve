# Validation: Redaction and Audit Events

## 自动化检查

| 检查 | 命令 | 期望结果 |
| --- | --- | --- |
| 安装依赖 | `pnpm install` | 安装成功，lockfile 与 package 声明一致。 |
| 构建 | `pnpm build` | 所有 package 构建成功。 |
| 类型检查 | `pnpm typecheck` | TypeScript 无类型错误。 |
| 测试 | `pnpm test` | Vitest 测试全部通过。 |
| Lint | `pnpm lint` | ESLint 检查通过。 |

## 场景验证

### 场景 1：已知 secret 脱敏

输入：

- text: `token is tv_live_secret_123456`
- knownSecrets: `["tv_live_secret_123456"]`

期望：

- 输出不包含 `tv_live_secret_123456`。
- 输出包含 `[REDACTED:known-secret]`。

### 场景 2：HTTP header 和 URL query 脱敏

输入包含：

- `Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz123456`
- `https://api.example.test/v1/projects?access_token=secret-token&safe=value`

期望：

- bearer token 不出现。
- `access_token` 值被替换。
- 非敏感 query `safe=value` 保留。

### 场景 3：SSH / git remote 脱敏

输入包含：

- `git@github.com:ThindoLab/token-valve.git`
- `SSH_AUTH_SOCK=/private/tmp/com.apple.launchd.xxx/Listeners`
- `-i /Users/xing/.ssh/id_ed25519_client`

期望：

- remote repo path、agent socket path、identity file path 不原样出现。
- 输出保留 operation 大意。

### 场景 4：长输出不可安全返回

输入：

- 超过 `maxLength` 的长文本。

期望：

- 返回文本被截断。
- `truncated` 为 `true`。
- `safeToReturn` 为 `false`。

### 场景 5：Audit event 不包含 secret

输入 audit event 包含：

- command args 中的 token。
- HTTP authorization header。
- SSH identity file。
- message 中的 known secret。

期望：

- shaped event 不包含原始 secret。
- event 包含 provider/profile/capability/risk/decision/source/timestamp。
- event 只包含脱敏后的 args/request/operation/message。

## 输出文本检查

- Redaction placeholder 使用稳定格式，例如 `[REDACTED:known-secret]`。
- Audit event 字段名稳定、可读。
- 不出现 TODO、foo、bar 或调试文本。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- audit event shaping 不包含原始 secret。
- stdout/stderr/error/MCP result 可复用同一 redactor API。
- Feature spec 与实现一致。
- `specs/roadmap.md` 中 Phase 4 可被标记完成。
- `CHANGELOG.md` 已更新。
