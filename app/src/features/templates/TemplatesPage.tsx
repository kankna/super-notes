import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { newId } from '../../lib/id'
import { Icon } from '../../components/Icon'
import { useUI } from '../../store/ui'
import { BLOCK_DESC, BLOCK_LABEL, cloneTemplate, makeBlock } from './blocks'
import type { Block, BlockType, Template } from '../../db/types'

const TYPES: BlockType[] = [
  'organize',
  'recall',
  'explain',
  'practice',
  'reflect',
  'preview',
  'retest',
  'free',
]

export function TemplatesPage() {
  const db = getDb()
  const { showToast } = useUI()
  const templates = useLiveQuery(() => db.templates.orderBy('created_at').toArray(), [])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Template | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!templates) return
    if (!activeId && templates.length) setActiveId(templates[0].id)
  }, [templates, activeId])

  useEffect(() => {
    const t = templates?.find((x) => x.id === activeId)
    if (t && !dirty) setDraft(structuredClone(t))
  }, [templates, activeId, dirty])

  const patch = (p: Partial<Template>) => {
    setDraft((d) => (d ? { ...d, ...p } : d))
    setDirty(true)
  }

  const patchBlock = (idx: number, p: Partial<Block>) => {
    setDraft((d) => {
      if (!d) return d
      const blocks = d.blocks.slice()
      blocks[idx] = { ...blocks[idx], ...p }
      return { ...d, blocks }
    })
    setDirty(true)
  }

  const move = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      if (!d) return d
      const blocks = d.blocks.slice()
      const j = idx + dir
      if (j < 0 || j >= blocks.length) return d
      ;[blocks[idx], blocks[j]] = [blocks[j], blocks[idx]]
      return { ...d, blocks }
    })
    setDirty(true)
  }

  const addBlock = (type: BlockType) => {
    setDraft((d) => (d ? { ...d, blocks: [...d.blocks, makeBlock(type)] } : d))
    setDirty(true)
  }

  const removeBlock = (idx: number) => {
    setDraft((d) => (d ? { ...d, blocks: d.blocks.filter((_, i) => i !== idx) } : d))
    setDirty(true)
  }

  const save = async () => {
    if (!draft) return
    const nextVersion = draft.builtin ? draft.version + 1 : draft.version
    await db.templates.put({
      ...draft,
      version: nextVersion,
      updated_at: Date.now(),
      created_at: draft.created_at || Date.now(),
      deleted_at: null,
    })
    setDirty(false)
    showToast(`已保存为 v${nextVersion}`)
  }

  const saveAs = async () => {
    if (!draft) return
    const name = prompt('新模板名字', `${draft.name} 副本`)
    if (!name) return
    const t = cloneTemplate(draft, name, draft.description)
    t.blocks = draft.blocks.map((b) => ({ ...b, id: newId('b_'), settings: { ...b.settings } }))
    await db.templates.add(t)
    setActiveId(t.id)
    setDirty(false)
    showToast('已另存为新模板')
  }

  const versions = useLiveQuery(
    async () => (activeId ? await db.templates.where('id').equals(activeId).toArray() : []),
    [activeId],
  )

  return (
    <main className="stage">
      <div className="tpl">
        <div className="tpl__side">
          <div className="tpl__sidehead">
            <h2>流程模板</h2>
            <span className="card__hint">模板决定每一轮的步骤</span>
          </div>
          {(templates ?? []).map((t) => (
            <button
              key={t.id}
              className={`tplitem${t.id === activeId ? ' is-on' : ''}`}
              onClick={() => {
                setActiveId(t.id)
                setDirty(false)
              }}
            >
              <div className="tplitem__name">{t.name}</div>
              <div className="tplitem__meta">
                v{t.version} · {t.blocks.length} 步 {t.builtin ? '· 内置' : ''}
              </div>
            </button>
          ))}
        </div>

        <div className="tpl__main">
          {!draft ? (
            <div className="card__empty">还没有模板。</div>
          ) : (
            <>
              <div className="tpl__head">
                <input
                  className="input tpl__name"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
                <span className="card__hint">v{draft.version}</span>
                <div className="wb__spacer" />
                <button className="btn btn--sm" onClick={saveAs}>
                  另存为新模板
                </button>
                <button className="btn btn--sm btn--primary" disabled={!dirty} onClick={save}>
                  {dirty ? '保存新版本' : '已保存'}
                </button>
              </div>

              <textarea
                className="textarea"
                style={{ marginBottom: 14 }}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
              />

              <div className="tpl__blocks">
                {draft.blocks.map((b, i) => (
                  <div className="blk" key={b.id}>
                    <div className="blk__grip">
                      <button className="iconbtn" onClick={() => move(i, -1)} disabled={i === 0}>
                        <Icon name="chevron" size={13} />
                      </button>
                      <span className="blk__idx">{i + 1}</span>
                      <button
                        className="iconbtn"
                        onClick={() => move(i, 1)}
                        disabled={i === draft.blocks.length - 1}
                      >
                        <Icon name="chevron" size={13} />
                      </button>
                    </div>
                    <div className="blk__body">
                      <div className="blk__row">
                        <input
                          className="input blk__name"
                          value={b.name}
                          onChange={(e) => patchBlock(i, { name: e.target.value })}
                        />
                        <select
                          className="select blk__type"
                          value={b.type}
                          onChange={(e) => patchBlock(i, { type: e.target.value as BlockType })}
                        >
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {BLOCK_LABEL[t]}
                            </option>
                          ))}
                        </select>
                        <select
                          className="select blk__timing"
                          value={b.timing}
                          onChange={(e) =>
                            patchBlock(i, { timing: e.target.value as Block['timing'] })
                          }
                        >
                          <option value="none">不计时</option>
                          <option value="manual">手动计时</option>
                          <option value="pomodoro">番茄钟</option>
                        </select>
                        <button
                          className="iconbtn"
                          title="删除这个块"
                          onClick={() => removeBlock(i)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      <textarea
                        className="textarea blk__instr"
                        placeholder="指导语：这一步具体要做什么"
                        value={b.instruction}
                        onChange={(e) => patchBlock(i, { instruction: e.target.value })}
                      />
                      {b.type === 'recall' && (
                        <label className="blk__check">
                          <input
                            type="checkbox"
                            checked={b.settings.hideAnswer !== false}
                            onChange={(e) =>
                              patchBlock(i, {
                                settings: { ...b.settings, hideAnswer: e.target.checked },
                              })
                            }
                          />
                          回忆时默认收起答案
                        </label>
                      )}
                      {b.type === 'practice' && (
                        <div className="blk__row">
                          <label className="blk__num">
                            番茄钟专注（分钟）
                            <input
                              className="input"
                              type="number"
                              value={b.settings.pomodoro?.work ?? 25}
                              onChange={(e) =>
                                patchBlock(i, {
                                  settings: {
                                    ...b.settings,
                                    pomodoro: {
                                      work: Number(e.target.value),
                                      break: b.settings.pomodoro?.break ?? 5,
                                    },
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="blk__num">
                            单题停留提醒（分钟，0=不提醒）
                            <input
                              className="input"
                              type="number"
                              value={b.settings.maxMinutesPerTask ?? 0}
                              onChange={(e) =>
                                patchBlock(i, {
                                  settings: {
                                    ...b.settings,
                                    maxMinutesPerTask: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      )}
                      {b.type === 'reflect' && (
                        <textarea
                          className="textarea blk__guide"
                          placeholder={'引导问题，一行一个：\n与过去相比有什么不同？\n下次遇到类似的第一步做什么？'}
                          value={(b.settings.guidance ?? []).join('\n')}
                          onChange={(e) =>
                            patchBlock(i, {
                              settings: {
                                ...b.settings,
                                guidance: e.target.value.split('\n').filter((x) => x.trim()),
                              },
                            })
                          }
                        />
                      )}
                      {b.type === 'free' && (
                        <label className="blk__check">
                          产出
                          <select
                            className="select"
                            value={b.settings.output ?? 'text'}
                            onChange={(e) =>
                              patchBlock(i, {
                                settings: {
                                  ...b.settings,
                                  output: e.target.value as 'text' | 'image' | 'text_and_image',
                                },
                              })
                            }
                          >
                            <option value="text">文本</option>
                            <option value="image">图片</option>
                            <option value="text_and_image">文本 + 图片</option>
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="tpl__add">
                <span className="card__hint">添加一个功能块：</span>
                {TYPES.map((t) => (
                  <button className="btn btn--sm" key={t} onClick={() => addBlock(t)}>
                    + {BLOCK_LABEL[t]}
                  </button>
                ))}
              </div>

              <div className="tpl__desc">
                {TYPES.map((t) => (
                  <div className="tpl__d" key={t}>
                    <b>{BLOCK_LABEL[t]}</b>
                    {BLOCK_DESC[t]}
                  </div>
                ))}
              </div>

              {(versions ?? []).length > 1 && (
                <div className="card__hint" style={{ marginTop: 12 }}>
                  历史版本保留在导出的 project.json 里；修改模板默认只影响今后创建的学习。
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
