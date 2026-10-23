import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { ItemCard } from '../ItemCard'
import type { WbCtx } from '../WorkbenchPage'
import type { Item, MarkKind } from '../../../db/types'

export function RecallStep({ ctx }: { ctx: WbCtx }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const hideAnswer = ctx.step.settings.hideAnswer !== false
  const revealMode = ctx.step.settings.revealMode ?? 'per_item'

  const groups = useMemo(() => {
    const theory = ctx.items.filter((i) => i.kind === 'theorem' || i.kind === 'formula')
    const examples: { q: Item; a: Item | null }[] = []
    const others: Item[] = []
    for (const it of ctx.items) {
      if (it.kind === 'example') {
        const answer = ctx.items.find((a) => a.kind === 'answer' && a.order > it.order)
        examples.push({ q: it, a: answer ?? null })
      } else if (it.kind !== 'answer') {
        others.push(it)
      }
    }
    return { theory, examples, others }
  }, [ctx.items])

  const revealAll = () => {
    setRevealed(new Set(ctx.items.map((i) => i.id)))
  }

  const markOf = (id: string): MarkKind[] => ctx.marks.get(id) ?? []

  const handleMark = async (item: Item, kind: MarkKind) => {
    await ctx.onToggleMark(item.id, kind)
    // 标记同时记一次尝试结果，和流程状态分开存
    const result =
      kind === 'ok' ? 'independent' : kind === 'unfamiliar' ? 'with_hint' : 'still_unsure'
    await ctx.onAttempt({ itemId: item.id, result })
  }

  return (
    <div className="step">
      <div className="step__intro">
        <p className="step__detail">{ctx.step.instruction}</p>
        <div className="row-btns">
          {hideAnswer && (
            <button className="btn btn--sm" onClick={revealAll}>
              <Icon name="info" size={14} />
              全部揭示答案
            </button>
          )}
          <span className="card__hint">
            默写和重演都在纸上做，这里只记录结果。标记「不熟悉」会回到笔记标记，「有疑问」自动进疑点清单。
          </span>
        </div>
      </div>

      {groups.theory.length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>定理与公式（默写）</h3>
            <span className="card__hint">不翻书，先在白纸上写一遍</span>
          </div>
          <div className="icard-list">
            {groups.theory.map((it) => (
              <ItemCard
                key={it.id}
                item={it}
                marks={markOf(it.id)}
                hideAnswer={false}
                revealed
                onReveal={() => setRevealed((s) => new Set(s).add(it.id))}
                onToggleMark={(k) => handleMark(it, k)}
                onAddDoubt={(x) => ctx.onAddDoubt(x, x.title)}
              />
            ))}
          </div>
        </section>
      )}

      {groups.examples.length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>例题重演</h3>
            <span className="card__hint">自己一步步推出来，同时讲一遍</span>
          </div>
          <div className="icard-list">
            {groups.examples.map(({ q, a }) => (
              <div className="example" key={q.id}>
                <ItemCard
                  item={q}
                  marks={markOf(q.id)}
                  hideAnswer={false}
                  revealed
                  onReveal={() => setRevealed((s) => new Set(s).add(q.id))}
                  onToggleMark={(k) => handleMark(q, k)}
                  onAddDoubt={(x) => ctx.onAddDoubt(x, x.title)}
                />
                {a && (
                  <ItemCard
                    item={a}
                    marks={markOf(a.id)}
                    hideAnswer={hideAnswer}
                    revealMode={revealMode}
                    revealed={revealed.has(a.id)}
                    onReveal={() => setRevealed((s) => new Set(s).add(a.id))}
                    onToggleMark={(k) => handleMark(a, k)}
                    onAddDoubt={(x) => ctx.onAddDoubt(x, x.title)}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {groups.others.length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>其他内容</h3>
          </div>
          <div className="icard-list">
            {groups.others.map((it) => (
              <ItemCard
                key={it.id}
                item={it}
                marks={markOf(it.id)}
                hideAnswer={false}
                revealed
                onReveal={() => setRevealed((s) => new Set(s).add(it.id))}
                onToggleMark={(k) => handleMark(it, k)}
                onAddDoubt={(x) => ctx.onAddDoubt(x, x.title)}
              />
            ))}
          </div>
        </section>
      )}

      {ctx.items.length === 0 && (
        <div className="card__empty">
          这一课还没有条目。先在第一步「接收资料」上传课堂照片并整理，或者在下面的「其他内容」里手写。
        </div>
      )}
    </div>
  )
}
