/** Deterministic aggregation for frozen ARR benchmark runs. */
export type BenchmarkStrategy = 'always-off' | 'always-high' | 'auto'

export interface BenchmarkRun {
  taskId: string
  strategy: BenchmarkStrategy
  success: boolean
  apiCostUsd: number | null
  reasoningTokens: number | null
  latencyMs: number
  toolCalls: number
  inTrajectoryUpgrades: number
  checkpointReplans: number
  protocolErrors: number
}

export interface BenchmarkSummary {
  strategy: BenchmarkStrategy
  runs: number
  successRate: number
  averageCostUsd: number | null
  averageReasoningTokens: number | null
  averageLatencyMs: number
  averageToolCalls: number
  inTrajectoryUpgradeRate: number
  checkpointReplanRate: number
  protocolErrors: number
}

export function summarizeRuns(strategy: BenchmarkStrategy, runs: readonly BenchmarkRun[]): BenchmarkSummary {
  const selected = runs.filter(run => run.strategy === strategy)
  if (selected.length === 0) throw new Error(`No benchmark runs for ${strategy}`)
  const average = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0) / values.length
  const nullableAverage = (values: readonly (number | null)[]): number | null => {
    if (values.some(value => value === null)) return null
    return average(values as number[])
  }
  const count = selected.length
  return {
    strategy, runs: count,
    successRate: selected.filter(run => run.success).length / count,
    averageCostUsd: nullableAverage(selected.map(run => run.apiCostUsd)),
    averageReasoningTokens: nullableAverage(selected.map(run => run.reasoningTokens)),
    averageLatencyMs: average(selected.map(run => run.latencyMs)),
    averageToolCalls: average(selected.map(run => run.toolCalls)),
    inTrajectoryUpgradeRate: selected.filter(run => run.inTrajectoryUpgrades > 0).length / count,
    checkpointReplanRate: selected.filter(run => run.checkpointReplans > 0).length / count,
    protocolErrors: selected.reduce((total, run) => total + run.protocolErrors, 0),
  }
}

export function renderBenchmarkReport(summaries: readonly BenchmarkSummary[]): string {
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`
  const value = (input: number | null): string => input === null ? 'N/A' : input.toFixed(3)
  return [
    '| Strategy | Runs | Success | Avg cost USD | Avg reasoning tokens | Replan rate | Protocol errors |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summaries.map(summary => `| ${summary.strategy} | ${summary.runs} | ${percent(summary.successRate)} | ${value(summary.averageCostUsd)} | ${value(summary.averageReasoningTokens)} | ${percent(summary.checkpointReplanRate)} | ${summary.protocolErrors} |`),
  ].join('\n')
}
