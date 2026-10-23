import { getDb } from '../db/db'
import { newId } from '../lib/id'
import { blobToDataUrl, chatCompletion, type ChatMessage, type ContentPart } from './client'
import { mockReply } from './mock'
import { BUILTIN_PROMPTS, fillTemplate } from './prompts'
import { getConfigForTask, isMockMode, recordUsage } from './store'
import type { AiTaskKind, PromptVersion } from '../db/types'

export interface RunTaskOptions {
  /** 传给提示词的变量 */
  vars: Record<string, string>
  /** 附加图片（转写任务用） */
  images?: { name: string; dataUrl: string }[]
  /** 覆盖系统提示（可选） */
  system?: string
}

export interface RunTaskResult {
  text: string
  mode: 'mock' | 'live'
  promptVersion: number
  inputTokens: number
  outputTokens: number
  model: string
  error: string
}

async function getPrompt(task: AiTaskKind): Promise<PromptVersion> {
  const db = getDb()
  const versions = await db.prompts.where('task').equals(task).toArray()
  if (versions.length) {
    return versions.sort((a, b) => b.version - a.version)[0]
  }
  const def = BUILTIN_PROMPTS.find((p) => p.task === task)!
  const row: PromptVersion = {
    id: newId('pr_'),
    task,
    version: def.version,
    content: def.content,
    builtin: true,
    created_at: Date.now(),
  }
  await db.prompts.add(row)
  return row
}

export async function listPromptVersions(task: AiTaskKind): Promise<PromptVersion[]> {
  const db = getDb()
  const rows = await db.prompts.where('task').equals(task).toArray()
  return rows.sort((a, b) => b.version - a.version)
}

export async function savePromptVersion(
  task: AiTaskKind,
  content: string,
): Promise<PromptVersion> {
  const db = getDb()
  const existing = await listPromptVersions(task)
  const version = (existing[0]?.version ?? 0) + 1
  const row: PromptVersion = {
    id: newId('pr_'),
    task,
    version,
    content,
    builtin: false,
    created_at: Date.now(),
  }
  await db.prompts.add(row)
  return row
}

/**
 * 统一调用入口：
 * 1. 取该任务的提示词（版本化）
 * 2. 按能力映射找到配置；没有配置或开了 Mock 就走本地模拟
 * 3. 记录用量
 */
export async function runTask(
  task: AiTaskKind,
  opts: RunTaskOptions,
): Promise<RunTaskResult> {
  const prompt = await getPrompt(task)
  const userText = fillTemplate(prompt.content, opts.vars)
  const mock = await isMockMode()
  const config = mock ? undefined : await getConfigForTask(task)

  if (!config) {
    const reply = mockReply({ task, messages: [], vars: opts.vars })
    await recordUsage({
      config_id: null,
      config_name: 'Mock 模式',
      task,
      model: 'mock',
      mode: 'mock',
      prompt_version: prompt.version,
      input_tokens: reply.inputTokens,
      output_tokens: reply.outputTokens,
      ok: true,
      error: '',
    })
    return {
      text: reply.text,
      mode: 'mock',
      promptVersion: prompt.version,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      model: 'mock',
      error: '',
    }
  }

  const content: ContentPart[] = [{ type: 'text', text: userText }]
  for (const img of opts.images ?? []) {
    content.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })
  }

  const messages: ChatMessage[] = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  messages.push({ role: 'user', content })

  try {
    const res = await chatCompletion(config, messages)
    await recordUsage({
      config_id: config.id,
      config_name: config.name,
      task,
      model: res.model,
      mode: 'live',
      prompt_version: prompt.version,
      input_tokens: res.inputTokens,
      output_tokens: res.outputTokens,
      ok: true,
      error: '',
    })
    return {
      text: res.text,
      mode: 'live',
      promptVersion: prompt.version,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      model: res.model,
      error: '',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await recordUsage({
      config_id: config.id,
      config_name: config.name,
      task,
      model: config.model,
      mode: 'live',
      prompt_version: prompt.version,
      input_tokens: 0,
      output_tokens: 0,
      ok: false,
      error: message,
    })
    return {
      text: '',
      mode: 'live',
      promptVersion: prompt.version,
      inputTokens: 0,
      outputTokens: 0,
      model: config.model,
      error: message,
    }
  }
}

/** 把本地图片附件转成模型能吃的 data URL */
export async function attachmentsToImages(
  blobs: { name: string; blob: Blob }[],
): Promise<{ name: string; dataUrl: string }[]> {
  const out: { name: string; dataUrl: string }[] = []
  for (const b of blobs) {
    try {
      out.push({ name: b.name, dataUrl: await blobToDataUrl(b.blob) })
    } catch {
      /* 单张失败不影响整批 */
    }
  }
  return out
}
