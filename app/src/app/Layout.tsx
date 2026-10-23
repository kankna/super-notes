import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '../db/db'
import { Icon } from '../components/Icon'
import { useUI } from '../store/ui'

export function Layout() {
  const db = getDb()
  const navigate = useNavigate()
  const location = useLocation()
  const { reducedMotion, toggleReducedMotion, toast, hideToast } = useUI()
  const [query, setQuery] = useState('')

  const trashCount = useLiveQuery(() => db.trash.count(), [])
  const projects = useLiveQuery(() => db.projects.orderBy('order').toArray(), [])

  const inShelf = location.pathname === '/'

  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => navigate('/')} title="回到书架">
          <span className="brand__mark">书斋</span>
          <span className="brand__sub">Super Notes</span>
        </button>

        <nav className="topnav">
          <NavLink to="/" className={({ isActive }) => `topnav__link${isActive ? ' is-on' : ''}`}>
            书架
          </NavLink>
          <NavLink
            to="/templates"
            className={({ isActive }) => `topnav__link${isActive ? ' is-on' : ''}`}
          >
            模板
          </NavLink>
          <NavLink
            to="/retests"
            className={({ isActive }) => `topnav__link${isActive ? ' is-on' : ''}`}
          >
            复测
          </NavLink>
        </nav>

        {inShelf && (
          <div className="search">
            <span className="search__icon">
              <Icon name="search" size={15} />
            </span>
            <input
              value={query}
              placeholder="搜索项目、标签、说明…"
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

        {projects && projects.length > 0 && (
          <select
            className="select topbar__jump"
            value=""
            onChange={(e) => e.target.value && navigate(`/p/${e.target.value}`)}
          >
            <option value="">跳到项目…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <button
          className={`iconbtn${reducedMotion ? ' is-on' : ''}`}
          title={reducedMotion ? '减少动效：已开启' : '减少动效：已关闭'}
          onClick={toggleReducedMotion}
        >
          <Icon name="motion" size={17} />
        </button>
        <NavLink to="/settings/ai" className="iconbtn" title="AI 服务设置">
          <Icon name="palette" size={17} />
        </NavLink>
        <NavLink to="/settings/data" className="iconbtn" title="数据与导出">
          <Icon name="book" size={17} />
        </NavLink>
        <button className="iconbtn" title="回收站" onClick={() => navigate('/settings/data')}>
          <Icon name="trash" size={17} />
          {(trashCount ?? 0) > 0 && <span className="dot-badge">{trashCount}</span>}
        </button>
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
