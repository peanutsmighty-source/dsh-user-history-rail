import type { Thresholds } from './policy.js'

export interface RouterConfig { enabled: boolean; mode: 'auto' | 'always-off' | 'always-high' | 'always-max'; thresholds: Thresholds; logging: { level: 'silent' | 'normal' | 'debug' } }
export const defaultConfig: RouterConfig = { enabled: true, mode: 'auto', thresholds: { toolSteps: 8, testFailures: 2, sameError: 2, repairCycles: 2, editedFiles: 4, repeatedToolCalls: 3 }, logging: { level: 'normal' } }
export function validateConfig(config: RouterConfig): void {
  for (const [key, value] of Object.entries(config.thresholds)) if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid threshold ${key}: ${value}`)
}
export function resolveConfig(input: Partial<RouterConfig> = {}): RouterConfig {
  const config: RouterConfig = { ...defaultConfig, ...input, thresholds: { ...defaultConfig.thresholds, ...input.thresholds }, logging: { ...defaultConfig.logging, ...input.logging } }
  validateConfig(config)
  return config
}
