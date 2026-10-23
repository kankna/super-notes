import { useEffect, useRef, useState } from 'react'
import { getDb } from '../../db/db'
import { newId } from '../../lib/id'
import { formatDuration } from '../../lib/time'
import type { Pomodoro } from '../../db/types'

interface Props {
  sessionId: string
  stepId: string
  workMinutes: number
  breakMinutes: number
}

/**
 * 番茄钟：工作段与休息段分别记录。
 * 休息不计入"活动时长"，只单独归档，避免把休息算成学习时间。
 */
export function Pomodoro({ sessionId, stepId, workMinutes, breakMinutes }: Props) {
  const [current, setCurrent] = useState<Pomodoro | null>(null)
  const [now, setNow] = useState(Date.now())
  const raf = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const db = getDb()
      const rows = await db.pomodoros.where('session_id').equals(sessionId).toArray()
      const open = rows.filter((p) => p.ended_at === null).sort((a, b) => b.started_at - a.started_at)[0]
      if (alive) setCurrent(open ?? null)
    }
    load()
    return () => {
      alive = false
    }
  }, [sessionId])

  useEffect(() => {
    if (!current) return
    raf.current = window.setInterval(() => setNow(Date.now()), 250)
    return () => {
      if (raf.current) window.clearInterval(raf.current)
    }
  }, [current])

  const remaining = current
    ? Math.max(0, current.planned_ms - (now - current.started_at))
    : 0
  const isBreak = current?.kind === 'break'
  const planned = current?.planned_ms ?? 0

  const ring = async () => {
    if (!current) return
    const db = getDb()
    await db.pomodoros.update(current.id, { ended_at: Date.now() })
    setCurrent(null)
    beep()
  }

  const start = async (kind: 'work' | 'break') => {
    const db = getDb()
    const row: Pomodoro = {
      id: newId('pm_'),
      session_id: sessionId,
      step_id: stepId,
      kind,
      started_at: Date.now(),
      ended_at: null,
      planned_ms: (kind === 'work' ? workMinutes : breakMinutes) * 60_000,
    }
    await db.pomodoros.add(row)
    setCurrent(row)
    setNow(Date.now())
  }

  const paused = remaining > 0 && remaining < planned

  return (
    <div className="pomo">
      <div className="pomo__dial">
        <div className={`pomo__time${isBreak ? ' is-break' : ''}`}>{formatDuration(remaining)}</div>
        <div className="pomo__label">{isBreak ? '休息' : '专注'}</div>
      </div>
      <div className="pomo__ctrls">
        {current ? (
          <>
            <button className="btn btn--sm" onClick={ring}>
              {paused ? '提前结束' : '结束本段'}
            </button>
            {isBreak ? (
              <button className="btn btn--sm btn--primary" onClick={() => start('work')}>
                开始下一段
              </button>
            ) : (
              <button className="btn btn--sm btn--primary" onClick={() => start('break')}>
                休息 {breakMinutes} 分钟
              </button>
            )}
          </>
        ) : (
          <button className="btn btn--sm btn--primary" onClick={() => start('work')}>
            开始专注 {workMinutes} 分钟
          </button>
        )}
      </div>
    </div>
  )
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2)
    osc.start()
    osc.stop(ctx.currentTime + 1.3)
    setTimeout(() => void ctx.close(), 1600)
  } catch {
    /* 浏览器不允许播放时忽略 */
  }
}
