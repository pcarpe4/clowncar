import type { CallNode, Model, NodeType } from './types'

/**
 * The tile projection.
 *
 * A question and the answer that settles it are one thought, so they are drawn
 * as one card. This module is the only place that decision lives: it turns the
 * parsed tree into the set of *tiles* the canvas draws, and reroutes the edges
 * so a child of an absorbed answer hangs off the tile that swallowed it.
 *
 * Nothing here touches the notes buffer. Absorbing is purely a matter of how
 * the tree is drawn — the text, the node ids and every other view are untouched.
 */

/** Direct children of a question that resolve it, and so merge into its card. */
const ABSORBED: readonly NodeType[] = ['answer', 'decision']

export interface Tile {
  /** The primary node's id. Tile ids and node ids share one space. */
  id: number
  node: CallNode
  /** Answers and decisions drawn inside this tile, in document order. */
  absorbed: CallNode[]
}

export interface TileEdge {
  source: number
  target: number
  /** The target's type, which colours the edge. */
  type: NodeType
}

export interface TileModel {
  tiles: Tile[]
  byId: Map<number, Tile>
  /** Any node id → the id of the tile that draws it. */
  tileOf: Map<number, number>
  edges: TileEdge[]
}

/** True when `n` is drawn inside its parent's card rather than getting its own. */
export function isAbsorbed(n: CallNode): boolean {
  return ABSORBED.includes(n.type) && n.parent.id !== -1 && n.parent.type === 'question'
}

export function buildTiles(model: Model): TileModel {
  const nodes = [...model.byId.values()].sort((a, b) => a.id - b.id)

  const tiles: Tile[] = []
  const byId = new Map<number, Tile>()
  const tileOf = new Map<number, number>()

  for (const node of nodes) {
    if (isAbsorbed(node)) continue
    const tile: Tile = {
      id: node.id,
      node,
      absorbed: node.type === 'question' ? node.children.filter(isAbsorbed) : [],
    }
    tiles.push(tile)
    byId.set(tile.id, tile)
    tileOf.set(node.id, tile.id)
    for (const a of tile.absorbed) tileOf.set(a.id, tile.id)
  }

  // An absorbed node keeps its own children; they attach to the tile that ate it.
  const edges: TileEdge[] = []
  for (const node of nodes) {
    if (isAbsorbed(node) || node.parent.id === -1) continue
    const source = tileOf.get(node.parent.id)
    if (source === undefined || source === node.id) continue
    edges.push({ source, target: node.id, type: node.type })
  }

  return { tiles, byId, tileOf, edges }
}

/**
 * Ids of everything drawn *below* a tile — its descendants minus the answers it
 * already displays. This is what a collapsed tile hides.
 */
export function tileDescendants(tileModel: TileModel, id: number): number[] {
  const tile = tileModel.byId.get(id)
  if (!tile) return []

  const out: number[] = []
  const visit = (n: CallNode) => {
    for (const child of n.children) {
      if (!isAbsorbed(child)) out.push(child.id)
      visit(child)
    }
  }
  visit(tile.node)
  // Children of an absorbed answer are reached through the answer itself.
  return out
}
