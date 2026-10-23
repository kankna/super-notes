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

const EMPTY: AiConfig = {
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
    if (!check.ok) return showToast(`地址不合法：${check.message}`)
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
        auth: `鉴权成功（${ms}ms）`,
        text: `文字能力正常：${res.text.slice(0, 40)}`,
        url: `实际请求：${url}`,
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
        auth: `失败：${msg}`,
        hint: '浏览器直连可能被厂商的 CORS 策略拦截。可以在设置里填自己的中转地址，或先用 Mock 模式。',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <main className="stage">
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">AI 服务设置</h1>
          <span className="page__sub">
            可以保存多组连接，按能力分配给照片转写、笔记整理、疑点讲解、出题、反馈。
          </span>
        </div>

        <section className="card">
          <div className="card__head">
            <h3>Mock 模式</h3>
            <span className="card__hint">开启时所有 AI 任务走本地模拟，零配置也能跑通全流程</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={mock}
              onChange={async (e) => {
                await setMockMode(e.target.checked)
                setMock(e.target.checked)
              }}
            />
            <span>{mock ? '已开启（演示用）' : '已关闭（走真实 API）'}</span>
          </label>
        </section>

        <section className="card">
          <div className="card__head">
            <h3>连接配置</h3>
            <button
              className="btn btn--sm btn--primary"
              onClick={() => setEditing({ ...EMPTY, id: '' })}
            >
              + 新增配置
            </button>
          </div>

          {(configs ?? []).length === 0 && (
            <div className="card__empty">
              还没有配置。DeepSeek 只需填 Base URL <code>https://api.deepseek.com</code> 和 API Key；
              其他 OpenAI 兼容厂商同理。
            </div>
          )}

          <div className="cfglist">
            {(configs ?? []).map((c) => (
              <div className="cfg" key={c.id}>
                <div className="cfg__name">{c.name}</div>
                <div className="cfg__meta">
                  {c.base_url} · {c.model}
                  {c.supports_image ? ' · 支持图片' : ' · 仅文字'}
                </div>
                <div className="cfg__key">{maskKey(c.api_key)}</div>
                <div className="cfg__acts">
                  <button className="btn btn--sm" onClick={() => setEditing({ ...c })}>
                    编辑
                  </button>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={async () => {
                      await db.ai_configs.delete(c.id)
                      showToast('已删除')
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {editing && (
          <section className="card">
            <div className="card__head">
              <h3>{editing.id ? '编辑配置' : '新增配置'}</h3>
            </div>

            <div className="field">
              <label className="field__label">配置名称</label>
              <input
                className="input"
                value={editing.name}
                placeholder="例如：DeepSeek 主账号"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>

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
              <label className="field__label">Base URL</label>
              <input
                className="input"
                value={editing.base_url}
                placeholder="https://api.deepseek.com"
                onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}
              />
              <div className="field__hint">
                填写服务根地址即可，程序会自己拼接路径：
                <code>{resolveEndpoint(editing.base_url || 'https://api.deepseek.com')}</code>
              </div>
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
                静态站形态下密钥保存在本机浏览器；导出包**不会**包含它。正式形态密钥留服务端。
              </div>
            </div>

            <div className="field">
              <label className="field__label">模型 ID</label>
              <input
                className="input"
                value={editing.model}
                placeholder="deepseek-v4-flash"
                onChange={(e) => setEditing({ ...editing, model: e.target.value })}
              />
              <div className="field__hint">
                DeepSeek：文字 <code>deepseek-v4-flash</code> / <code>deepseek-v4-pro</code>；
                图片识别 <code>deepseek-v4-flash-vision-exp</code>。
              </div>
            </div>

            <div className="field">
              <label className="field__label">模型能力</label>
              <div className="row-btns">
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={editing.supports_text}
                    onChange={(e) => setEditing({ ...editing, supports_text: e.target.checked })}
                  />
                  支持文字输入
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={editing.supports_image}
                    onChange={(e) => setEditing({ ...editing, supports_image: e.target.checked })}
                  />
                  支持图片输入
                </label>
              </div>
            </div>

            <div className="field">
              <label className="field__label">高级参数</label>
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
                  最大输出长度
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
                  温度（留空=不发送）
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

            <div className="row-btns">
              <button className="btn btn--primary" onClick={save}>
                保存
              </button>
              <button className="btn" disabled={testing} onClick={test}>
                {testing ? '测试中…' : '测试连接'}
              </button>
              <button className="btn btn--ghost" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>

            {testResult.auth && (
              <div className={`alert ${testResult.auth.startsWith('失败') ? 'alert--err' : 'alert--info'}`}>
                <div>{testResult.auth}</div>
                {testResult.text && <div>{testResult.text}</div>}
                {testResult.url && <div className="field__hint">{testResult.url}</div>}
                {testResult.hint && <div className="field__hint">{testResult.hint}</div>}
              </div>
            )}
          </section>
        )}

        <section className="card">
          <div className="card__head">
            <h3>功能映射</h3>
            <span className="card__hint">每个能力用哪一组配置</span>
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
                  <option value="">（未指定 → 走 Mock）</option>
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
            <h3>用量与费用估算</h3>
            <span className="card__hint">以供应商返回的 usage 为准，未接入账单前均为估算</span>
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
              <div className="stat__k">Mock 调用</div>
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
            <span className="card__hint">五个任务各自独立、独立版本化</span>
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
            <span className="card__hint">
              变量：{extractVariables(promptText).join('、') || '无'}
            </span>
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
    </main>
  )
}
