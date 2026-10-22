import { getDb } from './db'
import { newId } from '../lib/id'
import type { Chapter, Doubt, Item, Mark, Project, Unit } from './types'

/**
 * 示例数据用真实教学内容填充，而不是「项目1 / 例题1」这种空壳。
 * 目的是让人一眼看出：公式能不能渲染、笔记结构清不清楚、AI 整理出来长什么样。
 * 全部集中在「示例项目」里，可以一键清空。
 */

interface SeedItem {
  kind: Item['kind']
  title: string
  body_md: string
  source: Item['source']
  confirmed?: boolean
  marks?: Mark['kind'][]
  order: number
}

interface SeedUnit {
  title: string
  status: Unit['status']
  last_studied_at?: number | null
  items: SeedItem[]
  doubts?: Omit<Doubt, 'id' | 'project_id' | 'unit_id' | 'item_id' | 'created_at' | 'updated_at'>[]
}

interface SeedProject {
  name: string
  subtitle: string
  description: string
  tags: string[]
  accent: string
  cover: Project['cover']
  chapters: { name: string; units: SeedUnit[] }[]
}

const DAY = 86_400_000

const SEED_PROJECTS: SeedProject[] = [
  {
    name: '高一数学 · 函数与导数',
    subtitle: '必修二 · 导数入门',
    description:
      '按“拍照整理 → 课下五步”走的样板项目。每堂课先上传课堂照片生成笔记草稿，课下按先复习 / 弄懂它 / 去实践 / 说感悟 / 先探路走一遍。',
    tags: ['数学', '高一', '在用'],
    accent: '#c07b3e',
    cover: 'gradient',
    chapters: [
      {
        name: '第一章 函数的单调性与最值',
        units: [
          {
            title: '第 3 讲 函数的单调性与导数',
            status: 'in_progress',
            last_studied_at: Date.now() - DAY,
            items: [
              {
                kind: 'theorem',
                title: '导数与单调性',
                source: 'teacher',
                confirmed: true,
                order: 0,
                body_md: `**定理（导数与单调性）**　设函数 $f(x)$ 在区间 $I$ 上可导。

- 若在 $I$ 上恒有 $f'(x) > 0$，则 $f(x)$ 在 $I$ 上是增函数；
- 若在 $I$ 上恒有 $f'(x) < 0$，则 $f(x)$ 在 $I$ 上是减函数。

> 老师说：这里“恒有”两个字很关键，只在部分点成立不能直接用。`,
              },
              {
                kind: 'formula',
                title: '链式法则',
                source: 'teacher',
                confirmed: true,
                order: 1,
                body_md: `$$\\left(f(g(x))\\right)' = f'\\!\\left(g(x)\\right) \\cdot g'(x)$$

常见复合函数的求导顺序：先外后内，逐层求导再相乘。

$$\\left[(x^2+1)^{3}\\right]' = 3(x^2+1)^2 \\cdot 2x$$`,
              },
              {
                kind: 'example',
                title: '例 1　求 $f(x)=x^3-3x$ 的单调区间与极值',
                source: 'teacher',
                confirmed: true,
                order: 2,
                body_md: `**题目**　求函数 $f(x)=x^3-3x$ 的单调区间，并求出它的极大值与极小值。

**我的重演（先遮住答案自己推）**　$f'(x)=3x^2-3=3(x-1)(x+1)$，令 $f'(x)=0$ 得 $x=\\pm 1$。`,
              },
              {
                kind: 'answer',
                title: '例 1 · 解答与过程',
                source: 'teacher',
                confirmed: true,
                order: 3,
                body_md: `**解**　$f'(x)=3x^2-3=3(x-1)(x+1)$。

令 $f'(x)=0$，得 $x=-1$ 与 $x=1$。

列表讨论 $f'(x)$ 的符号：

| 区间 | $x< -1$ | $-1<x<1$ | $x>1$ |
|---|---|---|---|
| $f'(x)$ | $+$ | $-$ | $+$ |
| $f(x)$ | 增 | 减 | 增 |

所以单调递增区间为 $(-\\infty,-1)$ 与 $(1,+\\infty)$，单调递减区间为 $(-1,1)$。

极大值 $f(-1)=(-1)^3-3(-1)=2$；极小值 $f(1)=1-3=-2$。`,
              },
              {
                kind: 'summary',
                title: '我的总结',
                source: 'self',
                order: 4,
                body_md: `第一次把“导数符号”和“单调性”真正连起来的是这道题，顺序是固定的四步：

1. 求导 $f'(x)$
2. 解 $f'(x)=0$ 得零点
3. 用零点把定义域切成区间，列表讨论 $f'$ 的符号
4. 由符号定单调区间，由符号变号点定极值

原来“符号变号”就是极值的开关，不用额外背什么。`,
              },
              {
                kind: 'note',
                title: '老师口头补充：极值与最值的区别',
                source: 'teacher',
                order: 5,
                body_md: `极值是**局部**概念（在某点附近），最值是**整体**概念（在整个区间上）。

- 极值点可能不止一个；
- 最值要在闭区间上比较所有端点和极值点的函数值。

期末这块容易混，专门记一下。`,
              },
            ],
            doubts: [
              {
                title: '为什么 $f\'(x)>0$ 就能推出 $f$ 严格递增？',
                context: '导数与单调性定理的证明过程。课本只给了结论，我不太清楚中间用了什么。',
                tried: '试着用定义写：任取 $x_1<x_2$，想证 $f(x_1)<f(x_2)$，但卡在“怎么把导数的信息用上”。',
                explanation: '',
                next: '查拉格朗日中值定理，看能不能用 $f(x_2)-f(x_1)=f\'(\\xi)(x_2-x_1)$。',
                status: 'open',
              },
            ],
          },
          {
            title: '第 4 讲 导数的运算法则',
            status: 'not_started',
            items: [
              {
                kind: 'theorem',
                title: '可导必连续',
                source: 'teacher',
                order: 0,
                body_md: `若 $f(x)$ 在点 $x_0$ 处可导，则 $f(x)$ 在 $x_0$ 处连续。

反过来不成立：$\\sqrt{x}$ 在 $x=0$ 处连续但不可导。`,
              },
              {
                kind: 'formula',
                title: '常用求导公式',
                source: 'teacher',
                order: 1,
                body_md: `$$(x^n)' = n x^{n-1}\\qquad (\\sin x)' = \\cos x \\qquad (\\cos x)' = -\\sin x$$
$$(\\ln x)' = \\dfrac{1}{x}\\qquad (e^x)' = e^x$$`,
              },
            ],
          },
        ],
      },
      {
        name: '第二章 导数的应用',
        units: [
          {
            title: '第 5 讲 极值与最值',
            status: 'not_started',
            items: [],
          },
          {
            title: '第 6 讲 导数与不等式',
            status: 'deferred',
            last_studied_at: Date.now() - 2 * DAY,
            items: [
              {
                kind: 'note',
                title: '预习记录：探路',
                source: 'self',
                order: 0,
                body_md: `下一节讲用导数证明不等式。

- **重点**：构造函数的思想，把不等式两边移到同一侧变成 $f(x)\\ge 0$。
- **难点**：辅助函数怎么构造；$f'(x)$ 的符号怎么判断。
- **待问**：什么时候该构造函数？有没有套路？`,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: '英语 · 阅读复盘',
    subtitle: '跨学科模板示例',
    description:
      '同一套基础动作换到非数学学科的验证：回忆块改成“合上原文复述”，解疑块用于长难句，练习块用于改写，反思块用于提炼表达。',
    tags: ['英语', '模板示例'],
    accent: '#3f7d8c',
    cover: 'striped',
    chapters: [
      {
        name: 'Unit 3 学术阅读',
        units: [
          {
            title: 'Reading 12　The Social Life of Algorithms',
            status: 'not_started',
            items: [
              {
                kind: 'note',
                title: '长难句待拆解',
                source: 'self',
                order: 0,
                body_md: `> …the suggestion that platforms are not merely distributing content but actively shaping the terms on which that content is judged.

- 主干：platforms are shaping the terms
- 插入：that … 整个是同位语从句，修饰 suggestion
- 重点表达：on which … is judged（介词提前的关系从句）`,
              },
            ],
          },
        ],
      },
      {
        name: 'Unit 4 新闻评论',
        units: [
          {
            title: 'Reading 13　Attention Economy',
            status: 'not_started',
            items: [],
          },
        ],
      },
    ],
  },
  {
    name: '高考数学 · 一轮复习',
    subtitle: '刚建的空项目',
    description: '一个还没开始的专题，用来展示“新建项目”的最小状态：只有章节骨架和一条待办单元。',
    tags: ['数学', '规划中'],
    accent: '#6b5b95',
    cover: 'grid',
    chapters: [
      {
        name: '专题一 数列',
        units: [
          {
            title: '第 1 讲 等差数列与等比数列',
            status: 'not_started',
            items: [],
          },
        ],
      },
    ],
  },
]

function demoNotePhoto(title: string, lines: string[]): Blob {
  const rows = lines
    .map(
      (l, i) =>
        `<text x="64" y="${190 + i * 46}" class="hand">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620">
  <defs>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
      <feComposite operator="over" in2="SourceGraphic"/></filter>
    <linearGradient id="page" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbf7ee"/><stop offset="100%" stop-color="#f0e9da"/></linearGradient>
  </defs>
  <rect width="900" height="620" fill="#2b2119"/>
  <g transform="rotate(-1.2 450 310)">
    <rect x="24" y="18" width="852" height="584" rx="6" fill="url(#page)" filter="url(#grain)"/>
    <g stroke="#cfe0ef" stroke-width="1.6">
      ${Array.from({ length: 9 }, (_, i) => `<line x1="24" y1="${170 + i * 46}" x2="876" y2="${170 + i * 46}"/>`).join('')}
    </g>
    <line x1="70" y1="18" x2="70" y2="602" stroke="#e8a0a0" stroke-width="2"/>
    <text x="96" y="92" class="head">${title}</text>
    <text x="96" y="140" class="sub">课堂笔记 · 拍照上传</text>
    ${rows}
  </g>
  <style>
    .head{font-family:"KaiTi","STKaiti","楷体",serif;font-size:44px;fill:#1d2733}
    .sub{font-family:"KaiTi","STKaiti","楷体",serif;font-size:24px;fill:#7d8894}
    .hand{font-family:"KaiTi","STKaiti","楷体",serif;font-size:30px;fill:#22303f}
  </style>
</svg>`
  return new Blob([svg], { type: 'image/svg+xml' })
}

export async function seedIfEmpty(): Promise<boolean> {
  const db = getDb()
  const count = await db.projects.count()
  if (count > 0) return false

  const now = Date.now()
  let order = 0

  for (const sp of SEED_PROJECTS) {
    const projectId = newId('p_')
    const project: Project = {
      id: projectId,
      profile_id: 'default',
      name: sp.name,
      subtitle: sp.subtitle,
      description: sp.description,
      tags: sp.tags,
      accent: sp.accent,
      cover: sp.cover,
      order,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }
    order += 1

    const chapters: Chapter[] = []
    const units: Unit[] = []
    const items: Item[] = []
    const marks: Mark[] = []
    const doubts: Doubt[] = []
    let chapterOrder = 0
    let unitOrder = 0
    let itemOrder = 0

    for (const sc of sp.chapters) {
      const chapterId = newId('c_')
      chapters.push({ id: chapterId, project_id: projectId, name: sc.name, order: chapterOrder })
      chapterOrder += 1

      for (const su of sc.units) {
        const unitId = newId('u_')
        units.push({
          id: unitId,
          project_id: projectId,
          chapter_id: chapterId,
          title: su.title,
          order: unitOrder,
          status: su.status,
          last_studied_at: su.last_studied_at ?? null,
          created_at: now,
          updated_at: now,
        })
        unitOrder += 1
        itemOrder = 0

        for (const si of su.items) {
          const itemId = newId('i_')
          items.push({
            id: itemId,
            project_id: projectId,
            unit_id: unitId,
            kind: si.kind,
            title: si.title,
            body_md: si.body_md,
            source: si.source,
            confirmed: si.confirmed ?? false,
            order: itemOrder,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          })
          itemOrder += 1
          for (const mk of si.marks ?? []) {
            marks.push({ id: newId('m_'), item_id: itemId, kind: mk, note: '', created_at: now })
          }
        }

        for (const sd of su.doubts ?? []) {
          doubts.push({
            ...sd,
            id: newId('d_'),
            project_id: projectId,
            unit_id: unitId,
            item_id: null,
            created_at: now,
            updated_at: now,
          })
        }
      }
    }

    await db.transaction(
      'rw',
      [db.projects, db.chapters, db.units, db.items, db.marks, db.doubts],
      async () => {
        await db.projects.add(project)
        await db.chapters.bulkAdd(chapters)
        await db.units.bulkAdd(units)
        await db.items.bulkAdd(items)
        if (marks.length) await db.marks.bulkAdd(marks)
        if (doubts.length) await db.doubts.bulkAdd(doubts)
      },
    )
  }

  // 给第一个单元挂一张“课堂照片”，方便演示原图对照
  const firstUnit = await db.units.orderBy('order').first()
  if (firstUnit) {
    const blob = demoNotePhoto('函数的单调性与导数', [
      '定理：f\'(x) > 0 ⟹ f 在 I 上递增',
      'f\'(x) < 0 ⟹ f 在 I 上递减',
      "例：f(x) = x³ - 3x",
      "f'(x) = 3(x-1)(x+1)",
      'x = ±1 处讨论符号 → 极值',
    ])
    await db.attachments.add({
      id: newId('a_'),
      project_id: firstUnit.project_id,
      unit_id: firstUnit.id,
      item_id: null,
      name: '课堂笔记-第3讲.svg',
      mime: 'image/svg+xml',
      size: blob.size,
      role: 'source_photo',
      blob,
      created_at: now,
    })
  }

  return true
}

export async function clearAllData(): Promise<void> {
  const db = getDb()
  await db.transaction(
    'rw',
    [db.projects, db.chapters, db.units, db.items, db.marks, db.doubts, db.attachments, db.trash],
    async () => {
      await db.projects.clear()
      await db.chapters.clear()
      await db.units.clear()
      await db.items.clear()
      await db.marks.clear()
      await db.doubts.clear()
      await db.attachments.clear()
      await db.trash.clear()
    },
  )
}
