import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { todayIso } from '../model/dates'
import { actions as allActions } from '../model/derive'
import { reparent } from '../model/edits'
import { isDescendant } from '../model/parse'
import type { XY } from '../model/project'
import { buildTiles, tileDescendants } from '../model/tiles'
import type { Model } from '../model/types'
import { TYPES } from '../model/types'
import { useActiveMeeting, useCallmap, useText } from '../store/useCallmap'
import { ActionsCard, type ActionsFlowNode } from './ActionsCard'
import { ActionsPanel } from './ActionsPanel'
import { CardNode, type CardFlowNode } from './CardNode'
import { ACTIONS_KEY, ACTIONS_W, NODE_W, actionsHeight, layoutTiles, tileHeight } from './layout'

const nodeTypes = { card: CardNode, actions: ActionsCard }

type FlowNode = CardFlowNode | ActionsFlowNode

/** Stable identity, so a meeting with no dragged cards does not re-render on every store write. */
const EMPTY_POSITIONS: Record<number, XY> = {}

/**
 * Where a dragged actions card is remembered. Real tiles are keyed by line
 * index, so a negative key can never collide with one.
 */
const ACTIONS_POS_KEY = -2

export function Canvas({ model }: { model: Model }) {
  const text = useText()
  const meeting = useActiveMeeting()
  const manualPositions = meeting?.manualPositions ?? EMPTY_POSITIONS
  const selectedId = useCallmap((s) => s.selectedId)
  const select = useCallmap((s) => s.select)
  const setEditing = useCallmap((s) => s.setEditing)
  const setPosition = useCallmap((s) => s.setPosition)
  const edit = useCallmap((s) => s.edit)
  const showActionsCard = useCallmap((s) => s.showActionsCard)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)
  const { fitView } = useReactFlow()

  const today = todayIso()
  const tiles = useMemo(() => buildTiles(model), [model])
  const actionItems = useMemo(() => allActions(model), [model])

  // Join to a primitive so the memos below do not re-run on every store write.
  const collapsedKey = (meeting?.collapsed ?? []).join(',')

  const collapsed = useMemo(
    () => new Set(collapsedKey ? collapsedKey.split(',').map(Number) : []),
    [collapsedKey],
  )

  /** Everything folded away behind a collapsed ancestor. */
  const hidden = useMemo(() => {
    const out = new Set<number>()
    for (const id of collapsed) {
      if (!tiles.byId.has(id)) continue
      for (const d of tileDescendants(tiles, id)) out.add(d)
    }
    return out
  }, [collapsed, tiles])

  const withActionsCard = showActionsCard && actionItems.length > 0

  // dagre parks the actions card beside the tree, which can be well outside the
  // current viewport. Reframe when it appears so it is not summoned off-screen.
  useEffect(() => {
    if (!withActionsCard) return
    const id = requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 }))
    return () => cancelAnimationFrame(id)
  }, [withActionsCard, fitView])

  const auto = useMemo(
    () =>
      layoutTiles(
        tiles,
        hidden,
        withActionsCard
          ? [{ id: ACTIONS_KEY, width: ACTIONS_W, height: actionsHeight(actionItems.length) }]
          : [],
      ),
    [tiles, hidden, withActionsCard, actionItems.length],
  )

  // Rebuild whenever the notes change or hand-positions are cleared. Card
  // content always comes from the parse, so it can never drift from the text.
  useEffect(() => {
    const cards: FlowNode[] = tiles.tiles
      .filter((tile) => !hidden.has(tile.id))
      .map((tile) => ({
        id: String(tile.id),
        type: 'card' as const,
        position: manualPositions[tile.id] ?? auto[String(tile.id)] ?? { x: 0, y: 0 },
        data: {
          tile,
          isDropTarget: false,
          collapsed: collapsed.has(tile.id),
          descendantCount: tileDescendants(tiles, tile.id).length,
        },
        draggable: true,
      }))

    if (withActionsCard) {
      cards.push({
        id: ACTIONS_KEY,
        type: 'actions' as const,
        position: manualPositions[ACTIONS_POS_KEY] ?? auto[ACTIONS_KEY] ?? { x: 0, y: 0 },
        data: { items: actionItems, today },
        draggable: true,
      })
    }

    setRfNodes(cards)
  }, [
    tiles,
    auto,
    manualPositions,
    hidden,
    collapsed,
    withActionsCard,
    actionItems,
    today,
    setRfNodes,
  ])

  // Highlight the hovered drop target without disturbing live drag positions.
  useEffect(() => {
    setRfNodes((ns) =>
      ns.map((n) => {
        if (n.type !== 'card') return n
        const should = Number(n.id) === dropTargetId
        return n.data.isDropTarget === should ? n : { ...n, data: { ...n.data, isDropTarget: should } }
      }),
    )
  }, [dropTargetId, setRfNodes])

  const edges: Edge[] = useMemo(
    () =>
      tiles.edges
        .filter((e) => !hidden.has(e.source) && !hidden.has(e.target))
        .map((e) => ({
          id: `e${e.source}-${e.target}`,
          source: String(e.source),
          target: String(e.target),
          type: 'smoothstep',
          style: { stroke: TYPES[e.type].color, strokeOpacity: 0.45, strokeWidth: 2 },
        })),
    [tiles, hidden],
  )

  /**
   * Which card is the dragged card's centre sitting inside? Descendants are
   * skipped — a node cannot become a child of its own subtree — and so is the
   * actions card, which is not part of the tree at all.
   */
  const findDropTarget = useCallback(
    (draggedId: number, x: number, y: number): number | null => {
      const dragged = model.byId.get(draggedId)
      if (!dragged) return null
      const draggedTile = tiles.byId.get(draggedId)
      const cx = x + NODE_W / 2
      const cy = y + (draggedTile ? tileHeight(draggedTile) : 0) / 2

      for (const candidate of rfNodes) {
        if (candidate.type !== 'card') continue
        const id = Number(candidate.id)
        if (id === draggedId) continue
        const node = model.byId.get(id)
        if (!node || isDescendant(node, dragged)) continue
        const { x: px, y: py } = candidate.position
        const h = tileHeight(candidate.data.tile)
        if (cx >= px && cx <= px + NODE_W && cy >= py && cy <= py + h) return id
      }
      return null
    },
    [model, rfNodes, tiles],
  )

  const onNodeDrag: OnNodeDrag<FlowNode> = useCallback(
    (_, node) => {
      if (node.type !== 'card') return
      setDropTargetId(findDropTarget(Number(node.id), node.position.x, node.position.y))
    },
    [findDropTarget],
  )

  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (_, node) => {
      if (node.id === ACTIONS_KEY) {
        setPosition(ACTIONS_POS_KEY, node.position)
        return
      }
      const id = Number(node.id)
      const target = dropTargetId
      setDropTargetId(null)
      if (target !== null) {
        edit((t, m) => reparent(t, m, id, target))
        select(null)
      } else {
        setPosition(id, node.position)
      }
    },
    [dropTargetId, edit, select, setPosition],
  )

  const onNodeClick: NodeMouseHandler<FlowNode> = useCallback(
    (_, node) => {
      if (node.type !== 'card') return
      const id = Number(node.id)
      if (selectedId === id) setEditing(id)
      else select(id)
    },
    [select, selectedId, setEditing],
  )

  const onNodeDoubleClick: NodeMouseHandler<FlowNode> = useCallback(
    (_, node) => {
      if (node.type === 'card') setEditing(Number(node.id))
    },
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
          nodeColor={(n) =>
            n.type === 'actions' ? TYPES.action.color : TYPES[(n.data as CardFlowNode['data']).tile.node.type].color
          }
          nodeStrokeWidth={0}
          maskColor="rgba(238,241,245,.7)"
        />
      </ReactFlow>

      <ActionsPanel items={actionItems} today={today} />

      {model.byId.size === 0 && <EmptyState text={text} />}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
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
