/** 根据背景色亮度选择可读的前景色。 */
export function contrastInk(hex: string): string {
  const c = normalize(hex)
  const l =
    0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  return l > 0.42 ? '#2a1c0e' : '#fdf7ee'
}

function normalize(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return { r: 140, g: 110, b: 70 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function lin(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** 书盒封面可选色：取自 Radix Colors 深色色阶第 9 级 */
export const ACCENTS = [
  '#3e63dd', // indigo
  '#12a594', // teal
  '#ffc53d', // amber
  '#f76b15', // orange
  '#6e56cf', // violet
  '#30a46c', // green
  '#e5484d', // red
  '#e54d2e', // tomato
  '#696e77', // slate
]

export function randomAccent(): string {
  return ACCENTS[Math.floor(Math.random() * ACCENTS.length)]
}
