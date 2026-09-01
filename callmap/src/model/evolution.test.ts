import { describe, expect, it } from 'vitest'
import { buildThreads, evolutionStats, similarity, tokenize } from './evolution'
import { newMeeting, newProject } from './project'

const project = newProject({
  name: 'Launch',
  meetings: [
    newMeeting({
      title: 'Kickoff',
      date: '2026-09-01',
      text: `Q: Should we ship v2 in September?\n!! Vendor contract is unsigned #Legal`,
    }),
    newMeeting({
      title: 'Check-in',
      date: '2026-09-08',
      text: `Q: Should we ship v2 in September?\n  > Chase QA for a date #Dave`,
    }),
    newMeeting({
      title: 'Go / no-go',
      date: '2026-09-15',
      text: `Q: Should we ship v2 in September?\n  D: Yes, behind a feature flag\n> Book the launch review #Sam`,
    }),
  ],
})

const threads = buildThreads(project)
const find = (fragment: string) => threads.find((t) => t.label.includes(fragment))!

describe('buildThreads — following an item across meetings', () => {
  it('joins the same question restated in three meetings into one thread', () => {
    const t = find('ship v2')
    expect(t.appearances).toHaveLength(3)
    expect(t.carried).toBe(true)
    expect(t.appearances.map((a) => a.meetingTitle)).toEqual(['Kickoff', 'Check-in', 'Go / no-go'])
  })

  it('marks it resolved once a decision lands under it', () => {
    const t = find('ship v2')
    expect(t.status).toBe('resolved')
    expect(t.appearances[2]!.resolvedBy).toBe('Yes, behind a feature flag')
    expect(t.appearances[0]!.open).toBe(true)
    expect(t.appearances[2]!.open).toBe(false)
  })

  it('calls an item still live in the newest meeting open', () => {
    expect(find('Book the launch review').status).toBe('open')
  })

  it('calls an unresolved item that stopped being raised dropped', () => {
    expect(find('Vendor contract').status).toBe('dropped')
    expect(find('Chase QA').status).toBe('dropped')
  })

  it('keeps unrelated items in separate threads', () => {
    expect(threads).toHaveLength(4)
    expect(threads.every((t) => t.appearances.length > 0)).toBe(true)
  })

  it('carries the owner and type through to each appearance', () => {
    expect(find('Vendor contract')).toMatchObject({ type: 'risk' })
    expect(find('Vendor contract').appearances[0]!.owner).toBe('Legal')
    expect(find('Book the launch review').appearances[0]!.owner).toBe('Sam')
  })
})

describe('buildThreads — ordering and matching rules', () => {
  it('reads meetings chronologically regardless of the stored order', () => {
    const shuffled = newProject({ name: 'Launch', meetings: [...project.meetings].reverse() })
    const t = buildThreads(shuffled).find((x) => x.label.includes('ship v2'))!
    expect(t.appearances.map((a) => a.date)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15'])
    expect(t.status).toBe('resolved')
  })

  it('never links two items from the same meeting into one thread', () => {
    const twice = newProject({
      meetings: [
        newMeeting({
          date: '2026-09-01',
          text: 'Q: Do we ship in September?\nQ: Do we ship in September?',
        }),
      ],
    })
    const out = buildThreads(twice)
    expect(out).toHaveLength(2)
    expect(out.every((t) => t.appearances.length === 1)).toBe(true)
  })

  it('does not merge two genuinely different questions', () => {
    const p = newProject({
      meetings: [
        newMeeting({ date: '2026-09-01', text: 'Q: Should we ship v2 in September?' }),
        newMeeting({ date: '2026-09-08', text: 'Q: Who is running the office move?' }),
      ],
    })
    expect(buildThreads(p)).toHaveLength(2)
  })

  it('ignores notes, answers and topics as thread starters', () => {
    const p = newProject({
      meetings: [
        newMeeting({
          date: '2026-09-01',
          text: '# Agenda\nplain note\nA: an orphan answer\n~ a stray idea',
        }),
      ],
    })
    expect(buildThreads(p)).toHaveLength(0)
  })
})

describe('tokenize / similarity', () => {
  it('drops stop words and punctuation', () => {
    expect([...tokenize('Should we ship v2 in September?')].sort()).toEqual([
      'september',
      'ship',
      'v2',
    ])
  })

  it('folds simple inflections together', () => {
    expect(similarity(tokenize('shipping the release'), tokenize('ship releases'))).toBe(1)
  })

  it('scores unrelated text at zero and identical text at one', () => {
    expect(similarity(tokenize('ship v2'), tokenize('office move'))).toBe(0)
    expect(similarity(tokenize('ship v2'), tokenize('ship v2'))).toBe(1)
  })

  it('scores an empty set at zero rather than dividing by zero', () => {
    expect(similarity(tokenize('the a of'), tokenize('ship'))).toBe(0)
  })
})

describe('evolutionStats', () => {
  it('rolls the threads up', () => {
    expect(evolutionStats(threads)).toEqual({
      total: 4,
      carried: 1,
      resolved: 1,
      dropped: 2,
      open: 1,
    })
  })
})
