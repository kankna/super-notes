import { getDb } from '../db'
import { newId } from '../../lib/id'
import type {
  Doubt,
  Item,
  ItemKind,
  ItemSource,
  ItemVersion,
  Mark,
  MarkKind,
} from '../types'

export async function listItems(unitId: string): Promise<Item[]> {
  const db = getDb()
  const rows = await db.items.where('unit_id').equals(unitId).toArray()
  return rows.sort((a, b) => a.order - b.order)
}

export async function listItemsForProject(projectId: string): Promise<Item[]> {
  const db = getDb()
  const rows = await db.items.where('project_id').equals(projectId).toArray()
  return rows.sort((a, b) => a.order - b.order)
}

export async function getItem(id: string): Promise<Item | undefined> {
  const db = getDb()
  return db.items.get(id)
}

export async function createItem(input: {
  projectId: string
  unitId: string
  kind: ItemKind
  title: string
  bodyMd: string
  source: ItemSource
  confirmed?: boolean
  order?: number
}): Promise<Item> {
  const db = getDb()
  const now = Date.now()
  const maxOrder = await db.items.where('unit_id').equals(input.unitId).toArray()
  const order =
    input.order ?? maxOrder.reduce((a, i) => Math.max(a, i.order + 1), 0)
  const item: Item = {
    id: newId('i_'),
    project_id: input.projectId,
    unit_id: input.unitId,
    kind: input.kind,
    title: input.title,
    body_md: input.bodyMd,
    source: input.source,
    confirmed: input.confirmed ?? false,
    order,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  await db.transaction('rw', [db.items, db.item_versions], async () => {
    await db.items.add(item)
    await db.item_versions.add({
      id: newId('v_'),
      item_id: item.id,
      title: item.title,
      body_md: item.body_md,
      source: item.source,
      confirmed: item.confirmed,
      created_at: now,
    })
  })
  return item
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<void> {
  const db = getDb()
  const before = await db.items.get(id)
  if (!before) return
  const now = Date.now()
  await db.transaction('rw', [db.items, db.item_versions], async () => {
    await db.items.update(id, { ...patch, updated_at: now })
    const version: ItemVersion = {
      id: newId('v_'),
      item_id: id,
      title: patch.title ?? before.title,
      body_md: patch.body_md ?? before.body_md,
      source: patch.source ?? before.source,
      confirmed: patch.confirmed ?? before.confirmed,
      created_at: now,
    }
    await db.item_versions.add(version)
  })
}

export async function listItemVersions(itemId: string): Promise<ItemVersion[]> {
  const db = getDb()
  const rows = await db.item_versions.where('item_id').equals(itemId).toArray()
  return rows.sort((a, b) => b.created_at - a.created_at)
}

/* ---------------- 标记 ---------------- */

export async function listMarks(itemId: string): Promise<Mark[]> {
  const db = getDb()
  return db.marks.where('item_id').equals(itemId).toArray()
}

/** 不熟悉与有疑问可以同时存在，所以是集合而不是单值 */
export async function toggleMark(itemId: string, kind: MarkKind): Promise<boolean> {
  const db = getDb()
  const existing = await db.marks.where('item_id').equals(itemId).toArray()
  const hit = existing.find((m) => m.kind === kind)
  if (hit) {
    await db.marks.delete(hit.id)
    return false
  }
  await db.marks.add({ id: newId('m_'), item_id: itemId, kind, note: '', created_at: Date.now() })
  return true
}

export async function allMarks(): Promise<Map<string, MarkKind[]>> {
  const db = getDb()
  const rows = await db.marks.toArray()
  const map = new Map<string, MarkKind[]>()
  for (const m of rows) {
    const arr = map.get(m.item_id) ?? []
    arr.push(m.kind)
    map.set(m.item_id, arr)
  }
  return map
}

/* ---------------- 疑点 ---------------- */

export async function listDoubts(unitId: string): Promise<Doubt[]> {
  const db = getDb()
  const rows = await db.doubts.where('unit_id').equals(unitId).toArray()
  return rows.sort((a, b) => b.created_at - a.created_at)
}

export async function listDoubtsForProject(projectId: string): Promise<Doubt[]> {
  const db = getDb()
  const rows = await db.doubts.where('project_id').equals(projectId).toArray()
  return rows.sort((a, b) => b.created_at - a.created_at)
}

export async function createDoubt(input: {
  projectId: string
  unitId: string
  itemId?: string | null
  title: string
  context?: string
  tried?: string
}): Promise<Doubt> {
  const db = getDb()
  const now = Date.now()
  const row: Doubt = {
    id: newId('d_'),
    project_id: input.projectId,
    unit_id: input.unitId,
    item_id: input.itemId ?? null,
    title: input.title,
    context: input.context ?? '',
    tried: input.tried ?? '',
    explanation: '',
    self_note: '',
    next: '',
    status: 'open',
    created_at: now,
    updated_at: now,
  }
  await db.doubts.add(row)
  return row
}

export async function updateDoubt(id: string, patch: Partial<Doubt>): Promise<void> {
  const db = getDb()
  await db.doubts.update(id, { ...patch, updated_at: Date.now() })
}
