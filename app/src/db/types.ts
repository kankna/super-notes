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

/** 功能块类型 */
export type BlockType =
  | 'organize'
  | 'recall'
  | 'explain'
  | 'practice'
  | 'reflect'
  | 'preview'
  | 'retest'
  | 'free'

export type TimingMode = 'none' | 'manual' | 'pomodoro'

export interface BlockSettings {
  /** 回忆块：答案默认收起 */
  hideAnswer?: boolean
  /** 揭示方式：逐条 / 一次性 */
  revealMode?: 'per_item' | 'all'
  /** 练习块：番茄钟时长（分钟） */
  pomodoro?: { work: number; break: number }
  /** 单题停留提醒（分钟），0 表示不提醒 */
  maxMinutesPerTask?: number
  /** 引导问题 */
  guidance?: string[]
  /** 产出类型 */
  output?: 'text' | 'image' | 'text_and_image'
  /** 需要关联材料 */
  requireMaterial?: 'none' | 'items' | 'attachments'
}

export interface Block {
  id: string
  type: BlockType
  name: string
  instruction: string
  timing: TimingMode
  settings: BlockSettings
}

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

export interface ItemVersion {
  id: ID
  item_id: ID
  title: string
  body_md: string
  source: ItemSource
  confirmed: boolean
  created_at: number
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
  /** 用户自己的话（费曼自述） */
  self_note: string
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

/** 作业题目 / 练习任务 */
export interface Task {
  id: ID
  project_id: ID
  unit_id: ID
  session_id: ID | null
  title: string
  difficulty: 'easy' | 'medium' | 'hard' | null
  status: 'todo' | 'doing' | 'done'
  spent_ms: number
  wrong: boolean
  note: string
  order: number
  created_at: number
  updated_at: number
}

/** 流程模板 */
export interface Template {
  id: ID
  profile_id: ID
  name: string
  description: string
  blocks: Block[]
  version: number
  builtin: boolean
  created_at: number
  updated_at: number
  deleted_at: number | null
}

/** 学习实例 */
export interface Session {
  id: ID
  project_id: ID
  unit_id: ID
  template_id: ID
  template_version: number
  template_snapshot: Block[]
  title: string
  status: SessionStatus
  current_step: number
  started_at: number
  ended_at: number | null
  updated_at: number
  deleted_at: number | null
}

export type StepEventType =
  | 'start'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'skip'
  | 'defer'
  | 'takeover'

export interface StepEvent {
  id: ID
  session_id: ID
  step_id: ID
  type: StepEventType
  ts: number
  /** 补录标记：用户事后补写的时间 */
  manual: boolean
  note: string
}

/** 一次尝试结果（与流程状态分离） */
export interface Attempt {
  id: ID
  session_id: ID
  step_id: ID
  item_id: ID | null
  task_id: ID | null
  result: AttemptResult
  note: string
  created_at: number
}

export interface Pomodoro {
  id: ID
  session_id: ID
  step_id: ID
  kind: 'work' | 'break'
  started_at: number
  ended_at: number | null
  planned_ms: number
}

export interface Retest {
  id: ID
  project_id: ID
  unit_id: ID
  item_id: ID | null
  title: string
  due_at: number
  status: 'scheduled' | 'done' | 'failed'
  result: AttemptResult | null
  note: string
  created_at: number
  updated_at: number
}

/** 心得 / 感悟 */
export interface Reflection {
  id: ID
  project_id: ID
  unit_id: ID
  session_id: ID | null
  step_id: ID | null
  item_id: ID | null
  body_md: string
  answers: Record<string, string>
  created_at: number
  updated_at: number
}

/** 预习清单 */
export interface PreviewNote {
  id: ID
  project_id: ID
  unit_id: ID
  session_id: ID | null
  title: string
  key_points: string
  difficulties: string
  questions: string
  created_at: number
  updated_at: number
}

export type AiTaskKind = 'transcribe' | 'organize' | 'explain' | 'quiz' | 'feedback'

export interface AiConfig {
  id: ID
  name: string
  protocol: 'openai' | 'anthropic'
  base_url: string
  api_key: string
  model: string
  supports_text: boolean
  supports_image: boolean
  timeout_ms: number
  max_tokens: number
  temperature: number | null
  created_at: number
  updated_at: number
}

export interface PromptVersion {
  id: ID
  task: AiTaskKind
  version: number
  content: string
  builtin: boolean
  created_at: number
}

export interface AiUsage {
  id: ID
  config_id: ID | null
  config_name: string
  task: AiTaskKind
  model: string
  mode: 'mock' | 'live'
  prompt_version: number
  input_tokens: number
  output_tokens: number
  ok: boolean
  error: string
  created_at: number
}

/** AI 能力 → 配置 的映射 */
export interface AiMapping {
  key: string
  value: string
}

export interface OutboxEntry {
  id: ID
  client_req_id: string
  kind: string
  payload: string
  created_at: number
}

export interface Conflict {
  id: ID
  entity: string
  entity_id: ID
  local_version: number
  remote_version: number
  local_payload: string
  remote_payload: string
  resolved: boolean
  created_at: number
}

export interface TrashEntry {
  id: ID
  kind: string
  ref_id: ID
  label: string
  payload: unknown
  created_at: number
}

export interface Settings {
  key: string
  value: unknown
}
