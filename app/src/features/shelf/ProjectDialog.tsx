import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { ACCENTS, randomAccent } from '../../lib/color'
import type { CoverStyle, Project } from '../../db/types'

const COVERS: { id: CoverStyle; label: string }[] = [
  { id: 'solid', label: '素色' },
  { id: 'gradient', label: '渐变' },
  { id: 'striped', label: '条纹' },
  { id: 'grid', label: '网格' },
]

export interface ProjectDraft {
  name: string
  subtitle: string
  description: string
  tags: string[]
  accent: string
  cover: CoverStyle
}

export function emptyDraft(): ProjectDraft {
  return {
    name: '',
    subtitle: '',
    description: '',
    tags: [],
    accent: randomAccent(),
    cover: 'gradient',
  }
}

export function draftFrom(p: Project): ProjectDraft {
  return {
    name: p.name,
    subtitle: p.subtitle,
    description: p.description,
    tags: p.tags,
    accent: p.accent,
    cover: p.cover,
  }
}

interface Props {
  initial: ProjectDraft
  onSave: (draft: ProjectDraft) => void
  onClose: () => void
}

export function ProjectDialog({ initial, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<ProjectDraft>(initial)

  const set = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const valid = draft.name.trim().length > 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3 className="modal__title">{initial.name ? '编辑书盒' : '新建书盒'}</h3>
          <button className="iconbtn" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="modal__body">
          <div className="field">
            <label className="field__label">项目名称</label>
            <input
              className="input"
              value={draft.name}
              autoFocus
              placeholder="例如：高一数学"
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label">副标题</label>
            <input
              className="input"
              value={draft.subtitle}
              placeholder="例如：函数与导数"
              onChange={(e) => set('subtitle', e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label">项目说明</label>
            <textarea
              className="textarea"
              value={draft.description}
              placeholder="这个项目是干什么的？打算怎么学？"
              onChange={(e) => set('description', e.target.value)}
            />
            <div className="field__hint">鼠标悬停书盒时显示的就是这段说明。</div>
          </div>

          <div className="field">
            <label className="field__label">标签</label>
            <input
              className="input"
              value={draft.tags.join('、')}
              placeholder="数学、高一、在用"
              onChange={(e) =>
                set(
                  'tags',
                  e.target.value
                    .split(/[、,，\s]+/)
                    .map((t) => t.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>

          <div className="field">
            <label className="field__label">封面色</label>
            <div className="swatches">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  className={`swatch${draft.accent === c ? ' is-active' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('accent', c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label">封面样式</label>
            <div className="cover-picker">
              {COVERS.map((c) => (
                <button
                  key={c.id}
                  className={`cover-opt${draft.cover === c.id ? ' is-active' : ''}`}
                  style={{ ['--accent' as string]: draft.accent }}
                  onClick={() => set('cover', c.id)}
                >
                  <span className="cover-opt__label">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn--primary"
            disabled={!valid}
            style={!valid ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
            onClick={() => valid && onSave(draft)}
          >
            {initial.name ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
