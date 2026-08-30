import { describe, expect, it } from 'vitest'
import { isDescendant, parseLine, parseText } from './parse'
import { openQuestions, followUpStats } from './derive'

const SAMPLE = `Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3
  What's the fallback if QA slips?
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12`

describe('parseLine — type prefixes', () => {
  it('reads Q: as a question', () => {
    expect(parseLine('Q: Ship v2?')).toMatchObject({ type: 'question', text: 'Ship v2?' })
  })

  it('reads A: as an answer', () => {
    expect(parseLine('A: Only if QA signs off')).toMatchObject({
      type: 'answer',
      text: 'Only if QA signs off',
    })
  })

  it('reads > as a follow-up', () => {
    expect(parseLine('> Confirm QA timeline')).toMatchObject({
      type: 'action',
      text: 'Confirm QA timeline',
    })
  })

  it('treats anything else as a note', () => {
    expect(parseLine('QA is running behind')).toMatchObject({
      type: 'note',
      text: 'QA is running behind',
    })
  })

  it('is case-insensitive about prefixes', () => {
    expect(parseLine('q: lowercase').type).toBe('question')
    expect(parseLine('a: lowercase').type).toBe('answer')
  })

  it('accepts the alternate prefixes ?, =, ! and todo:', () => {
    expect(parseLine('? Ship v2').type).toBe('question')
    expect(parseLine('= Only if QA signs off').type).toBe('answer')
    expect(parseLine('! Confirm timeline').type).toBe('action')
    expect(parseLine('todo: Confirm timeline').type).toBe('action')
  })

  it('strips the prefix from the stored text', () => {
    expect(parseLine('todo: Confirm timeline').text).toBe('Confirm timeline')
  })
})

describe('parseLine — ? auto-detect', () => {
  it('promotes a note ending in ? to a question', () => {
    expect(parseLine("What's the fallback if QA slips?")).toMatchObject({
      type: 'question',
      text: "What's the fallback if QA slips?",
    })
  })

  it('keeps the trailing ? in the text', () => {
    expect(parseLine('Ready?').text).toBe('Ready?')
  })

  it('still detects the ? after an owner and date are stripped', () => {
    const n = parseLine('Is that right? #Dave @Friday')
    expect(n.type).toBe('question')
    expect(n.text).toBe('Is that right?')
  })

  it('does not promote a line whose ? is not at the end', () => {
    expect(parseLine('Ready? I think so').type).toBe('note')
  })

  it('does not downgrade an explicit A: that ends in ?', () => {
    expect(parseLine('A: who knows?').type).toBe('answer')
  })
})

describe('parseLine — owner and date', () => {
  it('extracts an owner', () => {
    expect(parseLine('> Confirm timeline #Dave')).toMatchObject({
      owner: 'Dave',
      text: 'Confirm timeline',
    })
  })

  it('extracts a free-text date', () => {
    expect(parseLine('> Confirm timeline @Sep 3')).toMatchObject({
      date: 'Sep 3',
      text: 'Confirm timeline',
    })
  })

  it('extracts both when the owner comes first', () => {
    expect(parseLine('> Confirm timeline #Dave @Sep 3')).toMatchObject({
      owner: 'Dave',
      date: 'Sep 3',
      text: 'Confirm timeline',
    })
  })

  it('extracts both when the date comes first', () => {
    expect(parseLine('> Confirm timeline @Sep 3 #Dave')).toMatchObject({
      owner: 'Dave',
      date: 'Sep 3',
      text: 'Confirm timeline',
    })
  })

  it('reads an owner sitting mid-line', () => {
    expect(parseLine('> Ask #Dave about the timeline')).toMatchObject({
      owner: 'Dave',
      text: 'Ask about the timeline',
    })
  })

  it('leaves owner and date null when absent', () => {
    expect(parseLine('A plain note')).toMatchObject({ owner: null, date: null })
  })

  it('takes the date to end of line, spaces and all', () => {
    expect(parseLine('> Ship it @end of next week').date).toBe('end of next week')
  })
})

describe('parseLine — indentation', () => {
  it('counts two spaces as one level', () => {
    expect(parseLine('Q: root').depth).toBe(0)
    expect(parseLine('  A: child').depth).toBe(1)
    expect(parseLine('    > grandchild').depth).toBe(2)
  })

  it('treats a tab as two spaces', () => {
    expect(parseLine('\tA: child').depth).toBe(1)
    expect(parseLine('\t\t> grandchild').depth).toBe(2)
  })

  it('rounds an odd indent to the nearest level', () => {
    expect(parseLine('   A: child').depth).toBe(2)
  })
})

describe('parseText — nesting by indent', () => {
  const model = parseText(SAMPLE)

  it('gives every node an id equal to its source line', () => {
    for (const [id, node] of model.byId) expect(node.line).toBe(id)
  })

  it('nests each line under the nearest less-indented line above it', () => {
    expect(model.root.children.map((n) => n.id)).toEqual([0, 4])
    expect(model.byId.get(0)!.children.map((n) => n.id)).toEqual([1, 3])
    expect(model.byId.get(1)!.children.map((n) => n.id)).toEqual([2])
    expect(model.byId.get(4)!.children.map((n) => n.id)).toEqual([5])
  })

  it('records the last line of each subtree as `end`', () => {
    expect(model.byId.get(0)!.end).toBe(3)
    expect(model.byId.get(1)!.end).toBe(2)
    expect(model.byId.get(3)!.end).toBe(3)
    expect(model.byId.get(4)!.end).toBe(5)
  })

  it('skips blank lines without shifting the ids after them', () => {
    const m = parseText('Q: first\n\n  A: second')
    expect([...m.byId.keys()]).toEqual([0, 2])
    expect(m.byId.get(2)!.parent.id).toBe(0)
  })

  it('reparents a line that outdents past its predecessor', () => {
    const m = parseText('Q: a\n    > deep\n  A: back up')
    expect(m.byId.get(2)!.parent.id).toBe(0)
  })

  it('returns an empty model for empty text', () => {
    const m = parseText('')
    expect(m.byId.size).toBe(0)
    expect(m.root.children).toEqual([])
  })

  it('identifies descendants transitively', () => {
    const root = model.byId.get(0)!
    expect(isDescendant(model.byId.get(2)!, root)).toBe(true)
    expect(isDescendant(model.byId.get(5)!, root)).toBe(false)
    expect(isDescendant(root, root)).toBe(false)
  })
})

describe('open questions', () => {
  const model = parseText(SAMPLE)

  it('closes a question that has an answer directly beneath it', () => {
    expect(model.byId.get(0)!.open).toBe(false)
  })

  it('leaves a question with no children open', () => {
    expect(model.byId.get(3)!.open).toBe(true)
  })

  it('leaves a question open when its only child is a follow-up', () => {
    expect(model.byId.get(4)!.open).toBe(true)
  })

  it('does not count an answer nested deeper than one level', () => {
    const m = parseText('Q: outer\n  > step\n    A: buried')
    expect(m.byId.get(0)!.open).toBe(true)
  })

  it('lists open questions in document order', () => {
    expect(openQuestions(model).map((n) => n.id)).toEqual([3, 4])
  })

  it('marks open only on questions', () => {
    expect(model.byId.get(2)!.open).toBeUndefined()
  })
})

describe('follow-up stats', () => {
  it('counts follow-ups and how many are dated', () => {
    expect(followUpStats(parseText(SAMPLE))).toEqual({ total: 2, dated: 2 })
  })

  it('counts an undated follow-up', () => {
    expect(followUpStats(parseText('> no date here'))).toEqual({ total: 1, dated: 0 })
  })
})
