import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../../db/db'
import { newId } from '../../../lib/id'
import { Icon } from '../../../components/Icon'
import { Markdown } from '../../../components/Markdown'
import { useUI } from '../../../store/ui'
import type { WbCtx } from '../WorkbenchPage'

export function FreeStep({ ctx }: { ctx: WbCtx }) {
  const db = getDb()
  const { showToast } = useUI()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [body, setBody] = useState('')
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)

  const saved = useLiveQuery(
    () =>
      db.reflections
        .where('unit_id')
        .equals(ctx.unitId)
        .filter((r) => r.session_id === ctx.session.id && r.step_id === ctx.step.id)
        .sortBy('created_at'),
    [ctx.unitId, ctx.session.id, ctx.step.id],
  )

  const save = async () => {
    if (!body.trim() && !pendingPhoto) {
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
      answers: {},
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    if (pendingPhoto) {
      await db.attachments.add({
        id: newId('a_'),
        project_id: ctx.projectId,
        unit_id: ctx.unitId,
        item_id: null,
        name: pendingPhoto.name,
        mime: pendingPhoto.type || 'image/jpeg',
        size: pendingPhoto.size,
        role: 'evidence',
        blob: pendingPhoto,
        created_at: Date.now(),
      })
    }
    setBody('')
    setPendingPhoto(null)
    ctx.refresh()
    showToast('已保存')
  }

  return (
    <div className="step">
      <div className="step__intro">
        <p className="step__detail">{ctx.step.instruction}</p>
      </div>

      <section className="card">
        <div className="card__head">
          <h3>产出</h3>
          <span className="card__hint">文本或图片都行</span>
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 180 }}
          placeholder="写点什么。公式可以用 LaTeX：$x^2$"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row-btns">
          <button className="btn btn--sm" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={14} />
            {pendingPhoto ? '已选 1 张图' : '附一张图'}
          </button>
          <button className="btn btn--primary btn--sm" onClick={save}>
            保存
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            setPendingPhoto(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
      </section>

      {(saved ?? []).length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>已产出（{(saved ?? []).length}）</h3>
          </div>
          {(saved ?? []).map((r) => (
            <article className="reflection" key={r.id}>
              <div className="reflection__time">{new Date(r.created_at).toLocaleString('zh-CN')}</div>
              <Markdown source={r.body_md} className="md" />
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
