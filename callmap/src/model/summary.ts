import { daysBetween, formatLabel } from './dates'
import { decisions, openQuestions, risks, actions, topicCoverage } from './derive'
import type { CallNode, Model } from './types'

/**
 * The wrap-up: what a meeting produced, in the order someone reads it after the
 * call — what we settled, what happens next, what is still hanging.
 *
 * Pure and separate from the dialog that shows it, so the Markdown that lands in
 * someone's inbox is exactly what the tests pin down.
 */

export interface SummaryDoc {
  title: string
  date: string
  decisions: CallNode[]
  actions: CallNode[]
  openQuestions: CallNode[]
  risks: CallNode[]
  topics: { text: string; covered: boolean }[]
  counts: { decisions: number; actions: number; done: number; open: number; risks: number }
}

export function buildSummary(
  meeting: { title: string; date: string },
  model: Model,
): SummaryDoc {
  const acts = actions(model)
  const dec = decisions(model)
  const open = openQuestions(model)
  const risk = risks(model)

  return {
    title: meeting.title,
    date: meeting.date,
    decisions: dec,
    // Outstanding first — that is what the reader has to act on.
    actions: [...acts].sort((a, b) => Number(a.done) - Number(b.done) || a.id - b.id),
    openQuestions: open,
    risks: risk,
    topics: topicCoverage(model).map((t) => ({
      text: t.node.text || 'Untitled topic',
      covered: t.covered,
    })),
    counts: {
      decisions: dec.length,
      actions: acts.length,
      done: acts.filter((n) => n.done).length,
      open: open.length,
      risks: risk.length,
    },
  }
}

const owner = (n: CallNode) => (n.owner ? ` — ${n.owner}` : '')

function due(n: CallNode, today: string): string {
  if (!n.due) return n.date ? ` (${n.date})` : ''
  const late = !n.done && daysBetween(today, n.due.iso) < 0
  return ` (due ${formatLabel(n.due.iso, today)}${late ? ', overdue' : ''})`
}

/** The recap as Markdown, ready to paste into a follow-up mail. */
export function summaryMarkdown(doc: SummaryDoc, today: string): string {
  const out: string[] = [`# ${doc.title} — ${formatLabel(doc.date, today)}`, '']

  const section = (heading: string, lines: string[]) => {
    if (lines.length === 0) return
    out.push(`## ${heading}`, ...lines, '')
  }

  section(
    'Decisions',
    doc.decisions.map((n) => `- ${n.text}${owner(n)}`),
  )
  section(
    'Actions',
    doc.actions.map((n) => `- [${n.done ? 'x' : ' '}] ${n.text}${owner(n)}${due(n, today)}`),
  )
  section(
    'Still open',
    doc.openQuestions.map((n) => `- ${n.text || 'Untitled question'}`),
  )
  section(
    'Risks',
    doc.risks.map((n) => `- ${n.text}${owner(n)}${due(n, today)}`),
  )

  const missed = doc.topics.filter((t) => !t.covered)
  section(
    'Not covered',
    missed.map((t) => `- ${t.text}`),
  )

  if (out.length === 2) out.push('_Nothing recorded._', '')
  return out.join('\n').trimEnd() + '\n'
}
