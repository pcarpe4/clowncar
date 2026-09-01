import { describe, expect, it } from 'vitest'
import { collapseUnchanged, diffLines, summarize } from './diff'

const kinds = (a: string, b: string) => diffLines(a, b).map((r) => r.kind)

describe('diffLines', () => {
  it('marks every row same for identical text', () => {
    expect(kinds('a\nb\nc', 'a\nb\nc')).toEqual(['same', 'same', 'same'])
  })

  it('reports a replaced line as a delete followed by an add', () => {
    expect(kinds('a\nb\nc', 'a\nx\nc')).toEqual(['same', 'del', 'add', 'same'])
  })

  it('reports a pure insertion', () => {
    expect(kinds('a\nc', 'a\nb\nc')).toEqual(['same', 'add', 'same'])
  })

  it('reports a pure deletion', () => {
    expect(kinds('a\nb\nc', 'a\nc')).toEqual(['same', 'del', 'same'])
  })

  it('handles an empty side', () => {
    expect(kinds('', 'a\nb')).toEqual(['add', 'add'])
    expect(kinds('a\nb', '')).toEqual(['del', 'del'])
    expect(kinds('a\nb', 'a')).toEqual(['same', 'del'])
  })

  it('carries the source line numbers on each side', () => {
    const rows = diffLines('a\nb\nc', 'a\nx\nc')
    expect(rows[0]).toMatchObject({ left: 0, right: 0 })
    expect(rows[1]).toMatchObject({ kind: 'del', left: 1, right: null })
    expect(rows[2]).toMatchObject({ kind: 'add', left: null, right: 1 })
    expect(rows[3]).toMatchObject({ left: 2, right: 2 })
  })

  it('finds the minimal edit rather than rewriting the tail', () => {
    // Inserting one line near the top must not mark everything below it changed.
    const before = 'a\nb\nc\nd\ne'
    const after = 'a\nNEW\nb\nc\nd\ne'
    const rows = diffLines(before, after)
    expect(rows.filter((r) => r.kind !== 'same')).toHaveLength(1)
    expect(rows.find((r) => r.kind === 'add')!.text).toBe('NEW')
  })
})

describe('summarize', () => {
  it('counts adds and removes', () => {
    expect(summarize(diffLines('a\nb', 'a\nx\ny'))).toEqual({
      added: 2,
      removed: 1,
      identical: false,
    })
  })

  it('reports identical text', () => {
    expect(summarize(diffLines('a\nb', 'a\nb')).identical).toBe(true)
  })

  it('ignores whitespace-only lines in the counts', () => {
    expect(summarize(diffLines('a', 'a\n\n   ')).added).toBe(0)
  })
})

describe('collapseUnchanged', () => {
  const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
  const edited = long.replace('line 10', 'line TEN')

  it('keeps the changed rows and a little context, and gaps the rest', () => {
    const out = collapseUnchanged(diffLines(long, edited), 2)
    const shown = out.filter((r): r is NonNullable<typeof r> => r !== null)
    expect(shown.some((r) => r.text === 'line TEN')).toBe(true)
    expect(shown.some((r) => r.text === 'line 10')).toBe(true)
    // 2 context either side, plus the del/add pair.
    expect(shown).toHaveLength(6)
    expect(out.filter((r) => r === null)).toHaveLength(2)
  })

  it('collapses an unchanged file to a single gap', () => {
    const out = collapseUnchanged(diffLines(long, long), 2)
    expect(out).toEqual([null])
  })
})
