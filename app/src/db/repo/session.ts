import { getDb } from '../db'
import { newId } from '../../lib/id'
import type {
  Attempt,
  AttemptResult,
  Session,
  SessionStatus,
  StepEvent,
  StepEventType,
  Task,
  Template,
} from '../types'

export async function listTemplates(): Promise<Template[]> {
  const db = getDb()
  return db.templates.orderBy('created_at').toArray()
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  const db = getDb()
  return db.templates.get(id)
}

/** 新建学习实例：模板在此刻拍快照，之后改模板不影响这一轮 */
export async function createSession(
  unitId: string,
  templateId: string,
  title?: string,
): Promise<Session> {
  const db = getDb()
  const unit = await db.units.get(unitId)
  const template = await db.templates.get(templateId)
  if (!template) throw new Error('模板不存在')
  const now = Date.now()
  const session: Session = {
    id: newId('s_'),
    project_id: unit?.project_id ?? '',
    unit_id: unitId,
    template_id: template.id,
    template_version: template.version,
    template_snapshot: template.blocks.map((b) => ({ ...b, settings: { ...b.settings } })),
    title: title || template.name,
    status: 'not_started',
    current_step: 0,
    started_at: now,
    ended_at: null,
    updated_at: now,
    deleted_at: null,
  }
  await db.sessions.add(session)
  return session
}

export async function listSessionsForUnit(unitId: string): Promise<Session[]> {
  const db = getDb()
  const rows = await db.sessions.where('unit_id').equals(unitId).toArray()
  return rows.sort((a, b) => b.started_at - a.started_at)
}

export async function listSessionsForProject(projectId: string): Promise<Session[]> {
  const db = getDb()
  const rows = await db.sessions.where('project_id').equals(projectId).toArray()
  return rows.sort((a, b) => b.started_at - a.started_at)
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = getDb()
  return db.sessions.get(id)
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
  const db = getDb()
  await db.sessions.update(id, { ...patch, updated_at: Date.now() })
}

/** 只改当前这一轮的流程顺序（不影响模板，也不影响历史记录） */
export async function reorderSessionBlocks(
  sessionId: string,
  blocks: Session['template_snapshot'],
): Promise<void> {
  const db = getDb()
  await db.sessions.update(sessionId, { template_snapshot: blocks, updated_at: Date.now() })
}

export async function addStepEvent(
  sessionId: string,
  stepId: string,
  type: StepEventType,
  opts: { manual?: boolean; note?: string; ts?: number } = {},
): Promise<StepEvent> {
  const db = getDb()
  const ev: StepEvent = {
    id: newId('ev_'),
    session_id: sessionId,
    step_id: stepId,
    type,
    ts: opts.ts ?? Date.now(),
    manual: opts.manual ?? false,
    note: opts.note ?? '',
  }
  await db.step_events.add(ev)
  return ev
}

export async function listStepEvents(sessionId: string): Promise<StepEvent[]> {
  if (!sessionId) return []
  const db = getDb()
  const rows = await db.step_events.where('session_id').equals(sessionId).toArray()
  return rows.sort((a, b) => a.ts - b.ts)
}

export async function listAttempts(sessionId: string): Promise<Attempt[]> {
  const db = getDb()
  const rows = await db.attempts.where('session_id').equals(sessionId).toArray()
  return rows.sort((a, b) => a.created_at - b.created_at)
}

/**
 * 记录一次尝试结果。
 * 同一个知识点可以记多次（第一次独立、提示后完成、日后复测），
 * 不会因为点了一次"完成"就永久判定掌握。
 */
export async function recordAttempt(input: {
  sessionId: string
  stepId: string
  itemId?: string | null
  taskId?: string | null
  result: AttemptResult
  note?: string
}): Promise<Attempt> {
  const db = getDb()
  const row: Attempt = {
    id: newId('at_'),
    session_id: input.sessionId,
    step_id: input.stepId,
    item_id: input.itemId ?? null,
    task_id: input.taskId ?? null,
    result: input.result,
    note: input.note ?? '',
    created_at: Date.now(),
  }
  await db.attempts.add(row)
  return row
}

/** 某条目在所有轮次中的尝试历史 */
export async function attemptsForItem(itemId: string): Promise<Attempt[]> {
  const db = getDb()
  const rows = await db.attempts.where('item_id').equals(itemId).toArray()
  return rows.sort((a, b) => a.created_at - b.created_at)
}

export async function listTasksForUnit(unitId: string): Promise<Task[]> {
  const db = getDb()
  const rows = await db.tasks.where('unit_id').equals(unitId).toArray()
  return rows.sort((a, b) => a.order - b.order)
}

export async function listTasksForSession(sessionId: string): Promise<Task[]> {
  const db = getDb()
  const rows = await db.tasks.where('session_id').equals(sessionId).toArray()
  return rows.sort((a, b) => a.order - b.order)
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const db = getDb()
  await db.tasks.update(id, { ...patch, updated_at: Date.now() })
}

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  paused: '已暂停',
  completed: '已完成',
  skipped: '已跳过',
  deferred: '已延后',
}
