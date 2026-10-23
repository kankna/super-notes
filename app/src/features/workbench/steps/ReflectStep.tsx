import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../../db/db'
import { newId } from '../../../lib/id'
import { Markdown } from '../../../components/Markdown'
import { Icon } from '../../../components/Icon'
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
  const [hintOpen, setHintOpen] = useState(false)
  const [draft, setDraft] = useState('')

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

  /** 把提示面板里写的内容追加到正文 */
  const appendDraft = () => {
    if (!draft.trim()) return
    setBody((b) => (b.trim() ? `${b.trim()}\n\n${draft.trim()}` : draft.trim()))
    setDraft('')
    setHintOpen(false)
  }

  return (
    <div className="step">
      <section className="card">
        <div className="card__head">
          <h3>这次学到了什么</h3>
          {guidance.length > 0 && (
            <button className="btn btn--sm card__acts" onClick={() => setHintOpen(true)}>
              不知道怎么写？
            </button>
          )}
        </div>
        <textarea
          className="textarea reflect__box"
          placeholder="想到什么写什么。公式可以用 LaTeX：$x^2$"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row-btns">
          <button className="btn btn--primary" onClick={save}>
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

      {hintOpen && (
        <div className="modal-backdrop" onClick={() => setHintOpen(false)}>
          <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3 className="modal__title">换个角度想想</h3>
              <button className="iconbtn" onClick={() => setHintOpen(false)} aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="modal__body">
              <div className="msg">
                <div className="msg__who">学习助手</div>
                <div className="msg__bubble">
                  挑一个顺眼的回答就行，也可以一个都不答。
                  <ul className="msg__list">
                    {guidance.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <textarea
                className="textarea msg__input"
                placeholder="在这里写，写完放回上面"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>

            <div className="modal__foot">
              <button className="btn btn--ghost" onClick={() => setHintOpen(false)}>
                关闭
              </button>
              <button className="btn btn--primary" onClick={appendDraft}>
                放进去
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
