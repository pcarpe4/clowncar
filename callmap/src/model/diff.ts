/**
 * Line diff between two versions of a notes buffer.
 *
 * Meeting notes are small — hundreds of lines at the very most — so the plain
 * O(n·m) LCS table is the right call here: it gives a minimal, stable diff
 * without the tuning and edge cases a heuristic differ brings.
 */

export type DiffKind = 'same' | 'add' | 'del'

export interface DiffRow {
  kind: DiffKind
  text: string
  /** 0-based line in the old text, when the row exists there. */
  left: number | null
  /** 0-based line in the new text, when the row exists there. */
  right: number | null
}

export interface DiffSummary {
  added: number
  removed: number
  /** True when the two texts are identical. */
  identical: boolean
}

/**
 * An empty buffer is zero lines, not one empty line. Without this, diffing an
 * empty meeting against a written one reports a phantom deleted blank row.
 * A buffer that merely *ends* in a newline still splits faithfully to `['a', '']`.
 */
const splitLines = (s: string): string[] => (s === '' ? [] : s.split('\n'))

/** Longest-common-subsequence table over two arrays of lines. */
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  return table
}

/** Row-by-row diff from `before` to `after`. */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = splitLines(before)
  const b = splitLines(after)
  const table = lcsTable(a, b)

  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i]!, left: i, right: j })
      i++
      j++
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      rows.push({ kind: 'del', text: a[i]!, left: i, right: null })
      i++
    } else {
      rows.push({ kind: 'add', text: b[j]!, left: null, right: j })
      j++
    }
  }
  while (i < a.length) rows.push({ kind: 'del', text: a[i]!, left: i++, right: null })
  while (j < b.length) rows.push({ kind: 'add', text: b[j]!, left: null, right: j++ })

  return rows
}

export function summarize(rows: DiffRow[]): DiffSummary {
  const added = rows.filter((r) => r.kind === 'add' && r.text.trim()).length
  const removed = rows.filter((r) => r.kind === 'del' && r.text.trim()).length
  return { added, removed, identical: added === 0 && removed === 0 }
}

/**
 * Drop long runs of unchanged lines, keeping `context` rows either side of each
 * change. Returns rows interleaved with nulls, which render as a gap marker.
 */
export function collapseUnchanged(rows: DiffRow[], context = 2): (DiffRow | null)[] {
  const keep = new Set<number>()
  rows.forEach((r, i) => {
    if (r.kind === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) {
      keep.add(k)
    }
  })

  const out: (DiffRow | null)[] = []
  let skipping = false
  rows.forEach((r, i) => {
    if (keep.has(i)) {
      out.push(r)
      skipping = false
    } else if (!skipping) {
      out.push(null)
      skipping = true
    }
  })
  return out
}
