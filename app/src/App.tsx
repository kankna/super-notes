import { useEffect, useState } from 'react'
import { seedIfEmpty } from './db/seed'
import { useUI, applyMotionClass } from './store/ui'
import { ShelfPage } from './features/shelf/ShelfPage'

export default function App() {
  const [ready, setReady] = useState(false)
  const reducedMotion = useUI((s) => s.reducedMotion)

  useEffect(() => {
    applyMotionClass(reducedMotion)
  }, [reducedMotion])

  useEffect(() => {
    let alive = true
    seedIfEmpty()
      .catch((err) => console.error('示例数据初始化失败', err))
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  if (!ready) {
    return (
      <div className="app">
        <div className="boot">
          <div className="boot__mark">书斋</div>
          <div className="boot__hint">正在整理书架…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <ShelfPage />
    </div>
  )
}
