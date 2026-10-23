import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { formatDuration, formatDurationCn } from '../../lib/time'
import type { StepTiming } from '../../lib/timer'

interface Props {
  timing: StepTiming
  stepName: string
  stepIndex: number
  stepTotal: number
  status: string
  onStart: () => void
  onPause: () => void
  onComplete: () => void
  onSkip: () => void
  onDefer: () => void
  onConfirmGap?: (include: boolean) => void
  uncertainMs?: number
  uncertainSince?: number
}

export function TimerBar({
  timing,
  stepName,
  stepIndex,
  stepTotal,
  status,
  onStart,
  onPause,
  onComplete,
  onSkip,
  onDefer,
  onConfirmGap,
  uncertainMs,
  uncertainSince,
}: Props) {
  const [, force] = useState(0)
  const raf = useRef<number | null>(null)

  // 显示由时间戳算出，每秒刷新一次显示即可，不上报
  useEffect(() => {
    if (!timing.running) return
    raf.current = window.setInterval(() => force((n) => n + 1), 1000)
    return () => {
      if (raf.current) window.clearInterval(raf.current)
    }
  }, [timing.running])

  const elapsed = timing.activeMs
  const showGap = uncertainMs !== undefined && uncertainMs > 0

  return (
    <div className="tbar">
      <div className="tbar__left">
        <div className="tbar__step">
          <span className="tbar__idx">
            {stepIndex + 1}/{stepTotal}
          </span>
          <span className="tbar__name">{stepName}</span>
        </div>
        <div className="tbar__status">{status}</div>
      </div>

      <div className="tbar__clock">
        <span className={`tbar__time${timing.running ? ' is-running' : ''}`}>
          {formatDuration(elapsed)}
        </span>
        <span className="tbar__hint">
          {timing.running ? '计时中' : timing.lastTs ? '已暂停' : '未开始'}
        </span>
      </div>

      <div className="tbar__actions">
        {showGap && onConfirmGap && (
          <div className="tbar__gap">
            <Icon name="clock" size={14} />
            <span>
              检测到 {formatDurationCn(uncertainMs!)} 的空白间隔，可能你已离开
            </span>
            <button className="btn btn--sm" onClick={() => onConfirmGap(true)}>
              计入
            </button>
            <button className="btn btn--sm" onClick={() => onConfirmGap(false)}>
              忽略
            </button>
          </div>
        )}

        {timing.running ? (
          <button className="btn btn--sm" onClick={onPause}>
            暂停
          </button>
        ) : (
          <button className="btn btn--sm btn--primary" onClick={onStart}>
            {timing.lastTs ? '继续' : '开始'}
          </button>
        )}
        <button className="btn btn--sm" onClick={onComplete} disabled={timing.lastTs === null}>
          完成
        </button>
        <button className="btn btn--sm btn--ghost" onClick={onSkip}>
          跳过
        </button>
        <button className="btn btn--sm btn--ghost" onClick={onDefer}>
          延后
        </button>
        {uncertainSince !== undefined && !showGap && (
          <span className="tbar__muted" title={`起始于 ${new Date(uncertainSince).toLocaleString()}`} />
        )}
      </div>
    </div>
  )
}
