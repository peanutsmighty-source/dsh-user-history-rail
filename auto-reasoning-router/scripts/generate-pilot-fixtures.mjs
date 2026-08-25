import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../benchmarks/pilot-v0.2/fixtures/', import.meta.url))
const tasks = [
  { id: 'simple-001', category: 'single-file-edit', files: { 'README.md': '# Demo\n\nRun tests with `npm test`.\n', 'test.mjs': "import { readFileSync } from 'node:fs'\nif (!readFileSync('README.md', 'utf8').includes('pnpm test')) process.exit(1)\n" } },
  { id: 'simple-002', category: 'single-file-edit', files: { 'README.md': '# Instalation\n\nInstall the package before use.\n', 'test.mjs': "import { readFileSync } from 'node:fs'\nconst text = readFileSync('README.md', 'utf8'); if (!text.includes('Installation') || text.includes('Instalation')) process.exit(1)\n" } },
  { id: 'simple-003', category: 'small-test-fix', files: { 'index.mjs': 'export const isEven = value => value % 2 === 1\n', 'test.mjs': "import { isEven } from './index.mjs'\nif (!isEven(2) || isEven(3)) process.exit(1)\n" } },
  { id: 'medium-001', category: 'debug', files: { 'index.mjs': "export function parsePort(value) { const port = Number(value); return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : null }\n", 'test.mjs': "import { parsePort } from './index.mjs'\nif (parsePort('3000') !== 3000 || parsePort('0') !== null || parsePort('70000') !== null) process.exit(1)\n" } },
  { id: 'medium-002', category: 'multi-file-change', files: { 'config.mjs': "export const prefix = 'user:'\n", 'format.mjs': "export const label = name => name\n", 'index.mjs': "export { label } from './format.mjs'\n", 'test.mjs': "import { label } from './index.mjs'\nif (label('ada') !== 'user:ada') process.exit(1)\n" } },
  { id: 'medium-003', category: 'regression', files: { 'index.mjs': "export function unique(values) { return [...new Set(values)].sort() }\n", 'test.mjs': "import { unique } from './index.mjs'\nconst result = unique([10, 2, 10]); if (JSON.stringify(result) !== JSON.stringify([2, 10])) process.exit(1)\n" } },
  { id: 'medium-004', category: 'error-handling', files: { 'index.mjs': "export const readName = input => JSON.parse(input).name\n", 'test.mjs': "import { readName } from './index.mjs'\nif (readName('{bad') !== null || readName('{}') !== null || readName('{\\\"name\\\":\\\"Ada\\\"}') !== 'Ada') process.exit(1)\n" } },
  { id: 'hard-001', category: 'root-cause', files: { 'store.mjs': "let value = 'old'\nexport const set = next => { value = next }\nexport const get = () => value\n", 'service.mjs': "import { get } from './store.mjs'\nconst cached = get()\nexport const current = () => cached\n", 'test.mjs': "import { set } from './store.mjs'\nimport { current } from './service.mjs'\nset('new'); if (current() !== 'new') process.exit(1)\n" } },
  { id: 'hard-002', category: 'cross-module', files: { 'state.mjs': "export const state = { enabled: false }\n", 'api.mjs': "import { state } from './state.mjs'\nexport const enable = () => ({ ...state, enabled: true })\n", 'view.mjs': "import { state } from './state.mjs'\nexport const visible = () => state.enabled\n", 'test.mjs': "import { enable } from './api.mjs'\nimport { visible } from './view.mjs'\nenable(); if (!visible()) process.exit(1)\n" } },
  { id: 'hard-003', category: 'concurrency', files: { 'index.mjs': "export function once(work) { let done = false; return async () => { if (done) return; const value = await work(); done = true; return value } }\n", 'test.mjs': "import { once } from './index.mjs'\nlet calls = 0; const run = once(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return calls }); await Promise.all([run(), run(), run()]); if (calls !== 1) process.exit(1)\n" } },
]

for (const task of tasks) {
  const dir = join(root, task.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: { test: 'node test.mjs' } }, null, 2) + '\n')
  writeFileSync(join(dir, 'README.md'), `# ${task.id}\n\nCategory: ${task.category}\n\nThis fixture is intentionally broken. Complete the manifest task and make \`npm test\` pass.\n`)
  for (const [path, content] of Object.entries(task.files)) writeFileSync(join(dir, path), content)
}
console.log(`Generated ${tasks.length} isolated pilot fixtures.`)
