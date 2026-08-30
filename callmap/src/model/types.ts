export type NodeType = 'question' | 'answer' | 'action' | 'note'

export interface TypeSpec {
  label: string
  glyph: string
  prefix: string
  color: string
}

/** Ordered as the type-glyph cycles when clicked. */
export const CYCLE: readonly NodeType[] = ['question', 'answer', 'action', 'note']

export const TYPES: Record<NodeType, TypeSpec> = {
  question: { label: 'Question', glyph: 'Q', prefix: 'Q: ', color: '#3B5BDB' },
  answer: { label: 'Answer', glyph: 'A', prefix: 'A: ', color: '#12876F' },
  action: { label: 'Follow-up', glyph: '→', prefix: '> ', color: '#E8590C' },
  note: { label: 'Note', glyph: '·', prefix: '', color: '#6B7280' },
}

/** The fields `parseLine` can recover from a single line of shorthand. */
export interface ParsedLine {
  depth: number
  type: NodeType
  text: string
  owner: string | null
  date: string | null
}

/**
 * A node in the parsed tree. `id` and `line` are both the 0-based index of the
 * source line, so a node id is always addressable back into the notes text.
 */
export interface CallNode extends ParsedLine {
  id: number
  line: number
  /** Last source line covered by this node's subtree, inclusive. */
  end: number
  children: CallNode[]
  parent: CallNode | RootNode
  /** Questions only: true when no direct child is an answer. */
  open?: boolean
}

/** Synthetic parent of every top-level node. Never rendered. */
export interface RootNode {
  id: -1
  line: -1
  depth: -1
  type: 'root'
  text: ''
  end: number
  children: CallNode[]
  parent: null
}

export interface Model {
  root: RootNode
  byId: Map<number, CallNode>
}

export function isRoot(n: CallNode | RootNode): n is RootNode {
  return n.id === -1
}
