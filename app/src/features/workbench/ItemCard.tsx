import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Markdown } from '../../components/Markdown'
import type { Item, MarkKind } from '../../db/types'

const MARK_OPTIONS: { kind: MarkKind; label: string; hint: string; cls: string }[] = [
  { kind: 'ok', label: '独立完成', hint: '不看答案自己推出来了', cls: 'ok' },
  { kind: 'unfamiliar', label: '不熟悉', hint: '卡壳了，但对着答案能懂 —— 回去标记一下', cls: 'unfamiliar' },
  { kind: 'doubt', label: '有疑问', hint: '完全不理解 —— 应该进疑点清单', cls: 'doubt' },
]

interface Props {
  item: Item
  marks: MarkKind[]
  hideAnswer?: boolean
  revealMode?: 'per_item' | 'all'
  revealed: boolean
  onReveal: () => void
  onToggleMark: (kind: MarkKind) => void
  onAddDoubt?: (item: Item) => void
  onWriteNote?: (item: Item) => void
  onEdit?: (item: Item) => void
}

export function ItemCard({
  item,
  marks,
  hideAnswer,
  revealMode = 'per_item',
  revealed,
  onReveal,
  onToggleMark,
  onAddDoubt,
  onWriteNote,
  onEdit,
}: Props) {
  const [noteOpen, setNoteOpen] = useState(false)
  const masked = Boolean(hideAnswer) && !revealed
  const isAnswer = item.kind === 'answer'

  return (
    <article className={`icard${masked ? ' is-masked' : ''}`}>
      <header className="icard__head">
        <span className={`icard__kind icard__kind--${item.kind}`}>{KIND_LABEL[item.kind]}</span>
        <h4 className="icard__title">{item.title}</h4>
        <div className="icard__srcs">
          {item.source === 'teacher' && <span className="icard__src">课堂</span>}
          {item.source === 'ai' && <span className="icard__src icard__src--ai">AI 草稿</span>}
          {item.source === 'self' && <span className="icard__src icard__src--self">我写的</span>}
          {item.confirmed && <span className="icard__src icard__src--ok">已校对</span>}
        </div>
        <div className="icard__tools">
          {onEdit && (
            <button className="iconbtn" title="编辑条目" onClick={() => onEdit(item)}>
              <Icon name="edit" size={14} />
            </button>
          )}
        </div>
      </header>

      {masked ? (
        <button className="icard__mask" onClick={onReveal}>
          <Icon name="info" size={14} />
          {isAnswer ? '答案已收起 —— 自己在纸上写完再点开' : '内容已收起'}
          {revealMode === 'all' && '（本组统一揭示）'}
        </button>
      ) : (
        <div className="icard__body">
          <Markdown source={item.body_md} className="md" />
        </div>
      )}

      <footer className="icard__foot">
        <div className="icard__marks">
          {MARK_OPTIONS.map((o) => {
            const active = marks.includes(o.kind)
            return (
              <button
                key={o.kind}
                className={`mchip mchip--${o.cls}${active ? ' is-on' : ''}`}
                title={o.hint}
                onClick={() => onToggleMark(o.kind)}
              >
                {active && <span className="mchip__dot" />}
                {o.label}
              </button>
            )
          })}
        </div>
        <div className="icard__links">
          {onWriteNote && (
            <button className="linkbtn" onClick={() => onWriteNote(item)}>
              写心得
            </button>
          )}
          {onAddDoubt && (
            <button className="linkbtn" onClick={() => onAddDoubt(item)}>
              记入疑点
            </button>
          )}
        </div>
      </footer>

      {noteOpen && (
        <div className="icard__note">
          <textarea
            className="textarea"
            placeholder="写点心得…"
            onBlur={() => setNoteOpen(false)}
            autoFocus
          />
        </div>
      )}
    </article>
  )
}

export const KIND_LABEL: Record<Item['kind'], string> = {
  theorem: '定理',
  formula: '公式',
  example: '例题',
  answer: '答案',
  summary: '总结',
  question: '题目',
  note: '笔记',
}
