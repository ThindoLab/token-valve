# Plan: Global Switch Compatibility

## Group 1 — 类型和 adapter opt-in

1.1 给 `AdapterDefinition` 增加可选 `executionModes`。

1.2 定义 global switch handler、锁、结果类型。

---

## Group 2 — 锁与恢复

2.1 实现 provider 级锁文件。

2.2 TTL 内锁冲突 fail closed。

2.3 过期锁可被新执行覆盖。

2.4 执行前 snapshot，执行后 restore。

---

## Group 3 — 审计和失败建议

3.1 每次 global switch 返回 audit。

3.2 switch / command / restore 失败时返回修复建议。

3.3 audit 和锁文件不包含 secret。

---

## Group 4 — 测试

4.1 覆盖 adapter 未 opt-in 被拒绝。

4.2 覆盖锁冲突被拒绝。

4.3 覆盖执行失败后仍调用 restore。

4.4 覆盖成功路径产出 audit。

4.5 覆盖默认 GitHub runner 仍使用 env injection。

---

## Group 5 — 验证

5.1 跑 `pnpm install`。

5.2 跑 `pnpm build`。

5.3 跑 `pnpm typecheck`。

5.4 跑 `pnpm test`。

5.5 跑 `pnpm lint`。
