const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 稳定 ID：改标题不会让疑点/题目的引用失效。 */
export function newId(prefix = ''): string {
  const t = Date.now().toString(36)
  let r = ''
  for (let i = 0; i < 8; i += 1) {
    r += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `${prefix}${t}${r}`
}
