import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Markdown } from '../../../components/Markdown'
import { runTask } from '../../../ai/tasks'
import { validateQuiz, type QuizOutput } from '../../../ai/schema'
import { updateDoubt } from '../../../db/repo/items'
import { useUI } from '../../../store/ui'
import type { WbCtx } from '../WorkbenchPage'
import type { Doubt } from '../../../db/types'

export function ExplainStep({ ctx }: { ctx: WbCtx }) {
  const { showToast } = useUI()
  const [busy, setBusy] = useState<string | null>(null)
  const [selfDraft, setSelfDraft] = useState<Record<string, string>>({})
  const [quiz, setQuiz] = useState<QuizOutput | null>(null)
  const [quizFor, setQuizFor] = useState<string | null>(null)
  const [quizRevealed, setQuizRevealed] = useState(false)
  const [quizErr, setQuizErr] = useState('')

  const open = ctx.doubts.filter((d) => d.status === 'open')
  const done = ctx.doubts.filter((d) => d.status === 'resolved')

  const askAi = async (d: Doubt) => {
    setBusy(`ai_${d.id}`)
    try {
      const source = ctx.items.find((i) => i.id === d.item_id)
      const res = await runTask('explain', {
        vars: {
          doubt: d.title,
          context: source?.body_md ?? d.context,
          tried: d.tried || d.self_note,
        },
      })
      if (res.error) {
        showToast(res.error)
        return
      }
      await updateDoubt(d.id, { explanation: res.text })
      ctx.refresh()
      showToast(`已生成解释（${res.mode === 'mock' ? 'Mock 模式' : res.model}）`)
    } finally {
      setBusy(null)
    }
  }

  const makeQuiz = async (d: Doubt) => {
    setBusy(`quiz_${d.id}`)
    setQuizErr('')
    setQuizFor(d.id)
    try {
      const source = ctx.items.find((i) => i.id === d.item_id)
      const res = await runTask('quiz', {
        vars: {
          scope: source?.body_md ?? d.context ?? d.title,
          difficulty: '与原例题同档',
          pitfalls: '用户已知卡住的点',
        },
      })
      if (res.error) {
        setQuizErr(res.error)
        return
      }
      const check = validateQuiz(res.text)
      if (!check.ok || !check.data) {
        // 答案核验失败 → 不进入正式检测
        setQuizErr(
          `检测题未通过核验，未进入正式检测：${check.issues.map((i) => i.message).join('；')}`,
        )
        setQuiz(null)
        return
      }
      setQuiz(check.data)
      setQuizRevealed(false)
    } finally {
      setBusy(null)
    }
  }

  const saveSelf = async (d: Doubt) => {
    const text = selfDraft[d.id]
    if (!text || !text.trim()) return
    await updateDoubt(d.id, { self_note: text.trim(), tried: d.tried || text.trim() })
    setSelfDraft((s) => ({ ...s, [d.id]: '' }))
    ctx.refresh()
    showToast('已保存你的复述')
  }

  const resolve = async (d: Doubt) => {
    await updateDoubt(d.id, { status: 'resolved' })
    await ctx.onAttempt({ itemId: d.item_id, result: 'independent', note: d.title })
    ctx.refresh()
    showToast('已解决')
  }

  const reopen = async (d: Doubt) => {
    await updateDoubt(d.id, { status: 'open' })
    ctx.refresh()
  }

  const renderDoubt = (d: Doubt) => (
    <article className="doubt" key={d.id}>
      <header className="doubt__head">
        <span className={`doubt__dot${d.status === 'resolved' ? ' is-done' : ''}`} />
        <h4 className="doubt__title">{d.title}</h4>
        {d.item_id && (
          <span className="doubt__src">
            来源：
            {ctx.items.find((i) => i.id === d.item_id)?.title ?? '已删除的条目'}
          </span>
        )}
      </header>

      <div className="doubt__fields">
        <div className="doubt__row">
          <span className="doubt__k">卡在哪</span>
          <span className="doubt__v">{d.context || '（未记录）'}</span>
        </div>
        <div className="doubt__row">
          <span className="doubt__k">已尝试</span>
          <span className="doubt__v">{d.tried || '（还没试过）'}</span>
        </div>
        {d.next && (
          <div className="doubt__row">
            <span className="doubt__k">下一步</span>
            <span className="doubt__v">{d.next}</span>
          </div>
        )}
      </div>

      {d.explanation && (
        <div className="doubt__ai">
          <div className="doubt__ai-label">
            <Icon name="info" size={13} />
            AI 分层提示
          </div>
          <Markdown source={d.explanation} className="md" />
        </div>
      )}

      <div className="doubt__self">
        <label>用自己的话讲一遍（费曼自述）</label>
        <textarea
          className="textarea"
          placeholder="别抄 AI 的，用自己的话讲一遍。讲不顺的地方正是没懂的地方。"
          value={selfDraft[d.id] ?? d.self_note ?? ''}
          onChange={(e) => setSelfDraft((s) => ({ ...s, [d.id]: e.target.value }))}
        />
        <div className="row-btns">
          <button className="btn btn--sm" onClick={() => saveSelf(d)}>
            保存复述
          </button>
          <button
            className="btn btn--sm btn--primary"
            disabled={busy === `ai_${d.id}`}
            onClick={() => askAi(d)}
          >
            {busy === `ai_${d.id}` ? '思考中…' : 'AI 分层提示'}
          </button>
          <button
            className="btn btn--sm"
            disabled={busy === `quiz_${d.id}`}
            onClick={() => makeQuiz(d)}
          >
            {busy === `quiz_${d.id}` ? '出题中…' : '出一道检测题'}
          </button>
          {d.status === 'open' ? (
            <button className="btn btn--sm" onClick={() => resolve(d)}>
              标记已解决
            </button>
          ) : (
            <button className="btn btn--sm btn--ghost" onClick={() => reopen(d)}>
              重新打开
            </button>
          )}
        </div>
      </div>

      {quizFor === d.id && (
        <div className="quizbox">
          {quizErr && <div className="alert alert--err">{quizErr}</div>}
          {quiz && (
            <>
              <div className="quizbox__head">检测题</div>
              <div className="quizbox__cond">
                条件：
                {quiz.conditions.map((c, i) => (
                  <span key={i} className="quizbox__c">
                    {c}
                  </span>
                ))}
              </div>
              <div className="quizbox__q">
                <Markdown source={quiz.question} className="md" />
              </div>
              <div className="row-btns">
                {quizRevealed ? (
                  <>
                    <div className="quizbox__a">
                      <div className="quizbox__alabel">答案</div>
                      <Markdown source={quiz.answer} className="md" />
                      <div className="quizbox__alabel">解析</div>
                      <Markdown source={quiz.solution} className="md" />
                    </div>
                    <button
                      className="btn btn--sm"
                      onClick={async () => {
                        await ctx.onAttempt({
                          itemId: d.item_id,
                          result: 'independent',
                          note: '检测题',
                        })
                        ctx.refresh()
                      }}
                    >
                      我做对了
                    </button>
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={async () => {
                        await ctx.onAttempt({
                          itemId: d.item_id,
                          result: 'still_unsure',
                          note: '检测题',
                        })
                        await updateDoubt(d.id, { status: 'open' })
                        ctx.refresh()
                      }}
                    >
                      还没做对
                    </button>
                  </>
                ) : (
                  <button className="btn btn--sm btn--primary" onClick={() => setQuizRevealed(true)}>
                    我写完了，核对答案
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  )

  return (
    <div className="step">

      {ctx.doubts.length === 0 && (
        <div className="card__empty">
          疑点清单是空的。在「先复习」那一步把不理解的条目标成「有疑问」，它会自动进这里。
        </div>
      )}

      {open.length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>待解决（{open.length}）</h3>
          </div>
          <div className="doubt-list">{open.map(renderDoubt)}</div>
        </section>
      )}

      {done.length > 0 && (
        <section className="card">
          <div className="card__head">
            <h3>已解决（{done.length}）</h3>
          </div>
          <div className="doubt-list">{done.map(renderDoubt)}</div>
        </section>
      )}
    </div>
  )
}
