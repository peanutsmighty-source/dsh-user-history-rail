# DSH `replan` 提案

## 问题

Agent 在工具轨迹中可能遇到重复失败、策略退化、上下文噪声或能力切换。现有循环可以继续、拒绝或压缩历史，但缺少一个受控的“保留事实、开启新模型轨迹”的控制点。

DeepSeek thinking 工具调用还有额外约束：一条 thinking 工具链必须持续回传 `reasoning_content`。因此，不能把已经以 `off` 开始并调用过工具的轨迹直接切换为 `high/max`。

## 提案

将 `agent/pre-step` 的决策扩展为：

```ts
{ kind: 'replan', checkpoint: UserMessage, messages: [] }
```

Agent Loop 收到此决策后，保留完整 durable session log，但将下一次模型请求可见的 surface 原子替换为 `checkpoint`。随后该请求可使用新的模型、推理预算或执行策略。

## 通用价值

- 工具失败或循环后的重新规划；
- 模型、provider 或推理预算的安全切换；
- 任务阶段切换（调研 → 实现 → 验证）；
- 人工纠偏后的干净恢复；
- 可审计的上下文恢复，避免插件直接篡改 session surface。

## ARR 作为首个用例

ARR 在 `off` 工具轨迹出现足够强的运行证据时，生成脱敏 checkpoint，并以 `high` 开启新轨迹。该方法避免 `reasoning_content` 协议错误；完整历史仍在 session log 中，可重放和审计。

## 验证

ARR Pilot 的 30 次真实 DeepSeek 运行中，`medium-002` 成功触发一次 `off → checkpoint → high`，协议错误为 0。该 Pilot 是小型合成任务验证，不构成正式性能或成本结论。
