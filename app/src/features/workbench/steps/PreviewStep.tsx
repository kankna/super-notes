import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../../db/db'
import { newId } from '../../../lib/id'
import { useUI } from '../../../store/ui'
import type { WbCtx } from '../WorkbenchPage'

export function PreviewStep({ ctx }: { ctx: WbCtx }) {
  const db = getDb()
  const { showToast } = useUI()
  const units = useLiveQuery(() => db.units.where('project_id').equals(ctx.projectId).sortBy('order'), [
    ctx.projectId,
  ])
  const saved = useLiveQuery(
    () =>
      db.preview_notes
        .where('unit_id')
        .equals(ctx.unitId)
        .filter((p) => p.session_id === ctx.session.id)
        .sortBy('created_at'),
    [ctx.unitId, ctx.session.id],
  )

  const nextUnits = (units ?? []).filter((u) => u.id !== ctx.unitId)
  const [target, setTarget] = useState(nextUnits[0]?.id ?? '')
  const [keyPoints, setKeyPoints] = useState('')
  const [difficulties, setDifficulties] = useState('')
  const [questions, setQuestions] = useState('')

  const save = async () => {
    if (!keyPoints.trim() && !difficulties.trim() && !questions.trim()) {
      showToast('至少写一条')
      return
    }
    const targetUnit = nextUnits.find((u) => u.id === target)
    await db.preview_notes.add({
      id: newId('pv_'),
      project_id: ctx.projectId,
      unit_id: ctx.unitId,
      session_id: ctx.session.id,
      title: targetUnit?.title ?? '下一课',
      key_points: keyPoints,
      difficulties: difficulties,
      questions: questions,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    setKeyPoints('')
    setDifficulties('')
    setQuestions('')
    ctx.refresh()
    showToast('已保存预习清单')
  }

  return (
    <div className="step">
      <div className="step__intro">
        <p className="step__detail">{ctx.step.instruction}</p>
        <div className="alert alert--info">
          探路的目标是「知道 Boss 在哪」，不是「把整关打穿」。别在这里死磕。
        </div>
      </div>

      <section className="card">
        <div className="card__head">
          <h3>下一课</h3>
        </div>
        {nextUnits.length === 0 ? (
          <div className="card__empty">这个项目还没有其他单元。先去画布加一课。</div>
        ) : (
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            {nextUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.title}
              </option>
            ))}
          </select>
        )}

        <div className="guide">
          <div className="guide__q">重点（这节课大概要讲什么）</div>
          <textarea
            className="textarea"
            placeholder="Boss 在哪：这一节的主线是什么？"
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
          />
        </div>
        <div className="guide">
          <div className="guide__q">难点（哪里大概率会卡）</div>
          <textarea
            className="textarea"
            placeholder="精英怪：哪几个点可能听不懂？"
            value={difficulties}
            onChange={(e) => setDifficulties(e.target.value)}
          />
        </div>
        <div className="guide">
          <div className="guide__q">待问的问题（课上要问老师 / 查资料）</div>
          <textarea
            className="textarea"
            placeholder="武器装备在哪：需要提前准备什么？"
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
          />
        </div>

        <div className="row-btns">
          <button className="btn btn--primary btn--sm" onClick={save}>
            保存预习清单
          </button>
        </div>
      </section>

      {(saved ?? []).length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>已记录（{(saved ?? []).length}）</h3>
          </div>
          {(saved ?? []).map((p) => (
            <article className="reflection" key={p.id}>
              <div className="reflection__time inline">
                <span>{p.title}</span>
                <span>{new Date(p.created_at).toLocaleString('zh-CN')}</span>
              </div>
              {p.key_points && (
                <div className="reflection__qa">
                  <div className="reflection__q">重点</div>
                  <div>{p.key_points}</div>
                </div>
              )}
              {p.difficulties && (
                <div className="reflection__qa">
                  <div className="reflection__q">难点</div>
                  <div>{p.difficulties}</div>
                </div>
              )}
              {p.questions && (
                <div className="reflection__qa">
                  <div className="reflection__q">待问</div>
                  <div>{p.questions}</div>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
