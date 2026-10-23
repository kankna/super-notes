import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { Icon } from '../../components/Icon'
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
import { TimerBar } from './TimerBar'
import { SidePanel } from './SidePanel'
import { StepBody } from './steps/StepBody'
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

/** 给数据库写入加超时保护：被阻塞时明确报错，而不是静默卡住。 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

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

export function WorkbenchPage() {
  const { projectId = '', unitId = '' } = useParams()
  const navigate = useNavigate()
  const db = getDb()
  const { showToast } = useUI()

  const unit = useLiveQuery(() => db.units.get(unitId), [unitId])
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
  const [navOpen, setNavOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
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

  /* ---------------- 计时动作 ---------------- */

  const writeEvent = useCallback(
    async (type: Parameters<typeof addStepEvent>[2], opts?: { manual?: boolean; note?: string }) => {
      if (!session || !step) return
      try {
        await withTimeout(addStepEvent(session.id, step.id, type, opts), 8000, '写入步骤事件超时')
        await withTimeout(updateSession(session.id, { status: 'in_progress' }), 8000, '更新会话超时')
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

  const onStart = useCallback(async () => {
    const t = step ? stepTiming(timing, step.id) : null
    await writeEvent(t?.lastTs ? 'resume' : 'start')
  }, [writeEvent, step, timing])

  const onPause = useCallback(async () => {
    await writeEvent('pause')
  }, [writeEvent])

  const onComplete = useCallback(async () => {
    await writeEvent('complete')
    if (session && steps.length) {
      const next = stepIndex + 1
      await updateSession(session.id, {
        current_step: Math.min(next, steps.length - 1),
        status: next >= steps.length ? 'completed' : 'in_progress',
        ended_at: next >= steps.length ? Date.now() : null,
      })
      refresh()
    }
    showToast('这一步已完成')
  }, [writeEvent, session, steps.length, stepIndex, refresh, showToast])

  const onSkip = useCallback(async () => {
    await writeEvent('skip')
    showToast('已记为「跳过」—— 不算完成')
  }, [writeEvent, showToast])

  const onDefer = useCallback(async () => {
    await writeEvent('defer')
    showToast('已记为「延后」—— 不算完成')
  }, [writeEvent, showToast])

  const onConfirmGap = useCallback(
    async (include: boolean) => {
      if (!session || !step) return
      const unc = timing.uncertain
      if (!unc || unc.stepId !== step.id) return
      if (include) {
        // 计入：补一条结束事件，把这段空白结掉
        await addStepEvent(session.id, step.id, 'pause', { note: '用户确认计入空白区间' })
      } else {
        // 忽略：在空白开始处截断
        await addStepEvent(session.id, step.id, 'pause', {
          ts: unc.since + UNCERTAIN_THRESHOLD,
          note: '用户确认忽略空白区间',
        })
      }
      refresh()
      showToast(include ? '空白区间已计入' : '空白区间已忽略')
    },
    [session, step, timing.uncertain, refresh, showToast],
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
          showToast('已记入疑点清单')
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
      showToast('已记入疑点清单')
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

  /* ---------------- 开始一轮 ---------------- */

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

  const stepTimingInfo = step ? stepTiming(timing, step.id) : null
  const unitAttempts = ctx.attempts

  return (
    <main className="stage stage--flush">
      <div className="wb">
        <div className="wb__head">
          <button className="linkbtn" onClick={() => navigate(`/p/${projectId}`)}>
            ← {ctx.steps.length ? '项目画布' : ''}
          </button>
          <h1 className="wb__unit">{unit.title}</h1>
          <span className="wb__meta">
            {session.template_snapshot.length} 个步骤 · 本轮开始于{' '}
            {new Date(session.started_at).toLocaleString('zh-CN')}
          </span>
          <div className="wb__spacer" />
          <div className="wb__steps">
            {steps.map((b, i) => {
              const t = stepTiming(timing, b.id)
              const done = t.events.some((e) => e.type === 'complete')
              const skipped = t.events.some((e) => e.type === 'skip')
              const deferred = t.events.some((e) => e.type === 'defer')
              const started = t.events.length > 0
              const cls = done
                ? 'is-done'
                : skipped
                  ? 'is-skip'
                  : deferred
                    ? 'is-defer'
                    : started
                      ? 'is-doing'
                      : 'is-idle'
              return (
                <button
                  key={b.id}
                  className={`wstep ${cls}${i === stepIndex ? ' is-current' : ''}`}
                  onClick={() => goStep(i)}
                  aria-label={`第 ${i + 1} 步 ${b.name}`}
                  title={b.instruction}
                >
                  <span className="wstep__idx">{i + 1}</span>
                  <span className="wstep__name">{b.name}</span>
                </button>
              )
            })}
          </div>

          <button
            className="iconbtn wb__drawer-btn"
            title="资料导航"
            onClick={() => {
              setNavOpen((v) => !v)
              setSideOpen(false)
            }}
          >
            <Icon name="folder" size={17} />
          </button>
          <button
            className="iconbtn wb__drawer-btn"
            title="随手记与 AI"
            onClick={() => {
              setSideOpen((v) => !v)
              setNavOpen(false)
            }}
          >
            <Icon name="info" size={17} />
          </button>
        </div>

        {step && (
          <TimerBar
            timing={stepTimingInfo!}
            stepName={step.name}
            stepIndex={stepIndex}
            stepTotal={steps.length}
            status={step.timing === 'none' ? '不计时' : step.timing === 'pomodoro' ? '番茄钟' : '手动计时'}
            onStart={onStart}
            onPause={onPause}
            onComplete={onComplete}
            onSkip={onSkip}
            onDefer={onDefer}
            onConfirmGap={onConfirmGap}
            uncertainMs={
              timing.uncertain && timing.uncertain.stepId === step.id
                ? timing.uncertain.ms
                : undefined
            }
            uncertainSince={
              timing.uncertain && timing.uncertain.stepId === step.id
                ? timing.uncertain.since
                : undefined
            }
          />
        )}

        <div className="wb__cols">
          <aside className={`wb__nav${navOpen ? ' is-open' : ''}`}>
            <div className="wb__nav-title">资料导航</div>
            {(chapters ?? []).map((ch) => (
              <div className="wnav__group" key={ch.id}>
                <div className="wnav__ch">{ch.name}</div>
                {(allUnits ?? [])
                  .filter((u) => u.chapter_id === ch.id)
                  .map((u) => (
                    <button
                      key={u.id}
                      className={`wnav__unit${u.id === unitId ? ' is-on' : ''}`}
                      onClick={() => navigate(`/p/${projectId}/u/${u.id}`)}
                    >
                      {u.title}
                    </button>
                  ))}
              </div>
            ))}
            <div className="wnav__group">
              <div className="wnav__ch">本单元条目</div>
              {(items ?? []).map((i) => (
                <div className="wnav__item" key={i.id}>
                  <span className={`wnav__kind wnav__kind--${i.kind}`}>
                    {i.kind === 'theorem'
                      ? '定'
                      : i.kind === 'formula'
                        ? '式'
                        : i.kind === 'example'
                          ? '例'
                          : i.kind === 'answer'
                            ? '答'
                            : i.kind === 'summary'
                              ? '结'
                              : '记'}
                  </span>
                  {i.title}
                </div>
              ))}
              {(items ?? []).length === 0 && <div className="wnav__empty">还没有条目</div>}
            </div>
            <button
              className="btn btn--sm wnav__proof"
              onClick={() => navigate(`/p/${projectId}/u/${unitId}/proof`)}
            >
              <Icon name="info" size={14} />
              原图校对
            </button>
          </aside>

          <main className="wb__main">
            {step && <StepBody ctx={ctx} />}
          </main>

          <aside className={`wb__side${sideOpen ? ' is-open' : ''}`}>
            <SidePanel ctx={ctx} unitAttempts={unitAttempts} />
          </aside>
        </div>
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
        <h1 className="start__title">{unitTitle}</h1>
        <p className="start__sub">选一个流程模板开始这一轮学习。模板会在此刻拍快照，之后改模板不影响这一轮。</p>

        {sessions && sessions.length > 0 && (
          <div className="start__history">
            <div className="start__hlabel">历史轮次</div>
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
              <div className="tcard__cta">用这个模板开始 →</div>
            </button>
          ))}
        </div>

        <div className="start__foot">
          没找到合适的？去 <a href="#/templates">模板页</a> 复制一个改，或者新建一个空白流程。
        </div>
      </div>
    </main>
  )
}
