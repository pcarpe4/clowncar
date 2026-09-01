import { isDescendant } from './parse'
import { serialize, shiftIndent } from './serialize'
import type { Model, NodeType } from './types'
import { CYCLE, TYPES } from './types'

/**
 * Every graphical edit is a pure text transform: lines in, lines out. The notes
 * buffer stays the single source of truth and the diagram is re-derived from it.
 *
 * `structural` reports whether the line count changed. Callers use it to decide
 * whether hand-positioned cards must be dropped — node ids are line indices, so
 * inserting or removing a line reassigns the ids beneath it.
 */
export interface EditResult {
  text: string
  structural: boolean
  /** Line index worth selecting after the edit, when the edit creates one. */
  focus?: number
}

/** Replace a node's text, preserving its type, owner, date and indent. */
export function setNodeText(text: string, model: Model, id: number, next: string): EditResult | null {
  const n = model.byId.get(id)
  if (!n) return null
  const lines = text.split('\n')
  lines[id] = serialize(n, { text: next.trim() })
  return { text: lines.join('\n'), structural: false }
}

/** Advance a node to the next type in the glyph cycle. */
export function cycleType(text: string, model: Model, id: number): EditResult | null {
  const n = model.byId.get(id)
  if (!n) return null
  const next = CYCLE[(CYCLE.indexOf(n.type) + 1) % CYCLE.length]!
  const lines = text.split('\n')
  lines[id] = serialize(n, { type: next })
  return { text: lines.join('\n'), structural: false }
}

/** Insert an empty node of `type` as the last child of `parentId` (-1 = root). */
export function addChild(text: string, model: Model, parentId: number, type: NodeType): EditResult | null {
  const lines = text.split('\n')
  const parent = parentId === -1 ? model.root : model.byId.get(parentId)
  if (!parent) return null
  const at = parent.id === -1 ? lines.length : parent.end + 1
  lines.splice(at, 0, ' '.repeat((parent.depth + 1) * 2) + TYPES[type].prefix)
  return { text: lines.join('\n'), structural: true, focus: at }
}

/** Remove a node and everything nested under it. */
export function deleteNode(text: string, model: Model, id: number): EditResult | null {
  const n = model.byId.get(id)
  if (!n) return null
  const lines = text.split('\n')
  lines.splice(n.line, n.end - n.line + 1)
  return { text: lines.join('\n'), structural: true }
}

/**
 * Move a node's whole subtree to become the last child of `targetId`,
 * re-indented to sit one level beneath it.
 *
 * The insertion index compensates for the removal: once the block is cut, every
 * line after it shifts up by `block.length`. `t.end >= n.end` covers both cases
 * that need that correction — the target sitting after the block, and the target
 * being an ancestor of the moved node (an ancestor's `end` always spans it).
 *
 * Returns null for the moves that make no sense: onto itself, or onto one of
 * its own descendants.
 */
export function reparent(text: string, model: Model, id: number, targetId: number): EditResult | null {
  const n = model.byId.get(id)
  const t = model.byId.get(targetId)
  if (!n || !t || n === t || isDescendant(t, n)) return null

  const lines = text.split('\n')
  const block = lines.slice(n.line, n.end + 1)
  const moved = block.map((l) => shiftIndent(l, t.depth + 1 - n.depth))
  const rest = [...lines.slice(0, n.line), ...lines.slice(n.end + 1)]

  let at = t.end + 1
  if (t.end >= n.end) at -= block.length
  rest.splice(at, 0, ...moved)

  return { text: rest.join('\n'), structural: true }
}

/** Tick a follow-up off, or un-tick it. */
export function toggleDone(text: string, model: Model, id: number): EditResult | null {
  const n = model.byId.get(id)
  if (!n) return null
  const lines = text.split('\n')
  lines[id] = serialize(n, { done: !n.done })
  return { text: lines.join('\n'), structural: false }
}
