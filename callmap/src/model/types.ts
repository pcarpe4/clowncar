export type NodeType =
  | 'question'
  | 'answer'
  | 'decision'
  | 'action'
  | 'risk'
  | 'idea'
  | 'topic'
  | 'note'

export interface TypeSpec {
  label: string
  glyph: string
  prefix: string
  color: string
  /** Tailwind theme token suffix — `bg-q`, `text-q`, etc. */
  token: string
  /** Shown in the notes-pane legend. */
  hint: string
}

/**
 * Ordered as the type-glyph cycles when clicked.
 *
 * `question` stays first and `note` stays last: the cycle is the only way to
 * change a type by mouse, and those two are the ends people reach for.
 */
export const CYCLE: readonly NodeType[] = [
  'question',
  'answer',
  'decision',
  'action',
  'risk',
  'idea',
  'topic',
  'note',
]

export const TYPES: Record<NodeType, TypeSpec> = {
  question: {
    label: 'Question',
    glyph: 'Q',
    prefix: 'Q: ',
    color: '#3B5BDB',
    token: 'q',
    hint: 'Q:',
  },
  answer: {
    label: 'Answer',
    glyph: 'A',
    prefix: 'A: ',
    color: '#12876F',
    token: 'a',
    hint: 'A:',
  },
  decision: {
    label: 'Decision',
    glyph: 'D',
    prefix: 'D: ',
    color: '#7C3AED',
    token: 'd',
    hint: 'D:',
  },
  action: {
    label: 'Follow-up',
    glyph: '→',
    prefix: '> ',
    color: '#E8590C',
    token: 'f',
    hint: '>',
  },
  risk: {
    label: 'Risk',
    glyph: '!',
    prefix: '!! ',
    color: '#DC2626',
    token: 'r',
    hint: '!!',
  },
  idea: {
    label: 'Idea',
    glyph: '~',
    prefix: '~ ',
    color: '#CA8A04',
    token: 'i',
    hint: '~',
  },
  topic: {
    label: 'Topic',
    glyph: '§',
    prefix: '# ',
    color: '#475569',
    token: 't',
    hint: '#',
  },
  note: {
    label: 'Note',
    glyph: '·',
    prefix: '',
    color: '#6B7280',
    token: 'muted',
    hint: '',
  },
}

/** Types that represent outstanding work, for the header counters. */
export const OPEN_WORK: readonly NodeType[] = ['action', 'risk']

/** The fields `parseLine` can recover from a single line of shorthand. */
export interface ParsedLine {
  depth: number
  type: NodeType
  text: string
  owner: string | null
  /** The date exactly as typed, so serializing round-trips it untouched. */
  date: string | null
  /** Ticked off. Written as `[x]` straight after the type prefix. */
  done: boolean
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
  /** Questions only: true when no direct child is an answer or decision. */
  open?: boolean
  /** `date` resolved to a real calendar day, when it could be understood. */
  due?: import('./dates').ResolvedDate | null
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
