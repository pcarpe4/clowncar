import { describe, expect, it } from 'vitest'
import {
  exportBundle,
  exportMeetingMarkdown,
  exportProjectMarkdown,
  readBundle,
  readMeetingMarkdown,
  slugify,
} from './io'
import { newMeeting, newProject } from './project'

const meeting = newMeeting({
  id: 'm1',
  title: 'Launch sync',
  date: '2026-09-01',
  text: 'Q: Ship v2?\n  A: Yes #Maria',
  manualPositions: { 0: { x: 10, y: 20 } },
  collapsed: [0],
  versions: [{ id: 'v1', at: 1_700_000_000_000, label: 'Before the rewrite', text: 'Q: Ship v2?', auto: false }],
})

const project = newProject({ id: 'p1', name: 'Product launch', meetings: [meeting] })

const reread = (raw: string) => {
  const out = readBundle(raw)
  if (!out.ok) throw new Error(out.error)
  return out.projects
}

describe('bundle round trip', () => {
  it('preserves the project and its meetings exactly', () => {
    const [p] = reread(exportBundle([project]))
    expect(p!.id).toBe('p1')
    expect(p!.name).toBe('Product launch')
    expect(p!.meetings).toHaveLength(1)
    expect(p!.meetings[0]).toMatchObject({
      id: 'm1',
      title: 'Launch sync',
      date: '2026-09-01',
      text: 'Q: Ship v2?\n  A: Yes #Maria',
    })
  })

  it('preserves hand-placed positions, folds and version history', () => {
    const [p] = reread(exportBundle([project]))
    const m = p!.meetings[0]!
    expect(m.manualPositions).toEqual({ 0: { x: 10, y: 20 } })
    expect(m.collapsed).toEqual([0])
    expect(m.versions).toEqual([
      { id: 'v1', at: 1_700_000_000_000, label: 'Before the rewrite', text: 'Q: Ship v2?', auto: false },
    ])
  })

  it('round-trips several projects', () => {
    const other = newProject({ name: 'Hiring', meetings: [newMeeting({ text: 'Q: Backfill?' })] })
    expect(reread(exportBundle([project, other]))).toHaveLength(2)
  })
})

describe('readBundle — bad input', () => {
  it('reports invalid JSON rather than throwing', () => {
    const out = readBundle('{not json')
    expect(out).toMatchObject({ ok: false })
    expect((out as { error: string }).error).toMatch(/not valid JSON/)
  })

  it('reports a JSON file that holds no projects', () => {
    expect(readBundle('{"hello":"world"}')).toMatchObject({ ok: false })
    expect(readBundle('[]')).toMatchObject({ ok: false })
    expect(readBundle('null')).toMatchObject({ ok: false })
  })

  it('accepts a bare project object', () => {
    const out = reread(JSON.stringify(project))
    expect(out).toHaveLength(1)
    expect(out[0]!.name).toBe('Product launch')
  })

  it('accepts a bare array of projects', () => {
    expect(reread(JSON.stringify([project]))).toHaveLength(1)
  })
})

describe('readBundle — hardening against malformed files', () => {
  it('ignores unknown keys instead of copying them into the store', () => {
    const raw = JSON.stringify({
      projects: [{ ...project, evil: 'payload', meetings: [{ ...meeting, evil: 'payload' }] }],
    })
    const [p] = reread(raw)
    expect(p).not.toHaveProperty('evil')
    expect(p!.meetings[0]).not.toHaveProperty('evil')
  })

  it('drops positions that are not numeric pairs', () => {
    const raw = JSON.stringify({
      projects: [
        {
          ...project,
          meetings: [
            { ...meeting, manualPositions: { 0: { x: 1, y: 2 }, 1: { x: 'nope' }, two: { x: 1, y: 1 } } },
          ],
        },
      ],
    })
    expect(reread(raw)[0]!.meetings[0]!.manualPositions).toEqual({ 0: { x: 1, y: 2 } })
  })

  it('drops non-integer collapsed ids and malformed versions', () => {
    const raw = JSON.stringify({
      projects: [
        {
          ...project,
          meetings: [{ ...meeting, collapsed: [0, 'x', 2.5, 3], versions: [{ label: 'no text' }, null] }],
        },
      ],
    })
    const m = reread(raw)[0]!.meetings[0]!
    expect(m.collapsed).toEqual([0, 3])
    expect(m.versions).toEqual([])
  })

  it('skips a meeting with no text at all, keeping the rest', () => {
    const raw = JSON.stringify({
      projects: [{ ...project, meetings: [{ title: 'broken' }, meeting] }],
    })
    expect(reread(raw)[0]!.meetings).toHaveLength(1)
  })

  it('falls back to a valid date when the stored one is nonsense', () => {
    const raw = JSON.stringify({ projects: [{ ...project, meetings: [{ ...meeting, date: 'soon' }] }] })
    expect(reread(raw)[0]!.meetings[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('markdown', () => {
  it('round-trips a meeting through front matter, body untouched', () => {
    const md = exportMeetingMarkdown(meeting)
    const back = readMeetingMarkdown(md)
    expect(back.title).toBe('Launch sync')
    expect(back.date).toBe('2026-09-01')
    expect(back.text).toBe(meeting.text)
  })

  it('round-trips a body that itself uses the # topic prefix', () => {
    const m = newMeeting({ title: 'T', date: '2026-09-01', text: '# Agenda\n  Q: Ship?' })
    expect(readMeetingMarkdown(exportMeetingMarkdown(m)).text).toBe('# Agenda\n  Q: Ship?')
  })

  it('treats a plain file with no front matter as raw notes', () => {
    const back = readMeetingMarkdown('Q: Ship v2?\n  A: Yes', 'pasted.md')
    expect(back.title).toBe('pasted.md')
    expect(back.text).toBe('Q: Ship v2?\n  A: Yes')
  })

  it('normalises CRLF line endings on the way in', () => {
    expect(readMeetingMarkdown('Q: a\r\n  A: b').text).toBe('Q: a\n  A: b')
  })

  it('writes a project as one document with a section per meeting', () => {
    const md = exportProjectMarkdown(project)
    expect(md).toContain('# Product launch')
    expect(md).toContain('## Launch sync — 2026-09-01')
    expect(md).toContain('Q: Ship v2?')
  })
})

describe('slugify', () => {
  it('makes a filename-safe stem', () => {
    expect(slugify('Product launch / Q3')).toBe('product-launch-q3')
    expect(slugify('  ')).toBe('callmap')
    expect(slugify('a'.repeat(80))).toHaveLength(60)
  })
})
