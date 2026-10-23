import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../../db/db'
import { newId } from '../../../lib/id'
import { Icon } from '../../../components/Icon'
import { Markdown } from '../../../components/Markdown'
import { attachmentsToImages, runTask } from '../../../ai/tasks'
import { validateOrganized } from '../../../ai/schema'
import { useUI } from '../../../store/ui'
import type { WbCtx } from '../WorkbenchPage'
import type { Item } from '../../../db/types'

const TRANSCRIPT_KEY = (unitId: string) => `transcript.${unitId}`

export function OrganizeStep({ ctx }: { ctx: WbCtx }) {
  const db = getDb()
  const navigate = useNavigate()
  const { showToast } = useUI()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const photos = useLiveQuery(
    () =>
      db.attachments
        .where('unit_id')
        .equals(ctx.unitId)
        .filter((a) => a.role === 'source_photo')
        .sortBy('created_at'),
    [ctx.unitId],
  )
  const transcriptRow = useLiveQuery(() => db.settings.get(TRANSCRIPT_KEY(ctx.unitId)), [ctx.unitId])
  const transcript = (transcriptRow?.value as string) ?? ''

  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState('')

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const f of Array.from(files)) {
      await db.attachments.add({
        id: newId('a_'),
        project_id: ctx.projectId,
        unit_id: ctx.unitId,
        item_id: null,
        name: f.name,
        mime: f.type || 'image/jpeg',
        size: f.size,
        role: 'source_photo',
        blob: f,
        created_at: Date.now(),
      })
    }
    ctx.refresh()
    showToast(`已上传 ${files.length} 张`)
  }

  const runTranscribe = async () => {
    setBusy('transcribe')
    setErr('')
    try {
      const imgs = await attachmentsToImages(
        (photos ?? []).map((p) => ({ name: p.name, blob: p.blob })),
      )
      const res = await runTask('transcribe', {
        vars: { pages: String(imgs.length), note: '' },
        images: imgs,
      })
      if (res.error) {
        setErr(res.error)
        return
      }
      await db.settings.put({ key: TRANSCRIPT_KEY(ctx.unitId), value: res.text })
      setPreview(res.text)
      showToast(`转写完成（${res.mode === 'mock' ? 'Mock 模式' : res.model}）`)
      ctx.refresh()
    } finally {
      setBusy(null)
    }
  }

  const runOrganize = async () => {
    if (!transcript) {
      setErr('还没有转写结果，先跑一次转写')
      return
    }
    setBusy('organize')
    setErr('')
    try {
      const res = await runTask('organize', { vars: { transcript } })
      if (res.error) {
        setErr(res.error)
        return
      }
      const check = validateOrganized(res.text)
      if (!check.data) {
        setErr(`整理结果未通过校验：${check.issues.map((i) => i.message).join('；')}`)
        return
      }
      // 草稿：来源标记为 AI、未确认，不覆盖已有正文
      const existing = ctx.items.length
      let order = existing
      for (const it of check.data.items) {
        await db.items.add({
          id: newId('i_'),
          project_id: ctx.projectId,
          unit_id: ctx.unitId,
          kind: it.kind,
          title: it.title,
          body_md: it.body_md,
          source: 'ai',
          confirmed: false,
          order: order++,
          created_at: Date.now(),
          updated_at: Date.now(),
          deleted_at: null,
        })
      }
      const pending = check.data.pending ?? []
      if (pending.length) {
        await db.settings.put({ key: `pending.${ctx.unitId}`, value: pending })
      }
      showToast(
        `整理出 ${check.data.items.length} 条草稿${check.issues.length ? `（${check.issues.length} 处待确认）` : ''}`,
      )
      ctx.refresh()
      navigate(`/p/${ctx.projectId}/u/${ctx.unitId}/proof`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="step">

      <section className="card">
        <div className="card__head">
          <h3>课堂照片</h3>
          <span className="card__hint">按拍摄顺序排列，可拖动调整</span>
        </div>

        <div className="photo-grid">
          {(photos ?? []).map((p, i) => (
            <div className="photo" key={p.id}>
              <img src={URL.createObjectURL(p.blob)} alt={p.name} />
              <div className="photo__bar">
                <span>第 {i + 1} 页</span>
                <button
                  className="iconbtn"
                  title="移到前面"
                  onClick={async () => {
                    if (i === 0) return
                    const list = photos ?? []
                    const prev = list[i - 1]
                    await db.attachments.update(prev.id, { created_at: p.created_at })
                    await db.attachments.update(p.id, { created_at: prev.created_at })
                    ctx.refresh()
                  }}
                >
                  <Icon name="chevron" size={13} />
                </button>
                <button
                  className="iconbtn"
                  title="删除"
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
          <button className="photo photo--add" onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={22} />
            <span>上传照片</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            upload(e.target.files)
            e.target.value = ''
          }}
        />
      </section>

      <section className="card">
        <div className="card__head">
          <h3>AI 整理</h3>
        </div>
        <div className="row-btns">
          <button className="btn btn--primary" disabled={busy !== null} onClick={runTranscribe}>
            {busy === 'transcribe' ? '转写中…' : '① AI 转写'}
          </button>
          <button
            className="btn"
            disabled={busy !== null || !transcript}
            onClick={runOrganize}
          >
            {busy === 'organize' ? '整理中…' : '② AI 整理成条目'}
          </button>
          <button className="btn btn--ghost" onClick={() => navigate(`/p/${ctx.projectId}/u/${ctx.unitId}/proof`)}>
            打开校对页
          </button>
        </div>

        {err && <div className="alert alert--err">{err}</div>}

        {transcript && (
          <details className="transcript">
            <summary>查看转写原文（{transcript.length} 字）</summary>
            <div className="transcript__body">
              <Markdown source={transcript} className="md" />
            </div>
          </details>
        )}

        {preview && (
          <div className="alert alert--info">
            转写完成。下面是 AI 的输出预览（正式稿已保存）——确认无误后点「AI 整理成条目」。
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__head">
          <h3>本单元条目（{ctx.items.length}）</h3>
        </div>
        {ctx.items.length === 0 ? (
          <div className="card__empty">还没有条目。先上传照片并整理。</div>
        ) : (
          <ul className="itemlist">
            {ctx.items.map((it: Item) => (
              <li key={it.id} className="itemlist__row">
                <span className={`icard__kind icard__kind--${it.kind}`}>{it.kind}</span>
                <span className="itemlist__title">{it.title}</span>
                {it.source === 'ai' && !it.confirmed && (
                  <span className="icard__src icard__src--ai">待校对</span>
                )}
                {it.confirmed && <span className="icard__src icard__src--ok">已校对</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
