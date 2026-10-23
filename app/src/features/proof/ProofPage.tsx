import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Markdown } from '../../components/Markdown'
import { useUI } from '../../store/ui'
import type { Item } from '../../db/types'

/**
 * 原图 ↔ 条目校对页。
 *
 * 左：课堂照片（可翻页、可放大）
 * 右：条目草稿，可编辑、确认、删除
 * 关键约束：重新整理不会覆盖已确认正文、自己的批注和既有学习记录。
 */
export function ProofPage() {
  const { projectId = '', unitId = '' } = useParams()
  const navigate = useNavigate()
  const db = getDb()
  const { showToast } = useUI()

  const photos = useLiveQuery(
    () =>
      db.attachments
        .where('unit_id')
        .equals(unitId)
        .filter((a) => a.role === 'source_photo')
        .sortBy('created_at'),
    [unitId],
  )
  const items = useLiveQuery(() => db.items.where('unit_id').equals(unitId).sortBy('order'), [unitId])

  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: '', body: '' })
  const [filter, setFilter] = useState<'all' | 'ai' | 'confirmed'>('all')

  const list = useMemo(() => {
    const all = items ?? []
    if (filter === 'ai') return all.filter((i) => i.source === 'ai' && !i.confirmed)
    if (filter === 'confirmed') return all.filter((i) => i.confirmed)
    return all
  }, [items, filter])

  useEffect(() => {
    if (page >= (photos ?? []).length) setPage(0)
  }, [photos, page])

  const startEdit = (it: Item) => {
    setEditing(it.id)
    setDraft({ title: it.title, body: it.body_md })
  }

  const saveEdit = async (it: Item) => {
    await db.items.update(it.id, {
      title: draft.title,
      body_md: draft.body,
      confirmed: true,
      source: it.source === 'ai' ? 'teacher' : it.source,
      updated_at: Date.now(),
    })
    setEditing(null)
    showToast('已保存并标记为已校对')
  }

  const confirm = async (it: Item) => {
    await db.items.update(it.id, { confirmed: true, updated_at: Date.now() })
    showToast('已确认')
  }

  const remove = async (it: Item) => {
    await db.items.update(it.id, { deleted_at: Date.now(), updated_at: Date.now() })
    showToast('已删除草稿')
  }

  const cur = (photos ?? [])[page]

  return (
    <main className="stage stage--flush">
      <div className="proof">
        <div className="proof__bar">
          <button className="linkbtn" onClick={() => navigate(`/p/${projectId}/u/${unitId}`)}>
            ← 返回学习
          </button>
          <h1>原图校对</h1>
          <span className="card__hint">
            左侧是原图，右侧是条目草稿。看不清的地方标「待确认」，不要猜成确定结论。
          </span>
          <div className="wb__spacer" />
          <div className="seg">
            {(['all', 'ai', 'confirmed'] as const).map((f) => (
              <button
                key={f}
                className={`seg__btn${filter === f ? ' is-on' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? '全部' : f === 'ai' ? '待校对' : '已确认'}
              </button>
            ))}
          </div>
        </div>

        <div className="proof__cols">
          <div className="proof__left">
            {cur ? (
              <>
                <div className="proof__viewer">
                  <img src={URL.createObjectURL(cur.blob)} alt={cur.name} style={{ transform: `scale(${zoom})` }} />
                </div>
                <div className="proof__pager">
                  <button
                    className="btn btn--sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    上一页
                  </button>
                  <span>
                    第 {page + 1} / {photos?.length ?? 0} 页
                  </span>
                  <button
                    className="btn btn--sm"
                    disabled={page >= (photos?.length ?? 1) - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </button>
                  <div className="wb__spacer" />
                  <button className="btn btn--sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>
                    缩小
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button className="btn btn--sm" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
                    放大
                  </button>
                </div>
              </>
            ) : (
              <div className="card__empty">
                这一课还没有课堂照片。回到「接收资料」那一步上传。
                <button
                  className="btn btn--sm"
                  style={{ marginTop: 12 }}
                  onClick={() => navigate(`/p/${projectId}/u/${unitId}`)}
                >
                  回去上传
                </button>
              </div>
            )}
          </div>

          <div className="proof__right">
            {list.length === 0 && <div className="card__empty">没有符合条件的条目。</div>}
            {list.map((it) => (
              <article className={`pf${it.confirmed ? ' is-confirmed' : ''}`} key={it.id}>
                <header className="pf__head">
                  <span className={`icard__kind icard__kind--${it.kind}`}>{it.kind}</span>
                  {editing === it.id ? (
                    <input
                      className="input pf__titleinput"
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    />
                  ) : (
                    <span className="pf__title">{it.title}</span>
                  )}
                  {it.source === 'ai' && <span className="icard__src icard__src--ai">AI 草稿</span>}
                  {it.confirmed && <span className="icard__src icard__src--ok">已校对</span>}
                </header>

                {editing === it.id ? (
                  <>
                    <textarea
                      className="textarea pf__editor"
                      value={draft.body}
                      onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                    />
                    <div className="row-btns">
                      <button className="btn btn--sm btn--primary" onClick={() => saveEdit(it)}>
                        保存并确认
                      </button>
                      <button className="btn btn--sm btn--ghost" onClick={() => setEditing(null)}>
                        取消
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="pf__body">
                    <Markdown source={it.body_md} className="md" />
                  </div>
                )}

                {editing !== it.id && (
                  <footer className="pf__foot">
                    {!it.confirmed && (
                      <>
                        <button className="btn btn--sm btn--primary" onClick={() => confirm(it)}>
                          确认无误
                        </button>
                        <button className="btn btn--sm" onClick={() => startEdit(it)}>
                          <Icon name="edit" size={13} />
                          校正
                        </button>
                        <button className="btn btn--sm btn--danger" onClick={() => remove(it)}>
                          丢弃
                        </button>
                      </>
                    )}
                    {it.confirmed && (
                      <>
                        <span className="card__hint">已确认的内容不会被重新整理覆盖</span>
                        <button className="btn btn--sm" onClick={() => startEdit(it)}>
                          <Icon name="edit" size={13} />
                          继续校正
                        </button>
                      </>
                    )}
                  </footer>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
