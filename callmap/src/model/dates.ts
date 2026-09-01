/**
 * Turning `@Sep 3` into a real calendar day.
 *
 * The notes buffer stays the source of truth, so the raw string a user typed is
 * never rewritten — this module only *interprets* it. Anything it cannot
 * understand resolves to null and simply renders as the literal text, which is
 * how the app behaved before dates meant anything.
 *
 * All arithmetic is done in UTC. A local-timezone `new Date('2026-09-03')` is
 * midnight UTC, which is the *previous day* anywhere west of Greenwich; using
 * UTC throughout keeps a date the user typed as the day they meant.
 */

export interface ResolvedDate {
  /** Calendar day as `YYYY-MM-DD`. */
  iso: string
  /** Short display form, e.g. `Sep 3` — or `Sep 3 '27` when the year differs. */
  label: string
  /**
   * True when the phrase named a period rather than a day ("end of month"),
   * so the UI can render it as a soft marker instead of a hard deadline.
   */
  approximate: boolean
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

const SHORT = MONTHS.map((m) => m.slice(0, 3))
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export const isoOf = (utcMs: number): string => {
  const d = new Date(utcMs)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export const msOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export const daysBetween = (a: string, b: string): number =>
  Math.round((msOf(b) - msOf(a)) / DAY_MS)

export const addDays = (iso: string, n: number): string => isoOf(msOf(iso) + n * DAY_MS)

/** Today, as an ISO day in the viewer's own timezone. */
export const todayIso = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

/** `Sep 3`, or `Sep 3 '27` when the year differs from `relativeTo`. */
export function formatLabel(iso: string, relativeTo: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const base = `${SHORT[m! - 1]!.replace(/^./, (c) => c.toUpperCase())} ${d}`
  const refYear = Number(relativeTo.slice(0, 4))
  return y === refYear ? base : `${base} '${String(y).slice(2)}`
}

/** A span of milliseconds as a clock: `12:04`, or `1:02:30` past an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`
}

/** `in 3 days`, `2 weeks ago`, `today`. */
export function formatRelative(iso: string, from: string): string {
  const n = daysBetween(from, iso)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  const mag = Math.abs(n)
  const unit = mag >= 14 ? `${Math.round(mag / 7)} weeks` : `${mag} days`
  return n > 0 ? `in ${unit}` : `${unit} ago`
}

const monthIndex = (name: string): number | null => {
  const key = name.toLowerCase().replace(/\.$/, '')
  const long = MONTHS.indexOf(key)
  if (long !== -1) return long
  // `sept` is the one common four-letter abbreviation.
  const short = SHORT.indexOf(key.slice(0, 3))
  return short === -1 ? null : short
}

/**
 * Pick the year that puts a bare month/day closest to the reference date, so
 * `@Jan 5` written in December means next January, not eleven months ago.
 */
function inferYear(month: number, day: number, refIso: string): number {
  const refMs = msOf(refIso)
  const refYear = Number(refIso.slice(0, 4))
  let best = refYear
  let bestGap = Infinity
  for (const y of [refYear - 1, refYear, refYear + 1]) {
    const gap = Math.abs(Date.UTC(y, month, day) - refMs)
    if (gap < bestGap) {
      bestGap = gap
      best = y
    }
  }
  return best
}

/** Days forward from `refIso` to the next `weekday`, always at least 1. */
function nextWeekday(refIso: string, weekday: number, skipAWeek: boolean): string {
  const cur = new Date(msOf(refIso)).getUTCDay()
  let delta = (weekday - cur + 7) % 7
  if (delta === 0) delta = 7
  if (skipAWeek) delta += 7
  return addDays(refIso, delta)
}

const valid = (y: number, m: number, d: number): boolean => {
  if (m < 0 || m > 11 || d < 1 || d > 31) return false
  const probe = new Date(Date.UTC(y, m, d))
  return probe.getUTCMonth() === m && probe.getUTCDate() === d
}

const make = (iso: string, refIso: string, approximate = false): ResolvedDate => ({
  iso,
  label: formatLabel(iso, refIso),
  approximate,
})

/**
 * Interpret a raw `@...` string against a reference day (the meeting's date).
 * Returns null when the phrase is not a date at all — "when the vendor replies"
 * stays a plain string and is simply never placed on the timeline.
 */
export function parseDueDate(raw: string, refIso: string = todayIso()): ResolvedDate | null {
  const s = raw.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (!s) return null

  // --- named days -------------------------------------------------------
  if (s === 'today' || s === 'now') return make(refIso, refIso)
  if (s === 'tomorrow' || s === 'tmrw' || s === 'tmw') return make(addDays(refIso, 1), refIso)
  if (s === 'yesterday') return make(addDays(refIso, -1), refIso)

  // --- fuzzy periods ----------------------------------------------------
  if (/^(eow|end of (the )?week)$/.test(s)) return make(nextWeekday(refIso, 5, false), refIso, true)
  if (/^(next week)$/.test(s)) return make(nextWeekday(refIso, 1, false), refIso, true)
  if (/^(eom|end of (the )?month)$/.test(s)) {
    const d = new Date(msOf(refIso))
    return make(isoOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)), refIso, true)
  }
  if (/^(eoq|end of (the )?quarter)$/.test(s)) {
    const d = new Date(msOf(refIso))
    const endMonth = Math.floor(d.getUTCMonth() / 3) * 3 + 3
    return make(isoOf(Date.UTC(d.getUTCFullYear(), endMonth, 0)), refIso, true)
  }

  // --- offsets: "in 3 days", "in 2 weeks" -------------------------------
  let m: RegExpMatchArray | null
  if ((m = s.match(/^in (\d+) (day|week|month)s?$/))) {
    const n = Number(m[1])
    const unit = m[2]
    if (unit === 'day') return make(addDays(refIso, n), refIso)
    if (unit === 'week') return make(addDays(refIso, n * 7), refIso)
    const d = new Date(msOf(refIso))
    return make(isoOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())), refIso)
  }

  // --- weekdays: "friday", "next tue", "this thu" -----------------------
  if ((m = s.match(/^(next |this |on )?([a-z]{3,9})$/))) {
    const idx = WEEKDAYS.findIndex((w) => w.startsWith(m![2]!) && m![2]!.length >= 3)
    if (idx !== -1) return make(nextWeekday(refIso, idx, m[1]?.trim() === 'next'), refIso)
  }

  // --- ISO: 2026-09-03 --------------------------------------------------
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
    return valid(y, mo, d) ? make(isoOf(Date.UTC(y, mo, d)), refIso) : null
  }

  // --- numeric: 9/3, 9/3/26, 9-3-2026 (month first) ---------------------
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2}|\d{4}))?$/))) {
    const mo = Number(m[1]) - 1
    const d = Number(m[2])
    let y: number
    if (m[3]) y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    else y = inferYear(mo, d, refIso)
    return valid(y, mo, d) ? make(isoOf(Date.UTC(y, mo, d)), refIso) : null
  }

  // --- "Sep 3", "September 3 2026" --------------------------------------
  if ((m = s.match(/^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/))) {
    const mo = monthIndex(m[1]!)
    if (mo !== null) {
      const d = Number(m[2])
      const y = m[3] ? Number(m[3]) : inferYear(mo, d, refIso)
      return valid(y, mo, d) ? make(isoOf(Date.UTC(y, mo, d)), refIso) : null
    }
  }

  // --- "3 Sep", "3rd September 2026" ------------------------------------
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})\.?(?: (\d{4}))?$/))) {
    const mo = monthIndex(m[2]!)
    if (mo !== null) {
      const d = Number(m[1])
      const y = m[3] ? Number(m[3]) : inferYear(mo, d, refIso)
      return valid(y, mo, d) ? make(isoOf(Date.UTC(y, mo, d)), refIso) : null
    }
  }

  return null
}
