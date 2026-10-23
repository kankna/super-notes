import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../../db/db'
import { newId } from '../../lib/id'
import { Icon } from '../../components/Icon'
import { useUI } from '../../store/ui'
import { chatCompletion, resolveEndpoint, validateBaseUrl } from '../../ai/client'
import {
  getMapping,
  isMockMode,
  listConfigs,
  maskKey,
  recordUsage,
  setMapping,
  setMockMode,
  usageSummary,
} from '../../ai/store'
import { MAPPING_KEYS, TASK_LABEL, extractVariables } from '../../ai/prompts'
import { listPromptVersions, savePromptVersion } from '../../ai/tasks'
import type { AiConfig, AiTaskKind } from '../../db/types'

const DEEPSEEK_HINT = 'DeepSeek 就填 https://api.deepseek.com，模型名 deepseek-v4-flash'

export function AiSettingsPage() {
  const db = getDb()
  const { showToast } = useUI()
  const configs = useLiveQuery(() => listConfigs(), [])
  const usage = useLiveQuery(() => usageSummary(), [])
  const [mock, setMock] = useState(true)
  const [mapping, setMappingState] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<AiConfig | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [promptTask, setPromptTask] = useState<AiTaskKind>('transcribe')
  const [promptText, setPromptText] = useState('')

  useEffect(() => {
    isMockMode().then(setMock)
    getMapping().then(setMappingState)
  }, [])

  useEffect(() => {
    const load = async () => {
      const rows = await listPromptVersions(promptTask)
      setPromptText(rows[0]?.content ?? '')
    }
    void load()
  }, [promptTask])

  const save = async () => {
    if (!editing) return
    if (!editing.name.trim()) return showToast('给这组配置起个名字')
    const check = validateBaseUrl(editing.base_url)
    if (!check.ok) return showToast(`地址不对：${check.message}`)
    const row: AiConfig = {
      ...editing,
      id: editing.id || newId('cfg_'),
      name: editing.name.trim(),
      created_at: editing.created_at || Date.now(),
      updated_at: Date.now(),
    }
    await db.ai_configs.put(row)
    setEditing(null)
    showToast('已保存')
  }

  const test = async () => {
    if (!editing) return
    setTesting(true)
    setTestResult({})
    try {
      const url = resolveEndpoint(editing.base_url)
      const t0 = Date.now()
      const res = await chatCompletion(
        { ...editing, id: editing.id || 'test', created_at: 0, updated_at: 0 },
        [{ role: 'user', content: '只回复两个字：连通' }],
        { timeoutMs: 20_000, maxTokens: 16 },
      )
      const ms = Date.now() - t0
      setTestResult({
        auth: `连上了（${ms} 毫秒）`,
        text: `模型回的是：${res.text.slice(0, 40)}`,
        url: `实际请求地址：${url}`,
      })
      await recordUsage({
        config_id: editing.id || null,
        config_name: editing.name,
        task: 'feedback',
        model: res.model,
        mode: 'live',
        prompt_version: 1,
        input_tokens: res.inputTokens,
        output_tokens: res.outputTokens,
        ok: true,
        error: '',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setTestResult({
        auth: `没连上：${msg}`,
        hint: '浏览器直连厂商接口有时会被跨域限制拦掉。可以填自己的中转地址；先切回演示模式也不影响使用。',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <main className="stage">
      <div className="page">
        <button className="wb2__back" onClick={() => (location.hash = '#/')}>
          ← 回书架
        </button>
        <div className="page__head">
          <h1 className="page__title">AI 设置</h1>
        </div>

        <section className="card">
          <div className="card__head">
            <h3>现在用哪种</h3>
          </div>
          <div className="pick2">
            <button
              className={`pick2__opt${mock ? ' is-on' : ''}`}
              onClick={async () => {
                await setMockMode(true)
                setMock(true)
              }}
            >
              <span className="pick2__name">演示模式</span>
              <span className="pick2__desc">不花钱、不联网，AI 给示例内容</span>
            </button>
            <button
              className={`pick2__opt${!mock ? ' is-on' : ''}`}
              onClick={async () => {
                await setMockMode(false)
                setMock(false)
              }}
            >
              <span className="pick2__name">真实模型</span>
              <span className="pick2__desc">用下面填的 Key 调真模型</span>
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <h3>接一个模型</h3>
            <button className="btn btn--sm btn--primary" onClick={() => setEditing(newConfig())}>
              + 新增
            </button>
          </div>

          {(configs ?? []).length === 0 && (
            <div className="card__empty">还没有配置。点右上角「新增」，填两行就能用。</div>
          )}

          <div className="cfglist">
            {(configs ?? []).map((c) => (
              <div className="cfg" key={c.id}>
                <div className="cfg__name">{c.name}</div>
                <div className="cfg__meta inline">
                  <span>{c.base_url}</span>
                  <span>{c.model}</span>
                </div>
                <div className="cfg__acts">
                  <button className="btn btn--sm" onClick={() => setEditing({ ...c })}>
                    改
                  </button>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={async () => {
                      await db.ai_configs.delete(c.id)
                      showToast('已删除')
                    }}
                  >
                    删
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {editing && (
          <section className="card">
            <div className="card__head">
              <h3>{editing.id ? '改配置' : '新增配置'}</h3>
            </div>

            <div className="field">
              <label className="field__label">给它起个名字</label>
              <input
                className="input"
                value={editing.name}
                placeholder="例如：DeepSeek"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label className="field__label">接口地址</label>
              <input
                className="input"
                value={editing.base_url}
                placeholder="https://api.deepseek.com"
                onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}
              />
              <div className="field__hint">{DEEPSEEK_HINT}</div>
            </div>

            <div className="field">
              <label className="field__label">API Key</label>
              <input
                className="input"
                type="password"
                value={editing.api_key}
                placeholder="sk-..."
                onChange={(e) => setEditing({ ...editing, api_key: e.target.value })}
              />
              <div className="field__hint">
                存在这台设备的浏览器里，导出包不会包含它。正式版会挪到服务器。
              </div>
            </div>

            <div className="field">
              <label className="field__label">模型名</label>
              <input
                className="input"
                value={editing.model}
                placeholder="deepseek-v4-flash"
                onChange={(e) => setEditing({ ...editing, model: e.target.value })}
              />
              <div className="field__hint">
                文字用 <code>deepseek-v4-flash</code>；要它读课堂照片，得用{' '}
                <code>deepseek-v4-flash-vision-exp</code>。
              </div>
            </div>

            <details className="adv">
              <summary className="adv__sum">高级设置</summary>
              <div className="adv__body">
                <div className="field">
                  <label className="field__label">接口协议</label>
                  <select
                    className="select"
                    value={editing.protocol}
                    onChange={(e) =>
                      setEditing({ ...editing, protocol: e.target.value as AiConfig['protocol'] })
                    }
                  >
                    <option value="openai">OpenAI 兼容（/chat/completions）</option>
                    <option value="anthropic">Anthropic 兼容（/messages）</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field__label">模型能力</label>
                  <div className="row-btns">
                    <label className="chk">
                      <input
                        type="checkbox"
                        checked={editing.supports_text}
                        onChange={(e) =>
                          setEditing({ ...editing, supports_text: e.target.checked })
                        }
                      />
                      能读文字
                    </label>
                    <label className="chk">
                      <input
                        type="checkbox"
                        checked={editing.supports_image}
                        onChange={(e) =>
                          setEditing({ ...editing, supports_image: e.target.checked })
                        }
                      />
                      能读图片
                    </label>
                  </div>
                </div>
                <div className="field">
                  <label className="field__label">超时 / 输出长度 / 温度</label>
                  <div className="row-btns">
                    <label className="blk__num">
                      超时（毫秒）
                      <input
                        className="input"
                        type="number"
                        value={editing.timeout_ms}
                        onChange={(e) =>
                          setEditing({ ...editing, timeout_ms: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="blk__num">
                      最大输出
                      <input
                        className="input"
                        type="number"
                        value={editing.max_tokens}
                        onChange={(e) =>
                          setEditing({ ...editing, max_tokens: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="blk__num">
                      温度（留空不发送）
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={editing.temperature ?? ''}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            temperature: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            </details>

            <div className="row-btns">
              <button className="btn btn--primary" onClick={save}>
                保存
              </button>
              <button className="btn" disabled={testing} onClick={test}>
                {testing ? '测试中…' : '试一下能不能连上'}
              </button>
              <button className="btn btn--ghost" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>

            {testResult.auth && (
              <div className={`alert ${testResult.auth.startsWith('没连上') ? 'alert--err' : 'alert--info'}`}>
                <div>{testResult.auth}</div>
                {testResult.text && <div>{testResult.text}</div>}
                {testResult.url && <div className="field__hint">{testResult.url}</div>}
                {testResult.hint && <div className="field__hint">{testResult.hint}</div>}
              </div>
            )}
          </section>
        )}

        <details className="adv">
          <summary className="adv__sum">更多（谁用哪个模型、用量、提示词）</summary>
          <div className="adv__body">
            <section className="card">
              <div className="card__head">
                <h3>谁用哪个模型</h3>
              </div>
              <div className="maplist">
                {MAPPING_KEYS.map((k) => (
                  <div className="maprow" key={k}>
                    <span className="maprow__k">{TASK_LABEL[k]}</span>
                    <select
                      className="select"
                      value={mapping[k] ?? ''}
                      onChange={async (e) => {
                        await setMapping(k, e.target.value)
                        setMappingState((m) => ({ ...m, [k]: e.target.value }))
                      }}
                    >
                      <option value="">（用第一个配置）</option>
                      {(configs ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card__head">
                <h3>用量</h3>
                <span className="card__hint">以厂商返回的 usage 为准，没接账单前都是估算</span>
              </div>
              <div className="statgrid">
                <div className="stat">
                  <div className="stat__n">{usage?.calls ?? 0}</div>
                  <div className="stat__k">总调用</div>
                </div>
                <div className="stat">
                  <div className="stat__n">{usage?.live ?? 0}</div>
                  <div className="stat__k">真实调用</div>
                </div>
                <div className="stat">
                  <div className="stat__n">{usage?.mock ?? 0}</div>
                  <div className="stat__k">演示调用</div>
                </div>
                <div className="stat">
                  <div className="stat__n">{usage?.inputTokens ?? 0}</div>
                  <div className="stat__k">输入 tokens</div>
                </div>
                <div className="stat">
                  <div className="stat__n">{usage?.outputTokens ?? 0}</div>
                  <div className="stat__k">输出 tokens</div>
                </div>
                <div className="stat">
                  <div className="stat__n">{usage?.failures ?? 0}</div>
                  <div className="stat__k">失败</div>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card__head">
                <h3>提示词</h3>
              </div>
              <div className="row-btns">
                {MAPPING_KEYS.map((k) => (
                  <button
                    key={k}
                    className={`btn btn--sm${promptTask === k ? ' btn--primary' : ''}`}
                    onClick={() => setPromptTask(k)}
                  >
                    {TASK_LABEL[k]}
                  </button>
                ))}
              </div>
              <textarea
                className="textarea"
                style={{ minHeight: 220, marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <div className="row-btns">
                <span className="card__hint">变量：{extractVariables(promptText).join('、') || '无'}</span>
                <button
                  className="btn btn--sm btn--primary"
                  onClick={async () => {
                    await savePromptVersion(promptTask, promptText)
                    showToast('已存为新版本')
                  }}
                >
                  <Icon name="ok" size={13} />
                  存为新版本
                </button>
              </div>
            </section>
          </div>
        </details>
      </div>
    </main>
  )
}

function newConfig(): AiConfig {
  return {
    id: '',
    name: '',
    protocol: 'openai',
    base_url: 'https://api.deepseek.com',
    api_key: '',
    model: 'deepseek-v4-flash',
    supports_text: true,
    supports_image: false,
    timeout_ms: 60_000,
    max_tokens: 4096,
    temperature: null,
    created_at: 0,
    updated_at: 0,
  }
}

export { maskKey }
