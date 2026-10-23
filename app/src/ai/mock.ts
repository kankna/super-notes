import type { AiTaskKind } from '../db/types'
import type { ChatMessage } from './client'

/**
 * Mock AI 模式：零配置也能跑通全链路。
 *
 * 它不"理解"任何东西，只是按任务返回**结构完全合规**的样例输出，
 * 让上传照片 → 整理 → 校对 → 复习 → 解疑 → 检测这条链路在没有 API Key 时也能真实跑通。
 */

export interface MockRequest {
  task: AiTaskKind
  messages: ChatMessage[]
  vars: Record<string, string>
}

export function mockReply(req: MockRequest): { text: string; inputTokens: number; outputTokens: number } {
  const text = build(req)
  return {
    text,
    inputTokens: Math.round(JSON.stringify(req.vars).length / 4),
    outputTokens: Math.round(text.length / 4),
  }
}

function build(req: MockRequest): string {
  switch (req.task) {
    case 'transcribe':
      return mockTranscribe(req.vars)
    case 'organize':
      return mockOrganize(req.vars)
    case 'explain':
      return mockExplain(req.vars)
    case 'quiz':
      return mockQuiz(req.vars)
    case 'feedback':
      return mockFeedback(req.vars)
  }
}

function mockTranscribe(vars: Record<string, string>): string {
  const pages = Number(vars.pages ?? 3) || 3
  const sections: string[] = []
  for (let i = 1; i <= pages; i += 1) {
    sections.push(
      `## 第 ${i} 页\n\n` +
        `### 转写\n\n` +
        `**定理（导数与单调性）**　设函数 $f(x)$ 在区间 $I$ 上可导。\n\n` +
        `- 若在 $I$ 上恒有 $f'(x) > 0$，则 $f(x)$ 在 $I$ 上是增函数；\n` +
        `- 若在 $I$ 上恒有 $f'(x) < 0$，则 $f(x)$ 在 $I$ 上是减函数。\n\n` +
        `$$\\left(f(g(x))\\right)' = f'\\!\\left(g(x)\\right) \\cdot g'(x)$$\n\n` +
        `**例 ${i}**　求 $f(x)=x^3-3x$ 的单调区间与极值。\n\n` +
        `### 不确定\n\n` +
        `[待确认: 第 ${i} 页右上手写的一个符号，像是不等号但看不清方向]`,
    )
  }
  return sections.join('\n\n')
}

function mockOrganize(vars: Record<string, string>): string {
  const payload = {
    outline: [
      '导数与单调性的判定（定理）',
      '复合函数的求导：链式法则',
      '例题：求 $f(x)=x^3-3x$ 的单调区间与极值',
      '例题解答过程与讨论',
      '老师补充：极值与最值的区别',
    ],
    items: [
      {
        kind: 'theorem',
        title: '导数与单调性',
        body_md:
          '**定理（导数与单调性）**　设函数 $f(x)$ 在区间 $I$ 上可导。\n\n' +
          '- 若在 $I$ 上恒有 $f\'(x) > 0$，则 $f(x)$ 在 $I$ 上是增函数；\n' +
          '- 若在 $I$ 上恒有 $f\'(x) < 0$，则 $f(x)$ 在 $I$ 上是减函数。',
        source: 'teacher',
        uncertain: false,
      },
      {
        kind: 'formula',
        title: '链式法则',
        body_md:
          "$$\\left(f(g(x))\\right)' = f'\\!\\left(g(x)\\right) \\cdot g'(x)$$\n\n" +
          '$$\\left[(x^2+1)^{3}\\right]\' = 3(x^2+1)^2 \\cdot 2x$$',
        source: 'teacher',
        uncertain: false,
      },
      {
        kind: 'example',
        title: '例 1　求 $f(x)=x^3-3x$ 的单调区间与极值',
        body_md:
          '**题目**　求函数 $f(x)=x^3-3x$ 的单调区间，并求出它的极大值与极小值。',
        source: 'teacher',
        uncertain: false,
      },
      {
        kind: 'answer',
        title: '例 1 · 解答与过程',
        body_md:
          "**解**　$f'(x)=3x^2-3=3(x-1)(x+1)$。\n\n" +
          '令 $f\'(x)=0$，得 $x=-1$ 与 $x=1$。\n\n' +
          '| 区间 | $x< -1$ | $-1<x<1$ | $x>1$ |\n|---|---|---|---|\n' +
          '| $f\'(x)$ | $+$ | $-$ | $+$ |\n| $f(x)$ | 增 | 减 | 增 |\n\n' +
          '所以单调递增区间为 $(-\\infty,-1)$ 与 $(1,+\\infty)$，单调递减区间为 $(-1,1)$。\n\n' +
          '极大值 $f(-1)=2$；极小值 $f(1)=-2$。',
        source: 'teacher',
        uncertain: false,
      },
      {
        kind: 'note',
        title: '老师口头补充：极值与最值的区别',
        body_md:
          '极值是**局部**概念（在某点附近），最值是**整体**概念（在整个区间上）。\n\n' +
          '- 极值点可能不止一个；\n- 最值要在闭区间上比较所有端点和极值点的函数值。',
        source: 'teacher',
        uncertain: false,
      },
      {
        kind: 'summary',
        title: '待确认：手写符号',
        body_md: '[待确认: 第 1 页右上手写符号方向不清，暂按不等号处理，请对照原图核对]',
        source: 'ai',
        uncertain: true,
      },
    ],
    pending: ['第 1 页右上手写的不等号方向需要对照原图确认'],
  }
  void vars
  return JSON.stringify(payload, null, 2)
}

function mockExplain(vars: Record<string, string>): string {
  const doubt = vars.doubt ?? '这个知识点我不懂'
  return `## 第一层提示

先回到你怀疑的那一步：**导数符号和单调性之间到底缺了什么？**

提示：你现在把"$f'(x)>0$"直接当成"递增"在用，但有没有想过这个结论凭什么成立？把结论反过来想：如果函数在区间上递增，导数会是什么情况？再和正向推回去对照一下，缺的那一环就露出来了。

> 相关材料里有一条：**可导必连续**（$f(x)$ 在 $x_0$ 处可导，则在 $x_0$ 处连续）。这条和你的疑问有关，先看一眼。

## 第二层提示

关键的一步是这个不等式：

$$f(x_2)-f(x_1) = f'(\\xi)(x_2-x_1), \\qquad x_1 < \\xi < x_2$$

这是**拉格朗日中值定理**。把 $f'$ 在某一点的值和区间两端的差值联系起来的工具。

代进去看：$f'(x)>0$ 恒成立 ⟹ $f'(\\xi)>0$ ⟹ $f(x_2)-f(x_1)>0$ ⟹ $f(x_2)>f(x_1)$。

## 完整解答

命题：若 $f$ 在区间 $I$ 上可导且 $f'(x)>0$ 恒成立，则 $f$ 在 $I$ 上严格递增。

证明：任取 $x_1<x_2\in I$。由拉格朗日中值定理，存在 $\\xi\\in(x_1,x_2)$ 使得

$$f(x_2)-f(x_1)=f'(\\xi)(x_2-x_1)$$

由于 $f'(\\xi)>0$ 且 $x_2-x_1>0$，故 $f(x_2)-f(x_1)>0$，即 $f(x_2)>f(x_1)$。由定义，$f$ 在 $I$ 上严格递增。$\\blacksquare$

> 注意：这里必须先有"可导"，才能用中值定理。"恒有"两个字也不能省。

## 额外补充

- [原文已有] 课本上的单调性判据就是上面这条定理的结论。
- [额外补充] 中值定理是"桥梁"，它把**某点的导数**和**区间的整体变化**联系起来；这个"桥梁"思想在后面的中值不等式、洛必达法则里还会反复出现。
- [额外补充] 如果只能记住一件事：**单调性是"整体"结论，导数是"局部"信息，中值定理负责把局部拼成整体。**

## 你的疑问是否解决

对照你的原话：「${doubt.slice(0, 60)}」

如果看完第一层提示就能自己把中值定理那条式子写出来，说明你已经会了；如果还是断片，说明缺的是"中值定理本身"，那是另一个疑点，可以单独拆出来问。
`
}

function mockQuiz(vars: Record<string, string>): string {
  void vars
  return JSON.stringify(
    {
      question:
        '已知函数 $f(x)=x^3-3x$。\n\n' +
        '(1) 求 $f(x)$ 的单调区间；\n' +
        '(2) 求 $f(x)$ 在 $[-2, 2]$ 上的最大值与最小值。',
      conditions: [
        '$f(x)=x^3-3x$ 定义在 $\\mathbb{R}$ 上',
        '讨论区间为 $[-2, 2]$（闭区间，最值需比较端点）',
        '$f$ 在 $\\mathbb{R}$ 上可导',
      ],
      answer: '单调递增区间为 $(-\\infty,-1)$ 与 $(1,+\\infty)$，单调递减区间为 $(-1,1)$；最大值为 $f(-2)=-2$，最小值为 $f(1)=-2$。',
      solution:
        "$f'(x)=3x^2-3=3(x-1)(x+1)$。\n\n" +
        '令 $f\'(x)=0$ 得 $x=\\pm 1$。\n\n' +
        '| 区间 | $(-∞,-1)$ | $(-1,1)$ | $(1,+∞)$ |\n|---|---|---|---|\n' +
        '| $f\'(x)$ | $+$ | $-$ | $+$ |\n' +
        '| $f(x)$ | 增 | 减 | 增 |\n\n' +
        '极值：$f(-1)=2$（极大），$f(1)=-2$（极小）。\n\n' +
        '在闭区间 $[-2,2]$ 上求最值需比较端点与极值点的函数值：\n' +
        '$f(-2)=-8+6=-2$，$f(2)=8-6=2$，$f(-1)=2$，$f(1)=-2$。\n\n' +
        '故最大值为 $2$（在 $x=-1$ 与 $x=2$ 处取到），最小值为 $-2$（在 $x=1$ 与 $x=-2$ 处取到）。',
      checks: [
        '能否正确求出导数并解出零点',
        '能否列表讨论导数符号并定出单调区间',
        '能否区分"极值"与"闭区间上的最值"',
        '能否意识到最值要比较端点',
      ],
    },
    null,
    2,
  )
}

function mockFeedback(vars: Record<string, string>): string {
  const text = vars.user_text ?? ''
  return `## 做对了什么

- 你知道要先求导再讨论符号，方向是对的。
- $f'(x)=3x^2-3$ 这一步求导没有算错。
${text.includes('±1') || text.includes('x=1') ? '- 解出了两个零点 $x=\\pm1$，这一步也对。' : '- 导数零点你写的是 $x=1$ 附近，这里漏了一个负根 $x=-1$，见下方。'}

## 具体缺口

1. **缺一个零点**。$3x^2-3=3(x-1)(x+1)=0$ 得到的是 $x=1$ 和 $x=-1$ 两个。只写一个会漏掉一整段区间。
2. **没有列表讨论符号**。直接说"$x>0$ 所以递增"是不够的 —— 导数符号要看**整个区间上**的符号，不是只看某个点。
3. **没有区分极值和最值**。$f(-1)=2$、$f(1)=-2$ 是极值（局部）；如果题目问的是闭区间 $[-2,2]$ 上的最值，还要把端点 $f(-2)$、$f(2)$ 一起比较。

## 下一次做什么

1. 回到课堂笔记里那条**定理（导数与单调性）**，重点看"恒有"两个字 —— 它规定了是区间上的性质。
2. 回去把例 1 的解答过程**遮住答案重做一遍**，这次要求写出那张三列的符号表。
3. 把上面那道检测题重做一遍，做完再点"核对答案"，专门检查端点有没有漏。

## 是否存在多种解法

有。不列表讨论也可以用"导数零点把定义域分成三段，分别验证单调性"的说法，本质一样。另外 $f(x)=x^3-3x$ 是奇函数，关于原点对称，也可以只算半边再对称推另一半 —— 这个技巧对三次函数很好用。
`
}
