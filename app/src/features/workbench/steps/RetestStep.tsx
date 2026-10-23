import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../../db/db'
import { newId } from '../../../lib/id'
import { Icon } from '../../../components/Icon'
import { Markdown } from '../../../components/Markdown'
import { useUI } from '../../../store/ui'
import { formatDate, relativeDays } from '../../../lib/time'
import type { WbCtx } from '../WorkbenchPage'
import type { AttemptResult } from '../../../db/types'

const DAY = 86_400_000
const OPTIONS = [
  { d: 1, label: '明天' },
  { d: 3, label: '3 天后' },
  { d: 7, label: '一周后' },
  { d: 14, label: '两周后' },
]

export function RetestStep({ ctx }: { ctx: WbCtx }) {
  const db = getDb()
  const { showToast } = useUI()
  const retests = useLiveQuery(
    () => db.retests.where('unit_id').equals(ctx.unitId).sortBy('due_at'),
    [ctx.unitId],
  )
  const [pick, setPick] = useState(ctx.items[0]?.id ?? '')
  const [days, setDays] = useState(3)
  const [active, setActive] = useState<string | null>(null)

  const schedule = async () => {
    const item = ctx.items.find((i) => i.id === pick)
    if (!item) {
      showToast('先选一个条目')
      return
    }
    await db.retests.add({
      id: newId('rt_'),
      project_id: ctx.projectId,
      unit_id: ctx.unitId,
      item_id: item.id,
      title: item.title,
      due_at: Date.now() + days * DAY,
      status: 'scheduled',
      result: null,
      note: '',
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    ctx.refresh()
    showToast(`已安排在${relativeDays(Date.now() + days * DAY)}复测`)
  }

  const finish = async (id: string, result: AttemptResult) => {
    await db.retests.update(id, {
      status: result === 'independent' ? 'done' : 'failed',
      result,
      updated_at: Date.now(),
    })
    if (result !== 'independent') {
      // 失败后重开疑点
      const rt = retests?.find((r) => r.id === id)
      if (rt?.item_id) {
        const doubt = ctx.doubts.find((d) => d.item_id === rt.item_id)
        if (doubt) {
          await db.doubts.update(doubt.id, { status: 'open', updated_at: Date.now() })
        }
      }
    }
    setActive(null)
    ctx.refresh()
    showToast(result === 'independent' ? '复测通过' : '复测失败，已重新打开疑点')
  }

  const now = Date.now()
  const due = (retests ?? []).filter((r) => r.status === 'scheduled')
  const past = (retests ?? []).filter((r) => r.status !== 'scheduled')

  return (
    <div className="step">
      <div className="step__intro">
        <h2>{ctx.step.name}</h2>
        <p>{ctx.step.instruction}</p>
      </div>

      <section className="card">
        <div className="card__head">
          <h3>安排一次复测</h3>
          <span className="card__hint">同一条目可以安排多次</span>
        </div>
        {ctx.items.length === 0 ? (
          <div className="card__empty">还没有条目可复测。</div>
        ) : (
          <>
            <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
              {ctx.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
            <div className="row-btns">
              {OPTIONS.map((o) => (
                <button
                  key={o.d}
                  className={`btn btn--sm${days === o.d ? ' btn--primary' : ''}`}
                  onClick={() => setDays(o.d)}
                >
                  {o.label}
                </button>
              ))}
              <button className="btn btn--sm" onClick={schedule}>
                安排复测
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card__head">
          <h3>待复测（{due.length}）</h3>
        </div>
        {due.length === 0 ? (
          <div className="card__empty">暂时没有待复测的安排。</div>
        ) : (
          <div className="retest-list">
            {due.map((r) => {
              const item = ctx.items.find((i) => i.id === r.item_id)
              const isDue = r.due_at <= now
              return (
                <div className={`retest${isDue ? ' is-due' : ''}`} key={r.id}>
                  <div className="retest__info">
                    <div className="retest__title">{r.title}</div>
                    <div className="retest__due">
                      {formatDate(r.due_at)} · {relativeDays(r.due_at)}
                      {isDue && <span className="retest__badge">到点了</span>}
                    </div>
                  </div>
                  {active === r.id ? (
                    <div className="retest__do">
                      {item && (
                        <div className="retest__content">
                          <Markdown source={item.body_md} className="md" />
                        </div>
                      )}
                      <div className="row-btns">
                        <button className="btn btn--sm" onClick={() => finish(r.id, 'with_hint')}>
                          看了提示才想起
                        </button>
                        <button className="btn btn--sm btn--primary" onClick={() => finish(r.id, 'independent')}>
                          独立做出来了
                        </button>
                        <button className="btn btn--sm btn--ghost" onClick={() => setActive(null)}>
                          收起
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn--sm btn--primary" onClick={() => setActive(r.id)}>
                      开始复测
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>历史复测（{past.length}）</h3>
          </div>
          <div className="retest-list">
            {past.map((r) => (
              <div className="retest retest--past" key={r.id}>
                <Icon name={r.status === 'done' ? 'ok' : 'info'} size={14} />
                <div className="retest__info">
                  <div className="retest__title">{r.title}</div>
                  <div className="retest__due">{formatDate(r.due_at)}</div>
                </div>
                <span className={`retest__result retest__result--${r.status}`}>
                  {r.status === 'done' ? '通过' : '未通过'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
