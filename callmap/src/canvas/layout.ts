import dagre from 'dagre'
import type { XY } from '../model/project'
import type { Tile, TileModel } from '../model/tiles'

export const NODE_W = 236
/** A tile showing only its own line. */
export const NODE_H = 78
/** Each answer merged into a question tile adds this much. */
export const ANSWER_H = 44

const GAP_X = 26
const GAP_Y = 54

/** Reserved graph key for the aggregate actions card, which has no source line. */
export const ACTIONS_KEY = 'actions'

export const tileHeight = (tile: Tile): number => NODE_H + tile.absorbed.length * ANSWER_H

// --- the aggregate actions card ---------------------------------------
export const ACTIONS_W = 262
const ACTIONS_HEADER_H = 40
const ACTIONS_ROW_H = 38
const ACTIONS_FOOTER_H = 10
/** Beyond this the card would tower over the map; the rest becomes a "+N more" line. */
export const ACTIONS_MAX_ROWS = 9

export const actionsHeight = (count: number): number =>
  ACTIONS_HEADER_H +
  Math.min(count, ACTIONS_MAX_ROWS) * ACTIONS_ROW_H +
  (count > ACTIONS_MAX_ROWS ? 22 : 0) +
  ACTIONS_FOOTER_H

export const ACTIONS_HEADER = ACTIONS_HEADER_H
export const ACTIONS_ROW = ACTIONS_ROW_H

export interface Extra {
  id: string
  width: number
  height: number
}

/**
 * Top-to-bottom auto-layout. dagre reports node centres; React Flow positions
 * from the top-left corner, so every result is shifted by half the card.
 *
 * `hidden` holds tiles folded away behind a collapsed parent. They are left out
 * of the graph entirely rather than laid out and then not drawn, so the visible
 * cards close up the space instead of leaving a hole where a subtree was.
 *
 * `extras` are cards with no line in the notes — the aggregate actions tile.
 * They join the graph unconnected, which dagre places beside the tree rather
 * than inside it.
 */
export function layoutTiles(
  tileModel: TileModel,
  hidden: ReadonlySet<number> = new Set(),
  extras: readonly Extra[] = [],
): Record<string, XY> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: GAP_X, ranksep: GAP_Y, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const tile of tileModel.tiles) {
    if (hidden.has(tile.id)) continue
    g.setNode(String(tile.id), { width: NODE_W, height: tileHeight(tile) })
  }
  for (const extra of extras) {
    g.setNode(extra.id, { width: extra.width, height: extra.height })
  }
  for (const edge of tileModel.edges) {
    if (hidden.has(edge.source) || hidden.has(edge.target)) continue
    g.setEdge(String(edge.source), String(edge.target))
  }

  dagre.layout(g)

  const positions: Record<string, XY> = {}
  const place = (key: string, width: number, height: number) => {
    const laid = g.node(key)
    if (laid) positions[key] = { x: laid.x - width / 2, y: laid.y - height / 2 }
  }

  for (const tile of tileModel.tiles) {
    if (hidden.has(tile.id)) continue
    place(String(tile.id), NODE_W, tileHeight(tile))
  }
  for (const extra of extras) place(extra.id, extra.width, extra.height)

  return positions
}
