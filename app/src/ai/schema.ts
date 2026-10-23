/**
 * AI 输出校验：字段是否完整、LaTeX 是否能渲染。
 * 不合规的输出不进入正式正文，转成"待确认"。
 */

export interface ValidationIssue {
  field: string
  message: string
}

export interface ValidationResult<T> {
  ok: boolean
  data: T | null
  issues: ValidationIssue[]
}

/** 从可能带 markdown 代码块的文本里抽出 JSON */
export function extractJson(raw: string): string | null {
  const text = (raw ?? '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start >= 0 && end > start) return body.slice(start, end + 1)
  return null
}

export function parseJson<T>(raw: string): T | null {
  const json = extractJson(raw)
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/** 粗略检查 LaTeX：$ 配对、花括号配对、必须有内容 */
export function checkLatex(md: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const s = md ?? ''
  const dollars = (s.match(/(?<!\$)\$(?!\$)/g) ?? []).length
  const dollars2 = (s.match(/\$\$/g) ?? []).length
  if (dollars % 2 !== 0) {
    issues.push({ field: 'body_md', message: '行内公式的 $ 没有成对闭合' })
  }
  if (dollars2 % 2 !== 0) {
    issues.push({ field: 'body_md', message: '块级公式的 $$ 没有成对闭合' })
  }
  let depth = 0
  for (const ch of s) {
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    if (depth < 0) break
  }
  if (depth !== 0) {
    issues.push({ field: 'body_md', message: '花括号没有配对，公式可能无法渲染' })
  }
  return issues
}

export interface OrganizedItem {
  kind: 'theorem' | 'formula' | 'example' | 'answer' | 'summary' | 'question' | 'note'
  title: string
  body_md: string
  source: 'teacher' | 'ai'
  uncertain: boolean
}

export interface OrganizedOutput {
  outline: string[]
  items: OrganizedItem[]
  pending: string[]
}

const KINDS: OrganizedItem['kind'][] = [
  'theorem',
  'formula',
  'example',
  'answer',
  'summary',
  'question',
  'note',
]

export function validateOrganized(raw: string): ValidationResult<OrganizedOutput> {
  const issues: ValidationIssue[] = []
  const data = parseJson<OrganizedOutput>(raw)
  if (!data) {
    return {
      ok: false,
      data: null,
      issues: [{ field: 'output', message: '不是可解析的 JSON，AI 可能没有按格式输出' }],
    }
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    issues.push({ field: 'items', message: '没有解析出任何条目' })
  }
  for (const [i, it] of (data.items ?? []).entries()) {
    if (!KINDS.includes(it.kind)) {
      issues.push({ field: `items[${i}].kind`, message: `未知的条目类型「${it.kind}」` })
    }
    if (!it.title || !it.title.trim()) {
      issues.push({ field: `items[${i}].title`, message: '标题为空' })
    }
    if (!it.body_md || !it.body_md.trim()) {
      issues.push({ field: `items[${i}].body_md`, message: '正文为空' })
    }
    issues.push(...checkLatex(it.body_md ?? '').map((x) => ({ ...x, field: `items[${i}].${x.field}` })))
  }
  if (!Array.isArray(data.outline)) {
    issues.push({ field: 'outline', message: '缺少课堂大纲' })
  }
  return { ok: issues.length === 0, data, issues }
}

export interface QuizOutput {
  question: string
  conditions: string[]
  answer: string
  solution: string
  checks: string[]
}

export function validateQuiz(raw: string): ValidationResult<QuizOutput> {
  const issues: ValidationIssue[] = []
  const data = parseJson<QuizOutput>(raw)
  if (!data) {
    return {
      ok: false,
      data: null,
      issues: [{ field: 'output', message: '不是可解析的 JSON，检测题未通过核验' }],
    }
  }
  if (!data.question?.trim()) issues.push({ field: 'question', message: '题干为空' })
  if (!data.answer?.trim()) issues.push({ field: 'answer', message: '答案为空' })
  if (!data.solution?.trim()) issues.push({ field: 'solution', message: '解析为空' })
  if (!Array.isArray(data.conditions) || data.conditions.length === 0) {
    issues.push({ field: 'conditions', message: '没有列出题目条件，无法核验' })
  }
  issues.push(...checkLatex(data.solution ?? '').map((x) => ({ ...x, field: `solution.${x.field}` })))
  issues.push(...checkLatex(data.answer ?? '').map((x) => ({ ...x, field: `answer.${x.field}` })))
  return { ok: issues.length === 0, data, issues }
}

/** 校验转写文本里有没有明显破损的公式 */
export function validateTranscript(raw: string): ValidationResult<string> {
  const issues = checkLatex(raw)
  return { ok: issues.length === 0, data: raw, issues }
}
