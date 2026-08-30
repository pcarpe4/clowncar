import { describe, expect, it } from 'vitest'
import { followUpStats, openQuestions } from './derive'
import { reparent } from './edits'
import { parseText } from './parse'

/** The exact paste from the spec's acceptance check. */
const PASTE = `Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3
  What's the fallback if QA slips?
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12`

describe('acceptance check', () => {
  const model = parseText(PASTE)

  it('has 2 root questions', () => {
    const roots = model.root.children
    expect(roots).toHaveLength(2)
    expect(roots.every((n) => n.type === 'question')).toBe(true)
    expect(roots.map((n) => n.text)).toEqual([
      'Ship v2 in September?',
      'Who owns launch comms?',
    ])
  })

  it('treats the un-prefixed "fallback" line as an open question', () => {
    const fallback = model.byId.get(3)!
    expect(fallback.type).toBe('question')
    expect(fallback.open).toBe(true)
  })

  it('lists the fallback question in the Still open bar', () => {
    expect(openQuestions(model).map((n) => n.text)).toContain("What's the fallback if QA slips?")
  })

  it('marks "Ship v2" as answered', () => {
    expect(model.byId.get(0)!.open).toBe(false)
  })

  it('counts 2 follow-ups, both dated', () => {
    expect(followUpStats(model)).toEqual({ total: 2, dated: 2 })
  })

  it('reads the owners and dates off both follow-ups', () => {
    expect(model.byId.get(2)!).toMatchObject({ owner: 'Dave', date: 'Sep 3' })
    expect(model.byId.get(5)!).toMatchObject({ owner: 'Sam', date: 'Sep 12' })
  })

  it('rewrites the text when the fallback card is dragged onto "Who owns launch comms?"', () => {
    const out = reparent(PASTE, model, 3, 4)!
    expect(out.text).toBe(`Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12
  What's the fallback if QA slips?`)

    // ...and the reparsed tree really does hang it off that question.
    const after = parseText(out.text)
    expect(after.byId.get(3)!.children.map((n) => n.text)).toEqual([
      'Draft announcement',
      "What's the fallback if QA slips?",
    ])
  })
})
