import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../../db/db'
import { newId } from '../../../lib/id'
import { Icon } from '../../../components/Icon'
import { Pomodoro } from '../Pomodoro'
import { updateTask } from '../../../db/repo/session'
import { useUI } from '../../../store/ui'
import { formatDuration } from '../../../lib/time'
import type { WbCtx } from '../WorkbenchPage'
import type { Task } from '../../../db/types'

const DIFFS: { id: Task['difficulty']; label: string }[] = [
  { id: 'easy', label: '简单' },
  { id: 'medium', label: '中等' },
  { id: 'hard', label: '较难' },
]

export function PracticeStep({ ctx }: { ctx: WbCtx }) {
  const db = getDb()
  const { showToast } = useUI()
  const [adding, setAdding] = useState('')
  const [tick, setTick] = useState(0)
  const runningTaskRef = useRef<string | null>(null)
  const runningSinceRef = useRef<number | null>(null)

  const photos = useLiveQuery(
    () => db.attachments.where('unit_id').equals(ctx.unitId).filter((a) => a.role !== 'source_photo').toArray(),
    [ctx.unitId],
  )

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])

  const elapsedOf = (t: Task) => {
    void tick
    if (runningTaskRef.current !== t.id || runningSinceRef.current === null) return t.spent_ms
    return t.spent_ms + (Date.now() - runningSinceRef.current)
  }

  const startTask = (t: Task) => {
    if (runningTaskRef.current && runningTaskRef.current !== t.id) {
      stopTask(runningTaskRef.current)
    }
    runningTaskRef.current = t.id
    runningSinceRef.current = Date.now()
    updateTask(t.id, { status: 'doing' })
    ctx.refresh()
  }

  const stopTask = (id: string) => {
    const t = ctx.tasks.find((x) => x.id === id)
    if (!t || runningTaskRef.current !== id || runningSinceRef.current === null) return
    const add = Date.now() - runningSinceRef.current
    runningTaskRef.current = null
    runningSinceRef.current = null
    updateTask(id, { spent_ms: t.spent_ms + add, status: 'done' })
    ctx.refresh()
  }

  const addTask = async () => {
    const title = adding.trim()
    if (!title) return
    await db.tasks.add({
      id: newId('t_'),
      project_id: ctx.projectId,
      unit_id: ctx.unitId,
      session_id: ctx.session.id,
      title,
      difficulty: null,
      status: 'todo',
      spent_ms: 0,
      wrong: false,
      note: '',
      order: ctx.tasks.length,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    setAdding('')
    ctx.refresh()
  }

  const uploadPhoto = async (taskId: string, role: 'wrong' | 'good', files: FileList | null) => {
    if (!files?.length) return
    for (const f of Array.from(files)) {
      await db.attachments.add({
        id: newId('a_'),
        project_id: ctx.projectId,
        unit_id: ctx.unitId,
        item_id: null,
        name: f.name,
        mime: f.type || 'image/jpeg',
        size: f.size,
        role,
        blob: f,
        created_at: Date.now(),
      })
    }
    if (role === 'wrong') await updateTask(taskId, { wrong: true })
    ctx.refresh()
    showToast(`已收录${role === 'wrong' ? '错题' : '好题'}照片`)
  }

  const maxMs = (ctx.step.settings.maxMinutesPerTask ?? 0) * 60_000
  const overList = ctx.tasks.filter((t) => maxMs > 0 && elapsedOf(t) > maxMs)

  return (
    <div className="step">
      <div className="step__intro">
        <h2>{ctx.step.name}</h2>
        <p>{ctx.step.instruction}</p>
      </div>

      <section className="card">
        <div className="card__head">
          <h3>番茄钟</h3>
          <span className="card__hint">休息单独记录，不计入学习时长</span>
        </div>
        <Pomodoro
          sessionId={ctx.session.id}
          stepId={ctx.step.id}
          workMinutes={ctx.step.settings.pomodoro?.work ?? 25}
          breakMinutes={ctx.step.settings.pomodoro?.break ?? 5}
        />
      </section>

      {overList.length > 0 && (
        <div className="alert alert--warn">
          <Icon name="clock" size={15} />
          「{overList[0].title}」已经停留超过 {ctx.step.settings.maxMinutesPerTask} 分钟了。
          先判断一下是不是这题太难 —— 换个思路或者先跳过。
        </div>
      )}

      <section className="card">
        <div className="card__head">
          <h3>作业清单（{ctx.tasks.length}）</h3>
          <span className="card__hint">先粗分难度，别在一道题上耗太久</span>
        </div>

        <div className="tasklist">
          {ctx.tasks.map((t) => {
            const el = elapsedOf(t)
            const running = runningTaskRef.current === t.id
            const shotWrong = (photos ?? []).filter((p) => p.role === 'wrong')
            return (
              <div className={`task${running ? ' is-running' : ''}`} key={t.id}>
                <div className="task__main">
                  <div className="task__title">{t.title}</div>
                  <div className="task__meta">
                    <span className="task__time">{formatDuration(el)}</span>
                    <div className="task__diffs">
                      {DIFFS.map((d) => (
                        <button
                          key={d.id}
                          className={`dchip${t.difficulty === d.id ? ' is-on' : ''}`}
                          onClick={async () => {
                            await updateTask(t.id, { difficulty: d.id })
                            ctx.refresh()
                          }}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    {t.wrong && <span className="task__wrong">错题</span>}
                  </div>
                </div>
                <div className="task__acts">
                  {running ? (
                    <button className="btn btn--sm" onClick={() => stopTask(t.id)}>
                      完成这题
                    </button>
                  ) : (
                    <button className="btn btn--sm" onClick={() => startTask(t)}>
                      开始
                    </button>
                  )}
                  <label className="btn btn--sm" title="拍照收录错题">
                    <Icon name="trash" size={13} />
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        uploadPhoto(t.id, 'wrong', e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <label className="btn btn--sm" title="拍照收录好题">
                    <Icon name="book" size={13} />
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        uploadPhoto(t.id, 'good', e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    className="iconbtn"
                    title="删除"
                    onClick={async () => {
                      await db.tasks.delete(t.id)
                      ctx.refresh()
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                {shotWrong.length > 0 && (
                  <div className="task__shots">
                    {shotWrong.slice(-4).map((p) => (
                      <img key={p.id} src={URL.createObjectURL(p.blob)} alt={p.name} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="task__add">
          <input
            className="input"
            value={adding}
            placeholder="加一道题，比如「教材 P68 习题 3」"
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
          />
          <button className="btn btn--primary btn--sm" onClick={addTask}>
            添加
          </button>
        </div>
      </section>

      {(photos ?? []).length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>错题与好题（{(photos ?? []).length}）</h3>
          </div>
          <div className="photo-grid">
            {(photos ?? []).map((p) => (
              <div className="photo" key={p.id}>
                <img src={URL.createObjectURL(p.blob)} alt={p.name} />
                <div className="photo__bar">
                  <span>{p.role === 'wrong' ? '错题' : '好题'}</span>
                  <button
                    className="iconbtn"
                    onClick={async () => {
                      await db.attachments.delete(p.id)
                      ctx.refresh()
                    }}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
