const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

let counter = 0

/**
 * 稳定 ID：改标题不会让疑点/题目的引用失效。
 *
 * 同一毫秒内创建的对象也要能排出先后顺序（步骤事件尤其重要：
 * start 和 complete 落在同一毫秒时，顺序错了时长就算不对），
 * 所以用「毫秒时间戳 + 自增序号」而不是纯随机串。
 */
export function newId(prefix = ''): string {
  const t = Date.now().toString(36)
  counter = (counter + 1) % 0xffff
  const c = counter.toString(36).padStart(3, '0')
  let r = ''
  for (let i = 0; i < 4; i += 1) {
    r += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `${prefix}${t}${c}${r}`
}
