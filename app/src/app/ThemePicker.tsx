import { useEffect, useRef, useState } from 'react'

export interface Theme {
  id: string
  name: string
  swatch: string
}

/** 主题色取自 Radix Colors 色阶 */
export const THEMES: Theme[] = [
  { id: 'indigo', name: '靛蓝', swatch: '#3e63dd' },
  { id: 'teal', name: '青绿', swatch: '#12a594' },
  { id: 'amber', name: '琥珀', swatch: '#ffc53d' },
  { id: 'violet', name: '紫罗兰', swatch: '#6e56cf' },
]

const KEY = 'sn.theme'

export function useTheme(): [string, (id: string) => void] {
  const [theme, setTheme] = useState<string>(() => {
    if (typeof localStorage === 'undefined') return 'indigo'
    return localStorage.getItem(KEY) || 'indigo'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(KEY, theme)
  }, [theme])

  return [theme, setTheme]
}

export function ThemePicker({ theme, onChange }: { theme: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="topbar__menu" ref={ref}>
      <button
        className="iconbtn"
        title="换主题色"
        onClick={() => setOpen((v) => !v)}
        style={{ color: 'var(--accent-text)' }}
      >
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: 3,
            background: 'var(--accent)',
            display: 'inline-block',
          }}
        />
      </button>
      {open && (
        <div className="themepick">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`themepick__sw${t.id === theme ? ' is-on' : ''}`}
              style={{ background: t.swatch }}
              title={t.name}
              aria-label={t.name}
              onClick={() => {
                onChange(t.id)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
