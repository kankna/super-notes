import Dexie, { type Table } from 'dexie'
import type {
  AiConfig,
  AiUsage,
  Attachment,
  Attempt,
  Chapter,
  Conflict,
  Doubt,
  Item,
  ItemVersion,
  Mark,
  OutboxEntry,
  Pomodoro,
  PreviewNote,
  Profile,
  Project,
  PromptVersion,
  Reflection,
  Retest,
  Session,
  Settings,
  StepEvent,
  Task,
  Template,
  TrashEntry,
  Unit,
} from './types'

/** 单元之间的知识关联（与"学习顺序"是两种不同的含义） */
export interface UnitLink {
  id: string
  project_id: string
  from_unit: string
  to_unit: string
  kind: 'knowledge'
  label: string
  created_at: number
}

/**
 * v1：首版已发布的结构。
 * 必须原样保留 —— 已经打开过这个版本的浏览器会拿它做校验，
 * 改动 v1 的声明会让老用户直接打不开数据库。
 */
const SCHEMA_V1 = {
  profiles: 'id, name, created_at',
  projects: 'id, profile_id, order, updated_at, deleted_at',
  chapters: 'id, project_id, order',
  units: 'id, project_id, chapter_id, order, status',
  items: 'id, project_id, unit_id, kind, order, deleted_at',
  marks: 'id, item_id, kind',
  doubts: 'id, project_id, unit_id, item_id, status',
  attachments: 'id, project_id, unit_id, item_id, role, created_at',
  trash: 'id, kind, ref_id, created_at',
  settings: 'key',
} as const

/** v2：加入学习流程、模板、AI 配置、复测等表 */
const SCHEMA_V2 = {
  ...SCHEMA_V1,
  unit_links: 'id, project_id, from_unit, to_unit, kind',
  item_versions: 'id, item_id, created_at',
  tasks: 'id, project_id, unit_id, session_id, status, order',
  templates: 'id, profile_id, name, version, created_at, deleted_at',
  sessions: 'id, project_id, unit_id, template_id, status, created_at',
  step_events: 'id, session_id, step_id, ts',
  attempts: 'id, session_id, step_id, item_id, task_id, result',
  pomodoros: 'id, session_id, step_id, started_at',
  retests: 'id, project_id, unit_id, due_at, status',
  reflections: 'id, project_id, unit_id, session_id, item_id',
  preview_notes: 'id, project_id, unit_id, session_id',
  prompts: 'id, task, version, created_at',
  ai_configs: 'id, name, created_at',
  ai_usage: 'id, config_id, task, created_at',
  outbox: 'id, client_req_id, kind, created_at',
  conflicts: 'id, entity, entity_id, resolved, created_at',
} as const

export const SCHEMA = SCHEMA_V2

export class AppDB extends Dexie {
  profiles!: Table<Profile, string>
  projects!: Table<Project, string>
  chapters!: Table<Chapter, string>
  units!: Table<Unit, string>
  unit_links!: Table<UnitLink, string>
  items!: Table<Item, string>
  item_versions!: Table<ItemVersion, string>
  marks!: Table<Mark, string>
  doubts!: Table<Doubt, string>
  attachments!: Table<Attachment, string>
  tasks!: Table<Task, string>
  templates!: Table<Template, string>
  sessions!: Table<Session, string>
  step_events!: Table<StepEvent, string>
  attempts!: Table<Attempt, string>
  pomodoros!: Table<Pomodoro, string>
  retests!: Table<Retest, string>
  reflections!: Table<Reflection, string>
  preview_notes!: Table<PreviewNote, string>
  prompts!: Table<PromptVersion, string>
  ai_configs!: Table<AiConfig, string>
  ai_usage!: Table<AiUsage, string>
  outbox!: Table<OutboxEntry, string>
  conflicts!: Table<Conflict, string>
  trash!: Table<TrashEntry, string>
  settings!: Table<Settings, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores(SCHEMA_V1)
    this.version(2).stores(SCHEMA_V2)
  }
}

/**
 * 每个本地档案一个独立数据库 —— 档案之间的隔离由数据库实例保证，
 * 而不是靠查询条件，容易漏。
 */
const instances = new Map<string, AppDB>()

export function openDb(profileId: string): AppDB {
  let db = instances.get(profileId)
  if (!db) {
    db = new AppDB(`super-notes-${profileId}`)
    instances.set(profileId, db)
  }
  return db
}

let activeProfileId = 'default'

export function getActiveProfileId(): string {
  return activeProfileId
}

export function getDb(): AppDB {
  return openDb(activeProfileId)
}

const listeners = new Set<() => void>()

export function onProfileChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function setActiveProfile(profileId: string): Promise<void> {
  activeProfileId = profileId
  getDb()
  listeners.forEach((fn) => fn())
}
