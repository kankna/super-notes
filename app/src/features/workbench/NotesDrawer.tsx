import { useEffect, useState } from 'react'
import { getDb } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Markdown } from '../../components/Markdown'
import { runTask } from '../../ai/tasks'
import { isMockMode } from '../../ai/store'
import { useUI } from '../../store/ui'
import type { WbCtx } from './WorkbenchPage'
import type { Chapter, Unit } from '../../db/types'

interface Props {
  mode: 'notes' | 'ai'
  onClose: () => void
  ctx: WbCtx
  chapters: Chapter[]
  allUnits: Unit[]
  onOpenUnit: (id: string) => void
}

/**
 * 侧边抽屉：只放两类东西 —— 看的（笔记）和问的（AI）。
 * 主界面因此只剩一栏内容，注意力不被切走。
 */
export function NotesDrawer({ mode, onClose, ctx, chapters, allUnits, onOpenUnit }: Props) {
  return (
    <>
      <div className="drawer__mask" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer__head">
          <h2>{mode === 'notes' ? '看笔记' : '问 AI'}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="drawer__body">
          {mode === 'notes' ? (
            <NotesPane ctx={ctx} chapters={chapters} allUnits={allUnits} onOpenUnit={onOpenUnit} />
          ) : (
            <AiPane ctx={ctx} />
          )}
        </div>
      </aside>
    </>
  )
}

function NotesPane({
  ctx,
  chapters,
  allUnits,
  onOpenUnit,
}: {
  ctx: WbCtx
  chapters: Chapter[]
  allUnits: Unit[]
  onOpenUnit: (id: string) => void
}) {
  return (
    <>
      <div className="drawer__section">
        <div className="drawer__label">换一课</div>
        {chapters.map((ch) => (
          <div className="wnav__group" key={ch.id}>
            <div className="wnav__ch">{ch.name}</div>
            {allUnits
              .filter((u) => u.chapter_id === ch.id)
              .map((u) => (
                <button
                  key={u.id}
                  className={`wnav__unit${u.id === ctx.unitId ? ' is-on' : ''}`}
                  onClick={() => onOpenUnit(u.id)}
                >
                  {u.title}
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="drawer__section">
        <div className="drawer__label">这一课的内容（{ctx.items.length}）</div>
        {ctx.items.length === 0 && <div className="drawer__empty">还没有内容</div>}
        {ctx.items.map((i) => (
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
      </div>

      <div className="drawer__section">
        <div className="drawer__label">不会清单（{ctx.doubts.length}）</div>
        {ctx.doubts.length === 0 && <div className="drawer__empty">还没有标记不会的</div>}
        {ctx.doubts.map((d) => (
          <div className="drawer__doubt" key={d.id}>
            <div className="drawer__doubttitle">{d.title}</div>
            <div className="drawer__doubtctx">{d.context}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function AiPane({ ctx }: { ctx: WbCtx }) {
  const db = getDb()
  const { showToast } = useUI()
  const [note, setNote] = useState('')
  const [question, setQuestion] = useState('')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  const [mock, setMock] = useState(true)

  const noteItem = ctx.items.find((i) => i.title === '__随手记__')

  useEffect(() => {
    isMockMode().then(setMock)
  }, [])

  useEffect(() => {
    if (noteItem) setNote(noteItem.body_md)
  }, [noteItem])

  const saveNote = async () => {
    if (noteItem) {
      await db.items.update(noteItem.id, { body_md: note, updated_at: Date.now() })
    } else {
      await db.items.add({
        id: `unote_${ctx.unitId}`,
        project_id: ctx.projectId,
        unit_id: ctx.unitId,
        kind: 'note',
        title: '__随手记__',
        body_md: note,
        source: 'self',
        confirmed: true,
        order: ctx.items.length,
        created_at: Date.now(),
        updated_at: Date.now(),
        deleted_at: null,
      })
    }
    ctx.refresh()
    showToast('随手记已保存')
  }

  const ask = async () => {
    const q = question.trim()
    if (!q) return
    setBusy(true)
    try {
      const res = await runTask('feedback', {
        vars: {
          user_text: q,
          reference: ctx.items.map((i) => `### ${i.title}\n${i.body_md}`).join('\n\n'),
        },
      })
      if (res.error) {
        showToast(res.error)
        return
      }
      setOut(res.text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="drawer__section">
        <div className="drawer__label">随手记（想到什么写什么，自动保存）</div>
        <textarea
          className="textarea"
          style={{ minHeight: 110 }}
          placeholder="随手记一句…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
        />
      </div>

      <div className="drawer__section">
        <div className="drawer__label">问 AI（{mock ? '演示模式' : '真实模型'}）</div>
        <div className="row-btns">
          <button
            className="btn btn--sm"
            disabled={busy}
            onClick={async () => {
              const d = ctx.doubts[0]
              if (!d) return showToast('先标记几个不会的')
              setBusy(true)
              try {
                const res = await runTask('explain', {
                  vars: { doubt: d.title, context: d.context, tried: d.tried },
                })
                if (res.error) return showToast(res.error)
                setOut(res.text)
              } finally {
                setBusy(false)
              }
            }}
          >
            讲讲我不会的第一个
          </button>
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 70, marginTop: 8 }}
          placeholder="也可以直接问，比如「这一步我这样想对吗」"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="row-btns">
          <button className="btn btn--sm btn--primary" disabled={busy} onClick={ask}>
            {busy ? '想…' : '问'}
          </button>
        </div>
        {out && (
          <div className="side__out">
            <Markdown source={out} className="md" />
          </div>
        )}
      </div>
    </>
  )
}
