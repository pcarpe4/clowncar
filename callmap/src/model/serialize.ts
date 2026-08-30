import { tabsToSpaces } from './parse'
import type { CallNode, ParsedLine } from './types'
import { TYPES } from './types'

/**
 * Render a node back to one line of shorthand. `patch` overrides any field,
 * which is how a text edit / type cycle / re-indent is applied: rebuild the
 * single line and splice it back into the buffer.
 */
export function serialize(n: CallNode | ParsedLine, patch: Partial<ParsedLine> = {}): string {
  const m = { ...n, ...patch }
  return (
    ' '.repeat(Math.max(0, m.depth) * 2) +
    TYPES[m.type].prefix +
    (m.text || '') +
    (m.owner ? ' #' + m.owner : '') +
    (m.date ? ' @' + m.date : '')
  )
}

/** Re-indent a raw line by `delta` levels (2 spaces each). Never goes below 0. */
export function shiftIndent(line: string, delta: number): string {
  const s = tabsToSpaces(line)
  if (delta >= 0) return ' '.repeat(delta * 2) + s
  const cur = /^ */.exec(s)![0].length
  return s.slice(Math.min(cur, -delta * 2))
}
