import { Icon } from '../../components/Icon'
import { contrastInk } from '../../lib/color'
import type { Project } from '../../db/types'

export interface BookStats {
  chapters: number
  units: number
  doubts: number
  items: number
  lastStudied: number | null
}

interface Props {
  project: Project
  stats: BookStats
  selected: boolean
  dragging: boolean
  detailOpen: boolean
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onToggleDetail: (id: string) => void
  onPointerDown: (e: React.PointerEvent, id: string) => void
}

function relative(ts: number | null): string {
  if (!ts) return '还没开始'
  const diff = Date.now() - ts
  const day = 86_400_000
  if (diff < 3_600_000) return '刚刚'
  if (diff < day) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

export function BookBox({
  project,
  stats,
  selected,
  dragging,
  detailOpen,
  onSelect,
  onEdit,
  onDelete,
  onToggleDetail,
  onPointerDown,
}: Props) {
  const ink = contrastInk(project.accent)

  return (
    <div
      className={`book book--${project.cover}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${stats.doubts > 0 ? ' has-badge' : ''}`}
      style={{ ['--accent' as string]: project.accent, ['--ink-on' as string]: ink }}
      data-book-id={project.id}
      onPointerDown={(e) => onPointerDown(e, project.id)}
      onClick={() => onSelect(project.id)}
    >
      <div className="book__actions" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className="book__act"
          title="先看看里面有什么（不开始学）"
          onClick={(e) => {
            e.stopPropagation()
            onToggleDetail(project.id)
          }}
        >
          <Icon name="info" size={14} />
        </button>
        <button
          className="book__act"
          title="改封面和名字"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(project.id)
          }}
        >
          <Icon name="palette" size={14} />
        </button>
        <button
          className="book__act"
          title="删掉这个书盒"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(project.id)
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      {stats.doubts > 0 && (
        <div className="book__badge">
          <Icon name="info" size={11} />
          {stats.doubts} 疑点
        </div>
      )}

      <div className="book__body">
        <div className="book__spine">
          <span className="book__spine-text">{project.name}</span>
        </div>
        <div className="book__front">
          <div>
            <div className="book__title">{project.name}</div>
            {project.subtitle && <div className="book__subtitle">{project.subtitle}</div>}
            {project.tags.length > 0 && (
              <div className="book__tags">
                {project.tags.slice(0, 3).map((t) => (
                  <span className="book__tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="book__foot">
            <span className="book__foot-stat">
              {stats.chapters} 章 · {stats.units} 单元
            </span>
            <span className="book__foot-time">{relative(stats.lastStudied)}</span>
          </div>
        </div>
      </div>

      <div
        className="book__detail"
        style={detailOpen ? { opacity: 1, transform: 'translate(-50%, 0)', pointerEvents: 'auto' } : undefined}
      >
        <h4>{project.name}</h4>
        <p>{project.description || '（还没有写项目说明）'}</p>
        <div className="book__stats">
          <span>
            章节 <b>{stats.chapters}</b>
          </span>
          <span>
            学习单元 <b>{stats.units}</b>
          </span>
          <span>
            内容条目 <b>{stats.items}</b>
          </span>
          <span>
            疑点 <b>{stats.doubts}</b>
          </span>
        </div>
      </div>
    </div>
  )
}
