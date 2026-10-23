import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../db/db'
import { newId } from '../lib/id'
import { computeTiming, stepTiming, activeStepId } from '../lib/timer'
import { addStepEvent, createSession, listStepEvents, recordAttempt } from '../db/repo/session'
import { createDoubt, listDoubts, listMarks, toggleMark } from '../db/repo/items'
import { makeMathTemplate } from '../features/templates/blocks'
import { seedIfEmpty } from '../db/seed'
import { runTask } from '../ai/tasks'
import { validateOrganized, validateQuiz, checkLatex } from '../ai/schema'
import { isMockMode } from '../ai/store'
import type { StepEvent } from '../db/types'

// 仓储层统一走 getDb()，测试必须用同一个库
const db = getDb()

function ev(stepId: string, type: StepEvent['type'], ts: number): StepEvent {
  return {
    id: newId('ev_'),
    session_id: 's',
    step_id: stepId,
    type,
    ts,
    manual: false,
    note: '',
  }
}

beforeEach(async () => {
  await Promise.all(
    [
      db.projects,
      db.chapters,
      db.units,
      db.items,
      db.marks,
      db.doubts,
      db.attachments,
      db.tasks,
      db.templates,
      db.sessions,
      db.step_events,
      db.attempts,
      db.retests,
      db.reflections,
      db.preview_notes,
      db.prompts,
      db.ai_usage,
      db.trash,
      db.settings,
    ].map((t) => t.clear()),
  )
  // 允许重新写入示例数据
  await db.settings.delete('seeded.v1')
})

describe('计时引擎', () => {
  it('按区间求和，暂停不计', () => {
    const events = [
      ev('a', 'start', 1000),
      ev('a', 'pause', 6000),
      ev('a', 'resume', 10000),
      ev('a', 'complete', 25000),
    ]
    const r = computeTiming(events, 30000)
    const t = stepTiming(r, 'a')
    expect(t.activeMs).toBe(5000 + 15000)
    expect(t.running).toBe(false)
  })

  it('只存事件不存计数器：同样的事件永远得到同样的时长', () => {
    const events = [ev('a', 'start', 0), ev('a', 'complete', 60_000)]
    expect(computeTiming(events, 999_999).byStep.get('a')!.activeMs).toBe(60_000)
    expect(computeTiming(events, 0).byStep.get('a')!.activeMs).toBe(60_000)
  })

  it('运行中的区间计入当前时刻', () => {
    const r = computeTiming([ev('a', 'start', 1000)], 6000)
    expect(stepTiming(r, 'a').activeMs).toBe(5000)
    expect(stepTiming(r, 'a').running).toBe(true)
  })

  it('离开过久的空白区间不默认计入，标为待确认', () => {
    const r = computeTiming([ev('a', 'start', 0)], 30 * 60_000)
    expect(r.uncertain).not.toBeNull()
    expect(stepTiming(r, 'a').activeMs).toBe(0)
  })

  it('同一时刻只允许一个活动计时会话', () => {
    const r = computeTiming([ev('a', 'start', 0), ev('b', 'start', 1000)], 2000)
    expect(activeStepId(r)).toBe('a')
  })

  it('接管会结算旧区间并重新开始', () => {
    const r = computeTiming([ev('a', 'start', 0), ev('a', 'takeover', 5000)], 8000)
    const t = stepTiming(r, 'a')
    expect(t.activeMs).toBe(5000 + 3000)
  })
})

describe('数据层', () => {
  it('模板快照会冻结在实例上，之后改模板不影响这一轮', async () => {
    const tpl = makeMathTemplate()
    await db.templates.add(tpl)
    const unitId = newId('u_')
    await db.units.add({
      id: unitId,
      project_id: 'p',
      chapter_id: 'c',
      title: '测试单元',
      order: 0,
      status: 'not_started',
      last_studied_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    const s = await createSession(unitId, tpl.id)
    const snapshotLen = s.template_snapshot.length

    tpl.blocks.pop()
    await db.templates.put(tpl)

    const again = await db.sessions.get(s.id)
    expect(again!.template_snapshot.length).toBe(snapshotLen)
  })

  it('步骤事件与尝试结果分开存储', async () => {
    const s = await db.sessions.add({
      id: newId('s_'),
      project_id: 'p',
      unit_id: 'u',
      template_id: 't',
      template_version: 1,
      template_snapshot: [],
      title: 'x',
      status: 'in_progress',
      current_step: 0,
      started_at: Date.now(),
      ended_at: null,
      updated_at: Date.now(),
      deleted_at: null,
    })
    const sessionId = String(s)
    await addStepEvent(sessionId, 'b1', 'start')
    await addStepEvent(sessionId, 'b1', 'complete')
    await recordAttempt({ sessionId, stepId: 'b1', result: 'independent' })

    const events = await listStepEvents(sessionId)
    expect(events.map((e) => e.type)).toEqual(['start', 'complete'])
    const attempts = await db.attempts.where('session_id').equals(sessionId).toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0].result).toBe('independent')
  })

  it('不熟悉与有疑问可以同时存在（标记是集合）', async () => {
    const itemId = newId('i_')
    await toggleMark(itemId, 'unfamiliar')
    await toggleMark(itemId, 'doubt')
    const marks = await listMarks(itemId)
    expect(marks.map((m) => m.kind).sort()).toEqual(['doubt', 'unfamiliar'])
    await toggleMark(itemId, 'doubt')
    expect((await listMarks(itemId)).map((m) => m.kind)).toEqual(['unfamiliar'])
  })

  it('疑点带来源与上下文', async () => {
    const d = await createDoubt({
      projectId: 'p',
      unitId: 'u',
      itemId: 'i',
      title: '为什么 f\'(x)>0 就能推出严格递增',
      context: '定理证明',
      tried: '试着用定义写',
    })
    const list = await listDoubts('u')
    expect(list).toHaveLength(1)
    expect(d.status).toBe('open')
    expect(list[0].tried).toBe('试着用定义写')
  })
})

describe('AI 层', () => {
  it('Mock 模式默认开启，不需要任何配置', async () => {
    expect(await isMockMode()).toBe(true)
  })

  it('转写结果按页切分并标出待确认', async () => {
    const res = await runTask('transcribe', { vars: { pages: '2', note: '' } })
    expect(res.mode).toBe('mock')
    expect(res.text).toContain('## 第 1 页')
    expect(res.text).toContain('## 第 2 页')
    expect(res.text).toContain('[待确认')
  })

  it('整理结果能通过字段与 LaTeX 校验', async () => {
    const res = await runTask('organize', { vars: { transcript: '随便什么' } })
    const check = validateOrganized(res.text)
    expect(check.ok).toBe(true)
    expect(check.data!.items.length).toBeGreaterThan(3)
    expect(check.data!.items.some((i) => i.kind === 'answer')).toBe(true)
    expect(check.data!.items.some((i) => i.kind === 'example')).toBe(true)
  })

  it('检测题答案与解析独立保存，校验不通过就不算正式检测', async () => {
    const res = await runTask('quiz', { vars: { scope: '导数', difficulty: '中', pitfalls: '' } })
    const check = validateQuiz(res.text)
    expect(check.ok).toBe(true)
    expect(check.data!.question).toBeTruthy()
    expect(check.data!.answer).toBeTruthy()
    expect(check.data!.solution).toBeTruthy()
    expect(validateQuiz('这不是 JSON').ok).toBe(false)
  })

  it('解疑输出分层提示', async () => {
    const res = await runTask('explain', { vars: { doubt: 'x', context: 'y', tried: 'z' } })
    expect(res.text).toContain('第一层提示')
    expect(res.text).toContain('第二层提示')
    expect(res.text).toContain('完整解答')
  })

  it('LaTeX 破损会被检出', () => {
    expect(checkLatex('$x^2$').length).toBe(0)
    expect(checkLatex('$x^2').length).toBeGreaterThan(0)
    expect(checkLatex('$$\\frac{a}{b}$$').length).toBe(0)
    expect(checkLatex('\\frac{a}{b').length).toBeGreaterThan(0)
    expect(checkLatex('$$x^2$$').length).toBe(0)
    expect(checkLatex('$$x^2').length).toBeGreaterThan(0)
  })

  it('每次调用都会记用量', async () => {
    await runTask('transcribe', { vars: { pages: '1', note: '' } })
    const usage = await db.ai_usage.toArray()
    expect(usage.length).toBeGreaterThan(0)
    expect(usage[0].mode).toBe('mock')
  })
})

describe('种子数据', () => {
  it('能在空库上完整写入', async () => {
    await seedIfEmpty()
    const projects = await db.projects.toArray()
    const templates = await db.templates.toArray()
    expect(projects.length).toBe(3)
    expect(templates.length).toBe(3)
    expect(templates.map((t) => t.name)).toContain('数学课后学习')
    const math = templates.find((t) => t.name === '数学课后学习')!
    expect(math.blocks.map((b) => b.name)).toEqual([
      '接收资料',
      '先复习',
      '弄懂它',
      '去实践',
      '说感悟',
      '先探路',
      '日后复测',
    ])
  })

  it('重复执行不会写重、也不会报 BulkError', async () => {
    await seedIfEmpty()
    const after = await db.projects.count()
    await seedIfEmpty()
    await seedIfEmpty()
    expect(await db.projects.count()).toBe(after)
    expect(await db.templates.count()).toBe(3)
  })

  it('并发执行也只写一次', async () => {
    await db.projects.clear()
    await db.settings.delete('seeded.v1')
    await Promise.all([seedIfEmpty(), seedIfEmpty(), seedIfEmpty()])
    expect(await db.projects.count()).toBe(3)
    expect(await db.templates.count()).toBe(3)
  })

  it('老用户库里已有项目但没有模板时，模板会被补上', async () => {
    // 模拟 v1 升级上来的库：有项目、有 seeded 标记，但 templates 表是空的
    await db.projects.clear()
    await db.templates.clear()
    await db.settings.delete('seeded.templates.v1')
    await db.projects.add({
      id: 'p_old',
      profile_id: 'default',
      name: '老用户的项目',
      subtitle: '',
      description: '',
      tags: [],
      accent: '#c07b3e',
      cover: 'gradient',
      order: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
    })
    await db.settings.put({ key: 'seeded.v1', value: true })

    await seedIfEmpty()

    expect(await db.templates.count()).toBe(3)
    // 老项目不能被重新播种覆盖
    expect(await db.projects.count()).toBe(1)
  })
})
