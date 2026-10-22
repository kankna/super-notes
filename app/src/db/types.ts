export type ID = string

/** 流程状态：回答“做到哪里了” */
export type SessionStatus =
  | 'not_started'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'skipped'
  | 'deferred'

/** 学习结果：回答“表现怎样”，与流程状态分离存储 */
export type AttemptResult =
  | 'untested'
  | 'independent'
  | 'with_hint'
  | 'still_unsure'
  | 'pending_retest'

export type CoverStyle = 'solid' | 'gradient' | 'striped' | 'grid'

export type ItemKind =
  | 'theorem'
  | 'formula'
  | 'example'
  | 'answer'
  | 'summary'
  | 'question'
  | 'note'

export type ItemSource = 'teacher' | 'ai' | 'self'

export type MarkKind = 'unfamiliar' | 'doubt' | 'ok'

export interface Profile {
  id: ID
  name: string
  created_at: number
}

export interface Project {
  id: ID
  profile_id: ID
  name: string
  subtitle: string
  description: string
  tags: string[]
  accent: string
  cover: CoverStyle
  order: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export interface Chapter {
  id: ID
  project_id: ID
  name: string
  order: number
}

export interface Unit {
  id: ID
  project_id: ID
  chapter_id: ID
  title: string
  order: number
  status: SessionStatus
  last_studied_at: number | null
  created_at: number
  updated_at: number
}

export interface Item {
  id: ID
  project_id: ID
  unit_id: ID
  kind: ItemKind
  title: string
  body_md: string
  source: ItemSource
  confirmed: boolean
  order: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export interface Mark {
  id: ID
  item_id: ID
  kind: MarkKind
  note: string
  created_at: number
}

export interface Doubt {
  id: ID
  project_id: ID
  unit_id: ID
  item_id: ID | null
  title: string
  context: string
  tried: string
  explanation: string
  next: string
  status: 'open' | 'resolved'
  created_at: number
  updated_at: number
}

export interface Attachment {
  id: ID
  project_id: ID
  unit_id: ID | null
  item_id: ID | null
  name: string
  mime: string
  size: number
  role: 'source_photo' | 'wrong' | 'good' | 'evidence'
  blob: Blob
  created_at: number
}

export interface TrashEntry {
  id: ID
  kind: 'project' | 'unit' | 'item' | 'doubt'
  ref_id: ID
  label: string
  payload: unknown
  created_at: number
}

export interface Settings {
  key: string
  value: unknown
}
