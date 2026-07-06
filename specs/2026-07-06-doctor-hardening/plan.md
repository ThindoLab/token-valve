# Plan: Doctor 与加固

## Group 1 — Doctor 数据模型

1.1 定义 `DoctorFinding`、severity、输入选项和诊断结果类型。

1.2 实现脱敏 helper，确保 finding 不回显 secret-like 值。

---

## Group 2 — 配置与 mapping 诊断

2.1 检查配置目录是否存在。

2.2 检查 profiles/bindings/recipes/custom-providers YAML 是否可解析。

2.3 检查 binding 指向的 profile 是否存在。

2.4 检查 profile 状态：unverified、expired、disabled。

2.5 检查 custom provider capability 是否缺少 risk rules。

2.6 检查 YAML 中疑似明文 secret。

---

## Group 3 — 运行环境诊断

3.1 检查 provider binary 是否缺失。

3.2 检查 shim bin 目录是否在 PATH。

3.3 检查 shim 是否可能排在真实 binary 之后。

3.4 检查 global-switch 锁冲突和过期锁。

---

## Group 4 — CLI 输出

4.1 替换 `tokenvalve doctor` 占位输出。

4.2 支持 `--workspace`、`--config-dir`、`--path` 参数。

4.3 输出每条 finding 的 severity、id、message、next step。

---

## Group 5 — 测试

5.1 覆盖空配置目录建议 init。

5.2 覆盖 YAML 损坏。

5.3 覆盖 profile 状态和 binding 缺失。

5.4 覆盖 custom risk rules 缺失。

5.5 覆盖 shim path 和 binary 缺失。

5.6 覆盖 global-switch 锁。

5.7 覆盖 CLI doctor 输出脱敏。

---

## Group 6 — 验证

6.1 跑 `pnpm install`。

6.2 跑 `pnpm build`。

6.3 跑 `pnpm typecheck`。

6.4 跑 `pnpm test`。

6.5 跑 `pnpm lint`。

6.6 跑 `node packages/cli/dist/index.js doctor --help`。
