/** DeepSeek v0.1 adapter capabilities are off/high/max; low is intentionally excluded. */
export type ReasoningEffort = 'off' | 'high' | 'max'
export type StrongSignal = 'repair_cycle' | 'same_error' | 'test_failure'
export type WeakSignal = 'repeated_tool_call' | 'edited_files' | 'tool_steps'
export type Signal = StrongSignal | WeakSignal

export interface Thresholds {
  repairCycles: number
  sameError: number
  testFailures: number
  repeatedToolCalls: number
  editedFiles: number
  toolSteps: number
}

export interface TurnState {
  currentEffort: ReasoningEffort
  repairCycles: number
  sameErrorCount: number
  testFailures: number
  repeatedToolCalls: number
  editedFiles: number
  editedFilePaths: Set<string>
  toolSteps: number
  lastUpgradeEpoch: number | undefined
  consumedStrongSignals: Set<StrongSignal>
  consumedWeakPair: boolean
  lastToolFingerprint?: string
  editSinceTest?: boolean
  lastError?: string
}

export interface PolicyDecision { action: 'keep' | 'upgrade' | 'replan'; reason?: Signal | 'weak_signal_pair' }

const next: Record<ReasoningEffort, ReasoningEffort> = { off: 'high', high: 'max', max: 'max' }

export function upgrade(effort: ReasoningEffort): ReasoningEffort { return next[effort] }

export function evaluate(state: TurnState, thresholds: Thresholds, epoch: number): PolicyDecision {
  if (state.currentEffort === 'max' || state.lastUpgradeEpoch === epoch) return { action: 'keep' }
  const strong: Array<[StrongSignal, boolean]> = [
    ['repair_cycle', state.repairCycles >= thresholds.repairCycles],
    ['same_error', state.sameErrorCount >= thresholds.sameError],
    ['test_failure', state.testFailures >= thresholds.testFailures],
  ]
  for (const [signal, reached] of strong) {
    if (reached && !state.consumedStrongSignals.has(signal)) {
      return { action: state.currentEffort === 'off' ? 'replan' : 'upgrade', reason: signal }
    }
  }
  const weakReached = [
    state.repeatedToolCalls >= thresholds.repeatedToolCalls,
    state.editedFiles >= thresholds.editedFiles,
    state.toolSteps >= thresholds.toolSteps,
  ].filter(Boolean).length
  if (state.currentEffort === 'off' && !state.consumedWeakPair && weakReached >= 2) return { action: 'replan', reason: 'weak_signal_pair' }
  return { action: 'keep' }
}

export function applyDecision(state: TurnState, decision: PolicyDecision, epoch: number): void {
  if ((decision.action !== 'upgrade' && decision.action !== 'replan') || !decision.reason) return
  state.currentEffort = upgrade(state.currentEffort)
  state.lastUpgradeEpoch = epoch
  if (decision.reason === 'weak_signal_pair') state.consumedWeakPair = true
  else state.consumedStrongSignals.add(decision.reason as StrongSignal)
}
