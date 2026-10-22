import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Markdown } from '../../components/Markdown'
import type { Item } from '../../db/types'

const KIND_LABEL: Record<Item['kind'], string> = {
  theorem: '定理',
  formula: '公式',
  example: '例题',
  answer: '答案',
  summary: '总结',
  question: '题目',
  note: '笔记',
}

const STATUS_LABEL: Record<string, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  paused: '已暂停',
  completed: '已完成',
  skipped: '已跳过',
  deferred: '已延后',
}

export function ProjectOverview({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const db = getDb()
  const [revealAnswers, setRevealAnswers] = useState(false)

  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const chapters = useLiveQuery(
    () => db.chapters.where('project_id').equals(projectId).sortBy('order'),
    [projectId],
  )
  const units = useLiveQuery(() => db.units.where('project_id').equals(projectId).sortBy('order'), [
    projectId,
  ])
  const items = useLiveQuery(() => db.items.where('project_id').equals(projectId).sortBy('order'), [
    projectId,
  ])
  const doubts = useLiveQuery(() => db.doubts.where('project_id').equals(projectId).toArray(), [
    projectId,
  ])

  if (!project) return null

  const itemsByUnit = new Map<string, Item[]>()
  for (const it of items ?? []) {
    const arr = itemsByUnit.get(it.unit_id) ?? []
    arr.push(it)
    itemsByUnit.set(it.unit_id, arr)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3 className="modal__title">{project.name}</h3>
          <button className="iconbtn" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="modal__body">
          <p className="ov__desc">{project.description}</p>

          <div className="ov__toolbar">
            <span className="ov__chip">{project.subtitle || '未命名副标题'}</span>
            {project.tags.map((t) => (
              <span className="ov__chip" key={t}>
                {t}
              </span>
            ))}
            <button
              className="btn btn--sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => setRevealAnswers((v) => !v)}
            >
              {revealAnswers ? '隐藏答案' : '揭示答案'}
            </button>
          </div>

          {(chapters ?? []).map((ch) => {
            const chUnits = (units ?? []).filter((u) => u.chapter_id === ch.id)
            return (
              <section className="ov__chapter" key={ch.id}>
                <h4 className="ov__chapter-name">
                  <Icon name="folder" size={15} />
                  {ch.name}
                  <span className="ov__count">{chUnits.length} 单元</span>
                </h4>

                {chUnits.map((u) => {
                  const uItems = itemsByUnit.get(u.id) ?? []
                  return (
                    <div className="ov__unit" key={u.id}>
                      <div className="ov__unit-head">
                        <span className="ov__unit-title">{u.title}</span>
                        <span className={`ov__status ov__status--${u.status}`}>
                          {STATUS_LABEL[u.status] ?? u.status}
                        </span>
                      </div>

                      {uItems.length === 0 && <div className="ov__empty-line">还没有内容条目</div>}

                      {uItems.map((it) => {
                        const hidden = it.kind === 'answer' && !revealAnswers
                        return (
                          <article className="ov__item" key={it.id}>
                            <div className="ov__item-head">
                              <span className={`ov__kind ov__kind--${it.kind}`}>{KIND_LABEL[it.kind]}</span>
                              <span className="ov__item-title">{it.title}</span>
                              {it.source === 'self' && <span className="ov__src">我写的</span>}
                              {it.source === 'ai' && <span className="ov__src ov__src--ai">AI 草稿</span>}
                              {it.confirmed && <span className="ov__src ov__src--ok">已校对</span>}
                            </div>
                            {hidden ? (
                              <button className="ov__masked" onClick={() => setRevealAnswers(true)}>
                                <Icon name="info" size={13} />
                                答案已收起 · 点击揭示
                              </button>
                            ) : (
                              <div className="ov__body">
                                <Markdown source={it.body_md} className="md" />
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  )
                })}
              </section>
            )
          })}

          {(doubts ?? []).length > 0 && (
            <section className="ov__chapter">
              <h4 className="ov__chapter-name">
                <Icon name="info" size={15} />
                疑点清单
                <span className="ov__count">{doubts!.length} 条</span>
              </h4>
              {doubts!.map((d) => (
                <div className="ov__doubt" key={d.id}>
                  <div className="ov__doubt-title">{d.title}</div>
                  <div className="ov__doubt-row">
                    <span>卡在哪</span>
                    {d.context}
                  </div>
                  <div className="ov__doubt-row">
                    <span>已尝试</span>
                    {d.tried}
                  </div>
                  <div className="ov__doubt-row ov__doubt-row--next">
                    <span>下一步</span>
                    {d.next}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="modal__foot">
          <span className="ov__note">图形化项目画布、单元工作台与 AI 整理在后续里程碑开放</span>
          <button className="btn btn--primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
