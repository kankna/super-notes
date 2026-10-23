import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { getDb } from '../../db/db'
import { newId } from '../../lib/id'
import { SESSION_STATUS_LABEL } from '../../db/repo/session'

type UnitNodeData = {
  unitId: string
  title: string
  status: string
  doubts: number
  retests: number
  items: number
  chapter: string
  onOpen: (id: string) => void
}

type ChapterNodeData = { name: string; count: number }

function UnitNode({ data }: NodeProps<Node<UnitNodeData>>) {
  const d = data
  return (
    <div
      className={`unode unode--${d.status}`}
      onClick={() => d.onOpen(d.unitId)}
      title="点击进入这个学习单元"
    >
      <Handle type="target" position={Position.Left} className="unode__handle" />
      <div className="unode__chapter">{d.chapter}</div>
      <div className="unode__title">{d.title}</div>
      <div className="unode__meta">
        <span className={`unode__status unode__status--${d.status}`}>
          {SESSION_STATUS_LABEL[d.status as keyof typeof SESSION_STATUS_LABEL] ?? d.status}
        </span>
        {d.items > 0 && <span className="unode__chip">{d.items} 条目</span>}
        {d.doubts > 0 && <span className="unode__chip unode__chip--warn">{d.doubts} 疑点</span>}
        {d.retests > 0 && <span className="unode__chip unode__chip--retest">{d.retests} 待复测</span>}
      </div>
      <Handle type="source" position={Position.Right} className="unode__handle" />
    </div>
  )
}

function ChapterNode({ data }: NodeProps<Node<ChapterNodeData>>) {
  return (
    <div className="cnode">
      <div className="cnode__name">{data.name}</div>
      <div className="cnode__count">{data.count} 个单元</div>
    </div>
  )
}

const NODE_TYPES = { unit: UnitNode, chapter: ChapterNode }

export function CanvasPage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const db = getDb()

  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const chapters = useLiveQuery(
    () => db.chapters.where('project_id').equals(projectId).sortBy('order'),
    [projectId],
  )
  const units = useLiveQuery(() => db.units.where('project_id').equals(projectId).sortBy('order'), [
    projectId,
  ])
  const items = useLiveQuery(() => db.items.where('project_id').equals(projectId).toArray(), [
    projectId,
  ])
  const doubts = useLiveQuery(() => db.doubts.where('project_id').equals(projectId).toArray(), [
    projectId,
  ])
  const retests = useLiveQuery(() => db.retests.where('project_id').equals(projectId).toArray(), [
    projectId,
  ])
  const sessions = useLiveQuery(() => db.sessions.where('project_id').equals(projectId).toArray(), [
    projectId,
  ])
  const links = useLiveQuery(() => db.unit_links.where('project_id').equals(projectId).toArray(), [
    projectId,
  ])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const openUnit = useCallback(
    (unitId: string) => navigate(`/p/${projectId}/u/${unitId}`),
    [navigate, projectId],
  )

  const built = useMemo(() => {
    if (!chapters || !units) return { nodes: [] as Node[], edges: [] as Edge[] }
    const n: Node[] = []
    const e: Edge[] = []
    const colW = 330
    const rowH = 168

    chapters.forEach((ch, ci) => {
      const chUnits = units.filter((u) => u.chapter_id === ch.id)
      const x = ci * colW

      n.push({
        id: `ch_${ch.id}`,
        type: 'chapter',
        position: { x, y: -30 },
        data: { name: ch.name, count: chUnits.length } as ChapterNodeData,
        draggable: false,
        selectable: false,
        style: { width: 280 },
      })

      chUnits.forEach((u, ui) => {
        const uItems = items?.filter((i) => i.unit_id === u.id) ?? []
        const uDoubts = doubts?.filter((d) => d.unit_id === u.id) ?? []
        const uRetests =
          retests?.filter((r) => r.unit_id === u.id && r.status === 'scheduled') ?? []
        n.push({
          id: `un_${u.id}`,
          type: 'unit',
          position: { x: x + 20, y: ui * rowH + 30 },
          data: {
            unitId: u.id,
            title: u.title,
            status: u.status,
            doubts: uDoubts.length,
            retests: uRetests.length,
            items: uItems.length,
            chapter: ch.name,
            onOpen: openUnit,
          } as UnitNodeData,
        })
        if (ui > 0) {
          e.push({
            id: `flow_${chUnits[ui - 1].id}_${u.id}`,
            source: `un_${chUnits[ui - 1].id}`,
            target: `un_${u.id}`,
            type: 'smoothstep',
            animated: false,
            label: '下一步',
            className: 'edge-flow',
          })
        }
      })
    })

    for (const l of links ?? []) {
      e.push({
        id: `kn_${l.id}`,
        source: `un_${l.from_unit}`,
        target: `un_${l.to_unit}`,
        type: 'smoothstep',
        label: l.label || '知识关联',
        className: 'edge-knowledge',
      })
    }

    return { nodes: n, edges: e }
  }, [chapters, units, items, doubts, retests, links, openUnit])

  useEffect(() => {
    setNodes(built.nodes)
    setEdges(built.edges)
  }, [built, setNodes, setEdges])

  const activeSession = sessions?.find((s) => s.status === 'in_progress' || s.status === 'paused')

  const addLink = async () => {
    const list = units ?? []
    if (list.length < 2) return
    const from = list[0]
    const to = list[list.length - 1]
    await db.unit_links.add({
      id: newId('ul_'),
      project_id: projectId,
      from_unit: from.id,
      to_unit: to.id,
      kind: 'knowledge',
      label: '知识关联',
      created_at: Date.now(),
    })
  }

  if (!project) return <div className="stage" />

  return (
    <main className="stage stage--flush">
      <div className="canvas">
        <div className="canvas__bar">
          <button className="linkbtn" onClick={() => navigate('/')}>
            ← 书架
          </button>
          <div className="canvas__title">
            <h1>{project.name}</h1>
            <span>{project.subtitle}</span>
          </div>
          <div className="canvas__spacer" />
          {activeSession && (
            <button
              className="btn btn--primary btn--sm"
              onClick={() => navigate(`/p/${projectId}/u/${activeSession.unit_id}`)}
            >
              继续学习
            </button>
          )}
          <button className="btn btn--sm" onClick={addLink}>
            + 知识关联
          </button>
        </div>

        <div className="canvas__legend">
          <span className="lg lg--flow">实线箭头 = 学习顺序</span>
          <span className="lg lg--kn">虚线 = 知识关联</span>
          <span className="lg">单击卡片进入学习单元</span>
        </div>

        <div className="canvas__flow">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.25}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background color="#ffffff10" gap={22} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.type === 'chapter' ? '#3a2c1e' : '#c07b3e')}
              maskColor="rgba(0,0,0,0.55)"
            />
          </ReactFlow>
        </div>
      </div>
    </main>
  )
}
