# Requirements: Local Web UI

## 范围

本 feature 在 Public MVP 后新增一个真正可打开的本地 Web UI，让用户通过浏览器查看 TokenValve 的密钥管理状态。

它包含：

- 新增 `tokenvalve dashboard web` 命令。
- 启动仅绑定本机的 HTTP server，默认 host 为 `127.0.0.1`。
- 展示 workspace bindings、profiles、active intents、recipes、custom providers、doctor findings。
- Web 页面默认中文。
- 页面不显示明文 secret、不提供复制明文 key 的能力。
- 支持通过 Web 表单安全切换 workspace/provider 的默认 profile。
- 提供 JSON snapshot API，便于后续扩展为更完整的 UI。

## 范围外

- 不实现真实 secret 输入/编辑；新增或更新 secret 仍走 CLI/未来本地受控输入。
- 不实现登录、多用户、远程访问或云端托管。
- 不自动打开公网端口。
- 不引入 React/Vue/Vite 等前端构建链；本次先用零依赖 HTML/CSS/JS，降低本地工具复杂度。
- 不把 Web UI 从本地部署到公网。

## 行为

用户运行：

```bash
tokenvalve dashboard web --workspace <path> --config-dir <dir> --port 4777
```

终端会显示本地访问地址。用户打开浏览器后看到一个中文密钥管理器界面：

- 顶部显示 workspace、doctor 总状态和配置目录。
- Profile 区域显示 provider、profile id、environment、status、fingerprint（如果有）。
- Workspace binding 区域显示每个 provider 当前默认 profile。
- Custom provider、Recipe、Intent、Doctor 分区分别显示当前状态。
- 切换默认 profile 的表单只提交 provider/profile/workspace 元数据，不接收 secret。

所有 API response 和 HTML 输出都必须脱敏。

## 决策

- Web server 放在 `packages/dashboard`，因为该包已经负责 dashboard 展示。
- CLI 负责读取 `configDir`、`workspace` 和启动 server。
- 使用 Node 内置 `http`，不新增依赖。
- Web UI 只绑定本机地址，默认 `127.0.0.1`，避免误暴露。
- `POST /api/default-profile` 复用 `ProfileInventory.setDefaultProfile`，保持与 CLI dashboard use 一致。

## 背景

用户明确希望“打开密钥管理器”时出现真实界面，而不只是终端输出。现有 Phase 20 只提供 rich CLI dashboard，本 feature 是对 Backlog 中 Local Web UI 的第一步落地。

## 未决问题

- 后续是否加入 secret 本地输入弹窗，需要单独设计安全交互。
- 是否升级到 React/Vue，需要等页面复杂度超过零依赖方案后再判断。
