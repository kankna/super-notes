import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { getDb } from '../../db/db'
import { Icon } from '../../components/Icon'
import { useUI } from '../../store/ui'
import { exportProject, importProject } from '../export/exporter'
import { clearAllData } from '../../db/seed'

export function DataPage() {
  const db = getDb()
  const navigate = useNavigate()
  const { showToast } = useUI()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState('')
  const [outbox, setOutbox] = useState(0)
  const [conflicts, setConflicts] = useState(0)

  const projects = useLiveQuery(() => db.projects.orderBy('order').toArray(), [])
  const trash = useLiveQuery(() => db.trash.orderBy('created_at').reverse().toArray(), [])
  const outboxCount = useLiveQuery(() => db.outbox.count(), [])
  const conflictCount = useLiveQuery(() => db.conflicts.filter((c) => !c.resolved).count(), [])

  const doExport = async () => {
    if (!projectId) {
      showToast('先选一个项目')
      return
    }
    setBusy('export')
    try {
      const { blob, name } = await exportProject(projectId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      showToast(`已导出 ${name}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导出失败')
    } finally {
      setBusy('')
    }
  }

  const doImport = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setBusy('import')
    try {
      const res = await importProject(f)
      showToast(`已恢复为新项目「${res.name}」`)
      navigate(`/p/${res.projectId}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导入失败')
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="stage">
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">数据与导出</h1>
          <span className="page__sub">
            导出包可以离开本产品继续阅读，也可以导回来恢复流程和布局。
          </span>
        </div>

        <section className="card">
          <div className="card__head">
            <h3>导出项目</h3>
            <span className="card__hint">ZIP 结构：notes / assets / records / project.json / manifest.json</span>
          </div>
          <div className="row-btns">
            <select
              className="select"
              style={{ maxWidth: 280 }}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">选择要导出的项目…</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn btn--primary" disabled={busy !== ''} onClick={doExport}>
              {busy === 'export' ? '导出中…' : '导出 ZIP'}
            </button>
          </div>
          <div className="field__hint" style={{ marginTop: 8 }}>
            Markdown 保留 LaTeX 源码，图片用相对路径引用；导出包不含任何 API Key。
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <h3>导入恢复</h3>
            <span className="card__hint">恢复为新项目，不覆盖现有数据</span>
          </div>
          <div className="row-btns">
            <button className="btn" disabled={busy !== ''} onClick={() => fileRef.current?.click()}>
              <Icon name="book" size={14} />
              选择导出的 ZIP
            </button>
            {busy === 'import' && <span className="card__hint">导入中…</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              doImport(e.target.files)
              e.target.value = ''
            }}
          />
        </section>

        <section className="card">
          <div className="card__head">
            <h3>同步状态</h3>
            <span className="card__hint">本地模式：数据存在本机浏览器，尚未接入跨端同步</span>
          </div>
          <div className="statgrid">
            <div className="stat">
              <div className="stat__n">{outboxCount ?? 0}</div>
              <div className="stat__k">待同步队列</div>
            </div>
            <div className="stat">
              <div className="stat__n">{conflictCount ?? 0}</div>
              <div className="stat__k">未解决冲突</div>
            </div>
            <div className="stat">
              <div className="stat__n">本地</div>
              <div className="stat__k">当前模式</div>
            </div>
          </div>
          <div className="field__hint" style={{ marginTop: 8 }}>
            接入后端后，这里会显示「保存中 / 已同步 / 离线待同步 / 存在冲突」四种状态。
          </div>
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => {
              setOutbox(outboxCount ?? 0)
              setConflicts(conflictCount ?? 0)
            }}
          >
            刷新计数
          </button>
          <span className="card__hint" style={{ marginLeft: 8 }}>
            待同步 {outbox} · 冲突 {conflicts}
          </span>
        </section>

        <section className="card">
          <div className="card__head">
            <h3>回收站</h3>
            <span className="card__hint">删除的内容先到这里，可以恢复</span>
          </div>
          {(trash ?? []).length === 0 ? (
            <div className="card__empty">回收站是空的。</div>
          ) : (
            (trash ?? []).map((e) => (
              <div className="trash-row" key={e.id}>
                <div>
                  <div className="trash-row__label">{e.label}</div>
                  <div className="trash-row__time">{new Date(e.created_at).toLocaleString('zh-CN')}</div>
                </div>
                <button
                  className="btn btn--sm"
                  onClick={async () => {
                    if (e.kind === 'project') {
                      await db.projects.update(e.ref_id, { deleted_at: null, updated_at: Date.now() })
                    }
                    await db.trash.delete(e.id)
                    showToast('已恢复')
                  }}
                >
                  恢复
                </button>
                <button
                  className="btn btn--sm btn--danger"
                  onClick={async () => {
                    await db.trash.delete(e.id)
                    showToast('已彻底删除')
                  }}
                >
                  彻底删除
                </button>
              </div>
            ))
          )}
        </section>

        <section className="card">
          <div className="card__head">
            <h3>危险操作</h3>
          </div>
          <div className="row-btns">
            <button
              className="btn btn--danger"
              onClick={async () => {
                if (!confirm('清空本机所有项目与学习记录？此操作不可撤销。')) return
                await clearAllData()
                showToast('已清空')
              }}
            >
              清空全部数据
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
