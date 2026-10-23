import { useEffect, useRef, useState } from 'react'

export type Mode = 'light' | 'dark'

export interface Accent {
  id: string
  name: string
  swatch: string
}

/** 强调色取自 Radix Colors 色阶 */
export const ACCENTS: Accent[] = [
  { id: 'indigo', name: '靛蓝', swatch: '#3e63dd' },
  { id: 'teal', name: '青绿', swatch: '#12a594' },
  { id: 'amber', name: '琥珀', swatch: '#ffc53d' },
  { id: 'violet', name: '紫罗兰', swatch: '#6e56cf' },
]

const MODE_KEY = 'sn.mode'
const ACCENT_KEY = 'sn.accent'

function systemMode(): Mode {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

export function useAppearance(): {
  mode: Mode
  accent: string
  setMode: (m: Mode) => void
  setAccent: (a: string) => void
} {
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof localStorage === 'undefined') return 'dark'
    const saved = localStorage.getItem(MODE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : systemMode()
  })
  const [accent, setAccentState] = useState<string>(() => {
    if (typeof localStorage === 'undefined') return 'indigo'
    return localStorage.getItem(ACCENT_KEY) || 'indigo'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', mode)
    localStorage.setItem(MODE_KEY, mode)
  }, [mode])

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
    localStorage.setItem(ACCENT_KEY, accent)
  }, [accent])

  return { mode, accent, setMode: setModeState, setAccent: setAccentState }
}

export function AppearancePicker({
  mode,
  accent,
  onMode,
  onAccent,
}: {
  mode: Mode
  accent: string
  onMode: (m: Mode) => void
  onAccent: (a: string) => void
}) {
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
        title="外观"
        onClick={() => setOpen((v) => !v)}
        style={{ color: 'var(--accent-text)' }}
      >
        {mode === 'dark' ? <MoonIcon /> : <SunIcon />}
      </button>
      {open && (
        <div className="appearance">
          <div className="appearance__label">模式</div>
          <div className="appearance__modes">
            <button
              className={`appearance__mode${mode === 'light' ? ' is-on' : ''}`}
              onClick={() => onMode('light')}
            >
              <SunIcon />
              浅色
            </button>
            <button
              className={`appearance__mode${mode === 'dark' ? ' is-on' : ''}`}
              onClick={() => onMode('dark')}
            >
              <MoonIcon />
              深色
            </button>
          </div>
          <div className="appearance__label">强调色</div>
          <div className="appearance__accents">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={`themepick__sw${a.id === accent ? ' is-on' : ''}`}
                style={{ background: a.swatch }}
                title={a.name}
                aria-label={a.name}
                onClick={() => onAccent(a.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SunIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.3 2a9 9 0 1 0 9.7 12.4A8 8 0 0 1 12.3 2Z" />
    </svg>
  )
}
