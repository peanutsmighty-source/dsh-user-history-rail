import type { TurnState } from './policy.js'

export function isTestCommand(command: string): boolean {
  return /(?:^|\s)(pytest|npm\s+(?:run\s+)?test|pnpm\s+test|yarn\s+test|jest|vitest|cargo\s+test|go\s+test|make\s+test|ctest|mvn\s+test|gradle\s+test)(?:\s|$)/i.test(command)
}

export function normalizeError(text: string): string {
  return text
    .replace(/[A-Za-z]:\\[^\s:]+|\/[\w./-]+/g, '<PATH>')
    .replace(/:\d+(?::\d+)?/g, ':<LINE>')
    .replace(/0x[\da-f]+/gi, '<ADDR>')
    .replace(/\b\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?Z?\b/g, '<TIME>')
    .replace(/\s+/g, ' ').trim().slice(0, 4096)
}

export function observeTool(state: TurnState, input: { toolName: string; command?: string; exitCode?: number; errorText?: string; editedFile?: string }): void {
  state.toolSteps++
  const fingerprint = `${input.toolName}:${JSON.stringify(input.command ?? input.editedFile ?? '')}`
  state.repeatedToolCalls = fingerprint === state.lastToolFingerprint ? state.repeatedToolCalls + 1 : 1
  state.lastToolFingerprint = fingerprint
  if (input.editedFile) { state.editedFilePaths.add(input.editedFile); state.editedFiles = state.editedFilePaths.size; state.editSinceTest = true }
  if (input.command && isTestCommand(input.command) && input.exitCode !== undefined) {
    if (input.exitCode !== 0) { state.testFailures++; if (state.editSinceTest) state.repairCycles++ }
    state.editSinceTest = false
  }
  if (input.errorText) {
    const key = normalizeError(input.errorText)
    const last = state.lastError
    state.lastError = key
    state.sameErrorCount = key === last ? state.sameErrorCount + 1 : 1
  }
}
