import { describe, expect, it } from 'vitest'
import { renderBenchmarkReport, summarizeRuns, type BenchmarkRun } from '../src/benchmark.js'

const runs: BenchmarkRun[] = [
  { taskId: 'a', strategy: 'auto', success: true, apiCostUsd: 0.1, reasoningTokens: 10, latencyMs: 100, toolCalls: 2, inTrajectoryUpgrades: 0, checkpointReplans: 1, protocolErrors: 0 },
  { taskId: 'b', strategy: 'auto', success: false, apiCostUsd: 0.3, reasoningTokens: null, latencyMs: 200, toolCalls: 4, inTrajectoryUpgrades: 1, checkpointReplans: 0, protocolErrors: 0 },
]

describe('benchmark aggregation', () => {
  it('keeps unknown token accounting as N/A instead of zero', () => {
    const summary = summarizeRuns('auto', runs)
    expect(summary.successRate).toBe(0.5)
    expect(summary.averageReasoningTokens).toBeNull()
    expect(summary.checkpointReplanRate).toBe(0.5)
    expect(renderBenchmarkReport([summary])).toContain('N/A')
  })
})
