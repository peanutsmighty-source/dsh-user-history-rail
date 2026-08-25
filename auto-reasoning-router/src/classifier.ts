import type { ReasoningEffort } from './policy.js'

export interface Classification { score: number; effort: ReasoningEffort; reasons: string[] }

const groups: Array<[string, RegExp, number]> = [
  ['change', /\b(implement|rename|update|add|delete)\b|修改|实现|添加|删除/, 1],
  ['debug', /\b(debug|bug|crash|error|root cause)\b|调试|错误|异常|崩溃|根因/, 2],
  ['architecture', /\b(architecture|refactor|redesign)\b|架构|重构|重新设计/, 2],
  ['scope', /\b(codebase|repository|cross-module|multiple files)\b|整个项目|跨模块|多个模块|多个文件/, 2],
  ['compatibility', /\b(abi|backward compatible|api compatibility)\b|不能破坏|保持兼容|保持现有行为/, 2],
  ['concurrency', /\b(race|deadlock|mutex|thread)\b|并发|线程安全|锁/, 3],
]

export function classifyPrompt(prompt: string): Classification {
  const text = prompt.replace(/```[\s\S]*?```/g, '')
  const reasons: string[] = []
  let score = 0
  for (const [name, pattern, points] of groups) if (pattern.test(text)) { score += points; reasons.push(name) }
  const effort: ReasoningEffort = score <= 1 ? 'off' : score <= 6 ? 'high' : 'max'
  return { score, effort, reasons }
}
