# Validation: Local Web UI

## 自动化检查

| 命令 | 期望 |
| --- | --- |
| `pnpm install` | 成功 |
| `pnpm build` | 成功 |
| `pnpm typecheck` | 成功 |
| `pnpm test` | 成功 |
| `pnpm lint` | 成功 |
| `node packages/cli/dist/index.js dashboard web --help` | 显示 Web UI 启动参数 |

## 场景验证

### 场景 1：打开 Web UI

步骤：

1. 运行 `tokenvalve dashboard web --workspace <path> --config-dir <dir> --port 4777`。
2. 浏览器打开输出的 URL。

期望：

- 页面可访问。
- 页面显示中文标题和 workspace。
- 页面包含 Profiles、Bindings、Recipes、Custom Providers、Doctor 区域。

### 场景 2：脱敏

步骤：

1. 在 profile metadata 或 doctor output 中放入疑似 token。
2. 打开页面和 `/api/snapshot`。

期望：

- 页面和 JSON 不包含原始 token。
- 不出现复制明文 secret 的功能。

### 场景 3：安全切换默认 profile

步骤：

1. 准备两个同 provider profile。
2. 通过 Web 表单切换默认 profile。
3. 刷新页面。

期望：

- binding 更新到目标 profile。
- secret value 不被读取或返回。
- 全局 provider CLI auth 状态不改变。

## 完成条件

- 自动化检查通过。
- 本地 Web UI 已启动并提供 URL。
- spec、代码、验证保持一致。
- `CHANGELOG.md` 更新。
