import { todayIso } from './dates'
import { newMeeting, newProject, uid, type Meeting, type Project, type Version, type XY } from './project'

/**
 * Import / export.
 *
 * Two formats, for two jobs:
 *  - a JSON bundle, which is lossless (positions, folds, full version history)
 *    and is what you use to move work between browsers or back it up;
 *  - Markdown, which is lossy but readable, and is what you paste into a doc.
 *
 * Everything arriving from a file is treated as untrusted: `readBundle` never
 * spreads a parsed object into place, it rebuilds each record field by field so
 * a malformed or hostile file cannot inject unexpected keys into the store.
 */

export const BUNDLE_KIND = 'callmap.bundle'
export const BUNDLE_VERSION = 1

export interface Bundle {
  kind: typeof BUNDLE_KIND
  version: number
  exportedAt: number
  projects: Project[]
}

// --- export ------------------------------------------------------------

export const exportBundle = (projects: Project[]): string =>
  JSON.stringify(
    { kind: BUNDLE_KIND, version: BUNDLE_VERSION, exportedAt: Date.now(), projects } satisfies Bundle,
    null,
    2,
  )

/**
 * A meeting as Markdown: YAML-ish front matter, then the notes buffer verbatim.
 * Keeping the body untouched is what makes the round-trip exact — and it is why
 * the body is never re-indented or re-prefixed on the way out.
 */
export function exportMeetingMarkdown(meeting: Meeting): string {
  return [
    '---',
    'callmap: meeting',
    `title: ${meeting.title}`,
    `date: ${meeting.date}`,
    '---',
    '',
    meeting.text,
    '',
  ].join('\n')
}

/** A whole project as one Markdown file, meetings in chronological order. */
export function exportProjectMarkdown(project: Project): string {
  const meetings = [...project.meetings].sort((a, b) => (a.date < b.date ? -1 : 1))
  const parts = [
    '---',
    'callmap: project',
    `title: ${project.name}`,
    '---',
    '',
    `# ${project.name}`,
    '',
  ]
  for (const m of meetings) {
    parts.push(`## ${m.title} — ${m.date}`, '', m.text, '')
  }
  return parts.join('\n')
}

// --- import ------------------------------------------------------------

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const isoDate = (v: unknown): string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayIso()

function readPositions(v: unknown): Record<number, XY> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<number, XY> = {}
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    const id = Number(key)
    if (!Number.isInteger(id) || !value || typeof value !== 'object') continue
    const { x, y } = value as Record<string, unknown>
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      out[id] = { x, y }
    }
  }
  return out
}

function readVersion(v: unknown): Version | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.text !== 'string') return null
  return {
    id: str(r.id, uid()),
    at: num(r.at, Date.now()),
    label: str(r.label, 'Imported version'),
    text: r.text,
    auto: r.auto === true,
  }
}

function readMeeting(v: unknown): Meeting | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.text !== 'string') return null
  return newMeeting({
    id: str(r.id, uid()),
    title: str(r.title, 'Untitled meeting'),
    date: isoDate(r.date),
    text: r.text,
    manualPositions: readPositions(r.manualPositions),
    collapsed: Array.isArray(r.collapsed) ? r.collapsed.filter((n): n is number => Number.isInteger(n)) : [],
    versions: Array.isArray(r.versions)
      ? r.versions.map(readVersion).filter((x): x is Version => x !== null)
      : [],
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
  })
}

function readProject(v: unknown): Project | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const meetings = Array.isArray(r.meetings)
    ? r.meetings.map(readMeeting).filter((x): x is Meeting => x !== null)
    : []
  if (meetings.length === 0 && typeof r.name !== 'string') return null
  return newProject({
    id: str(r.id, uid()),
    name: str(r.name, 'Imported project'),
    createdAt: num(r.createdAt, Date.now()),
    meetings,
  })
}

export type ImportResult =
  | { ok: true; projects: Project[] }
  | { ok: false; error: string }

/** Parse a `.json` bundle. Never throws — a bad file returns an error message. */
export function readBundle(raw: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'That file does not contain a Callmap bundle.' }
  }

  const r = parsed as Record<string, unknown>
  // Accept a bare project or a bare array too — people do split bundles by hand.
  const candidates: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(r.projects)
      ? r.projects
      : [parsed]

  const projects = candidates.map(readProject).filter((x): x is Project => x !== null)
  if (projects.length === 0) {
    return { ok: false, error: 'No projects found in that file.' }
  }
  return { ok: true, projects }
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?/

/** Read a Markdown export back into a meeting. Falls back to treating the whole file as notes. */
export function readMeetingMarkdown(raw: string, fallbackTitle = 'Imported meeting'): Meeting {
  const text = raw.replace(/\r\n/g, '\n')
  const fm = FRONT_MATTER.exec(text)
  if (!fm) {
    return newMeeting({ title: fallbackTitle, text: text.trim() })
  }

  const fields = new Map<string, string>()
  for (const line of fm[1]!.split('\n')) {
    const at = line.indexOf(':')
    if (at === -1) continue
    fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim())
  }

  return newMeeting({
    title: fields.get('title') || fallbackTitle,
    date: isoDate(fields.get('date')),
    // The blank separator line after the front matter is part of the envelope,
    // not the notes. Leaving it in would shift every line index by one.
    text: text.slice(fm[0].length).replace(/^\n+/, '').replace(/\n+$/, ''),
  })
}

// --- browser helpers ---------------------------------------------------

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'callmap'

/** Trigger a download of `content` as `filename`. */
export function download(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Give the click a tick to be handled before the blob is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Open a file picker and resolve with the chosen file's text. */
export function pickFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      file
        .text()
        .then((text) => resolve({ name: file.name, text }))
        .catch(() => resolve(null))
    }
    input.click()
  })
}
