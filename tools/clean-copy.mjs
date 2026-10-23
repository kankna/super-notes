/**
 * 清理界面上的冗余说明文本。
 * 一次性脚本，跑完即可删除。
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = 'D:/CoWork-Super Notes -MiniMax/app/src'

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(name) && !p.includes('__tests__')) out.push(p)
  }
  return out
}

// 整块删除：带缩进的多行 JSX
const BLOCKS = [
  // 步骤内容里重复的说明（页头已经有一句话说明）
  /[ \t]*<div className="step__intro">\r?\n[ \t]*<p className="step__detail">\{ctx\.step\.instruction\}<\/p>\r?\n[ \t]*<\/div>\r?\n/g,
  // 书架的使用说明
  /[ \t]*<p className="shelf__hint">[\s\S]*?<\/p>\r?\n/g,
  // 选流程页的说明
  /[ \t]*<p className="start__sub">[\s\S]*?<\/p>\r?\n/g,
  // 顶栏菜单里的逐项说明
  /[ \t]*<span className="topmenu__hint">\{it\.hint\}<\/span>\r?\n/g,
  /[ \t]*<div className="topmenu__note">[\s\S]*?<\/div>\r?\n/g,
]

// 单行删除：明确的冗余文案
const LINES = [
  '先转写，再按教学顺序整理成条目草稿',
  '卡住不丢人，卡着不动才丢人',
  '可以随时重新打开',
  '文本或图片都行',
  '休息单独记录，不计入学习时长',
  '先粗分难度，别在一道题上耗太久',
  '不翻书，先在白纸上写一遍',
  '自己一步步推出来，同时讲一遍',
  '可以选着答，也可以全忽略',
  '同一条目可以安排多次',
  '不指定就全部用第一个配置',
  '五件事各自一份，互不干扰',
  '删除的内容先到这里，可以恢复',
  '模板决定每一轮的步骤',
  '添加一个功能块：',
]

let changed = 0
for (const file of walk(root)) {
  let src = readFileSync(file, 'utf8')
  const before = src
  for (const re of BLOCKS) src = src.replace(re, '')
  for (const line of LINES) {
    const re = new RegExp(
      `[ \\t]*<span className="card__hint">\\s*${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<\\/span>\\r?\\n`,
      'g',
    )
    src = src.replace(re, '')
  }
  if (src !== before) {
    writeFileSync(file, src, 'utf8')
    changed++
    console.log('updated', file.replace(root, ''))
  }
}
console.log(`\n${changed} 个文件已清理`)
