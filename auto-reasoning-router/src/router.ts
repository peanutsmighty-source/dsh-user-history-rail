import { classifyPrompt } from './classifier.js'
import { defaultConfig, validateConfig, type RouterConfig } from './config.js'
import { normalizeError, observeTool } from './monitor.js'
import { applyDecision, evaluate, type PolicyDecision, type ReasoningEffort, type TurnState } from './policy.js'
import { createTurnState } from './state.js'

export interface TurnSummary { initialEffort: ReasoningEffort; finalEffort: ReasoningEffort; escalations: Array<{ epoch: number; reason: string; action: 'upgrade' | 'replan' }>; toolSteps: number; testFailures: number; repairCycles: number }
export class AutoReasoningRouter {
  readonly config: RouterConfig
  #turns = new Map<string, {
    initial: ReasoningEffort; prompt: string; state: TurnState
    escalations: Array<{ epoch: number; reason: string; action: 'upgrade' | 'replan' }>
    timeline: Array<{ tool: string; command?: string; exitCode?: number; errorFingerprint?: string }>
  }>()
  constructor(config: RouterConfig = defaultConfig) { validateConfig(config); this.config = config }
  startTurn(key: string, prompt: string): ReasoningEffort { const effort = this.config.mode === 'auto' ? classifyPrompt(prompt).effort : this.fixed(); this.#turns.set(key, { initial: effort, prompt, state: createTurnState(effort), escalations: [], timeline: [] }); return effort }
  effort(key: string): ReasoningEffort | undefined { return this.#turns.get(key)?.state.currentEffort }
  observe(key: string, epoch: number, input: Parameters<typeof observeTool>[1]): PolicyDecision {
    const turn = this.#turns.get(key); if (!turn || !this.config.enabled || this.config.mode !== 'auto') return { action: 'keep' }
    observeTool(turn.state, input)
    turn.timeline.push({
      tool: input.toolName,
      ...input.command === undefined ? {} : { command: redact(input.command) },
      ...input.exitCode === undefined ? {} : { exitCode: input.exitCode },
      ...input.errorText === undefined ? {} : { errorFingerprint: normalizeError(input.errorText).slice(0, 240) },
    })
    const decision = evaluate(turn.state, this.config.thresholds, epoch); applyDecision(turn.state, decision, epoch)
    if ((decision.action === 'upgrade' || decision.action === 'replan') && decision.reason) turn.escalations.push({ epoch, reason: decision.reason, action: decision.action }); return decision
  }
  checkpoint(key: string): string | undefined {
    const turn = this.#turns.get(key); if (!turn) return undefined
    const state = turn.state
    return [
      'ARR CHECKPOINT — start a fresh reasoning trajectory and continue the task directly.',
      `Original task: ${turn.prompt}`,
      `Observed evidence: tool steps=${state.toolSteps}; test failures=${state.testFailures}; repair cycles=${state.repairCycles}; repeated errors=${state.sameErrorCount}; edited files=${state.editedFiles}.`,
      `Escalation reason: ${turn.escalations.at(-1)?.reason ?? 'runtime evidence'}.`,
      'Recent tool evidence:',
      ...turn.timeline.slice(-12).map(item => JSON.stringify(item)),
      'Do not repeat completed work. Reassess the evidence, identify the root cause, then continue with the remaining work.',
    ].join('\n')
  }
  finishTurn(key: string): TurnSummary | undefined { const turn = this.#turns.get(key); if (!turn) return; this.#turns.delete(key); return { initialEffort: turn.initial, finalEffort: turn.state.currentEffort, escalations: turn.escalations, toolSteps: turn.state.toolSteps, testFailures: turn.state.testFailures, repairCycles: turn.state.repairCycles } }
  private fixed(): ReasoningEffort { return this.config.mode.replace('always-', '') as ReasoningEffort }
}

/** Keep credentials out of durable checkpoints while retaining the command shape. */
function redact(command: string): string {
  return command.replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)(\S+)/gi, '$1<REDACTED>')
}
