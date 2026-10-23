import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes, HashRouter } from 'react-router-dom'
import { seedIfEmpty } from './db/seed'
import { useUI, applyMotionClass } from './store/ui'
import { Layout } from './app/Layout'
import { ErrorBoundary } from './app/ErrorBoundary'
import { ShelfPage } from './features/shelf/ShelfPage'

// 画布（React Flow）、导出（JSZip）体积较大，按需加载
const CanvasPage = lazy(() =>
  import('./features/canvas/CanvasPage').then((m) => ({ default: m.CanvasPage })),
)
const WorkbenchPage = lazy(() =>
  import('./features/workbench/WorkbenchPage').then((m) => ({ default: m.WorkbenchPage })),
)
const ProofPage = lazy(() =>
  import('./features/proof/ProofPage').then((m) => ({ default: m.ProofPage })),
)
const TemplatesPage = lazy(() =>
  import('./features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })),
)
const RetestPage = lazy(() =>
  import('./features/retest/RetestPage').then((m) => ({ default: m.RetestPage })),
)
const AiSettingsPage = lazy(() =>
  import('./features/settings/AiSettingsPage').then((m) => ({ default: m.AiSettingsPage })),
)
const DataPage = lazy(() =>
  import('./features/settings/DataPage').then((m) => ({ default: m.DataPage })),
)

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
      <HashRouter>
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="boot">
                <div className="boot__mark">书斋</div>
                <div className="boot__hint">加载中…</div>
              </div>
            }
          >
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<ShelfPage />} />
                <Route path="/p/:projectId" element={<CanvasPage />} />
                <Route path="/p/:projectId/u/:unitId" element={<WorkbenchPage />} />
                <Route path="/p/:projectId/u/:unitId/proof" element={<ProofPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/retests" element={<RetestPage />} />
                <Route path="/settings/ai" element={<AiSettingsPage />} />
                <Route path="/settings/data" element={<DataPage />} />
                <Route path="*" element={<ShelfPage />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </HashRouter>
    </div>
  )
}
