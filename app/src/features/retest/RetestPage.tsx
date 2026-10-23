import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Markdown } from '../../components/Markdown'
import { useUI } from '../../store/ui'
import { formatDate, relativeDays } from '../../lib/time'

export function RetestPage() {
  const db = getDb()
  const navigate = useNavigate()
  const { showToast } = useUI()
  const retests = useLiveQuery(async () => {
    const rows = await db.retests.toArray()
    return rows.sort((a, b) => a.due_at - b.due_at)
  }, [])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const units = useLiveQuery(() => db.units.toArray(), [])
  const [active, setActive] = useState<string | null>(null)

  const now = Date.now()
  const scheduled = (retests ?? []).filter((r) => r.status === 'scheduled')
  const overdue = scheduled.filter((r) => r.due_at <= now)
  const upcoming = scheduled.filter((r) => r.due_at > now)
  const history = (retests ?? []).filter((r) => r.status !== 'scheduled')

  const finish = async (id: string, ok: boolean) => {
    const rt = (retests ?? []).find((r) => r.id === id)
    await db.retests.update(id, {
      status: ok ? 'done' : 'failed',
      result: ok ? 'independent' : 'still_unsure',
      updated_at: Date.now(),
    })
    if (!ok && rt?.item_id) {
      const doubt = (await db.doubts.where('item_id').equals(rt.item_id).toArray())[0]
      if (doubt) await db.doubts.update(doubt.id, { status: 'open', updated_at: Date.now() })
    }
    setActive(null)
    showToast(ok ? '复测通过' : '复测失败，相关疑点已重新打开')
  }

  const unitTitle = (unitId: string) => units?.find((u) => u.id === unitId)?.title ?? ''

  const Row = ({ id }: { id: string }) => {
    const r = (retests ?? []).find((x) => x.id === id)!
    const item = items?.find((i) => i.id === r.item_id)
    const isDue = r.due_at <= now
    return (
      <div className={`retest${isDue ? ' is-due' : ''}`}>
        <div className="retest__info">
          <div className="retest__title">{r.title}</div>
          <div className="retest__due inline">
            <span>{formatDate(r.due_at)}</span>
            <span>{relativeDays(r.due_at)}</span>
            <span>{unitTitle(r.unit_id)}</span>
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
              <button className="btn btn--sm btn--primary" onClick={() => finish(r.id, true)}>
                独立做出来了
              </button>
              <button className="btn btn--sm btn--danger" onClick={() => finish(r.id, false)}>
                没做出来
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
  }

  return (
    <main className="stage">
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">复测队列</h1>
        </div>

        {overdue.length > 0 && (
          <section className="card">
            <div className="card__head">
              <h3>到点了（{overdue.length}）</h3>
            </div>
            <div className="retest-list">
              {overdue.map((r) => (
                <Row id={r.id} key={r.id} />
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="card__head">
            <h3>待复测（{upcoming.length}）</h3>
          </div>
          {upcoming.length === 0 ? (
            <div className="card__empty">
              <Icon name="clock" size={18} />
              <div>还没有安排复测。在某一课的「日后复测」那一步可以安排。</div>
            </div>
          ) : (
            <div className="retest-list">
              {upcoming.map((r) => (
                <Row id={r.id} key={r.id} />
              ))}
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section className="card">
            <div className="card__head">
              <h3>历史（{history.length}）</h3>
            </div>
            <div className="retest-list">
              {history.map((r) => (
                <div className="retest retest--past" key={r.id}>
                  <Icon name={r.status === 'done' ? 'ok' : 'warning'} size={14} />
                  <div className="retest__info">
                    <div className="retest__title">{r.title}</div>
                    <div className="retest__due inline">
                      <span>{formatDate(r.due_at)}</span>
                      <span>{unitTitle(r.unit_id)}</span>
                    </div>
                  </div>
                  <span className={`retest__result retest__result--${r.status}`}>
                    {r.status === 'done' ? '通过' : '未通过'}
                  </span>
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick={() => navigate(`/p/${r.project_id}/u/${r.unit_id}`)}
                  >
                    回到这一课
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
