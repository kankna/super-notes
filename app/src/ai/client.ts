import type { AiConfig } from '../db/types'

export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image_url'
  image_url: { url: string; detail?: 'low' | 'high' | 'auto' | 'original' }
}

export type ContentPart = TextPart | ImagePart
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface ChatResult {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
  resolvedUrl: string
}

/**
 * 统一拼接接口地址，避免重复添加路径。
 * - 结尾已是 /chat/completions → 直接用
 * - 含版本路径（如 /v1）→ 追加 /chat/completions
 * - 否则 → 追加 /v1/chat/completions
 */
export function resolveEndpoint(baseUrl: string): string {
  const base = (baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('Base URL 为空')
  if (/\/chat\/completions$/.test(base)) return base
  if (/\/v\d+$/.test(base)) return `${base}/chat/completions`
  return `${base}/v1/chat/completions`
}

export interface CallOptions {
  timeoutMs?: number
  maxTokens?: number
  temperature?: number | null
  signal?: AbortSignal
}

export async function chatCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  opts: CallOptions = {},
): Promise<ChatResult> {
  const url = resolveEndpoint(config.base_url)
  const controller = new AbortController()
  const timeout = opts.timeoutMs ?? config.timeout_ms ?? 60_000
  const timer = setTimeout(() => controller.abort(), timeout)
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false,
  }
  const maxTokens = opts.maxTokens ?? config.max_tokens
  if (maxTokens && maxTokens > 0) body.max_tokens = maxTokens
  const temperature = opts.temperature ?? config.temperature
  if (typeof temperature === 'number') body.temperature = temperature

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? `：${detail.slice(0, 300)}` : ''}`)
    }

    const json = await res.json()
    const text: string = json?.choices?.[0]?.message?.content ?? ''
    const usage = json?.usage ?? {}
    return {
      text: typeof text === 'string' ? text : JSON.stringify(text),
      inputTokens: Number(usage.prompt_tokens ?? 0),
      outputTokens: Number(usage.completion_tokens ?? 0),
      model: json?.model ?? config.model,
      resolvedUrl: url,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(timeout / 1000)} 秒）`)
    }
    throw err instanceof Error ? err : new Error(String(err))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 客户端侧的地址安全校验。
 *
 * 注意：这是**防误配**，不是安全边界 —— 真正的边界必须在服务端做，
 * 因为静态站无法阻止绕过本页面的直接请求。
 */
export function validateBaseUrl(raw: string): { ok: boolean; message: string; url?: string } {
  const v = (raw || '').trim()
  if (!v) return { ok: false, message: 'Base URL 不能为空' }
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return { ok: false, message: '不是合法的 URL' }
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, message: '只支持 http/https' }
  }
  if (u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    return { ok: false, message: '非本机地址必须使用 HTTPS' }
  }
  const host = u.hostname.toLowerCase()
  const blocked = [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
  ]
  if (blocked.includes(host)) {
    return { ok: false, message: '不能指向本机或云元数据地址（静态站限制，正式形态由服务端校验）' }
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return { ok: false, message: '不能指向内网地址' }
  }
  return { ok: true, message: '地址可用', url: v.replace(/\/+$/, '') }
}

/** Blob → base64 data URL（用于把本地图片送给模型） */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('图片读取失败'))
    fr.readAsDataURL(blob)
  })
}
