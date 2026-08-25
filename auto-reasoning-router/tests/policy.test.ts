import { describe, expect, it } from 'vitest'
import { applyDecision, evaluate, type Thresholds } from '../src/policy.js'
import { createTurnState } from '../src/state.js'

const t: Thresholds = { repairCycles: 2, sameError: 2, testFailures: 2, repeatedToolCalls: 3, editedFiles: 4, toolSteps: 8 }

describe('policy', () => {
  it('consumes one evidence epoch once', () => {
    const state = createTurnState('off'); state.repairCycles = 2; state.sameErrorCount = 2
    const first = evaluate(state, t, 7); expect(first.reason).toBe('repair_cycle'); applyDecision(state, first, 7)
    expect(state.currentEffort).toBe('high'); expect(evaluate(state, t, 7).action).toBe('keep')
  })
  it('allows weak signals only from off', () => {
    const state = createTurnState('off'); state.toolSteps = 8; state.editedFiles = 4
    const decision = evaluate(state, t, 1); expect(decision.reason).toBe('weak_signal_pair'); applyDecision(state, decision, 1)
    expect(state.currentEffort).toBe('high')
  })
})
