import { describe, expect, it } from 'vitest'
import { classifyPrompt } from '../src/classifier.js'
import { isTestCommand, normalizeError, observeTool } from '../src/monitor.js'
import { AutoReasoningRouter } from '../src/router.js'
import { applyDshAdapter, type DshLikeContext } from '../src/dsh-adapter.js'
import { createTurnState } from '../src/state.js'

describe('classifier', () => {
  it('ignores code blocks and scores each concept once', () => {
    expect(classifyPrompt('修改 README\n```\nasync deadlock race\n```').effort).toBe('off')
    expect(classifyPrompt('定位 deadlock 根因并保持兼容').effort).toBe('max')
  })
})

describe('monitor', () => {
  it('detects repair cycles and stable error signatures', () => {
    const state = createTurnState('high')
    observeTool(state, { toolName: 'edit', editedFile: 'a.ts' })
    observeTool(state, { toolName: 'bash', command: 'npm test', exitCode: 1, errorText: '/x/a.ts:12 Foo undefined' })
    observeTool(state, { toolName: 'edit', editedFile: 'a.ts' })
    observeTool(state, { toolName: 'bash', command: 'npm test', exitCode: 1, errorText: '/x/a.ts:88 Foo undefined' })
    expect(state.repairCycles).toBe(2); expect(state.sameErrorCount).toBe(2)
  })
  it('recognizes supported test commands', () => { expect(isTestCommand('cargo test -p app')).toBe(true); expect(isTestCommand('git status')).toBe(false); expect(normalizeError('/a/x.ts:3 bad')).toContain('<PATH>') })
})

describe('router', () => {
  it('routes and summarizes one turn', () => {
    const router = new AutoReasoningRouter(); expect(router.startTurn('s:1', '修改 README')).toBe('off')
    router.observe('s:1', 1, { toolName: 'edit', editedFile: 'a' }); router.observe('s:1', 2, { toolName: 'bash', command: 'npm test', exitCode: 1 }); router.observe('s:1', 3, { toolName: 'edit', editedFile: 'a' }); router.observe('s:1', 4, { toolName: 'bash', command: 'npm test', exitCode: 1 })
    const summary = router.finishTurn('s:1'); expect(summary?.finalEffort).toBe('high'); expect(summary?.escalations).toHaveLength(1)
  })
  it('builds an auditable, credential-redacted checkpoint', () => {
    const router = new AutoReasoningRouter()
    router.startTurn('s:2', '修复测试')
    router.observe('s:2', 1, { toolName: 'bash', command: 'npm test token=abc123', exitCode: 1, errorText: '/a/file.ts:12 failure' })
    router.observe('s:2', 2, { toolName: 'bash', command: 'npm test', exitCode: 1, errorText: '/a/file.ts:18 failure' })
    const checkpoint = router.checkpoint('s:2')
    expect(checkpoint).toContain('Original task: 修复测试')
    expect(checkpoint).toContain('token=<REDACTED>')
    expect(checkpoint).not.toContain('abc123')
  })
})

describe('DSH adapter', () => {
  it('routes a pre-step and extracts a shell exitCode', async () => {
    const handlers = new Map<string, Function>()
    const ctx: DshLikeContext = { on: (event: string, handler: Function) => void handlers.set(event, handler) } as DshLikeContext
    const router = new AutoReasoningRouter(); applyDshAdapter(ctx, router)
    const session = {}; const agent = { session }
    await handlers.get('agent/pre-step')({ agent, turn: 2, messages: [{ content: [{ type: 'text', text: '修改 README' }] }] }, async () => undefined)
    await handlers.get('agent/pre-step')({ agent, turn: 2, messages: [{ content: [{ type: 'text', text: '修改 README' }] }] }, async () => undefined)
    handlers.get('tools/result')({ agent, name: 'bash', arguments: { command: 'npm test' } }, { isError: false, value: { exitCode: 1 } })
    handlers.get('tools/result')({ agent, name: 'bash', arguments: { command: 'npm test' } }, { isError: false, value: { exitCode: 1 } })
    expect(router.effort('session-1:2')).toBe('high')
  })
  it('upgrades an active thinking trajectory from high to max', async () => {
    const handlers = new Map<string, Function>()
    const ctx: DshLikeContext = { on: (event: string, handler: Function) => void handlers.set(event, handler) } as DshLikeContext
    const router = new AutoReasoningRouter(); applyDshAdapter(ctx, router)
    const session = {}; const agent = { session }
    await handlers.get('agent/pre-step')({ agent, turn: 1, messages: [{ content: [{ type: 'text', text: '修复这个 bug' }] }] }, async () => undefined)
    expect(await handlers.get('agent/request')({ agent, turn: 1 }, async () => ({ provider: 'd', model: 'm' }))).toMatchObject({ reasoningEffort: 'high' })
    handlers.get('tools/result')({ agent, name: 'bash', arguments: { command: 'npm test' } }, { isError: false, value: { exitCode: 1 } })
    handlers.get('tools/result')({ agent, name: 'bash', arguments: { command: 'npm test' } }, { isError: false, value: { exitCode: 1 } })
    expect(await handlers.get('agent/request')({ agent, turn: 1 }, async () => ({ provider: 'd', model: 'm' }))).toMatchObject({ reasoningEffort: 'max' })
  })
  it('replans an off trajectory as high after two failed tests', async () => {
    const handlers = new Map<string, Function>()
    const ctx: DshLikeContext = { on: (event: string, handler: Function) => void handlers.set(event, handler) } as DshLikeContext
    const router = new AutoReasoningRouter(); applyDshAdapter(ctx, router)
    const session = {}; const agent = { session }
    const first = { agent, turn: 3, messages: [{ content: [{ type: 'text', text: '修改 README' }] }] }
    await handlers.get('agent/pre-step')(first, async () => undefined)
    handlers.get('tools/result')({ agent, name: 'bash', arguments: { command: 'npm test' } }, { isError: false, value: { exitCode: 1 } })
    handlers.get('tools/result')({ agent, name: 'bash', arguments: { command: 'npm test' } }, { isError: false, value: { exitCode: 1 } })
    const replan = await handlers.get('agent/pre-step')({ agent, turn: 3, messages: [] }, async () => undefined)
    expect(replan).toMatchObject({ kind: 'replan', messages: [], checkpoint: { role: 'user' } })
    expect(await handlers.get('agent/request')({ agent, turn: 3 }, async () => ({ provider: 'd', model: 'm' }))).toMatchObject({ reasoningEffort: 'high' })
  })
  it('emits JSONL-compatible task and completion events', async () => {
    const handlers = new Map<string, Function>(); const lines: string[] = []
    const ctx: DshLikeContext = { on: (event: string, handler: Function) => void handlers.set(event, handler) } as DshLikeContext
    const router = new AutoReasoningRouter(); applyDshAdapter(ctx, router, () => {}, { write: line => lines.push(line) })
    const session = {}; const agent = { session }
    await handlers.get('agent/pre-step')({ agent, turn: 5, messages: [{ content: [{ type: 'text', text: '修改 README' }] }] }, async () => undefined)
    handlers.get('session/event')(session, { type: 'turn/end', data: { turn: 5 } })
    expect(lines.map(line => JSON.parse(line).type)).toEqual(['task_started', 'turn_completed'])
    expect(router.effort('session-1:5')).toBeUndefined()
  })
})
