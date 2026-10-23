import JSZip from 'jszip'
import { getDb } from '../../db/db'
import { formatDateTime } from '../../lib/time'
import type {
  Attempt,
  Chapter,
  Item,
  Project,
  Session,
  StepEvent,
  Task,
  Template,
  Unit,
} from '../../db/types'

export const EXPORT_FORMAT_VERSION = 1

function slug(s: string): string {
  return (
    s
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 48) || 'untitled'
  )
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}

/**
 * 导出整个项目为一个 ZIP。
 * 结构与需求文档 §8 一致：
 *   README.md / notes/ / assets/ / records/ / project.json / manifest.json
 *
 * 保证：Markdown 保留 LaTeX 源码，图片用相对路径引用；包内不含任何密钥。
 */
export async function exportProject(projectId: string): Promise<{ blob: Blob; name: string }> {
  const db = getDb()
  const zip = new JSZip()

  const project = await db.projects.get(projectId)
  if (!project) throw new Error('项目不存在')

  const chapters = await db.chapters.where('project_id').equals(projectId).sortBy('order')
  const units = await db.units.where('project_id').equals(projectId).sortBy('order')
  const items = (await db.items.where('project_id').equals(projectId).sortBy('order')).filter(
    (i) => i.deleted_at === null,
  )
  const attachments = await db.attachments.where('project_id').equals(projectId).toArray()
  const marks = await db.marks.toArray()
  const doubts = await db.doubts.where('project_id').equals(projectId).toArray()
  const tasks = await db.tasks.where('project_id').equals(projectId).sortBy('order')
  const sessions = await db.sessions.where('project_id').equals(projectId).toArray()
  const sessionIds = new Set(sessions.map((s) => s.id))
  const events = (await db.step_events.toArray()).filter((e) => sessionIds.has(e.session_id))
  const attempts = (await db.attempts.toArray()).filter((a) => sessionIds.has(a.session_id))
  const retests = await db.retests.where('project_id').equals(projectId).toArray()
  const reflections = await db.reflections.where('project_id').equals(projectId).toArray()
  const previews = await db.preview_notes.where('project_id').equals(projectId).toArray()
  const templates = await db.templates.toArray()

  const unitById = new Map(units.map((u) => [u.id, u]))
  const chapterById = new Map(chapters.map((c) => [c.id, c]))

  /* ---------- notes/ ---------- */
  const notesDir = zip.folder('notes')!
  const itemFile = new Map<string, string>()
  for (const it of items) {
    const unit = unitById.get(it.unit_id)
    const chapter = unit ? chapterById.get(unit.chapter_id) : undefined
    const name = `${slug(it.title)}--${it.id.slice(-6)}.md`
    itemFile.set(it.id, `notes/${name}`)
    const fm = [
      '---',
      `id: ${it.id}`,
      `kind: ${it.kind}`,
      `source: ${it.source}`,
      `confirmed: ${it.confirmed}`,
      `unit: ${unit?.title ?? ''}`,
      `chapter: ${chapter?.name ?? ''}`,
      `created_at: ${formatDateTime(it.created_at)}`,
      '---',
      '',
    ].join('\n')
    const related = attachments
      .filter((a) => a.item_id === it.id)
      .map((a) => `![${a.name}](../assets/${a.name})`)
      .join('\n\n')
    notesDir.file(name, `${fm}${it.body_md}\n${related ? `\n\n${related}\n` : ''}`)
  }

  /* ---------- assets/ ---------- */
  const assetsDir = zip.folder('assets')!
  for (const a of attachments) {
    const ext = a.name.includes('.') ? a.name.slice(a.name.lastIndexOf('.')) : ''
    const fname = `${a.id.slice(-8)}${ext}`
    assetsDir.file(fname, a.blob)
    ;(a as unknown as { exported_name?: string }).exported_name = fname
  }

  /* ---------- records/ ---------- */
  const recordsDir = zip.folder('records')!

  const stepRows: (string | number | null)[][] = [
    ['session_id', 'session_title', 'step', 'step_name', 'event', 'time', 'manual'],
  ]
  for (const s of sessions) {
    for (const ev of events.filter((e) => e.session_id === s.id)) {
      const idx = s.template_snapshot.findIndex((b) => b.id === ev.step_id)
      stepRows.push([
        s.id,
        s.title,
        idx + 1,
        s.template_snapshot[idx]?.name ?? ev.step_id,
        ev.type,
        formatDateTime(ev.ts),
        ev.manual ? 'yes' : 'no',
      ])
    }
  }
  recordsDir.file('学习记录.csv', `\ufeff${csv(stepRows)}`)

  const attemptRows: (string | number | null)[][] = [
    ['session_id', 'step', 'item_id', 'task_id', 'result', 'note', 'time'],
  ]
  for (const a of attempts) {
    attemptRows.push([
      a.session_id,
      a.step_id,
      a.item_id ?? '',
      a.task_id ?? '',
      a.result,
      a.note,
      formatDateTime(a.created_at),
    ])
  }
  recordsDir.file('尝试结果.csv', `\ufeff${csv(attemptRows)}`)

  const retestRows: (string | number | null)[][] = [
    ['title', 'due_at', 'status', 'result', 'note'],
  ]
  for (const r of retests) {
    retestRows.push([r.title, formatDateTime(r.due_at), r.status, r.result ?? '', r.note])
  }
  recordsDir.file('复测.csv', `\ufeff${csv(retestRows)}`)

  const recordMd = [
    `# 学习记录 · ${project.name}`,
    '',
    `导出时间：${formatDateTime(Date.now())}`,
    '',
    '## 学习轮次',
    ...sessions.map(
      (s) =>
        `- ${formatDateTime(s.started_at)} — ${s.title}（${s.status}，${s.template_snapshot.length} 步）`,
    ),
    '',
    '## 步骤事件',
    ...events.map(
      (e) =>
        `- ${formatDateTime(e.ts)} ${e.type}${e.manual ? '（补录）' : ''} — ${
          sessions.find((s) => s.id === e.session_id)?.title ?? e.session_id
        }`,
    ),
    '',
    '## 尝试结果',
    ...attempts.map(
      (a) =>
        `- ${formatDateTime(a.created_at)} ${a.result}${a.note ? ` — ${a.note}` : ''}${
          a.item_id ? `（条目 ${a.item_id}）` : ''
        }`,
    ),
    '',
  ].join('\n')
  recordsDir.file('学习记录.md', recordMd)

  /* ---------- project.json ---------- */
  const projectJson = {
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: Date.now(),
    project: {
      ...project,
      deleted_at: undefined,
    },
    chapters,
    units,
    items: items.map((i) => ({ ...i, file: itemFile.get(i.id) })),
    attachments: attachments.map((a) => ({
      id: a.id,
      item_id: a.item_id,
      unit_id: a.unit_id,
      name: a.name,
      mime: a.mime,
      role: a.role,
      file: `assets/${(a as unknown as { exported_name: string }).exported_name}`,
    })),
    marks: marks.filter((m) => itemFile.has(m.item_id)),
    doubts,
    tasks,
    sessions: sessions.map((s) => ({ ...s, template_snapshot: s.template_snapshot })),
    step_events: events,
    attempts,
    retests,
    reflections,
    preview_notes: previews,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      builtin: t.builtin,
      blocks: t.blocks,
    })),
  }
  zip.file('project.json', JSON.stringify(projectJson, null, 2))

  /* ---------- manifest.json ---------- */
  const files: { path: string; size: number }[] = []
  zip.forEach((path, file) => {
    if (!file.dir) files.push({ path, size: 0 })
  })
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        format_version: EXPORT_FORMAT_VERSION,
        app: 'super-notes',
        project: project.name,
        exported_at: formatDateTime(Date.now()),
        files: files.map((f) => f.path).sort(),
        counts: {
          chapters: chapters.length,
          units: units.length,
          items: items.length,
          attachments: attachments.length,
          sessions: sessions.length,
          step_events: events.length,
          attempts: attempts.length,
          retests: retests.length,
        },
      },
      null,
      2,
    ),
  )

  /* ---------- README.md ---------- */
  zip.file(
    'README.md',
    [
      `# ${project.name}`,
      '',
      `> 由「书斋 Super Notes」导出，导出时间 ${formatDateTime(Date.now())}。`,
      '',
      project.description || '',
      '',
      '## 目录结构',
      '',
      '```text',
      'notes/      课堂笔记、题目、疑点、心得（Markdown，保留 LaTeX 源码，图片相对路径引用）',
      'assets/     原始照片、错题好题图、图形附件',
      'records/    学习记录（可读 Markdown + CSV）',
      'project.json  内容关联、模板版本、画布位置和状态',
      'manifest.json 文件清单与格式版本',
      '```',
      '',
      '## 阅读方式',
      '',
      '- 任何支持 Markdown 的阅读器都能直接看 `notes/` 里的正文和图片。',
      '- 公式以 LaTeX 源码保存，阅读器需要支持数学语法才能渲染。',
      '- 几何图与复杂示意图保留为图片，不要求转换成绘图代码。',
      '',
      '## 说明',
      '',
      '- 导出的包**不包含任何 API Key**。',
      '- 想恢复回产品内，用「设置 → 数据与导出 → 导入恢复」。',
      '',
    ].join('\n'),
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, name: `${slug(project.name)}.zip` }
}

/**
 * 导入恢复：把导出的 ZIP 读回来，作为**新项目**恢复，不覆盖现有数据。
 */
export async function importProject(file: File): Promise<{ projectId: string; name: string }> {
  const db = getDb()
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  const projectFile = zip.file('project.json')
  if (!manifestFile || !projectFile) {
    throw new Error('这个 ZIP 里没有 manifest.json / project.json，不是本应用导出的包')
  }
  const manifest = JSON.parse(await manifestFile.async('string')) as {
    format_version: number
    project: string
  }
  if (manifest.format_version > EXPORT_FORMAT_VERSION) {
    throw new Error(`导出包版本 ${manifest.format_version} 高于当前支持的 ${EXPORT_FORMAT_VERSION}`)
  }
  const data = JSON.parse(await projectFile.async('string')) as {
    project: Project
    chapters: Chapter[]
    units: Unit[]
    items: (Item & { file?: string })[]
    attachments: { id: string; item_id: string | null; unit_id: string | null; name: string; mime: string; role: string; file: string }[]
    marks: { id: string; item_id: string; kind: string; note: string; created_at: number }[]
    doubts: unknown[]
    tasks: Task[]
    sessions: Session[]
    step_events: StepEvent[]
    attempts: Attempt[]
    retests: unknown[]
    reflections: unknown[]
    preview_notes: unknown[]
    templates: Partial<Template>[]
  }

  const now = Date.now()
  const projectId = `imp_${now.toString(36)}`
  const idMap = new Map<string, string>()
  const remap = (id: string) => {
    if (!idMap.has(id)) idMap.set(id, `${id}_${now.toString(36).slice(-4)}`)
    return idMap.get(id)!
  }

  const project: Project = {
    ...data.project,
    id: projectId,
    profile_id: 'default',
    name: `${data.project.name}（导入）`,
    order: (await db.projects.count()) + 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }

  await db.projects.add(project)
  for (const c of data.chapters ?? []) {
    await db.chapters.add({ ...c, id: remap(c.id), project_id: projectId })
  }
  for (const u of data.units ?? []) {
    await db.units.add({ ...u, id: remap(u.id), project_id: projectId })
  }
  for (const it of data.items ?? []) {
    const { file: _file, ...rest } = it
    await db.items.add({
      ...rest,
      id: remap(it.id),
      project_id: projectId,
      unit_id: remap(it.unit_id),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })
  }
  for (const m of data.marks ?? []) {
    await db.marks.add({ ...m, id: `${m.id}_${now}`, item_id: remap(m.item_id) } as never)
  }
  for (const t of data.tasks ?? []) {
    await db.tasks.add({ ...t, id: remap(t.id), project_id: projectId, unit_id: remap(t.unit_id) })
  }
  for (const s of data.sessions ?? []) {
    await db.sessions.add({
      ...s,
      id: remap(s.id),
      project_id: projectId,
      unit_id: remap(s.unit_id),
      deleted_at: null,
    })
  }
  for (const e of data.step_events ?? []) {
    await db.step_events.add({ ...e, id: `${e.id}_${now}`, session_id: remap(e.session_id) })
  }
  for (const a of data.attempts ?? []) {
    await db.attempts.add({ ...a, id: `${a.id}_${now}`, session_id: remap(a.session_id) })
  }
  for (const a of data.attachments ?? []) {
    const zipEntry = zip.file(a.file)
    if (!zipEntry) continue
    const blob = await zipEntry.async('blob')
    await db.attachments.add({
      id: `${a.id}_${now}`,
      project_id: projectId,
      unit_id: a.unit_id ? remap(a.unit_id) : null,
      item_id: a.item_id ? remap(a.item_id) : null,
      name: a.name,
      mime: a.mime,
      size: blob.size,
      role: a.role as never,
      blob,
      created_at: now,
    })
  }

  return { projectId, name: project.name }
}
