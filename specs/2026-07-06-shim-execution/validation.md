# Validation: Shim Execution

## 自动化检查

| 命令 | 期望结果 |
| --- | --- |
| `pnpm install` | 依赖安装成功，无 lockfile 异常。 |
| `pnpm build` | 所有 package 构建成功。 |
| `pnpm typecheck` | TypeScript 检查通过。 |
| `pnpm test` | 全部 Vitest 测试通过。 |
| `pnpm lint` | lint 通过。 |

## 场景验证

### 场景 1：PATH 中 shim 在前时找到真实 binary

输入：

- shim name: `gh`
- current shim path: `/tmp/tokenvalve-bin/gh`
- PATH: `/tmp/tokenvalve-bin:/usr/local/bin`
- fake filesystem 中 `/usr/local/bin/gh` 存在

步骤：

1. 调用 `findRealBinary`。

期望：

- 返回 `/usr/local/bin/gh`。
- 不返回 `/tmp/tokenvalve-bin/gh`。

### 场景 2：避免递归调用自己

输入：

- shim name: `gh`
- PATH 只包含 current shim 所在目录。

步骤：

1. 调用 `runShim`。

期望：

- `executed` 为 `false`。
- exitCode 为 `1`。
- fake process runner 没有被调用。
- stderr 提示找不到真实 binary 或避免递归。

### 场景 3：使用 args array 转发

输入：

- shim name: `supabase`
- args: `["projects", "list"]`
- 真实 binary: `/usr/local/bin/supabase`

步骤：

1. 调用 `runShim`。
2. 检查 fake process runner 记录。

期望：

- command 为 `/usr/local/bin/supabase`。
- args 精确等于 `["projects", "list"]`。
- 没有 shell string 字段。

### 场景 4：env 只进入子进程

输入：

- env 注入 `{ GH_TOKEN: "ghp_secret_value_1234567890" }`。

步骤：

1. 记录调用前 `process.env.GH_TOKEN`。
2. 调用 `runShim`。
3. 检查 fake process runner 和调用后 `process.env.GH_TOKEN`。

期望：

- fake process runner 收到 `GH_TOKEN`。
- 父进程 `process.env.GH_TOKEN` 没有变化。

### 场景 5：输出脱敏

输入：

- fake process runner stdout/stderr 中包含 `ghp_secret_value_1234567890`。

步骤：

1. 调用 `runShim`。

期望：

- 返回 stdout/stderr 不包含原始 token。
- 输出包含 `[REDACTED:known-secret]` 或 token pattern redaction。

## 输出文本检查

- 错误信息说明缺少真实 binary 或不支持的 shim 名称。
- 不出现调试输出、明文 secret、完整 token。

## 完成条件

- 自动化检查全部通过。
- 场景验证完成，无阻塞性问题。
- shim 实现与本 spec 一致。
- `specs/roadmap.md` Phase 14 可标记为已完成。
- `CHANGELOG.md` 已更新。
