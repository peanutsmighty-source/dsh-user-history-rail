import { AutoReasoningRouter } from './router.js'
import { emitEvent, emitSummary, type JsonlSink } from './metrics.js'

/** Structural boundary for DSH public seams; kept dependency-free for standalone development. */
export interface DshLikeContext {
  on(event: 'agent/pre-step', handler: (payload: { agent: { session: unknown }; messages: Array<{ content: Array<{ type: string; text?: string }> }>; turn: number }, next: () => Promise<unknown>) => Promise<unknown>): void
  on(event: 'agent/request', handler: (payload: { agent: { session: unknown }; turn: number }, next: () => Promise<{ reasoningEffort?: string; [key: string]: unknown }>) => Promise<unknown>): void
  on(event: 'tools/result', handler: (exec: { agent?: { session: unknown }; parent?: unknown; name: string; arguments: unknown }, result: { isError: boolean; error?: unknown; value?: unknown }) => void): void
  on(event: 'session/event', handler: (session: unknown, event: { type: string; data?: { turn?: number } }) => void): void
}

const text = (messages: Array<{ content: Array<{ type: string; text?: string }> }>) => messages.flatMap(m => m.content).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n')
const object = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
const stringField = (value: unknown, ...keys: string[]): string | undefined => { const source = object(value); for (const key of keys) if (typeof source?.[key] === 'string') return source[key] as string }
const numberField = (value: unknown, ...keys: string[]): number | undefined => { const source = object(value); for (const key of keys) if (typeof source?.[key] === 'number') return source[key] as number }

export function applyDshAdapter(ctx: DshLikeContext, router: AutoReasoningRouter, log: (message: string) => void = () => {}, sink: JsonlSink = { write: () => {} }): void {
  const ids = new WeakMap<object, string>(); const turns = new WeakMap<object, number>(); const epochs = new WeakMap<object, number>(); const replans = new Map<string, true>(); let sequence = 0
  const key = (session: unknown, turn: number) => { const object = session as object; let id = ids.get(object); if (!id) { id = `session-${++sequence}`; ids.set(object, id) }; return `${id}:${turn}` }
  ctx.on('agent/pre-step', async (payload, next) => {
    const session = payload.agent.session as object
    const turnKey = key(session, payload.turn)
    if (replans.delete(turnKey)) {
      const checkpoint = router.checkpoint(turnKey)
      if (checkpoint !== undefined) {
        log('[ARR] checkpoint → HIGH')
        return {
          kind: 'replan',
          messages: [],
          checkpoint: {
            id: crypto.randomUUID(), role: 'user',
            content: [{ type: 'text', text: checkpoint }],
            source: { kind: 'plugin', plugin: 'auto-reasoning-router' },
          },
        }
      }
    }
    if (turns.get(session) !== payload.turn) {
      turns.set(session, payload.turn)
      const effort = router.startTurn(turnKey, text(payload.messages))
      log(`[ARR] reasoning: ${effort.toUpperCase()}`)
      emitEvent(sink, { schemaVersion: 2, type: 'task_started', sessionKey: turnKey, turn: payload.turn, effort })
    }
    return next()
  })
  ctx.on('agent/request', async (payload, next) => ({ ...await next(), reasoningEffort: router.effort(key(payload.agent.session, payload.turn)) }))
  ctx.on('tools/result', (exec, result) => {
    if (!exec.agent || exec.parent !== undefined) return
    const command = stringField(exec.arguments, 'command', 'cmd')
    const editedFile = /(?:edit|write|patch)/i.test(exec.name) ? stringField(exec.arguments, 'path', 'filePath', 'file_path') : undefined
    const session = exec.agent.session as object; const turn = turns.get(session); if (turn === undefined) return
    const epoch = (epochs.get(session) ?? 0) + 1; epochs.set(session, epoch)
    const decision = router.observe(key(session, turn), epoch, { toolName: exec.name, command, editedFile, exitCode: numberField(result.value, 'exitCode', 'exit_code'), errorText: result.isError ? JSON.stringify(result.error ?? '') : undefined })
    if (decision.action === 'replan') {
      replans.set(key(session, turn), true)
      log(`[ARR] checkpoint requested: ${decision.reason ?? 'unknown'}`)
      emitEvent(sink, { schemaVersion: 2, type: 'trajectory_decision', sessionKey: key(session, turn), turn, action: 'replan', effort: 'high', reason: decision.reason ?? 'unknown', epoch })
    } else if (decision.action === 'upgrade') log(`[ARR] escalation: ${decision.reason ?? 'unknown'}`)
    if (decision.action === 'upgrade') emitEvent(sink, { schemaVersion: 2, type: 'trajectory_decision', sessionKey: key(session, turn), turn, action: 'upgrade', effort: router.effort(key(session, turn)) ?? 'max', reason: decision.reason ?? 'unknown', epoch })
  })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end' || event.data?.turn === undefined) return
    const turnKey = key(session, event.data.turn)
    const summary = router.finishTurn(turnKey)
    if (summary !== undefined) emitSummary(sink, turnKey, event.data.turn, summary)
  })
}
