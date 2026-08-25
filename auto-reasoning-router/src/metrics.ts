import type { TurnSummary } from './router.js'

export interface JsonlSink { write(line: string): void }
export type ArrEvent =
  | { schemaVersion: 2; type: 'task_started'; sessionKey: string; turn: number; effort: string }
  | { schemaVersion: 2; type: 'trajectory_decision'; sessionKey: string; turn: number; action: 'upgrade' | 'replan'; effort: string; reason: string; epoch: number }
  | { schemaVersion: 2; type: 'turn_completed'; sessionKey: string; turn: number; summary: TurnSummary }

export function emitEvent(sink: JsonlSink, event: ArrEvent): void {
  sink.write(`${JSON.stringify(event)}\n`)
}
export function emitSummary(sink: JsonlSink, sessionKey: string, turn: number, summary: TurnSummary): void {
  emitEvent(sink, { schemaVersion: 2, type: 'turn_completed', sessionKey, turn, summary })
}
