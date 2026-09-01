import { describe, expect, it } from 'vitest'
import { parseText } from './parse'
import { buildSummary, summaryMarkdown } from './summary'

const MEETING = { title: 'Launch sync', date: '2026-09-01' }
const TODAY = '2026-09-06'

const NOTES = `# Launch readiness
  Q: Ship v2 in September?
    D: Feature-flag the new checkout #Maria
    > [x] Confirm QA timeline #Dave @Sep 3
    > Write rollout plan #Priya @Sep 8
    !! Payment migration is untested #Priya @Sep 5
  Q: Who owns launch comms?
# Budget`

const doc = buildSummary(MEETING, parseText(NOTES, MEETING.date))

describe('buildSummary', () => {
  it('collects the decisions', () => {
    expect(doc.decisions.map((n) => n.text)).toEqual(['Feature-flag the new checkout'])
  })

  it('lists outstanding actions before completed ones', () => {
    expect(doc.actions.map((n) => [n.text, n.done])).toEqual([
      ['Write rollout plan', false],
      ['Confirm QA timeline', true],
    ])
  })

  it('collects questions with no answer', () => {
    expect(doc.openQuestions.map((n) => n.text)).toEqual(['Who owns launch comms?'])
  })

  it('collects risks', () => {
    expect(doc.risks.map((n) => n.text)).toEqual(['Payment migration is untested'])
  })

  it('reports which agenda topics went untouched', () => {
    expect(doc.topics).toEqual([
      { text: 'Launch readiness', covered: true },
      { text: 'Budget', covered: false },
    ])
  })

  it('counts everything for the header', () => {
    expect(doc.counts).toEqual({ decisions: 1, actions: 2, done: 1, open: 1, risks: 1 })
  })
})

describe('summaryMarkdown', () => {
  const md = summaryMarkdown(doc, TODAY)

  it('leads with the meeting and its date', () => {
    expect(md.split('\n')[0]).toBe('# Launch sync — Sep 1')
  })

  it('writes actions as a checklist with owner and due date', () => {
    expect(md).toContain('- [ ] Write rollout plan — Priya (due Sep 8)')
    expect(md).toContain('- [x] Confirm QA timeline — Dave (due Sep 3)')
  })

  it('flags an outstanding action whose date has passed', () => {
    const late = summaryMarkdown(
      buildSummary(MEETING, parseText('> Chase vendor #Sam @Sep 3', MEETING.date)),
      TODAY,
    )
    expect(late).toContain('- [ ] Chase vendor — Sam (due Sep 3, overdue)')
  })

  it('does not call a completed past action overdue', () => {
    expect(md).toContain('- [x] Confirm QA timeline — Dave (due Sep 3)')
    expect(md).not.toContain('Confirm QA timeline — Dave (due Sep 3, overdue)')
  })

  it('includes each section that has content', () => {
    expect(md).toContain('## Decisions')
    expect(md).toContain('## Actions')
    expect(md).toContain('## Still open')
    expect(md).toContain('## Risks')
    expect(md).toContain('## Not covered')
    expect(md).toContain('- Budget')
  })

  it('omits sections that are empty', () => {
    const bare = summaryMarkdown(buildSummary(MEETING, parseText('D: just a decision')), TODAY)
    expect(bare).toContain('## Decisions')
    expect(bare).not.toContain('## Actions')
    expect(bare).not.toContain('## Risks')
  })

  it('says so plainly when a meeting recorded nothing', () => {
    expect(summaryMarkdown(buildSummary(MEETING, parseText('')), TODAY)).toContain(
      '_Nothing recorded._',
    )
  })

  it('keeps a date we could not parse as the literal text', () => {
    const md2 = summaryMarkdown(
      buildSummary(MEETING, parseText('> Ship it @when the vendor replies', MEETING.date)),
      TODAY,
    )
    expect(md2).toContain('- [ ] Ship it (when the vendor replies)')
  })
})
