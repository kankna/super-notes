import Dexie, { type Table } from 'dexie'
import type {
  Attachment,
  Chapter,
  Doubt,
  Item,
  Mark,
  Profile,
  Project,
  Settings,
  TrashEntry,
  Unit,
} from './types'

/**
 * 完整表结构。第一版先把所有关系与状态字段定下来，
 * 避免后续每加一个功能就迁移一次库。
 */
export const SCHEMA = {
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

export class AppDB extends Dexie {
  profiles!: Table<Profile, string>
  projects!: Table<Project, string>
  chapters!: Table<Chapter, string>
  units!: Table<Unit, string>
  items!: Table<Item, string>
  marks!: Table<Mark, string>
  doubts!: Table<Doubt, string>
  attachments!: Table<Attachment, string>
  trash!: Table<TrashEntry, string>
  settings!: Table<Settings, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores(SCHEMA)
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
