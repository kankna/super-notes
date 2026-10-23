import { newId } from '../../lib/id'
import type { Block, BlockType, Template } from '../../db/types'

export const BLOCK_LABEL: Record<BlockType, string> = {
  organize: '资料整理',
  recall: '回忆 / 重演',
  explain: '弄懂它',
  practice: '去实践',
  reflect: '说感悟',
  preview: '先探路',
  retest: '日后复测',
  free: '自由任务',
}

export const BLOCK_DESC: Record<BlockType, string> = {
  organize: '拍照上传课堂照片 → AI 转写整理 → 对照原图校对',
  recall: '遮住答案，在纸上默写或重演，逐条标记掌握情况',
  explain: '把疑点清单逐条解决：AI 分层提示 + 自己的话讲清楚',
  practice: '浏览作业、分类难度、番茄钟推进、拍照收录错题好题',
  reflect: '自由写心得，或按引导问题回答',
  preview: '浏览下一课材料，标出重点、难点和待问的问题',
  retest: '隔一段时间重新默写或重做，检验是否真的记住',
  free: '自定义名称与说明的临时任务，产出文本或图片',
}

export function makeBlock(type: BlockType, overrides: Partial<Block> = {}): Block {
  const base: Block = {
    id: newId('b_'),
    type,
    name: BLOCK_LABEL[type],
    instruction: BLOCK_DESC[type],
    timing: type === 'practice' ? 'pomodoro' : type === 'recall' ? 'manual' : 'none',
    settings: {
      hideAnswer: type === 'recall',
      revealMode: type === 'recall' ? 'per_item' : 'all',
      pomodoro: type === 'practice' ? { work: 25, break: 5 } : undefined,
      maxMinutesPerTask: type === 'practice' ? 12 : 0,
      guidance:
        type === 'reflect'
          ? [
              '与过去相比，新知识有什么不同、有什么联系？',
              '这道题/这节课给你的最大感受是什么？',
              '下次遇到类似的题，第一步该做什么？',
            ]
          : undefined,
      output: type === 'free' ? 'text_and_image' : 'text',
      requireMaterial:
        type === 'organize' ? 'attachments' : type === 'recall' ? 'items' : 'none',
    },
  }
  return { ...base, ...overrides, settings: { ...base.settings, ...(overrides.settings ?? {}) } }
}

export function makeMathTemplate(): Template {
  const now = Date.now()
  return {
    id: 'tpl_math_v1',
    profile_id: 'default',
    name: '数学课后学习',
    description: '课上拍照整理 → 课下五步走通。课上与课下时间比约 1:3，重心在课下。',
    version: 1,
    builtin: true,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    blocks: [
      makeBlock('organize', {
        name: '接收资料',
        instruction: '按顺序上传课堂照片，AI 转写并整理成条目草稿，再对照原图校对确认。',
      }),
      makeBlock('recall', {
        name: '先复习',
        instruction:
          '定理与公式：不翻书默写到白纸。例题：自己一步一步推出来并讲一遍。卡壳但对答案后懂了，回笔记上标记「不熟悉」；完全不懂的写进疑点清单。',
        timing: 'manual',
      }),
      makeBlock('explain', {
        name: '弄懂它',
        instruction: '把疑点清单逐条解决：先要一层提示，自己讲一遍，再做一道检测题。',
        timing: 'manual',
      }),
      makeBlock('practice', {
        name: '去实践',
        instruction:
          '先浏览作业并粗分难度，不要在一道题上耗太久。独立完成后对答案，收藏好题和错题（拍照），同时回头补充笔记。',
        timing: 'pomodoro',
      }),
      makeBlock('reflect', {
        name: '说感悟',
        instruction: '写完题目再写收获。可以自由发挥，也可以按引导问题回答。',
      }),
      makeBlock('preview', {
        name: '先探路',
        instruction:
          '预习明天要学的内容。不要全部搞懂，只要知道重点在哪、难点在哪、有哪些东西要提前记。',
      }),
      makeBlock('retest', {
        name: '日后复测',
        instruction: '隔几天回来重新默写或重做一次，检验是否真的记住。',
        timing: 'none',
      }),
    ],
  }
}

export function makeEnglishTemplate(): Template {
  const now = Date.now()
  return {
    id: 'tpl_english_v1',
    profile_id: 'default',
    name: '英语阅读复盘',
    description: '同一套基础动作换到非数学学科：合上原文复述 → 拆长难句 → 改写练习 → 提炼表达。',
    version: 1,
    builtin: true,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    blocks: [
      makeBlock('recall', {
        name: '合上原文复述',
        instruction: '合上文章，用自己的话把内容讲一遍。讲不顺的地方回原文标记。',
        timing: 'manual',
      }),
      makeBlock('explain', {
        name: '长难句拆解',
        instruction: '把读不懂的句子拆成主干和修饰，说明每个从句指什么。',
        timing: 'manual',
      }),
      makeBlock('practice', {
        name: '改写练习',
        instruction: '把文章里的关键句改写成自己的表达，练习换词换结构。',
        timing: 'pomodoro',
      }),
      makeBlock('reflect', {
        name: '提炼表达',
        instruction: '记下今天学到的 3 个可复用的表达，并各写一个自己的例句。',
      }),
      makeBlock('preview', {
        name: '下篇预读',
        instruction: '先看标题和小标题，猜一猜文章会讲什么。',
      }),
    ],
  }
}

export function makeFreeTemplate(): Template {
  const now = Date.now()
  return {
    id: 'tpl_free_v1',
    profile_id: 'default',
    name: '自由学习',
    description: '只有一个自由任务块，用来做临时安排。',
    version: 1,
    builtin: true,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    blocks: [makeBlock('free', { name: '临时任务', instruction: '想做什么就做什么。' })],
  }
}

export function builtinTemplates(): Template[] {
  // created_at 依次递增，保证模板列表顺序稳定（数学 → 英语 → 自由）
  const base = Date.now()
  const math = makeMathTemplate()
  const english = makeEnglishTemplate()
  const free = makeFreeTemplate()
  math.created_at = base
  math.updated_at = base
  english.created_at = base + 1
  english.updated_at = base + 1
  free.created_at = base + 2
  free.updated_at = base + 2
  return [math, english, free]
}

/** 复制模板并另存为新模板 */
export function cloneTemplate(src: Template, name: string, description: string): Template {
  const now = Date.now()
  return {
    ...src,
    id: newId('tpl_'),
    name,
    description,
    version: 1,
    builtin: false,
    created_at: now,
    updated_at: now,
    blocks: src.blocks.map((b) => ({ ...b, id: newId('b_'), settings: { ...b.settings } })),
  }
}
