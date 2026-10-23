import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../db/db'
import { Icon } from '../components/Icon'
import { useUI } from '../store/ui'
import { ThemePicker, useTheme } from './ThemePicker'

/** 顶栏只留"家"和"更多"，其他都收进去 */
const MORE_ITEMS = [
  { to: '/retests', label: '复测清单' },
  { to: '/templates', label: '学习流程模板' },
  { to: '/settings/ai', label: 'AI 设置' },
  { to: '/settings/data', label: '数据与导出' },
]

export function Layout() {
  const db = getDb()
  const navigate = useNavigate()
  const location = useLocation()
  const { reducedMotion, toggleReducedMotion, toast, hideToast } = useUI()
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useTheme()
  const menuRef = useRef<HTMLDivElement | null>(null)

  const trashCount = useLiveQuery(() => db.trash.count(), [])
  const projects = useLiveQuery(() => db.projects.orderBy('order').toArray(), [])

  const inShelf = location.pathname === '/'

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => navigate('/')} title="回到书架">
          <span className="brand__mark">书斋</span>
        </button>

        {inShelf && (
          <div className="search">
            <span className="search__icon">
              <Icon name="search" size={15} />
            </span>
            <input
              value={query}
              placeholder="搜项目"
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="search__clear" onClick={() => setQuery('')} aria-label="清除">
                <Icon name="close" size={13} />
              </button>
            )}
          </div>
        )}

        <div className="topbar__spacer" />

        {inShelf && projects && projects.length > 0 && (
          <select
            className="select topbar__jump"
            value=""
            onChange={(e) => e.target.value && navigate(`/p/${e.target.value}`)}
          >
            <option value="">直接去一课…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <button
          className={`iconbtn${reducedMotion ? ' is-on' : ''}`}
          title={reducedMotion ? '动效已关' : '动效开着'}
          onClick={toggleReducedMotion}
        >
          <Icon name="motion" size={17} />
        </button>

        <ThemePicker theme={theme} onChange={setTheme} />

        <div className="topbar__menu" ref={menuRef}>
          <button
            className={`iconbtn${menuOpen ? ' is-on' : ''}`}
            title="更多"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name="more" size={17} />
            {(trashCount ?? 0) > 0 && <span className="dot-badge">{trashCount}</span>}
          </button>
          {menuOpen && (
            <div className="topmenu">
              {MORE_ITEMS.map((it) => (
                <NavLink key={it.to} to={it.to} className="topmenu__item" onClick={() => setMenuOpen(false)}>
                  <span className="topmenu__label">{it.label}</span>
                </NavLink>
              ))}
              <div className="topmenu__sep" />
            </div>
          )}
        </div>
      </header>

      <Outlet />

      {toast && (
        <div className="toast" onClick={() => !toast.action && hideToast()}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="toast__undo"
              onClick={(e) => {
                e.stopPropagation()
                toast.action?.run()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </>
  )
}
