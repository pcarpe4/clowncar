import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { reparent } from '../model/edits'
import { isDescendant, parseText } from '../model/parse'
import type { Model } from '../model/types'
import { TYPES } from '../model/types'
import { useCallmap } from '../store/useCallmap'
import { CardNode, type CardFlowNode } from './CardNode'
import { NODE_H, NODE_W, layoutTree } from './layout'

const nodeTypes = { card: CardNode }

export function Canvas({ model }: { model: Model }) {
  const text = useCallmap((s) => s.text)
  const manualPositions = useCallmap((s) => s.manualPositions)
  const selectedId = useCallmap((s) => s.selectedId)
  const select = useCallmap((s) => s.select)
  const setEditing = useCallmap((s) => s.setEditing)
  const setPosition = useCallmap((s) => s.setPosition)
  const applyEdit = useCallmap((s) => s.applyEdit)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<CardFlowNode>([])
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)

  const auto = useMemo(() => layoutTree(model), [model])

  // Rebuild whenever the notes change or hand-positions are cleared. Card
  // content always comes from the parse, so it can never drift from the text.
  useEffect(() => {
    setRfNodes(
      [...model.byId.values()].map((node) => ({
        id: String(node.id),
        type: 'card' as const,
        position: manualPositions[node.id] ?? auto[node.id] ?? { x: 0, y: 0 },
        data: { node, isDropTarget: false },
        draggable: true,
      })),
    )
  }, [model, auto, manualPositions, setRfNodes])

  // Highlight the hovered drop target without disturbing live drag positions.
  useEffect(() => {
    setRfNodes((ns) =>
      ns.map((n) => {
        const should = Number(n.id) === dropTargetId
        return n.data.isDropTarget === should ? n : { ...n, data: { ...n.data, isDropTarget: should } }
      }),
    )
  }, [dropTargetId, setRfNodes])

  const edges: Edge[] = useMemo(
    () =>
      [...model.byId.values()]
        .filter((n) => n.parent.id !== -1)
        .map((n) => ({
          id: `e${n.parent.id}-${n.id}`,
          source: String(n.parent.id),
          target: String(n.id),
          type: 'smoothstep',
          style: { stroke: TYPES[n.type].color, strokeOpacity: 0.45, strokeWidth: 2 },
        })),
    [model],
  )

  /**
   * Which card is the dragged card's centre sitting inside? Mirrors the
   * prototype's hit test. Descendants are skipped — a node cannot become a
   * child of its own subtree.
   */
  const findDropTarget = useCallback(
    (draggedId: number, x: number, y: number): number | null => {
      const dragged = model.byId.get(draggedId)
      if (!dragged) return null
      const cx = x + NODE_W / 2
      const cy = y + NODE_H / 2
      for (const candidate of rfNodes) {
        const id = Number(candidate.id)
        if (id === draggedId) continue
        const node = model.byId.get(id)
        if (!node || isDescendant(node, dragged)) continue
        const { x: px, y: py } = candidate.position
        if (cx >= px && cx <= px + NODE_W && cy >= py && cy <= py + NODE_H) return id
      }
      return null
    },
    [model, rfNodes],
  )

  const onNodeDrag: OnNodeDrag<CardFlowNode> = useCallback(
    (_, node) => setDropTargetId(findDropTarget(Number(node.id), node.position.x, node.position.y)),
    [findDropTarget],
  )

  const onNodeDragStop: OnNodeDrag<CardFlowNode> = useCallback(
    (_, node) => {
      const id = Number(node.id)
      const target = dropTargetId
      setDropTargetId(null)
      if (target !== null) {
        applyEdit(reparent(text, parseText(text), id, target))
        select(null)
      } else {
        setPosition(id, node.position)
      }
    },
    [applyEdit, dropTargetId, select, setPosition, text],
  )

  const onNodeClick: NodeMouseHandler<CardFlowNode> = useCallback(
    (_, node) => {
      const id = Number(node.id)
      if (selectedId === id) setEditing(id)
      else select(id)
    },
    [select, selectedId, setEditing],
  )

  const onNodeDoubleClick: NodeMouseHandler<CardFlowNode> = useCallback(
    (_, node) => setEditing(Number(node.id)),
    [setEditing],
  )

  return (
    <div className="relative min-h-0 flex-1 bg-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={() => select(null)}
        nodesConnectable={false}
        selectNodesOnDrag={false}
        minZoom={0.2}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#C3CBD6" />
        <MiniMap
          pannable
          zoomable
          className="!hidden sm:!block !rounded-lg !border !border-line !bg-white/80"
          nodeColor={(n) => TYPES[(n.data as CardFlowNode['data']).node.type].color}
          nodeStrokeWidth={0}
          maskColor="rgba(238,241,245,.7)"
        />
      </ReactFlow>

      {model.byId.size === 0 && <EmptyState />}
    </div>
  )
}

function EmptyState() {
  const text = useCallmap((s) => s.text)
  const setText = useCallmap((s) => s.setText)
  const setEditing = useCallmap((s) => s.setEditing)

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto max-w-[300px] rounded-2xl border border-dashed border-line bg-white px-5 py-4 text-center text-[13px] leading-normal text-muted">
        Nothing mapped yet. Start a line in the notes with <b className="text-ink">Q:</b> and the first
        card appears here.
        <br />
        <button
          type="button"
          className="mt-2.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink hover:border-[#AAB4C3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
          onClick={() => {
            const next = text.trim() ? `${text}\nQ: ` : 'Q: '
            setText(next)
            setEditing(next.split('\n').length - 1)
          }}
        >
          Add a question
        </button>
      </div>
    </div>
  )
}
