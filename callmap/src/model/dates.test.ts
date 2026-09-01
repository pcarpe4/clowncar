import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  formatDuration,
  formatLabel,
  formatRelative,
  parseDueDate,
} from './dates'

/** A Tuesday, so weekday maths has somewhere unambiguous to start. */
const REF = '2026-09-01'

const iso = (raw: string, ref = REF) => parseDueDate(raw, ref)?.iso ?? null

describe('parseDueDate — named days', () => {
  it('reads today, tomorrow and yesterday', () => {
    expect(iso('today')).toBe('2026-09-01')
    expect(iso('tomorrow')).toBe('2026-09-02')
    expect(iso('yesterday')).toBe('2026-08-31')
  })

  it('is case-insensitive and tolerates surrounding space', () => {
    expect(iso('  Tomorrow ')).toBe('2026-09-02')
  })
})

describe('parseDueDate — weekdays', () => {
  it('resolves a weekday to its next occurrence', () => {
    expect(iso('friday')).toBe('2026-09-04')
    expect(iso('fri')).toBe('2026-09-04')
  })

  it('pushes a weekday that is today to the following week', () => {
    expect(iso('tuesday')).toBe('2026-09-08')
  })

  it('adds a week for "next"', () => {
    expect(iso('next tuesday')).toBe('2026-09-15')
  })

  it('does not read a month name as a weekday', () => {
    expect(iso('march')).toBeNull()
  })
})

describe('parseDueDate — explicit dates', () => {
  it('reads ISO', () => {
    expect(iso('2026-09-03')).toBe('2026-09-03')
  })

  it('reads month-first numerics, with and without a year', () => {
    expect(iso('9/3')).toBe('2026-09-03')
    expect(iso('9/3/26')).toBe('2026-09-03')
    expect(iso('9/3/2027')).toBe('2027-09-03')
  })

  it('reads "Sep 3" and its long and four-letter forms', () => {
    expect(iso('Sep 3')).toBe('2026-09-03')
    expect(iso('Sept 3')).toBe('2026-09-03')
    expect(iso('September 3')).toBe('2026-09-03')
    expect(iso('September 3, 2027')).toBe('2027-09-03')
  })

  it('reads day-first forms', () => {
    expect(iso('3 Sep')).toBe('2026-09-03')
    expect(iso('3rd September')).toBe('2026-09-03')
  })

  it('rejects an impossible day', () => {
    expect(iso('2026-02-30')).toBeNull()
    expect(iso('Feb 31')).toBeNull()
  })
})

describe('parseDueDate — year inference', () => {
  it('picks the nearest year for a bare month and day', () => {
    // Written in December, "Jan 5" means the January two weeks away.
    expect(iso('Jan 5', '2026-12-20')).toBe('2027-01-05')
    // Written in January, "Dec 20" means the December just gone.
    expect(iso('Dec 20', '2027-01-05')).toBe('2026-12-20')
  })

  it('honours an explicit year over the inference', () => {
    expect(iso('Jan 5 2030', '2026-12-20')).toBe('2030-01-05')
  })
})

describe('parseDueDate — periods and offsets', () => {
  it('resolves end-of-week to the coming Friday', () => {
    expect(iso('eow')).toBe('2026-09-04')
    expect(iso('end of week')).toBe('2026-09-04')
  })

  it('resolves end-of-month and end-of-quarter', () => {
    expect(iso('eom')).toBe('2026-09-30')
    expect(iso('end of the quarter')).toBe('2026-09-30')
  })

  it('handles a leap February', () => {
    expect(iso('eom', '2028-02-10')).toBe('2028-02-29')
  })

  it('marks period phrases as approximate but exact days as not', () => {
    expect(parseDueDate('eom', REF)!.approximate).toBe(true)
    expect(parseDueDate('next week', REF)!.approximate).toBe(true)
    expect(parseDueDate('Sep 3', REF)!.approximate).toBe(false)
  })

  it('reads "in N days/weeks/months"', () => {
    expect(iso('in 3 days')).toBe('2026-09-04')
    expect(iso('in 2 weeks')).toBe('2026-09-15')
    expect(iso('in 1 month')).toBe('2026-10-01')
  })
})

describe('parseDueDate — non-dates', () => {
  it('returns null for prose, leaving the raw text to render as-is', () => {
    expect(iso('when the vendor replies')).toBeNull()
    expect(iso('')).toBeNull()
    expect(iso('asap')).toBeNull()
  })
})

describe('formatting and arithmetic', () => {
  it('labels a same-year date without the year', () => {
    expect(formatLabel('2026-09-03', REF)).toBe('Sep 3')
  })

  it('adds a short year when it differs from the reference', () => {
    expect(formatLabel('2027-01-05', '2026-12-20')).toBe("Jan 5 '27")
  })

  it('counts days in both directions', () => {
    expect(daysBetween('2026-09-01', '2026-09-04')).toBe(3)
    expect(daysBetween('2026-09-04', '2026-09-01')).toBe(-3)
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0)
  })

  it('counts across a month boundary', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3)
  })

  it('adds days across a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('describes a date relative to another', () => {
    expect(formatRelative('2026-09-01', REF)).toBe('today')
    expect(formatRelative('2026-09-02', REF)).toBe('tomorrow')
    expect(formatRelative('2026-08-31', REF)).toBe('yesterday')
    expect(formatRelative('2026-09-04', REF)).toBe('in 3 days')
    expect(formatRelative('2026-09-20', REF)).toBe('in 3 weeks')
    expect(formatRelative('2026-08-30', REF)).toBe('2 days ago')
  })
})

describe('formatDuration', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(9_000)).toBe('0:09')
    expect(formatDuration(64_000)).toBe('1:04')
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59:59')
  })

  it('adds hours, zero-padding the minutes, once it runs past one', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_750_000)).toBe('1:02:30')
  })

  it('floors to the second and never goes negative', () => {
    expect(formatDuration(1_999)).toBe('0:01')
    expect(formatDuration(-5_000)).toBe('0:00')
  })
})
