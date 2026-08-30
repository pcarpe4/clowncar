import dagre from 'dagre'
import type { Model } from '../model/types'
import type { XY } from '../store/useCallmap'

export const NODE_W = 212
export const NODE_H = 78
const GAP_X = 26
const GAP_Y = 54

/**
 * Top-to-bottom auto-layout. dagre reports node centres; React Flow positions
 * from the top-left corner, so every result is shifted by half the card.
 *
 * Multiple roots are fine — dagre lays out disconnected components side by side.
 */
export function layoutTree(model: Model): Record<number, XY> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: GAP_X, ranksep: GAP_Y, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of model.byId.values()) {
    g.setNode(String(node.id), { width: NODE_W, height: NODE_H })
  }
  for (const node of model.byId.values()) {
    if (node.parent.id !== -1) g.setEdge(String(node.parent.id), String(node.id))
  }

  dagre.layout(g)

  const positions: Record<number, XY> = {}
  for (const node of model.byId.values()) {
    const laid = g.node(String(node.id))
    if (!laid) continue
    positions[node.id] = { x: laid.x - NODE_W / 2, y: laid.y - NODE_H / 2 }
  }
  return positions
}
