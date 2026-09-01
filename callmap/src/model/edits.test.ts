import { describe, expect, it } from 'vitest'
import { parseText } from './parse'
import { serialize, shiftIndent } from './serialize'
import { addChild, cycleType, deleteNode, reparent, setNodeText, toggleDone } from './edits'

const SAMPLE = `Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3
  What's the fallback if QA slips?
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12`

/** Apply an edit to SAMPLE and return the resulting text. */
const edit = (fn: (text: string, model: ReturnType<typeof parseText>) => { text: string } | null) => {
  const result = fn(SAMPLE, parseText(SAMPLE))
  return result?.text ?? null
}

describe('serialize', () => {
  it('round-trips a line through parse and back', () => {
    const line = '    > Confirm QA timeline #Dave @Sep 3'
    expect(serialize(parseText(line).byId.get(0)!)).toBe(line)
  })

  it('writes the indent from the depth', () => {
    expect(serialize({ depth: 2, type: 'note', text: 'x', owner: null, date: null, done: false })).toBe('    x')
  })

  it('writes owner before date', () => {
    expect(serialize({ depth: 0, type: 'action', text: 'go', owner: 'Sam', date: 'Sep 12', done: false })).toBe(
      '> go #Sam @Sep 12',
    )
  })

  it('omits the prefix for a note', () => {
    expect(serialize({ depth: 0, type: 'note', text: 'just a note', owner: null, date: null, done: false })).toBe(
      'just a note',
    )
  })

  it('applies a patch over the node', () => {
    const n = parseText('Q: original').byId.get(0)!
    expect(serialize(n, { text: 'replaced' })).toBe('Q: replaced')
    expect(serialize(n, { type: 'answer' })).toBe('A: original')
  })
})

describe('shiftIndent', () => {
  it('indents by whole levels', () => {
    expect(shiftIndent('a', 1)).toBe('  a')
    expect(shiftIndent('  a', 2)).toBe('      a')
  })

  it('outdents by whole levels', () => {
    expect(shiftIndent('    a', -1)).toBe('  a')
    expect(shiftIndent('    a', -2)).toBe('a')
  })

  it('never outdents past column zero', () => {
    expect(shiftIndent('  a', -5)).toBe('a')
  })

  it('normalises tabs before shifting', () => {
    expect(shiftIndent('\ta', 1)).toBe('    a')
  })
})

describe('setNodeText / cycleType', () => {
  it('replaces the text and keeps type, owner, date and indent', () => {
    const out = edit((t, m) => setNodeText(t, m, 2, 'Confirm QA timeline with the vendor'))
    expect(out!.split('\n')[2]).toBe('    > Confirm QA timeline with the vendor #Dave @Sep 3')
  })

  it('is not a structural edit', () => {
    expect(setNodeText(SAMPLE, parseText(SAMPLE), 2, 'x')!.structural).toBe(false)
  })

  it('advances the type through the cycle', () => {
    const out = edit((t, m) => cycleType(t, m, 0))
    expect(out!.split('\n')[0]).toBe('A: Ship v2 in September?')
  })

  it('wraps note back round to question', () => {
    const m = parseText('a plain note')
    expect(cycleType('a plain note', m, 0)!.text).toBe('Q: a plain note')
  })
})

describe('addChild / deleteNode', () => {
  it('appends a child at the end of the parent subtree', () => {
    const out = edit((t, m) => addChild(t, m, 0, 'action'))
    expect(out!.split('\n')[4]).toBe('  > ')
  })

  it('appends a root node at the end of the buffer', () => {
    const out = edit((t, m) => addChild(t, m, -1, 'question'))
    expect(out!.split('\n')[6]).toBe('Q: ')
  })

  it('reports the new line as the focus target', () => {
    expect(addChild(SAMPLE, parseText(SAMPLE), 0, 'action')!.focus).toBe(4)
  })

  it('deletes the node together with its whole subtree', () => {
    const out = edit((t, m) => deleteNode(t, m, 1))
    expect(out).toBe(`Q: Ship v2 in September?
  What's the fallback if QA slips?
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12`)
  })

  it('marks both as structural', () => {
    expect(addChild(SAMPLE, parseText(SAMPLE), 0, 'note')!.structural).toBe(true)
    expect(deleteNode(SAMPLE, parseText(SAMPLE), 1)!.structural).toBe(true)
  })
})

describe('reparent', () => {
  it('moves a subtree onto a later node', () => {
    // "What's the fallback" (line 3) onto "Who owns launch comms?" (line 4).
    expect(edit((t, m) => reparent(t, m, 3, 4))).toBe(`Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12
  What's the fallback if QA slips?`)
  })

  it('moves a subtree onto an earlier node', () => {
    // "Draft announcement" (line 5) onto the answer at line 1.
    expect(edit((t, m) => reparent(t, m, 5, 1))).toBe(`Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3
    > Draft announcement #Sam @Sep 12
  What's the fallback if QA slips?
Q: Who owns launch comms?`)
  })

  it('moves a subtree onto one of its own ancestors', () => {
    // "Confirm QA timeline" (line 2) up onto the root question at line 0.
    expect(edit((t, m) => reparent(t, m, 2, 0))).toBe(`Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
  What's the fallback if QA slips?
  > Confirm QA timeline #Dave @Sep 3
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12`)
  })

  it('carries the whole subtree, re-indented, not just the dragged line', () => {
    // The answer at line 1 still owns line 2 after moving under line 4.
    const out = edit((t, m) => reparent(t, m, 1, 4))!
    expect(out).toBe(`Q: Ship v2 in September?
  What's the fallback if QA slips?
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3`)
    expect(parseText(out).byId.get(4)!.children.map((n) => n.id)).toEqual([5])
  })

  it('refuses to move a node onto itself', () => {
    expect(edit((t, m) => reparent(t, m, 0, 0))).toBeNull()
  })

  it('refuses to move a node onto its own descendant', () => {
    expect(edit((t, m) => reparent(t, m, 0, 2))).toBeNull()
  })

  it('is a structural edit', () => {
    expect(reparent(SAMPLE, parseText(SAMPLE), 3, 4)!.structural).toBe(true)
  })

  it('keeps the line count unchanged', () => {
    const out = edit((t, m) => reparent(t, m, 3, 4))!
    expect(out.split('\n')).toHaveLength(SAMPLE.split('\n').length)
  })
})

describe('toggleDone', () => {
  const run = (text: string, id: number) => toggleDone(text, parseText(text), id)!.text

  it('ticks a follow-up off', () => {
    expect(run('> Confirm QA', 0)).toBe('> [x] Confirm QA')
  })

  it('un-ticks one that was already done', () => {
    expect(run('> [x] Confirm QA', 0)).toBe('> Confirm QA')
  })

  it('keeps the indent, owner and date', () => {
    expect(run('  > Confirm QA #Dave @Sep 3', 0)).toBe('  > [x] Confirm QA #Dave @Sep 3')
  })

  it('leaves the rest of the buffer alone', () => {
    expect(run('Q: Ship?\n  > Confirm QA\n  > Other', 1)).toBe(
      'Q: Ship?\n  > [x] Confirm QA\n  > Other',
    )
  })

  it('is not a structural edit', () => {
    const text = '> Confirm QA'
    expect(toggleDone(text, parseText(text), 0)!.structural).toBe(false)
  })

  it('returns null for an unknown id', () => {
    expect(toggleDone('> a', parseText('> a'), 9)).toBeNull()
  })
})
