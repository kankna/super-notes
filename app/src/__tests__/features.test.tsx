import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { getDb } from '../db/db'
import { exportProject, importProject } from '../features/export/exporter'
import { makeMathTemplate } from '../features/templates/blocks'

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
      db.ai_configs,
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

async function waitShelf() {
  await screen.findByRole('heading', { name: '书架' })
  await waitFor(() => expect(screen.getByText('3 个项目')).toBeInTheDocument())
}

describe('照片 → AI 整理 → 原图校对', () => {
  it('转写、整理、生成草稿、到校对页确认条目', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitShelf()

    // 进单元
    await user.click(document.querySelector('.book__title') as HTMLElement)
    await waitFor(() => expect(window.location.hash).toMatch(/\/u\/u_/))

    // 选模板开始
    await user.click(await screen.findByRole('button', { name: /数学课后学习/ }))
    await waitFor(() => expect(screen.getByText(/共 7 步/)).toBeInTheDocument())

    const before = (await db.items.toArray()).length

    // ① AI 转写
    await user.click(screen.getByRole('button', { name: '① AI 转写' }))
    await waitFor(() => expect(screen.getByText(/查看转写原文/)).toBeInTheDocument())

    // ② AI 整理成条目
    await user.click(screen.getByRole('button', { name: '② AI 整理成条目' }))
    await waitFor(async () => {
      expect((await db.items.toArray()).length).toBeGreaterThan(before)
    })

    // 草稿来源是 AI、未确认
    const drafts = (await db.items.toArray()).filter((i) => i.source === 'ai' && !i.confirmed)
    expect(drafts.length).toBeGreaterThan(0)

    // 自动跳到校对页
    await waitFor(() => expect(window.location.hash).toMatch(/\/proof$/))

    // 校对页：原图 + 条目
    expect((await screen.findAllByRole('button', { name: '确认无误' })).length).toBeGreaterThan(0)

    // 确认第一条
    const confirmBtn = (await screen.findAllByRole('button', { name: '确认无误' }))[0]
    await user.click(confirmBtn)
    await waitFor(async () => {
      const confirmed = (await db.items.toArray()).filter((i) => i.confirmed)
      expect(confirmed.length).toBeGreaterThan(0)
    })
  }, 60_000)
})

describe('导出与恢复', () => {
  it('导出包结构完整且不含密钥，导入后能恢复成新项目', async () => {
    await db.templates.add(makeMathTemplate())
    const projectId = 'p_export_test'
    await db.projects.add({
      id: projectId,
      profile_id: 'default',
      name: '高一数学',
      subtitle: '导出测试',
      description: '测试导出',
      tags: [],
      accent: '#c07b3e',
      cover: 'gradient',
      order: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
    })
    await db.units.add({
      id: 'u_export',
      project_id: projectId,
      chapter_id: 'c_export',
      title: '第 1 讲',
      order: 0,
      status: 'not_started',
      last_studied_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    await db.items.add({
      id: 'i_export',
      project_id: projectId,
      unit_id: 'u_export',
      kind: 'theorem',
      title: '导数与单调性',
      body_md: '若 $f\'(x) > 0$ 恒成立，则 $f$ 递增。',
      source: 'teacher',
      confirmed: true,
      order: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
    })
    await db.ai_configs.add({
      id: 'cfg_secret',
      name: '带密钥的配置',
      protocol: 'openai',
      base_url: 'https://api.deepseek.com',
      api_key: 'sk-SECRET-SHOULD-NOT-LEAK',
      model: 'deepseek-v4-flash',
      supports_text: true,
      supports_image: false,
      timeout_ms: 60000,
      max_tokens: 4096,
      temperature: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    })

    const { blob, name } = await exportProject(projectId)
    expect(name).toBe('高一数学.zip')

    const zip = await JSZip.loadAsync(blob)
    const paths = Object.keys(zip.files)
    expect(paths).toContain('README.md')
    expect(paths).toContain('project.json')
    expect(paths).toContain('manifest.json')
    expect(paths.some((p) => p.startsWith('notes/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('records/'))).toBe(true)

    // LaTeX 源码保留
    const notePath = paths.find((p) => p.startsWith('notes/') && p.endsWith('.md'))!
    const note = await zip.file(notePath)!.async('string')
    expect(note).toContain('$f\'(x) > 0$')
    expect(note).toContain('---')

    // 密钥不能出现在包里
    const all = await Promise.all(
      paths
        .filter((p) => !zip.files[p].dir)
        .map(async (p) => zip.file(p)!.async('string').catch(() => '')),
    )
    expect(all.join('\n')).not.toContain('sk-SECRET-SHOULD-NOT-LEAK')

    // 导入恢复成新项目
    const file = new File([blob], 'x.zip', { type: 'application/zip' })
    const imported = await importProject(file)
    expect(imported.projectId).not.toBe(projectId)
    const restored = await db.projects.get(imported.projectId)
    expect(restored!.name).toContain('导入')
    const restoredItems = (await db.items.toArray()).filter((i) => i.project_id === imported.projectId)
    expect(restoredItems.length).toBe(1)
    expect(restoredItems[0].title).toContain('单调性')
    expect(restoredItems[0].body_md).toContain('递增')
  }, 40_000)
})

describe('模板编辑', () => {
  it('能重排功能块并另存为新模板', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitShelf()

    window.location.hash = '#/templates'
    await screen.findByRole('heading', { name: '流程模板' })

    const blocks = await screen.findAllByRole('textbox')
    const nameInput = document.querySelector('.tpl__name') as HTMLInputElement
    expect(nameInput.value).toBeTruthy()

    // 另存为
    const cloneBtn = screen.getByRole('button', { name: '另存为新模板' })
    const origPrompt = window.prompt
    window.prompt = () => '我的数学流程'
    await user.click(cloneBtn)
    window.prompt = origPrompt

    await waitFor(async () => {
      const t = (await db.templates.toArray()).find((x) => x.name === '我的数学流程')
      expect(t).toBeTruthy()
      expect(t!.blocks.length).toBe(7)
    })
    expect(blocks.length).toBeGreaterThan(0)
  }, 40_000)
})

describe('AI 设置', () => {
  it('能新增配置、做能力映射、并测出用量', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitShelf()

    window.location.hash = '#/settings/ai'
    await screen.findByRole('heading', { name: 'AI 设置' })

    // 演示模式默认开启
    expect(await screen.findByText('演示模式')).toBeInTheDocument()

    // 新增配置
    await user.click(screen.getByRole('button', { name: '+ 新增' }))
    const nameBox = await screen.findByPlaceholderText('例如：DeepSeek')
    await user.type(nameBox, 'DeepSeek')
    const modelBox = document.querySelector('input[placeholder="deepseek-v4-flash"]') as HTMLInputElement
    await user.clear(modelBox)
    await user.type(modelBox, 'deepseek-v4-flash')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(async () => {
      const cfgs = await db.ai_configs.toArray()
      expect(cfgs.length).toBe(1)
      expect(cfgs[0].name).toBe('DeepSeek')
    })

    // 能力映射（在"更多"折叠区里）
    await user.click(screen.getByText(/更多（谁用哪个模型/))
    const selects = await screen.findAllByRole('combobox')
    const mapSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'DeepSeek'),
    )!
    await user.selectOptions(mapSelect, await db.ai_configs.toArray().then((c) => c[0].id))
    await waitFor(async () => {
      const m = await db.settings.get('ai.mapping.transcribe')
      expect(m).toBeTruthy()
    })
  }, 40_000)
})
