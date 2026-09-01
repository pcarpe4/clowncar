import { useMemo } from 'react'
import { daysBetween, formatLabel, formatRelative, todayIso } from '../model/dates'
import { datedItems, ownerLoad, undatedWithText, type DatedItem } from '../model/derive'
import type { Model, NodeType } from '../model/types'
import { TYPES } from '../model/types'
import { useCallmap } from '../store/useCallmap'

const CARD_W = 186
const LANE_H = 62
const PAD = 28
const AXIS_H = 44

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

interface Placed extends DatedItem {
  x: number
  lane: number
}

/**
 * Pack items into lanes so no two cards overlap horizontally: walk them in date
 * order and drop each into the first lane whose last card has already ended.
 */
function pack(items: DatedItem[], xOf: (iso: string) => number): Placed[] {
  const laneEnds: number[] = []
  return items.map((item) => {
    const x = xOf(item.iso)
    let lane = laneEnds.findIndex((end) => end <= x)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = x + CARD_W + 10
    return { ...item, x, lane }
  })
}

export function TimelineView({ model }: { model: Model }) {
  const select = useCallmap((s) => s.select)
  const setView = useCallmap((s) => s.setView)
  const today = todayIso()

  const dated = useMemo(() => datedItems(model), [model])
  const unparsed = useMemo(() => undatedWithText(model), [model])
  const owners = useMemo(() => ownerLoad(model, today), [model, today])

  const geometry = useMemo(() => {
    if (dated.length === 0) return null

    // Always include today, so "everything is overdue" still reads as such.
    const days = [...dated.map((d) => d.iso), today]
    const min = days.reduce((a, b) => (a < b ? a : b))
    const max = days.reduce((a, b) => (a > b ? a : b))
    const span = Math.max(1, daysBetween(min, max))
    const pxPerDay = Math.max(16, Math.min(90, 880 / span))
    const xOf = (iso: string) => PAD + daysBetween(min, iso) * pxPerDay
    const placed = pack(dated, xOf)
    const lanes = Math.max(1, ...placed.map((p) => p.lane + 1))

    // A tick for each day that carries something, plus today.
    const tickDays = [...new Set([...dated.map((d) => d.iso), today])].sort()

    return {
      min,
      max,
      span,
      pxPerDay,
      xOf,
      placed,
      lanes,
      tickDays,
      width: PAD * 2 + span * pxPerDay + CARD_W,
      height: AXIS_H + lanes * LANE_H + 16,
    }
  }, [dated, today])

  const jumpTo = (id: number) => {
    select(id)
    setView('map')
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas">
      <div className="p-4">
        {!geometry ? (
          <EmptyTimeline hasUnparsed={unparsed.length > 0} />
        ) : (
          <section className="rounded-2xl border border-line bg-paper p-3">
            <SectionTitle>
              Timeline
              <span className="ml-2 font-ui text-[11px] font-normal tracking-normal normal-case text-muted">
                {formatLabel(geometry.min, today)} → {formatLabel(geometry.max, today)} ·{' '}
                {dated.length} dated item{dated.length === 1 ? '' : 's'}
              </span>
            </SectionTitle>

            <div className="overflow-x-auto">
              <div
                className="relative"
                style={{ width: geometry.width, height: geometry.height }}
                role="list"
                aria-label="Dated items"
              >
                {/* day gridlines + labels */}
                {geometry.tickDays.map((iso) => {
                  const x = geometry.xOf(iso)
                  const isToday = iso === today
                  return (
                    <div key={iso} className="absolute top-0 bottom-0" style={{ left: x }}>
                      <div
                        className={`absolute top-[26px] bottom-0 w-px ${
                          isToday ? 'bg-q/50' : 'bg-line'
                        }`}
                      />
                      <div
                        className={`absolute top-0 left-0 whitespace-nowrap font-mono text-[10.5px] ${
                          isToday ? 'font-semibold text-q' : 'text-muted'
                        }`}
                      >
                        {isToday ? 'today' : formatLabel(iso, today)}
                      </div>
                    </div>
                  )
                })}

                {/* the items */}
                {geometry.placed.map((item) => {
                  const overdue =
                    (item.node.type === 'action' || item.node.type === 'risk') &&
                    daysBetween(today, item.iso) < 0
                  const spec = TYPES[item.node.type]
                  return (
                    <button
                      key={item.node.id}
                      type="button"
                      role="listitem"
                      onClick={() => jumpTo(item.node.id)}
                      title={`${spec.label} — open in the map`}
                      className={`absolute flex flex-col gap-1 rounded-xl border-[1.5px] bg-paper px-2.5 py-1.5 text-left shadow-[0_1px_2px_rgba(22,33,58,.06)] hover:shadow-[0_4px_12px_rgba(22,33,58,.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
                        overdue ? 'border-r/60' : 'border-line'
                      }`}
                      style={{
                        left: item.x,
                        top: AXIS_H + item.lane * LANE_H,
                        width: CARD_W,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[item.node.type]}`} />
                        <span className="truncate text-[12px] font-medium text-ink">
                          {item.node.text || `Untitled ${spec.label.toLowerCase()}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px] whitespace-nowrap">
                        <span className={overdue ? 'font-semibold text-overdue' : 'text-muted'}>
                          {formatRelative(item.iso, today)}
                          {item.approximate && ' ≈'}
                        </span>
                        {item.node.owner && (
                          <span className="truncate rounded-full bg-muted-soft px-1.5 text-muted">
                            {item.node.owner}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {owners.length > 0 && (
            <section className="rounded-2xl border border-line bg-paper p-3">
              <SectionTitle>Who owns what</SectionTitle>
              <ul className="mt-1.5 flex flex-col gap-1">
                {owners.map((o) => (
                  <li key={o.owner} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 truncate font-semibold text-ink">{o.owner}</span>
                    {/*
                      One fixed-width block per item, not `flex-1` — a shared
                      scale is the whole point of the row. Stretching each
                      person's blocks to fill the track would make one item look
                      like the same workload as five.
                    */}
                    <span className="flex min-w-0 flex-1 gap-0.5">
                      {o.items.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => jumpTo(n.id)}
                          title={n.text}
                          aria-label={`${n.text} — open in the map`}
                          className={`h-3.5 w-4 shrink-0 rounded-sm ${DOT[n.type]} opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-q`}
                        />
                      ))}
                    </span>
                    <span className="w-16 shrink-0 text-right text-muted">
                      {o.items.length} item{o.items.length === 1 ? '' : 's'}
                    </span>
                    {o.overdue > 0 && (
                      <span className="shrink-0 rounded-full bg-r-soft px-1.5 text-[10px] font-semibold text-overdue">
                        {o.overdue} late
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {unparsed.length > 0 && (
            <section className="rounded-2xl border border-dashed border-line bg-paper p-3">
              <SectionTitle>Not placed</SectionTitle>
              <p className="mt-1 text-[11px] leading-normal text-muted">
                These carry an <code className="font-mono">@</code> date we could not read, so they
                have no place on the axis. Try <code className="font-mono">@Sep 3</code>,{' '}
                <code className="font-mono">@friday</code> or <code className="font-mono">@eom</code>.
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {unparsed.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => jumpTo(n.id)}
                      className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink hover:border-[#AAB4C3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                    >
                      {n.text || 'Untitled'}{' '}
                      <span className="font-mono text-muted">@{n.date}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-[11px] font-bold tracking-[.08em] text-muted uppercase">
    {children}
  </h2>
)

function EmptyTimeline({ hasUnparsed }: { hasUnparsed: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-paper px-5 py-8 text-center text-[13px] leading-relaxed text-muted">
      Nothing on the timeline yet.
      <br />
      Add <code className="rounded bg-canvas px-1 font-mono text-ink">@Sep 3</code> —{' '}
      or <code className="rounded bg-canvas px-1 font-mono text-ink">@friday</code>,{' '}
      <code className="rounded bg-canvas px-1 font-mono text-ink">@eom</code> — to a line in the
      notes and it appears here.
      {hasUnparsed && (
        <div className="mt-2 text-[12px]">Some dates below could not be read.</div>
      )}
    </div>
  )
}
