import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Markdown } from '../../components/Markdown'
import { runTask } from '../../ai/tasks'
import { isMockMode } from '../../ai/store'
import { useUI } from '../../store/ui'
import type { WbCtx } from './WorkbenchPage'
import type { Attempt } from '../../db/types'

export function SidePanel({ ctx, unitAttempts }: { ctx: WbCtx; unitAttempts: Attempt[] }) {
  const db = getDb()
  const { showToast } = useUI()
  const [mock, setMock] = useState(true)
  const [note, setNote] = useState('')
  const [aiOut, setAiOut] = useState('')
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')

  const noteItem = useLiveQuery(
    () => db.items.where('unit_id').equals(ctx.unitId).filter((i) => i.title === '__随手记__').first(),
    [ctx.unitId],
  )

  useEffect(() => {
    isMockMode().then(setMock)
  }, [])

  useEffect(() => {
    if (noteItem) setNote(noteItem.body_md)
  }, [noteItem])

  const saveNote = async () => {
    const db2 = getDb()
    if (noteItem) {
      await db2.items.update(noteItem.id, { body_md: note, updated_at: Date.now() })
    } else {
      const maxOrder = (await db2.items.where('unit_id').equals(ctx.unitId).toArray()).length
      await db2.items.add({
        id: `unote_${ctx.unitId}`,
        project_id: ctx.projectId,
        unit_id: ctx.unitId,
        kind: 'note',
        title: '__随手记__',
        body_md: note,
        source: 'self',
        confirmed: true,
        order: maxOrder,
        created_at: Date.now(),
        updated_at: Date.now(),
        deleted_at: null,
      })
    }
    ctx.refresh()
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
      setAiOut(res.text)
    } finally {
      setBusy(false)
    }
  }

  const quick = async (kind: 'explain' | 'quiz') => {
    const doubt = ctx.doubts.find((d) => d.status === 'open')
    setBusy(true)
    try {
      if (kind === 'explain' && doubt) {
        const source = ctx.items.find((i) => i.id === doubt.item_id)
        const res = await runTask('explain', {
          vars: {
            doubt: doubt.title,
            context: source?.body_md ?? doubt.context,
            tried: doubt.tried,
          },
        })
        if (res.error) return showToast(res.error)
        setAiOut(res.text)
      } else {
        const res = await runTask('quiz', {
          vars: {
            scope: ctx.items.map((i) => i.body_md).join('\n\n'),
            difficulty: '与本课例题同档',
            pitfalls: '用户标记过不熟悉/有疑问的点',
          },
        })
        if (res.error) return showToast(res.error)
        setAiOut(res.text)
      }
    } finally {
      setBusy(false)
    }
  }

  const lastAttempt = unitAttempts[unitAttempts.length - 1]

  return (
    <div className="side">
      <section className="side__block">
        <div className="side__title">
          <Icon name="edit" size={14} />
          单元随手记
          <button className="btn btn--sm btn--ghost side__save" onClick={saveNote}>
            保存
          </button>
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 120 }}
          placeholder="想到什么随手记一句"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </section>

      <section className="side__block">
        <div className="side__title">
          <Icon name="info" size={14} />
          AI 面板
          <span className={`side__mode${mock ? ' is-mock' : ''}`}>{mock ? 'Mock 模式' : '真实模型'}</span>
        </div>

        <div className="side__quick">
          <button className="btn btn--sm" disabled={busy} onClick={() => quick('explain')}>
            解当前疑点
          </button>
          <button className="btn btn--sm" disabled={busy} onClick={() => quick('quiz')}>
            出检测题
          </button>
        </div>

        <textarea
          className="textarea"
          style={{ minHeight: 80 }}
          placeholder="问点别的，比如「这道题我这样想对吗」"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="side__act">
          <button className="btn btn--sm btn--primary" disabled={busy} onClick={ask}>
            {busy ? '思考中…' : '提问'}
          </button>
        </div>

        {aiOut && (
          <div className="side__out">
            <Markdown source={aiOut} className="md" />
          </div>
        )}
      </section>

      {lastAttempt && (
        <section className="side__block">
          <div className="side__title">
            <Icon name="clock" size={14} />
            最近一次尝试
          </div>
          <div className="side__attempt">
            结果：{ATTEMPT_LABEL[lastAttempt.result]}
            {lastAttempt.note && <span className="side__anote">· {lastAttempt.note}</span>}
          </div>
        </section>
      )}
    </div>
  )
}

export const ATTEMPT_LABEL: Record<Attempt['result'], string> = {
  untested: '未检验',
  independent: '独立完成',
  with_hint: '借助提示完成',
  still_unsure: '仍有疑问',
  pending_retest: '待复测',
}
