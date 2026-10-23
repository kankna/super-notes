export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

/** 秒级展示：HH:MM:SS */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** 中文时长：1 小时 12 分 08 秒 */
export function formatDurationCn(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (h) parts.push(`${h} 小时`)
  if (m) parts.push(`${m} 分`)
  if (s || parts.length === 0) parts.push(`${s} 秒`)
  return parts.join(' ')
}

/** 带时区偏移的 ISO 时间戳 */
export function isoWithTz(ts: number, timeZone?: string): string {
  const d = new Date(ts)
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const base =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const local = timeZone ? base : base
  return `${local}${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function relativeDays(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 0) {
    const ahead = -diff
    if (ahead < DAY) return '今天'
    if (ahead < 2 * DAY) return '明天'
    return `${Math.round(ahead / DAY)} 天后`
  }
  if (diff < 3_600_000) return '刚刚'
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return formatDate(ts)
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
