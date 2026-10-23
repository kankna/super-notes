import { getDb } from '../db/db'
import { newId } from '../lib/id'
import { MAPPING_KEYS } from './prompts'
import type { AiConfig, AiTaskKind, AiUsage } from '../db/types'

const MOCK_KEY = 'ai.mockMode'
const MAPPING_PREFIX = 'ai.mapping.'

export async function isMockMode(): Promise<boolean> {
  const db = getDb()
  const row = await db.settings.get(MOCK_KEY)
  return row?.value !== false
}

export async function setMockMode(on: boolean): Promise<void> {
  const db = getDb()
  await db.settings.put({ key: MOCK_KEY, value: on })
}

export async function getMapping(): Promise<Record<string, string>> {
  const db = getDb()
  const rows = await db.settings.where('key').startsWith(MAPPING_PREFIX).toArray()
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key.slice(MAPPING_PREFIX.length)] = String(r.value)
  return out
}

export async function setMapping(task: string, configId: string): Promise<void> {
  const db = getDb()
  await db.settings.put({ key: `${MAPPING_PREFIX}${task}`, value: configId })
}

export async function listConfigs(): Promise<AiConfig[]> {
  const db = getDb()
  return db.ai_configs.orderBy('created_at').toArray()
}

export async function getConfig(id: string): Promise<AiConfig | undefined> {
  const db = getDb()
  return db.ai_configs.get(id)
}

/** 按能力映射找到该任务要用的配置；没配就返回 undefined（走 Mock） */
export async function getConfigForTask(task: AiTaskKind): Promise<AiConfig | undefined> {
  const mapping = await getMapping()
  const id = mapping[task]
  if (!id) return undefined
  return getConfig(id)
}

export async function saveConfig(config: AiConfig): Promise<void> {
  const db = getDb()
  await db.ai_configs.put({ ...config, updated_at: Date.now() })
}

export async function deleteConfig(id: string): Promise<void> {
  const db = getDb()
  await db.ai_configs.delete(id)
  const mapping = await getMapping()
  for (const key of MAPPING_KEYS) {
    if (mapping[key] === id) await setMapping(key, '')
  }
}

export function maskKey(key: string): string {
  if (!key) return '（未设置）'
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

export async function recordUsage(entry: Omit<AiUsage, 'id' | 'created_at'>): Promise<void> {
  const db = getDb()
  await db.ai_usage.add({ id: newId('u_'), created_at: Date.now(), ...entry })
}

export async function usageSummary(): Promise<{
  calls: number
  live: number
  mock: number
  inputTokens: number
  outputTokens: number
  failures: number
}> {
  const db = getDb()
  const rows = await db.ai_usage.toArray()
  return {
    calls: rows.length,
    live: rows.filter((r) => r.mode === 'live').length,
    mock: rows.filter((r) => r.mode === 'mock').length,
    inputTokens: rows.reduce((a, r) => a + r.input_tokens, 0),
    outputTokens: rows.reduce((a, r) => a + r.output_tokens, 0),
    failures: rows.filter((r) => !r.ok).length,
  }
}
