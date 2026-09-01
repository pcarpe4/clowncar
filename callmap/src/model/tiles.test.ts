import { describe, expect, it } from 'vitest'
import { parseText } from './parse'
import { buildTiles, isAbsorbed, tileDescendants } from './tiles'

const tiles = (text: string) => buildTiles(parseText(text))

describe('buildTiles — what merges into a question', () => {
  it('draws a question and its answer as one tile', () => {
    const t = tiles('Q: Ship v2?\n  A: Only if QA signs off')
    expect(t.tiles).toHaveLength(1)
    expect(t.tiles[0]!.node.text).toBe('Ship v2?')
    expect(t.tiles[0]!.absorbed.map((n) => n.text)).toEqual(['Only if QA signs off'])
  })

  it('absorbs a decision too', () => {
    const t = tiles('Q: Ship v2?\n  D: Yes, behind a flag')
    expect(t.tiles).toHaveLength(1)
    expect(t.tiles[0]!.absorbed.map((n) => n.type)).toEqual(['decision'])
  })

  it('absorbs several answers in document order', () => {
    const t = tiles('Q: Ship v2?\n  A: first\n  D: then decided')
    expect(t.tiles).toHaveLength(1)
    expect(t.tiles[0]!.absorbed.map((n) => n.text)).toEqual(['first', 'then decided'])
  })

  it('leaves follow-ups, risks and nested questions as their own tiles', () => {
    const t = tiles('Q: Ship v2?\n  A: yes\n  > Confirm QA\n  !! payments untested\n  Q: fallback?')
    expect(t.tiles.map((x) => x.node.type)).toEqual(['question', 'action', 'risk', 'question'])
  })

  it('does not absorb an answer whose parent is not a question', () => {
    const t = tiles('> Confirm QA\n  A: stray answer')
    expect(t.tiles).toHaveLength(2)
    expect(t.tiles[1]!.node.type).toBe('answer')
  })

  it('does not absorb a top-level answer', () => {
    const t = tiles('A: an orphan answer')
    expect(t.tiles).toHaveLength(1)
    expect(t.tiles[0]!.absorbed).toEqual([])
  })

  it('does not absorb an answer nested two levels down', () => {
    const t = tiles('Q: outer\n  > step\n    A: buried')
    expect(t.tiles.map((x) => x.node.type)).toEqual(['question', 'action', 'answer'])
  })
})

describe('buildTiles — edges', () => {
  it('hangs a follow-up off the question that owns it', () => {
    const t = tiles('Q: Ship v2?\n  A: yes\n  > Confirm QA')
    expect(t.edges).toEqual([{ source: 0, target: 2, type: 'action' }])
  })

  it('reroutes a child of an absorbed answer onto the merged tile', () => {
    // `> Confirm` is a child of the answer, but the answer has no card of its own.
    const t = tiles('Q: Ship v2?\n  A: yes\n    > Confirm QA')
    expect(t.edges).toEqual([{ source: 0, target: 2, type: 'action' }])
  })

  it('never emits an edge from a tile to itself', () => {
    const t = tiles('Q: Ship v2?\n  A: yes')
    expect(t.edges).toEqual([])
  })

  it('leaves root tiles unconnected', () => {
    const t = tiles('Q: one?\nQ: two?')
    expect(t.edges).toEqual([])
    expect(t.tiles).toHaveLength(2)
  })

  it('chains through several levels', () => {
    const t = tiles('# Topic\n  Q: Ship?\n    A: yes\n      > Confirm')
    expect(t.edges).toEqual([
      { source: 0, target: 1, type: 'question' },
      { source: 1, target: 3, type: 'action' },
    ])
  })
})

describe('tileOf', () => {
  it('maps an absorbed answer to the tile that draws it', () => {
    const t = tiles('Q: Ship v2?\n  A: yes')
    expect(t.tileOf.get(1)).toBe(0)
    expect(t.tileOf.get(0)).toBe(0)
  })
})

describe('isAbsorbed', () => {
  it('is true only for an answer or decision directly under a question', () => {
    const m = parseText('Q: Ship?\n  A: yes\n  > act\nA: orphan')
    expect(isAbsorbed(m.byId.get(1)!)).toBe(true)
    expect(isAbsorbed(m.byId.get(2)!)).toBe(false)
    expect(isAbsorbed(m.byId.get(3)!)).toBe(false)
  })
})

describe('tileDescendants', () => {
  it('counts what a collapsed tile would hide, excluding what it already shows', () => {
    const t = tiles('Q: Ship v2?\n  A: yes\n    > Confirm QA\n  > Other work')
    expect(tileDescendants(t, 0)).toEqual([2, 3])
  })

  it('is empty for a leaf tile', () => {
    const t = tiles('Q: Ship v2?\n  A: yes')
    expect(tileDescendants(t, 0)).toEqual([])
  })
})

describe('the [x] done marker', () => {
  it('reads a ticked follow-up', () => {
    const m = parseText('> [x] Confirm QA #Dave')
    expect(m.byId.get(0)!).toMatchObject({ done: true, text: 'Confirm QA', owner: 'Dave' })
  })

  it('reads an explicit empty box as not done', () => {
    expect(parseText('> [ ] Confirm QA').byId.get(0)!.done).toBe(false)
  })

  it('defaults to not done', () => {
    expect(parseText('> Confirm QA').byId.get(0)!.done).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(parseText('> [X] Confirm QA').byId.get(0)!.done).toBe(true)
  })

  it('still finds the owner and date after the marker', () => {
    expect(parseText('> [x] Confirm QA #Dave @Sep 3').byId.get(0)!).toMatchObject({
      done: true,
      owner: 'Dave',
      date: 'Sep 3',
    })
  })

  it('does not treat a bracket mid-line as a marker', () => {
    expect(parseText('> Confirm [x] the QA timeline').byId.get(0)!).toMatchObject({
      done: false,
      text: 'Confirm [x] the QA timeline',
    })
  })
})
