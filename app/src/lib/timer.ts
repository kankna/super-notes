import type { StepEvent, StepEventType } from '../db/types'

/**
 * 计时引擎。
 *
 * 原则：只存事件，不存计数器。任何显示时长都由事件时间戳区间实时算出，
 * 刷新页面、重开浏览器、换设备都不会漂移。
 */

export interface StepTiming {
  /** 已完成的活动时长（毫秒） */
  activeMs: number
  /** 是否正在计时 */
  running: boolean
  /** 当前区间起点（正在计时时有值） */
  openSince: number | null
  /** 该步骤的事件序列 */
  events: StepEvent[]
  /** 最后一次事件时间 */
  lastTs: number | null
}

export interface TimingResult {
  byStep: Map<string, StepTiming>
  totalActiveMs: number
  /** 全局是否存在不确定的空白区间 */
  uncertain: { stepId: string; since: number; ms: number } | null
}

/** 超过这个间隔没有事件，就认为用户离开过，区间待确认 */
export const UNCERTAIN_THRESHOLD = 5 * 60_000

export function computeTiming(events: StepEvent[], now = Date.now()): TimingResult {
  const byStep = new Map<string, StepTiming>()
  const sorted = [...events].sort(
    (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  for (const ev of sorted) {
    let t = byStep.get(ev.step_id)
    if (!t) {
      t = { activeMs: 0, running: false, openSince: null, events: [], lastTs: null }
      byStep.set(ev.step_id, t)
    }
    t.events.push(ev)
    t.lastTs = ev.ts

    switch (ev.type) {
      case 'start':
      case 'resume':
        if (t.openSince === null) t.openSince = ev.ts
        t.running = true
        break
      case 'pause':
      case 'complete':
      case 'skip':
      case 'defer':
        if (t.openSince !== null) {
          t.activeMs += Math.max(0, ev.ts - t.openSince)
          t.openSince = null
        }
        t.running = false
        break
      case 'takeover':
        // 换端接续：先结算旧区间，再从此刻重新开始
        if (t.openSince !== null) {
          t.activeMs += Math.max(0, ev.ts - t.openSince)
        }
        t.openSince = ev.ts
        t.running = true
        break
    }
  }

  let totalActiveMs = 0
  let uncertain: TimingResult['uncertain'] = null

  for (const [stepId, t] of byStep) {
    if (t.running && t.openSince !== null) {
      const gap = now - t.openSince
      if (gap > UNCERTAIN_THRESHOLD) {
        // 用户可能已经离开，不能默认算作有效学习
        uncertain = { stepId, since: t.openSince, ms: gap }
      } else {
        t.activeMs += gap
      }
    }
    totalActiveMs += t.activeMs
  }

  return { byStep, totalActiveMs, uncertain }
}

export function stepTiming(result: TimingResult, stepId: string): StepTiming {
  return (
    result.byStep.get(stepId) ?? {
      activeMs: 0,
      running: false,
      openSince: null,
      events: [],
      lastTs: null,
    }
  )
}

/** 当前处于“正在计时”的步骤（一个用户同一时刻只允许一个） */
export function activeStepId(result: TimingResult): string | null {
  for (const [id, t] of result.byStep) {
    if (t.running) return id
  }
  return null
}

export function nextEventType(t: StepTiming): StepEventType {
  if (t.running) return 'pause'
  if (t.lastTs === null) return 'start'
  return 'resume'
}
