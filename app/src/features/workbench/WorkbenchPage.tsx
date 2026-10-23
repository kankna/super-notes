import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { useUI } from '../../store/ui'
import { computeTiming, stepTiming, UNCERTAIN_THRESHOLD } from '../../lib/timer'
import {
  addStepEvent,
  createSession,
  listStepEvents,
  recordAttempt,
  updateSession,
} from '../../db/repo/session'
import { createDoubt, toggleMark } from '../../db/repo/items'
import { formatDuration } from '../../lib/time'
import { StepBody } from './steps/StepBody'
import { NotesDrawer } from './NotesDrawer'
import type {
  Attempt,
  AttemptResult,
  Block,
  Doubt,
  Item,
  MarkKind,
  Session,
  StepEvent,
  Task,
} from '../../db/types'

export interface WbCtx {
  projectId: string
  unitId: string
  session: Session
  steps: Block[]
  step: Block
  stepIndex: number
  items: Item[]
  marks: Map<string, MarkKind[]>
  doubts: Doubt[]
  tasks: Task[]
  attempts: Attempt[]
  goStep: (i: number) => void
  onToggleMark: (itemId: string, kind: MarkKind) => Promise<void>
  onAddDoubt: (item: Item, title: string) => Promise<void>
  onAttempt: (args: {
    itemId?: string | null
    taskId?: string | null
    result: AttemptResult
    note?: string
  }) => Promise<void>
  refresh: () => void
}

/** 给数据库写入加超时保护：被阻塞时明确报错，而不是静默卡住。 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export function WorkbenchPage() {
  const { projectId = '', unitId = '' } = useParams()
  const navigate = useNavigate()
  const db = getDb()
  const { showToast } = useUI()

  const unit = useLiveQuery(() => db.units.get(unitId), [unitId])
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const chapters = useLiveQuery(
    () => db.chapters.where('project_id').equals(projectId).sortBy('order'),
    [projectId],
  )
  const allUnits = useLiveQuery(() => db.units.where('project_id').equals(projectId).sortBy('order'), [
    projectId,
  ])
  const items = useLiveQuery(() => db.items.where('unit_id').equals(unitId).sortBy('order'), [unitId])
  const doubts = useLiveQuery(() => db.doubts.where('unit_id').equals(unitId).toArray(), [unitId])
  const tasks = useLiveQuery(() => db.tasks.where('unit_id').equals(unitId).sortBy('order'), [unitId])
  const sessions = useLiveQuery(() => db.sessions.where('unit_id').equals(unitId).toArray(), [unitId])
  const markRows = useLiveQuery(() => db.marks.toArray(), [])

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<'none' | 'notes' | 'ai'>('none')
  const [tick, setTick] = useState(0)
  const [events, setEvents] = useState<StepEvent[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [, force] = useState(0)
  const refresh = useCallback(() => force((n) => n + 1), [])

  // 步骤事件与尝试结果显式加载：计时是核心链路，不能依赖实时查询的触发时机
  const loadEvents = useCallback(async () => {
    if (!sessionId) {
      setEvents([])
      return
    }
    setEvents(await listStepEvents(sessionId))
  }, [sessionId])

  const loadAttempts = useCallback(async () => {
    if (!sessionId) {
      setAttempts([])
      return
    }
    const rows = await db.attempts.where('session_id').equals(sessionId).toArray()
    setAttempts(rows.sort((a, b) => a.created_at - b.created_at))
  }, [sessionId])

  useEffect(() => {
    void loadEvents()
    void loadAttempts()
  }, [loadEvents, loadAttempts])

  const session = useMemo(
    () => sessions?.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId],
  )

  // 默认进入最近一轮未完成的学习
  useEffect(() => {
    if (!sessions || sessionId) return
    const open = sessions
      .filter((s) => s.status === 'in_progress' || s.status === 'paused')
      .sort((a, b) => b.started_at - a.started_at)[0]
    const latest = open ?? sessions.sort((a, b) => b.started_at - a.started_at)[0]
    if (latest) setSessionId(latest.id)
  }, [sessions, sessionId])

  const marks = useMemo(() => {
    const map = new Map<string, MarkKind[]>()
    for (const m of markRows ?? []) {
      const arr = map.get(m.item_id) ?? []
      arr.push(m.kind)
      map.set(m.item_id, arr)
    }
    return map
  }, [markRows])

  const timing = useMemo(
    () => computeTiming(events ?? [], Date.now()),
    // tick 参与依赖：正在计时时每秒重算，秒数才会走
    [events, refresh, tick],
  )

  const anyRunning = useMemo(
    () => Array.from(timing.byStep.values()).some((t) => t.running),
    [timing],
  )

  useEffect(() => {
    if (!anyRunning) return
    const t = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [anyRunning])

  const steps = session?.template_snapshot ?? []
  const stepIndex = Math.min(session?.current_step ?? 0, Math.max(0, steps.length - 1))
  const step = steps[stepIndex]
  const stepTimingInfo = step ? stepTiming(timing, step.id) : null
  const elapsed = stepTimingInfo?.activeMs ?? 0
  const running = stepTimingInfo?.running ?? false
  const started = (stepTimingInfo?.lastTs ?? null) !== null

  /* ---------------- 动作 ---------------- */

  const writeEvent = useCallback(
    async (type: Parameters<typeof addStepEvent>[2], opts?: { manual?: boolean; note?: string }) => {
      if (!session || !step) return
      try {
        await withTimeout(addStepEvent(session.id, step.id, type, opts), 8000, '写入超时')
        await withTimeout(updateSession(session.id, { status: 'in_progress' }), 8000, '更新超时')
        await loadEvents()
        refresh()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('记录步骤事件失败', err)
        showToast(err instanceof Error ? `记录失败：${err.message}` : '记录失败')
        await loadEvents()
      }
    },
    [session, step, refresh, showToast, loadEvents],
  )

  const onToggleTimer = useCallback(async () => {
    if (running) {
      await writeEvent('pause')
      return
    }
    await writeEvent(started ? 'resume' : 'start')
  }, [running, started, writeEvent])

  const onComplete = useCallback(async () => {
    if (!session || !step) return
    await writeEvent('complete')
    const next = stepIndex + 1
    await updateSession(session.id, {
      current_step: Math.min(next, steps.length - 1),
      status: next >= steps.length ? 'completed' : 'in_progress',
      ended_at: next >= steps.length ? Date.now() : null,
    })
    await loadEvents()
    refresh()
    if (next >= steps.length) {
      showToast('这一轮全部完成 🎉')
    } else {
      showToast(`完成「${step.name}」，下一步：${steps[next].name}`)
    }
  }, [session, step, writeEvent, stepIndex, steps, refresh, showToast, loadEvents])

  const onSkip = useCallback(async () => {
    await writeEvent('skip')
    showToast('这一步先跳过，不算完成')
  }, [writeEvent, showToast])

  const onDefer = useCallback(async () => {
    await writeEvent('defer')
    showToast('这一步改天再说，不算完成')
  }, [writeEvent, showToast])

  const onConfirmGap = useCallback(
    async (include: boolean) => {
      if (!session || !step) return
      const unc = timing.uncertain
      if (!unc || unc.stepId !== step.id) return
      if (include) {
        await addStepEvent(session.id, step.id, 'pause', { note: '用户确认计入空白区间' })
      } else {
        await addStepEvent(session.id, step.id, 'pause', {
          ts: unc.since + UNCERTAIN_THRESHOLD,
          note: '用户确认忽略空白区间',
        })
      }
      await loadEvents()
      refresh()
      showToast(include ? '这段时间算进学习时长' : '这段时间不算')
    },
    [session, step, timing.uncertain, refresh, showToast, loadEvents],
  )

  /* ---------------- 标记 / 疑点 / 尝试 ---------------- */

  const handleToggleMark = useCallback(
    async (itemId: string, kind: MarkKind) => {
      const on = await toggleMark(itemId, kind)
      refresh()
      if (on && kind === 'doubt') {
        const it = items?.find((i) => i.id === itemId)
        if (it) {
          await createDoubt({
            projectId,
            unitId,
            itemId,
            title: it.title,
            context: it.body_md.slice(0, 200),
          })
          showToast('已放进「不会清单」')
        }
      }
    },
    [items, projectId, unitId, refresh, showToast],
  )

  const handleAddDoubt = useCallback(
    async (item: Item, title: string) => {
      await createDoubt({
        projectId,
        unitId,
        itemId: item.id,
        title: title || item.title,
        context: item.body_md.slice(0, 300),
      })
      refresh()
      showToast('已放进「不会清单」')
    },
    [projectId, unitId, refresh, showToast],
  )

  const handleAttempt = useCallback(
    async (args: {
      itemId?: string | null
      taskId?: string | null
      result: AttemptResult
      note?: string
    }) => {
      if (!session || !step) return
      try {
        await recordAttempt({
          sessionId: session.id,
          stepId: step.id,
          itemId: args.itemId ?? null,
          taskId: args.taskId ?? null,
          result: args.result,
          note: args.note ?? '',
        })
        await loadAttempts()
        refresh()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('记录尝试结果失败', err)
      }
    },
    [session, step, refresh, loadAttempts],
  )

  const goStep = useCallback(
    (i: number) => {
      if (!session) return
      updateSession(session.id, { current_step: i })
      refresh()
    },
    [session, refresh],
  )

  if (!unit) return <div className="stage" />

  if (!session) {
    return (
      <StartSession
        unitId={unitId}
        unitTitle={unit.title}
        onStarted={(id) => {
          setSessionId(id)
          refresh()
        }}
      />
    )
  }

  const ctx: WbCtx = {
    projectId,
    unitId,
    session,
    steps,
    step,
    stepIndex,
    items: items ?? [],
    marks,
    doubts: doubts ?? [],
    tasks: tasks ?? [],
    attempts: (attempts ?? []).filter((a) => a.session_id === session.id),
    goStep,
    onToggleMark: handleToggleMark,
    onAddDoubt: handleAddDoubt,
    onAttempt: handleAttempt,
    refresh,
  }

  const uncertain =
    timing.uncertain && timing.uncertain.stepId === step?.id ? timing.uncertain : null

  return (
    <main className="stage stage--flush">
      <div className="wb2">
        <header className="wb2__top">
          <button className="wb2__back" onClick={() => navigate('/')}>
            ← 书架
          </button>
          <div className="wb2__crumb">
            {project?.name ? `${project.name} · ` : ''}
            {unit.title}
          </div>
          <div className="wb2__tools">
            <button className="wb2__tool" onClick={() => setDrawer('notes')}>
              看笔记
            </button>
            <button className="wb2__tool" onClick={() => setDrawer('ai')}>
              问 AI
            </button>
            <button className="wb2__tool" onClick={() => navigate(`/p/${projectId}`)}>
              课程表
            </button>
          </div>
        </header>

        <div className="wb2__progress">
          <div className="wb2__dots">
            {steps.map((b, i) => {
              const t = stepTiming(timing, b.id)
              const done = t.events.some((e) => e.type === 'complete')
              const skipped = t.events.some((e) => e.type === 'skip')
              const cls = done
                ? 'is-done'
                : skipped
                  ? 'is-skip'
                  : t.events.length
                    ? 'is-doing'
                    : ''
              return (
                <button
                  key={b.id}
                  className={`wb2__dot ${cls}${i === stepIndex ? ' is-now' : ''}`}
                  onClick={() => goStep(i)}
                  title={b.name}
                  aria-label={`第 ${i + 1} 步 ${b.name}`}
                >
                  {done ? '✓' : skipped ? '–' : i + 1}
                </button>
              )
            })}
          </div>
          <div className="wb2__now">
            <div className="wb2__stepno">
              第 {stepIndex + 1} 步 / 共 {steps.length} 步
            </div>
            <h1 className="wb2__stepname">{step?.name}</h1>
            {step?.what && <p className="wb2__stepwhat">{step.what}</p>}
          </div>
        </div>

        <div className="wb2__body">
          {step ? <StepBody ctx={ctx} /> : null}
        </div>

        <footer className="wb2__foot">
          {uncertain && (
            <div className="wb2__gap">
              <span>刚才有 {formatDuration(uncertain.ms)} 没有动静，算进学习时长吗？</span>
              <button className="linkbtn" onClick={() => onConfirmGap(true)}>
                算
              </button>
              <button className="linkbtn" onClick={() => onConfirmGap(false)}>
                不算
              </button>
            </div>
          )}
          <div className="wb2__bar">
            <div className="wb2__clock">
              <span className="wb2__clocklabel">这一步用时</span>
              <span className={`wb2__clockvalue${running ? ' is-on' : ''}`}>
                {formatDuration(elapsed)}
              </span>
            </div>
            <button className="btn wb2__toggle" onClick={onToggleTimer}>
              {running ? '暂停' : started ? '继续' : '开始'}
            </button>
            <button className="btn btn--primary wb2__done" onClick={onComplete}>
              完成这步
            </button>
          </div>
          <div className="wb2__minor">
            <button className="linkbtn" onClick={onSkip}>
              先跳过
            </button>
            <button className="linkbtn" onClick={onDefer}>
              改天再说
            </button>
          </div>
        </footer>

        {drawer !== 'none' && (
          <NotesDrawer
            mode={drawer}
            onClose={() => setDrawer('none')}
            ctx={ctx}
            chapters={chapters ?? []}
            allUnits={allUnits ?? []}
            onOpenUnit={(id) => {
              setDrawer('none')
              navigate(`/p/${projectId}/u/${id}`)
            }}
          />
        )}
      </div>
    </main>
  )
}

function StartSession({
  unitId,
  unitTitle,
  onStarted,
}: {
  unitId: string
  unitTitle: string
  onStarted: (id: string) => void
}) {
  const db = getDb()
  const { showToast } = useUI()
  const templates = useLiveQuery(() => db.templates.orderBy('created_at').toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.where('unit_id').equals(unitId).toArray(), [unitId])

  const start = async (templateId: string) => {
    try {
      const s = await createSession(unitId, templateId)
      onStarted(s.id)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('开始学习失败', err)
      showToast(err instanceof Error ? `开始失败：${err.message}` : '开始失败')
    }
  }

  return (
    <main className="stage">
      <div className="start">
        <button className="wb2__back" onClick={() => (location.hash = '#/')}>
          ← 书架
        </button>
        <h1 className="start__title">开始学「{unitTitle}」</h1>
        <p className="start__sub">选一个流程，系统会照着一步步带你走。选错了也没关系，随时能换。</p>

        {sessions && sessions.length > 0 && (
          <div className="start__history">
            <div className="start__hlabel">你之前学过</div>
            {sessions
              .sort((a, b) => b.started_at - a.started_at)
              .map((s) => (
                <div className="start__row" key={s.id}>
                  <span>{s.title}</span>
                  <span className="start__time">{new Date(s.started_at).toLocaleString('zh-CN')}</span>
                  <span className="start__status">{s.status}</span>
                </div>
              ))}
          </div>
        )}

        <div className="start__grid">
          {(templates ?? []).map((t) => (
            <button className="tcard" key={t.id} onClick={() => start(t.id)}>
              <div className="tcard__name">{t.name}</div>
              <div className="tcard__desc">{t.description}</div>
              <div className="tcard__blocks">
                {t.blocks.map((b, i) => (
                  <span className="tcard__block" key={b.id}>
                    {i + 1}. {b.name}
                  </span>
                ))}
              </div>
              <div className="tcard__cta">就用这个 →</div>
            </button>
          ))}
        </div>

        <div className="start__foot">
          没有合适的？去 <a href="#/templates">模板</a> 复制一个改，或者自己新建一个空白流程。
        </div>
      </div>
    </main>
  )
}
