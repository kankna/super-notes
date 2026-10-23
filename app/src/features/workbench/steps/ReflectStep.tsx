import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../../db/db'
import { newId } from '../../../lib/id'
import { Markdown } from '../../../components/Markdown'
import { useUI } from '../../../store/ui'
import type { WbCtx } from '../WorkbenchPage'

export function ReflectStep({ ctx }: { ctx: WbCtx }) {
  const db = getDb()
  const { showToast } = useUI()
  const guidance = ctx.step.settings.guidance ?? []

  const saved = useLiveQuery(
    () =>
      db.reflections
        .where('unit_id')
        .equals(ctx.unitId)
        .filter((r) => r.session_id === ctx.session.id)
        .sortBy('created_at'),
    [ctx.unitId, ctx.session.id],
  )

  const [body, setBody] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const save = async () => {
    if (!body.trim() && !Object.values(answers).some((a) => a.trim())) {
      showToast('还没写东西')
      return
    }
    await db.reflections.add({
      id: newId('r_'),
      project_id: ctx.projectId,
      unit_id: ctx.unitId,
      session_id: ctx.session.id,
      step_id: ctx.step.id,
      item_id: null,
      body_md: body,
      answers,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    setBody('')
    setAnswers({})
    ctx.refresh()
    showToast('已保存')
  }

  return (
    <div className="step">
      <div className="step__intro">
        <p className="step__detail">{ctx.step.instruction}</p>
      </div>

      {guidance.length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>引导问题</h3>
            <span className="card__hint">可以选着答，也可以全忽略</span>
          </div>
          {guidance.map((g, i) => (
            <div className="guide" key={i}>
              <div className="guide__q">{g}</div>
              <textarea
                className="textarea"
                placeholder="随便写，写多少算多少"
                value={answers[g] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [g]: e.target.value }))}
              />
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card__head">
          <h3>自由发挥</h3>
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 160 }}
          placeholder="写完题目再写收获。公式可以用 LaTeX：$x^2$"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row-btns">
          <button className="btn btn--primary btn--sm" onClick={save}>
            保存心得
          </button>
        </div>
      </section>

      {(saved ?? []).length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>这一轮写下的（{(saved ?? []).length}）</h3>
          </div>
          {(saved ?? []).map((r) => (
            <article className="reflection" key={r.id}>
              <div className="reflection__time">{new Date(r.created_at).toLocaleString('zh-CN')}</div>
              {r.body_md && <Markdown source={r.body_md} className="md" />}
              {Object.entries(r.answers ?? {}).map(([q, a]) => (
                <div className="reflection__qa" key={q}>
                  <div className="reflection__q">{q}</div>
                  <Markdown source={a} className="md" />
                </div>
              ))}
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
