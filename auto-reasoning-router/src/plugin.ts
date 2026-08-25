import { resolveConfig, type RouterConfig } from './config.js'
import { applyDshAdapter, type DshLikeContext } from './dsh-adapter.js'
import { AutoReasoningRouter } from './router.js'

/** Cordis Loader entrypoint. DSH resolves this external ESM module by path. */
export const name = 'auto-reasoning-router'
export function apply(ctx: DshLikeContext, config: Partial<RouterConfig> = {}): void {
  const resolved = resolveConfig(config)
  const write = (line: string): void => { if (resolved.logging.level !== 'silent') console.error(`[ARR_EVENT] ${line.trimEnd()}`) }
  applyDshAdapter(ctx, new AutoReasoningRouter(resolved), resolved.logging.level === 'silent' ? undefined : message => console.error(message), { write })
}
