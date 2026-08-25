import type { ReasoningEffort, TurnState } from './policy.js'

export function createTurnState(effort: ReasoningEffort): TurnState {
  return { currentEffort: effort, repairCycles: 0, sameErrorCount: 0, testFailures: 0, repeatedToolCalls: 0, editedFiles: 0, editedFilePaths: new Set(), toolSteps: 0, lastUpgradeEpoch: undefined, consumedStrongSignals: new Set(), consumedWeakPair: false }
}
