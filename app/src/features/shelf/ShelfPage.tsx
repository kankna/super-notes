import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { newId } from '../../lib/id'
import { Icon } from '../../components/Icon'
import { useUI } from '../../store/ui'
import { BookBox, type BookStats } from './BookBox'
import { ProjectDialog, draftFrom, emptyDraft, type ProjectDraft } from './ProjectDialog'
import { ProjectOverview } from './ProjectOverview'
import type { Project } from '../../db/types'

type DialogState =
  | { mode: 'none' }
  | { mode: 'create' }
  | { mode: 'edit'; id: string }

export function ShelfPage() {
  const db = getDb()
  const { toast, showToast, hideToast, reducedMotion, toggleReducedMotion } = useUI()

  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<DialogState>({ mode: 'none' })
  const [overviewId, setOverviewId] = useState<string | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)

  const projects = useLiveQuery(() => db.projects.orderBy('order').toArray(), [])
  const units = useLiveQuery(() => db.units.toArray(), [])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const doubts = useLiveQuery(() => db.doubts.toArray(), [])
  const trashCount = useLiveQuery(() => db.trash.count(), [])

  /* ---------------- 拖拽排序 ---------------- */

  const [displayOrder, setDisplayOrder] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overTrash, setOverTrash] = useState(false)
  const trashRef = useRef<HTMLDivElement | null>(null)
  const pendingRef = useRef<{
    id: string
    x: number
    y: number
    timer: number | null
    active: boolean
  } | null>(null)
  const dragMovedRef = useRef(false)

  // 数据变化时同步显示顺序（外部改动也立即反映）
  useEffect(() => {
    if (!projects) return
    if (dragId) return
    setDisplayOrder(projects.map((p) => p.id))
  }, [projects, dragId])

  const orderedProjects = useMemo(() => {
    if (!projects) return []
    const map = new Map(projects.map((p) => [p.id, p]))
    const list = displayOrder.map((id) => map.get(id)).filter(Boolean) as Project[]
    const rest = projects.filter((p) => !displayOrder.includes(p.id))
    return [...list, ...rest]
  }, [projects, displayOrder])

  const statsById = useMemo(() => {
    const map = new Map<string, BookStats>()
    for (const p of projects ?? []) {
      const pUnits = (units ?? []).filter((u) => u.project_id === p.id)
      const pItems = (items ?? []).filter((i) => i.project_id === p.id)
      const pDoubts = (doubts ?? []).filter((d) => d.project_id === p.id)
      const last = pUnits.reduce<number | null>(
        (acc, u) => (u.last_studied_at && (!acc || u.last_studied_at > acc) ? u.last_studied_at : acc),
        null,
      )
      map.set(p.id, {
        chapters: new Set(pUnits.map((u) => u.chapter_id)).size,
        units: pUnits.length,
        doubts: pDoubts.length,
        items: pItems.length,
        lastStudied: last,
      })
    }
    return map
  }, [projects, units, items, doubts])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orderedProjects
    return orderedProjects.filter((p) =>
      [p.name, p.subtitle, p.description, ...p.tags].join(' ').toLowerCase().includes(q),
    )
  }, [orderedProjects, query])

  const beginDrag = useCallback((id: string) => {
    setDragId(id)
    setOverTrash(false)
    document.body.style.cursor = 'grabbing'
  }, [])

  const endDrag = useCallback(() => {
    setDragId(null)
    setOverTrash(false)
    document.body.style.cursor = ''
    pendingRef.current = null
  }, [])

  const computeTarget = useCallback(
    (x: number, y: number, ids: string[]): number => {
      const rect = trashRef.current?.getBoundingClientRect()
      if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return -1
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-book-id]'))
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          const id = el.dataset.bookId
          if (!id) break
          const idx = ids.indexOf(id)
          if (idx < 0) break
          return x > r.left + r.width / 2 ? idx + 1 : idx
        }
      }
      return -2
    },
    [],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if ((e.target as HTMLElement).closest('button')) return
      dragMovedRef.current = false
      const pending = { id, x: e.clientX, y: e.clientY, timer: null as number | null, active: false }
      pendingRef.current = pending
      if (e.pointerType !== 'mouse') {
        // 触摸：长按 320ms 才进入拖拽，避免和滚动/点击冲突
        pending.timer = window.setTimeout(() => {
          pending.active = true
          beginDrag(id)
        }, 320)
      }
    },
    [beginDrag],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending) return
      const dx = e.clientX - pending.x
      const dy = e.clientY - pending.y
      const dist = Math.hypot(dx, dy)

      if (!pending.active) {
        if (e.pointerType === 'mouse' && dist > 5) {
          pending.active = true
          beginDrag(pending.id)
        } else if (e.pointerType !== 'mouse' && dist > 12 && pending.timer) {
          // 手指移动了就是滚动/长按取消
          window.clearTimeout(pending.timer)
          pending.timer = null
        }
        if (!pending.active) return
      }

      dragMovedRef.current = true
      e.preventDefault()
      const target = computeTarget(e.clientX, e.clientY, displayOrder)
      if (target === -1) {
        setOverTrash(true)
        return
      }
      setOverTrash(false)
      if (target < 0) return
      setDisplayOrder((prev) => {
        const from = prev.indexOf(pending.id)
        if (from < 0) return prev
        let to = target
        if (from < to) to -= 1
        if (to === from) return prev
        const next = prev.slice()
        next.splice(from, 1)
        next.splice(to, 0, pending.id)
        return next
      })
    }

    const onUp = () => {
      const pending = pendingRef.current
      if (pending?.timer) window.clearTimeout(pending.timer)
      if (pending?.active) {
        finishDrag()
      }
      pendingRef.current = null
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeTarget, displayOrder, beginDrag])

  const finishDrag = useCallback(async () => {
    const id = dragId
    const toTrash = overTrash
    endDrag()
    if (!id) return
    if (toTrash) {
      await moveToTrash(id)
      return
    }
    const order = displayOrder
    await db.transaction('rw', db.projects, async () => {
      await Promise.all(
        order.map((pid, i) => db.projects.update(pid, { order: i, updated_at: Date.now() })),
      )
    })
  }, [dragId, overTrash, displayOrder, db, endDrag])

  /* ---------------- 增删改 ---------------- */

  const moveToTrash = useCallback(
    async (id: string) => {
      const p = await db.projects.get(id)
      if (!p) return
      await db.transaction('rw', [db.projects, db.trash], async () => {
        await db.projects.update(id, { deleted_at: Date.now(), updated_at: Date.now() })
        await db.trash.add({
          id: newId('t_'),
          kind: 'project',
          ref_id: id,
          label: p.name,
          payload: p,
          created_at: Date.now(),
        })
      })
      setDisplayOrder((prev) => prev.filter((x) => x !== id))
      showToast(`「${p.name}」已移入回收站`, {
        label: '撤销',
        run: async () => {
          await db.transaction('rw', [db.projects, db.trash], async () => {
            const entry = await db.trash.where('ref_id').equals(id).first()
            if (entry) await db.trash.delete(entry.id)
            await db.projects.update(id, { deleted_at: null, updated_at: Date.now() })
          })
          hideToast()
        },
      })
    },
    [db, showToast, hideToast],
  )

  const saveProject = useCallback(
    async (draft: ProjectDraft) => {
      if (dialog.mode === 'create') {
        const count = await db.projects.count()
        const id = newId('p_')
        const now = Date.now()
        await db.projects.add({
          id,
          profile_id: 'default',
          name: draft.name.trim(),
          subtitle: draft.subtitle.trim(),
          description: draft.description.trim(),
          tags: draft.tags,
          accent: draft.accent,
          cover: draft.cover,
          order: count,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        })
        showToast(`已创建「${draft.name.trim()}」`)
      } else if (dialog.mode === 'edit') {
        await db.projects.update(dialog.id, {
          name: draft.name.trim(),
          subtitle: draft.subtitle.trim(),
          description: draft.description.trim(),
          tags: draft.tags,
          accent: draft.accent,
          cover: draft.cover,
          updated_at: Date.now(),
        })
        showToast('已保存')
      }
      setDialog({ mode: 'none' })
    },
    [db, dialog, showToast],
  )

  const openDialogProject = useMemo(() => {
    if (dialog.mode !== 'edit') return undefined
    return projects?.find((p) => p.id === dialog.id)
  }, [dialog, projects])

  /* ---------------- 渲染 ---------------- */

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">书斋</span>
          <span className="brand__sub">Super Notes</span>
        </div>

        <div className="search">
          <span className="search__icon">
            <Icon name="search" size={15} />
          </span>
          <input
            value={query}
            placeholder="搜索项目、标签、说明…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search__clear" onClick={() => setQuery('')} aria-label="清除">
              <Icon name="close" size={13} />
            </button>
          )}
        </div>

        <div className="topbar__spacer" />

        <button
          className={`iconbtn${reducedMotion ? ' is-on' : ''}`}
          title={reducedMotion ? '减少动效：已开启' : '减少动效：已关闭'}
          onClick={toggleReducedMotion}
        >
          <Icon name="motion" size={17} />
        </button>
        <button className="iconbtn" title="回收站" onClick={() => setTrashOpen(true)}>
          <Icon name="trash" size={17} />
          {(trashCount ?? 0) > 0 && <span className="dot-badge">{trashCount}</span>}
        </button>
        <div className="divider-v" />
        <span className="brand__sub">本地模式 · 未同步</span>
      </header>

      <main className="stage">
        <div className="shelf">
          <div className="shelf__head">
            <h1 className="shelf__title">书架</h1>
            <span className="shelf__count">
              {visible.length} 个项目{query ? `（共 ${projects?.length ?? 0}）` : ''}
            </span>
          </div>
          <p className="shelf__hint">
            悬停书盒查看项目说明，<b>点一下</b>进入项目。拖动书盒可以重新排序，拖到底部红色区域移入回收站。
            长按（手机）也可以拖动。
          </p>
          <div className="shelf__rule" />

          <div className="shelf__grid">
            {visible.map((p) => (
              <BookBox
                key={p.id}
                project={p}
                stats={statsById.get(p.id) ?? { chapters: 0, units: 0, doubts: 0, items: 0, lastStudied: null }}
                selected={overviewId === p.id}
                dragging={dragId === p.id}
                detailOpen={false}
                onSelect={(id) => {
                  if (dragMovedRef.current) return
                  setOverviewId(id)
                }}
                onEdit={(id) => setDialog({ mode: 'edit', id })}
                onDelete={(id) => moveToTrash(id)}
                onToggleDetail={(id) => setOverviewId(id)}
                onPointerDown={onPointerDown}
              />
            ))}

            <div className="book book--new" onClick={() => setDialog({ mode: 'create' })}>
              <div className="book__body">
                <div className="book__front">
                  <Icon name="plus" size={26} />
                  <span className="book__new-label">新建项目</span>
                </div>
              </div>
            </div>
          </div>

          {visible.length === 0 && query && (
            <div className="empty">
              <div className="empty__title">没有匹配「{query}」的项目</div>
              <div>换个关键词试试</div>
            </div>
          )}
        </div>
      </main>

      <div
        className={`trashzone${dragId ? ' is-active' : ''}${overTrash ? ' is-over' : ''}`}
        ref={trashRef}
      >
        <Icon name="trash" size={17} />
        松手移入回收站
      </div>

      {toast && (
        <div className="toast" onClick={() => !toast.action && hideToast()}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="toast__undo"
              onClick={(e) => {
                e.stopPropagation()
                toast.action?.run()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {dialog.mode !== 'none' && (
        <ProjectDialog
          initial={
            dialog.mode === 'edit' && openDialogProject
              ? draftFrom(openDialogProject)
              : emptyDraft()
          }
          onSave={saveProject}
          onClose={() => setDialog({ mode: 'none' })}
        />
      )}

      {overviewId && <ProjectOverview projectId={overviewId} onClose={() => setOverviewId(null)} />}

      {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} />}
    </>
  )
}

function TrashPanel({ onClose }: { onClose: () => void }) {
  const db = getDb()
  const entries = useLiveQuery(() => db.trash.orderBy('created_at').reverse().toArray(), [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3 className="modal__title">回收站</h3>
          <button className="iconbtn" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal__body">
          {(entries ?? []).length === 0 ? (
            <div className="empty" style={{ padding: '30px 0' }}>
              <div className="empty__title">回收站是空的</div>
              <div>拖动书盒到底部红色区域可以把它放进来</div>
            </div>
          ) : (
            (entries ?? []).map((e) => (
              <div className="trash-row" key={e.id}>
                <div>
                  <div className="trash-row__label">{e.label}</div>
                  <div className="trash-row__time">
                    {new Date(e.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <button
                  className="btn btn--sm"
                  onClick={async () => {
                    await db.transaction('rw', [db.projects, db.trash], async () => {
                      await db.projects.update(e.ref_id, { deleted_at: null, updated_at: Date.now() })
                      await db.trash.delete(e.id)
                    })
                  }}
                >
                  恢复
                </button>
              </div>
            ))
          )}
        </div>
        <div className="modal__foot">
          <button className="btn btn--primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
