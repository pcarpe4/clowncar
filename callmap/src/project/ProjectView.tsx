import { useMemo, useState } from 'react'
import { formatLabel, todayIso } from '../model/dates'
import { buildThreads, evolutionStats, type Thread, type ThreadStatus } from '../model/evolution'
import { chronological, type Project } from '../model/project'
import type { NodeType } from '../model/types'
import { TYPES } from '../model/types'
import { useCallmap } from '../store/useCallmap'

const LABEL_W = 236
const MIN_COL = 132
const ROW_H = 34

const DOT: Record<NodeType, string> = {
  question: 'bg-q',
  answer: 'bg-a',
  decision: 'bg-d',
  action: 'bg-f',
  risk: 'bg-r',
  idea: 'bg-i',
  topic: 'bg-t',
  note: 'bg-muted',
}

const STATUS: Record<ThreadStatus, { label: string; className: string; bar: string }> = {
  open: { label: 'open', className: 'bg-q-soft text-q', bar: 'bg-q/35' },
  resolved: { label: 'resolved', className: 'bg-a-soft text-a', bar: 'bg-a/35' },
  dropped: { label: 'dropped', className: 'bg-muted-soft text-muted', bar: 'bg-muted/25' },
}

type Filter = 'all' | 'carried' | 'unfinished'

export function ProjectView({ project }: { project: Project }) {
  const selectMeeting = useCallmap((s) => s.selectMeeting)
  const select = useCallmap((s) => s.select)
  const setView = useCallmap((s) => s.setView)
  const today = todayIso()

  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const meetings = useMemo(() => chronological(project), [project])
  const threads = useMemo(() => buildThreads(project), [project])
  const stats = useMemo(() => evolutionStats(threads), [threads])

  const shown = useMemo(() => {
    const list =
      filter === 'carried'
        ? threads.filter((t) => t.carried)
        : filter === 'unfinished'
          ? threads.filter((t) => t.status !== 'resolved')
          : threads
    // Longest-running first: the threads that keep coming back are the story.
    return [...list].sort(
      (a, b) =>
        b.appearances.length - a.appearances.length ||
        a.appearances[0]!.date.localeCompare(b.appearances[0]!.date),
    )
  }, [threads, filter])

  const index = useMemo(
    () => new Map(meetings.map((m, i) => [m.id, i] as const)),
    [meetings],
  )

  const colW = Math.max(MIN_COL, 880 / Math.max(1, meetings.length))
  const trackW = colW * meetings.length
  const xOf = (i: number) => i * colW + colW / 2

  const jumpTo = (meetingId: string, nodeId: number) => {
    selectMeeting(meetingId)
    select(nodeId)
    setView('map')
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas">
      <div className="p-4">
        <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">
            {project.name}
          </h1>
          <span className="text-xs text-muted">
            {meetings.length} meeting{meetings.length === 1 ? '' : 's'}
            {meetings.length > 1 &&
              ` · ${formatLabel(meetings[0]!.date, today)} → ${formatLabel(meetings[meetings.length - 1]!.date, today)}`}
          </span>

          <div className="ml-auto flex items-center gap-3">
            <Stat value={stats.carried} label="carried over" tone="text-q" />
            <Stat value={stats.resolved} label="resolved" tone="text-a" />
            <Stat value={stats.open} label="still open" tone="text-f" />
            <Stat value={stats.dropped} label="dropped" tone="text-muted" />
          </div>
        </header>

        {meetings.length === 0 ? (
          <Empty>This project has no meetings yet.</Empty>
        ) : threads.length === 0 ? (
          <Empty>
            No questions, follow-ups or risks recorded yet — those are the things followed from one
            meeting to the next.
          </Empty>
        ) : (
          <section className="rounded-2xl border border-line bg-paper p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[11px] font-bold tracking-[.08em] text-muted uppercase">
                Across meetings
              </h2>
              <div className="ml-auto flex rounded-lg border border-line p-0.5">
                {(
                  [
                    ['all', `All ${threads.length}`],
                    ['carried', `Carried ${stats.carried}`],
                    ['unfinished', `Unfinished ${stats.open + stats.dropped}`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    aria-pressed={filter === id}
                    className={`rounded-[6px] px-2 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
                      filter === id ? 'bg-q text-white' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <div style={{ minWidth: LABEL_W + trackW }}>
                {/* meeting column headers */}
                <div className="flex border-b border-line pb-1.5">
                  <div style={{ width: LABEL_W }} className="shrink-0" />
                  <div className="relative" style={{ width: trackW, height: 30 }}>
                    {meetings.map((m, i) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          selectMeeting(m.id)
                          setView('map')
                        }}
                        title={`Open “${m.title}”`}
                        className="absolute top-0 -translate-x-1/2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                        style={{ left: xOf(i), width: colW - 8 }}
                      >
                        <div className="truncate text-[11px] font-semibold text-ink hover:text-q">
                          {m.title}
                        </div>
                        <div className="font-mono text-[10px] text-muted">
                          {formatLabel(m.date, today)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {shown.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted">
                    Nothing matches that filter.
                  </p>
                ) : (
                  <ul className="pt-1.5">
                    {shown.map((thread) => {
                      const first = index.get(thread.appearances[0]!.meetingId) ?? 0
                      const last =
                        index.get(thread.appearances[thread.appearances.length - 1]!.meetingId) ?? 0
                      const status = STATUS[thread.status]
                      const isOpen = expanded === thread.id

                      return (
                        <li key={thread.id} className="border-b border-line/60 last:border-0">
                          <div className="flex items-center" style={{ height: ROW_H }}>
                            <button
                              type="button"
                              onClick={() => setExpanded(isOpen ? null : thread.id)}
                              aria-expanded={isOpen}
                              className="flex shrink-0 items-center gap-1.5 pr-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                              style={{ width: LABEL_W }}
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded font-display text-[9px] font-bold text-white ${DOT[thread.type]}`}
                                title={TYPES[thread.type].label}
                              >
                                {TYPES[thread.type].glyph}
                              </span>
                              <span className="truncate text-[12px] text-ink" title={thread.label}>
                                {thread.label}
                              </span>
                            </button>

                            <div className="relative" style={{ width: trackW, height: ROW_H }}>
                              {/* the span from first mention to last */}
                              {last > first && (
                                <div
                                  className={`absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full ${status.bar}`}
                                  style={{ left: xOf(first), width: xOf(last) - xOf(first) }}
                                />
                              )}
                              {meetings.map((m, i) => {
                                const here = thread.appearances.find((a) => a.meetingId === m.id)
                                if (!here) return null
                                const settled = here.type === 'question' && !here.open
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => jumpTo(m.id, here.nodeId)}
                                    title={`${here.text}${here.resolvedBy ? ` → ${here.resolvedBy}` : ''} — open in the map`}
                                    aria-label={`${here.text} in ${m.title}`}
                                    className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
                                      settled ? 'bg-a' : DOT[thread.type]
                                    } hover:scale-125`}
                                    style={{ left: xOf(i) }}
                                  />
                                )
                              })}
                            </div>

                            <span
                              className={`ml-2 shrink-0 rounded-full px-2 py-px text-[10px] font-semibold ${status.className}`}
                            >
                              {status.label}
                            </span>
                          </div>

                          {isOpen && <ThreadDetail thread={thread} onJump={jumpTo} today={today} />}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            <p className="mt-2.5 border-t border-line pt-2 text-[11px] leading-normal text-muted">
              Threads are matched across meetings by wording, so a heavily reworded item may start a
              new thread. A green dot marks the meeting where a question was answered or decided.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

function ThreadDetail({
  thread,
  onJump,
  today,
}: {
  thread: Thread
  onJump: (meetingId: string, nodeId: number) => void
  today: string
}) {
  return (
    <ol className="mb-2 ml-6 flex flex-col gap-1 border-l-2 border-line pl-3">
      {thread.appearances.map((a) => (
        <li key={`${a.meetingId}:${a.nodeId}`} className="text-[11.5px]">
          <button
            type="button"
            onClick={() => onJump(a.meetingId, a.nodeId)}
            className="text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
          >
            <span className="font-mono text-[10px] text-muted">{formatLabel(a.date, today)}</span>{' '}
            <span className="font-semibold text-ink">{a.meetingTitle}</span>{' '}
            <span className="text-muted">— {a.text}</span>
          </button>
          {a.resolvedBy && (
            <div className="ml-1 text-[11px] text-a">↳ {a.resolvedBy}</div>
          )}
          {a.owner && <span className="ml-1 text-[10px] text-muted">#{a.owner}</span>}
        </li>
      ))}
    </ol>
  )
}

const Stat = ({ value, label, tone }: { value: number; label: string; tone: string }) => (
  <div className="text-center">
    <div className={`font-display text-[17px] font-bold leading-none ${tone}`}>{value}</div>
    <div className="text-[10px] whitespace-nowrap text-muted">{label}</div>
  </div>
)

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-dashed border-line bg-paper px-5 py-10 text-center text-[13px] leading-relaxed text-muted">
    {children}
  </div>
)
