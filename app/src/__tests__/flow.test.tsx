import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { getDb } from '../db/db'
import { listStepEvents } from '../db/repo/session'
import { listDoubts, listMarks } from '../db/repo/items'

const db = getDb()

async function resetDb() {
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
      db.pomodoros,
      db.retests,
      db.reflections,
      db.preview_notes,
      db.prompts,
      db.ai_usage,
      db.trash,
      db.settings,
    ].map((t) => t.clear()),
  )
  await db.settings.delete('seeded.v1')
}

beforeEach(async () => {
  await resetDb()
  window.location.hash = '#/'
})

/** 等种子数据写完（书架上有 3 个项目） */
async function waitShelf() {
  await screen.findByRole('heading', { name: '书架' })
  await waitFor(() => expect(screen.getByText('3 个项目')).toBeInTheDocument())
}

function firstBook(): HTMLElement {
  const el = document.querySelector('.book__title') as HTMLElement
  if (!el) throw new Error('书架上没有书盒')
  return el
}

describe('完整学习流程（真实点击）', () => {
  it('能从书架一路走到复测，并留下完整记录', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 1. 书架
    await waitShelf()

    // 2. 点书盒 → 直接进入这一课的工作台（少一层跳转）
    await user.click(firstBook())
    await waitFor(() => expect(window.location.hash).toMatch(/\/u\/u_/))

    // 3. 选模板开始
    const tpl = await screen.findByRole('button', { name: /数学课后学习/ })
    await user.click(tpl)
    await waitFor(() => expect(screen.getByText(/共 7 步/)).toBeInTheDocument())

    // 步骤条出现 7 个步骤
    const steps = screen.getAllByRole('button', { name: /^第 [1-7] 步/ })
    expect(steps.length).toBe(7)

    // 4. 计时：进入这一步就自动开始记录，不需要手动点
    await waitFor(async () => {
      const sessions = await db.sessions.toArray()
      const events = await listStepEvents(sessions[0].id)
      expect(events.some((e) => e.type === 'start')).toBe(true)
    })

    // 事件真的落库了
    const sessions = await db.sessions.toArray()
    expect(sessions).toHaveLength(1)
    const events = await listStepEvents(sessions[0].id)
    expect(events.map((e) => e.type)).toContain('start')

    // 5. 先复习：标记「有点糊」/「不会」
    await user.click(screen.getByRole('button', { name: '第 2 步 先复习' }))
    const markButtons = await screen.findAllByRole('button', { name: '有点糊' })
    expect(markButtons.length).toBeGreaterThan(0)
    await user.click(markButtons[0])
    await waitFor(async () => {
      const items = await db.items.toArray()
      const marked = await Promise.all(items.map((i) => listMarks(i.id)))
      expect(marked.flat().some((m) => m.kind === 'unfamiliar')).toBe(true)
    })

    const doubtBtn = (await screen.findAllByRole('button', { name: '不会' }))[0]
    await user.click(doubtBtn)
    const targetUnit = (await db.units.toArray()).find(
      (u) => u.title === '第 3 讲 函数的单调性与导数',
    )!
    await waitFor(async () => {
      const doubts = await listDoubts(targetUnit.id)
      expect(doubts.length).toBeGreaterThan(0)
    })

    // 6. 弄懂它：疑点清单 + AI 分层提示
    await user.click(screen.getByRole('button', { name: '第 3 步 弄懂它' }))
    expect(await screen.findByText(/为什么/)).toBeInTheDocument()
    const aiBtn = (await screen.findAllByRole('button', { name: 'AI 分层提示' }))[0]
    await user.click(aiBtn)
    await waitFor(async () => {
      const ds = await db.doubts.toArray()
      expect(ds.some((d) => (d.explanation ?? '').includes('第一层提示'))).toBe(true)
    })
    // 解释也渲染到了界面上
    await waitFor(() => expect(screen.getAllByText('第一层提示').length).toBeGreaterThan(0), {
      timeout: 5000,
    })

    // 7. 去实践：错题收录入口 + 作业清单（没有番茄钟了）
    await user.click(screen.getByRole('button', { name: '第 4 步 去实践' }))
    expect(await screen.findByRole('button', { name: '拍错题' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '拍好题' })).toBeInTheDocument()
    expect(screen.queryByText('开始专注 25 分钟')).not.toBeInTheDocument()
    expect(screen.getByText(/教材 P68 习题 1/)).toBeInTheDocument()

    // 8. 说感悟：先自己写；不知道写什么时点按钮弹出提示
    await user.click(screen.getByRole('button', { name: '第 5 步 说感悟' }))
    const box = await screen.findByPlaceholderText(/想到什么写什么/)
    await user.type(box, '这次终于把导数符号和单调性连起来了。')
    await user.click(screen.getByRole('button', { name: '不知道怎么写？' }))
    const hintBox = await screen.findByPlaceholderText(/在这里写/)
    await user.type(hintBox, '以前我总以为背下来就会了。')
    await user.click(screen.getByRole('button', { name: '放进去' }))
    await waitFor(() => {
      const v = (screen.getByPlaceholderText(/想到什么写什么/) as HTMLTextAreaElement).value
      expect(v).toContain('以前我总以为')
    })
    await user.click(screen.getByRole('button', { name: '保存心得' }))
    await waitFor(async () => {
      expect((await db.reflections.toArray()).length).toBe(1)
    })

    // 9. 先探路：预习清单
    await user.click(screen.getByRole('button', { name: '第 6 步 先探路' }))
    const kp = await screen.findByPlaceholderText(/Boss 在哪/)
    await user.type(kp, '构造函数，把不等式变到同一侧')
    await user.click(screen.getByRole('button', { name: '保存预习清单' }))
    await waitFor(async () => {
      expect((await db.preview_notes.toArray()).length).toBe(1)
    })

    // 10. 日后复测：安排一次复测
    await user.click(screen.getByRole('button', { name: '第 7 步 日后复测' }))
    await user.click(await screen.findByRole('button', { name: '安排复测' }))
    await waitFor(async () => {
      expect((await db.retests.toArray()).length).toBe(1)
    })

    // 11. 完成这一步后，流程状态如实记录
    await user.click(screen.getByRole('button', { name: '完成这步' }))
    await waitFor(async () => {
      const s = (await db.sessions.toArray())[0]
      const evs = await listStepEvents(s.id)
      expect(evs.some((e) => e.type === 'complete')).toBe(true)
    })
  }, 60_000)

  it('完成步骤会推进到下一步，且状态分流程与结果两套', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitShelf()

    await user.click(firstBook())
    await waitFor(() => expect(window.location.hash).toMatch(/\/u\/u_/))

    await user.click(await screen.findByRole('button', { name: /数学课后学习/ }))
    await waitFor(() => expect(screen.getByText(/共 7 步/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '完成这步' }))
    await waitFor(async () => {
      const s = (await db.sessions.toArray())[0]
      expect(s.current_step).toBe(1)
      expect(s.status).toBe('in_progress')
    })
  }, 40_000)

  it('课程表画布能打开并显示单元卡片', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitShelf()

    await user.click(firstBook())
    await waitFor(() => expect(window.location.hash).toMatch(/\/u\/u_/))

    // 选一个流程进入工作台
    await user.click(await screen.findByRole('button', { name: /数学课后学习/ }))
    await waitFor(() => expect(screen.getByText(/共 7 步/)).toBeInTheDocument())

    // 工作台右上角「课程表」回到画布
    await user.click(screen.getByRole('button', { name: '课程表' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/p_/))
    expect(await screen.findByText('实线箭头 = 学习顺序')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node-unit').length).toBeGreaterThan(0))
  }, 40_000)
})
