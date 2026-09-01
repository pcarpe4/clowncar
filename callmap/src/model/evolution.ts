import { parseText } from './parse'
import { chronological, type Meeting, type Project } from './project'
import type { CallNode, NodeType } from './types'

/**
 * Threading items across the meetings of a project.
 *
 * Nothing in the notes format carries an identity across meetings — people
 * retype a question rather than reference it — so threads are recovered by
 * text similarity. That is a heuristic and it is deliberately conservative:
 * a missed link shows up as two short threads, which reads fine, whereas a
 * false link silently merges two unrelated items. Hence the high thresholds.
 */

/** Only these types are worth following meeting to meeting. */
const TRACKED: readonly NodeType[] = ['question', 'action', 'risk']

/** Same-type matches need this much overlap; cross-type matches need more. */
const SAME_TYPE_THRESHOLD = 0.6
const CROSS_TYPE_THRESHOLD = 0.8

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'we', 'to', 'of', 'for', 'on', 'in', 'and', 'or',
  'do', 'does', 'did', 'what', 'who', 'how', 'when', 'why', 'be', 'will', 'would', 'should', 'can',
  'could', 'it', 'that', 'this', 'our', 'if', 'with', 'from', 'by', 'at', 'as', 'any', 'all',
])

/**
 * Fold a word to a comparison key. This is not linguistics — it only has to be
 * *consistent*, so that two spellings of the same idea land on one key.
 *
 * The last two steps are what a naive suffix-strip gets wrong: removing "-ing"
 * from "shipping" leaves "shipp", and removing "-es" from "releases" leaves
 * "releas" while bare "release" keeps its "e". Collapsing a doubled consonant
 * and then a trailing "e" makes both pairs agree.
 */
function stem(word: string): string {
  let s = word
  if (s.length > 4 && s.endsWith('ing')) s = s.slice(0, -3)
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('es')) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)

  if (s.length > 3 && /([bdfglmnprt])\1$/.test(s)) s = s.slice(0, -1)
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1)
  return s
}

/** Normalised content words, crudely de-inflected so "shipping" ≈ "ship". */
export function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w))
      .map(stem)
      .filter(Boolean),
  )
}

/** Sørensen–Dice coefficient over two token sets. 0 = nothing shared, 1 = identical. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return (2 * shared) / (a.size + b.size)
}

export interface Appearance {
  meetingId: string
  meetingTitle: string
  date: string
  nodeId: number
  type: NodeType
  text: string
  owner: string | null
  due: string | null
  /** Questions only: still unanswered at this meeting. */
  open: boolean
  /** The answer or decision that settled it here, if any. */
  resolvedBy: string | null
}

export type ThreadStatus = 'open' | 'resolved' | 'dropped'

export interface Thread {
  id: string
  /** The wording from the thread's first appearance. */
  label: string
  type: NodeType
  appearances: Appearance[]
  status: ThreadStatus
  /** True when the thread spans more than one meeting. */
  carried: boolean
}

const resolvingChild = (n: CallNode): string | null =>
  n.children.find((c) => c.type === 'answer' || c.type === 'decision')?.text ?? null

function appearancesOf(meeting: Meeting): { node: CallNode; app: Appearance }[] {
  const model = parseText(meeting.text, meeting.date)
  return [...model.byId.values()]
    .filter((n) => TRACKED.includes(n.type) && n.text.trim())
    .sort((a, b) => a.id - b.id)
    .map((node) => ({
      node,
      app: {
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        date: meeting.date,
        nodeId: node.id,
        type: node.type,
        text: node.text,
        owner: node.owner,
        due: node.due?.iso ?? null,
        open: node.type === 'question' ? node.open === true : true,
        resolvedBy: resolvingChild(node),
      },
    }))
}

interface Building {
  id: string
  label: string
  type: NodeType
  tokens: Set<string>
  appearances: Appearance[]
}

/**
 * Build the threads for a project. Meetings are read oldest-first; within each
 * meeting every candidate pairing is scored, then assigned best-first so the
 * result does not depend on document order.
 */
export function buildThreads(project: Project): Thread[] {
  const meetings = chronological(project)
  const threads: Building[] = []

  for (const meeting of meetings) {
    const items = appearancesOf(meeting)
    const itemTokens = items.map((i) => tokenize(i.app.text))

    // Score every (item, existing thread) pair, then take them best-first.
    const pairs: { item: number; thread: number; score: number }[] = []
    items.forEach((item, i) => {
      threads.forEach((thread, t) => {
        const score = similarity(itemTokens[i]!, thread.tokens)
        const floor =
          thread.type === item.app.type ? SAME_TYPE_THRESHOLD : CROSS_TYPE_THRESHOLD
        if (score >= floor) pairs.push({ item: i, thread: t, score })
      })
    })
    pairs.sort((a, b) => b.score - a.score)

    const usedItem = new Set<number>()
    const usedThread = new Set<number>()
    for (const { item, thread } of pairs) {
      if (usedItem.has(item) || usedThread.has(thread)) continue
      usedItem.add(item)
      usedThread.add(thread)
      threads[thread]!.appearances.push(items[item]!.app)
    }

    // Anything unmatched starts a thread of its own.
    items.forEach((item, i) => {
      if (usedItem.has(i)) return
      threads.push({
        id: `${meeting.id}:${item.app.nodeId}`,
        label: item.app.text,
        type: item.app.type,
        tokens: itemTokens[i]!,
        appearances: [item.app],
      })
    })
  }

  const lastDate = meetings.length ? meetings[meetings.length - 1]!.date : ''

  return threads.map((t) => {
    const last = t.appearances[t.appearances.length - 1]!
    const everResolved = t.appearances.some((a) => a.type === 'question' && !a.open)
    const settled = everResolved && !last.open

    let status: ThreadStatus
    if (settled) status = 'resolved'
    else if (last.date === lastDate) status = 'open'
    else status = 'dropped'

    return {
      id: t.id,
      label: t.label,
      type: t.type,
      appearances: t.appearances,
      status,
      carried: t.appearances.length > 1,
    }
  })
}

export interface EvolutionStats {
  total: number
  carried: number
  resolved: number
  dropped: number
  open: number
}

export function evolutionStats(threads: Thread[]): EvolutionStats {
  return {
    total: threads.length,
    carried: threads.filter((t) => t.carried).length,
    resolved: threads.filter((t) => t.status === 'resolved').length,
    dropped: threads.filter((t) => t.status === 'dropped').length,
    open: threads.filter((t) => t.status === 'open').length,
  }
}
