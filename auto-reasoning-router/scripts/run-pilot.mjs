import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifestPath = join(root, 'benchmarks', 'pilot-v0.2', 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const execute = process.argv.includes('--execute')
const selectedStrategy = process.argv.find(arg => arg.startsWith('--strategy='))?.split('=')[1]
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? Infinity)
const rerunTaskId = process.argv.find(arg => arg.startsWith('--rerun='))?.split('=')[1]
const strategies = selectedStrategy ? [selectedStrategy] : manifest.strategies
if (!strategies.every(strategy => manifest.strategies.includes(strategy))) throw new Error('Unknown benchmark strategy')

const cli = process.env.DSH_CLI ?? join(process.env.DSH_ROOT ?? resolve(root, '..', 'deepseek-harness'), 'apps', 'cli', 'lib', 'bin.js')
const node = process.execPath
const fixtureRoot = join(root, 'benchmarks', 'pilot-v0.2', 'fixtures')
if (!execute) {
  console.log(JSON.stringify({ mode: 'dry-run', tasks: manifest.tasks.length, strategies, cli, fixtureRoot }, null, 2))
  process.exit(0)
}
if (!existsSync(cli)) throw new Error(`DSH CLI not found: ${cli}`)
if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY must be set only in this process environment')

const outputRoot = join(root, 'benchmark-results', manifest.experimentId)
mkdirSync(outputRoot, { recursive: true })
const partialPath = join(outputRoot, 'runs.partial.json')
let records = existsSync(partialPath) ? JSON.parse(readFileSync(partialPath, 'utf8')) : []
if (rerunTaskId !== undefined) records = records.filter(record => record.taskId !== rerunTaskId || !strategies.includes(record.strategy))
const logRoot = join(outputRoot, 'logs')
mkdirSync(logRoot, { recursive: true })
const pending = []
for (const task of manifest.tasks) for (const strategy of strategies) {
  if ((rerunTaskId === undefined || task.id === rerunTaskId) && !records.some(record => record.taskId === task.id && record.strategy === strategy)) pending.push({ task, strategy })
}
for (const { task, strategy } of pending.slice(0, limit)) {
  const source = join(fixtureRoot, task.id)
  if (!existsSync(source)) throw new Error(`Fixture missing: ${source}; run generate-pilot-fixtures.mjs first`)
  const workdir = mkdtempSync(join(tmpdir(), `arr-${task.id}-${strategy}-`))
  try {
    console.log(`[pilot] ${strategy} ${task.id}`)
    cpSync(source, workdir, { recursive: true })
    const patch = join(workdir, 'arr.patch.yml')
    const pluginUrl = `file:///${join(root, 'dist', 'plugin.js').replace(/\\/g, '/')}`
    writeFileSync(patch, `- insert:\n    - id: auto-reasoning-router\n      name: ${pluginUrl}\n      config:\n        enabled: true\n        mode: ${strategy}\n`)
    const started = Date.now()
    const agent = spawnSync(node, [cli, '--profile', 'headless', '--patch', patch, task.prompt], {
      cwd: workdir, encoding: 'utf8', env: { ...process.env, DSH_TELEMETRY_MODE: 'DISABLED' }, timeout: 180000,
    })
    const validator = spawnSync(task.validator, { cwd: workdir, shell: true, encoding: 'utf8', timeout: 30000 })
    const log = `${agent.stdout}\n${agent.stderr}`
    writeFileSync(join(logRoot, `${task.id}-${strategy}.log`), log)
    const events = log.split('\n').filter(line => line.startsWith('[ARR_EVENT] ')).map(line => JSON.parse(line.slice(12)))
    records.push({ taskId: task.id, strategy, success: agent.status === 0 && validator.status === 0, apiCostUsd: null, reasoningTokens: null, latencyMs: Date.now() - started, toolCalls: 0, inTrajectoryUpgrades: events.filter(event => event.type === 'trajectory_decision' && event.action === 'upgrade').length, checkpointReplans: events.filter(event => event.type === 'trajectory_decision' && event.action === 'replan').length, protocolErrors: /reasoning_content|INVALID_REQUEST/.test(log) ? 1 : 0, agentExitCode: agent.status, validatorExitCode: validator.status, agentError: agent.error?.message ?? null })
    writeFileSync(partialPath, JSON.stringify(records, null, 2) + '\n')
  } finally { rmSync(workdir, { recursive: true, force: true }) }
}
const expected = manifest.tasks.length * manifest.strategies.length
if (records.length === expected) writeFileSync(join(outputRoot, 'runs.json'), JSON.stringify(records, null, 2) + '\n')
console.log(`Recorded ${records.length}/${expected} benchmark runs to ${outputRoot}`)
