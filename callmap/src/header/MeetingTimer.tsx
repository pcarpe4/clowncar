import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../model/dates'
import { useCallmap } from '../store/useCallmap'

export function MeetingTimer() {
  const timer = useCallmap((s) => s.timer)
  const start = useCallmap((s) => s.startTimer)
  const pause = useCallmap((s) => s.pauseTimer)
  const reset = useCallmap((s) => s.resetTimer)

  const [, forceTick] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Re-render once a second while running. The store is not touched — elapsed
  // time is derived from `since`, so there is nothing to write.
  useEffect(() => {
    if (!timer.running) return
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [timer.running])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const now = Date.now()
  const live = timer.running && timer.since !== null ? now - timer.since : 0
  const elapsed = timer.total + live

  // Fold the segment in flight into the breakdown so it counts up live too.
  const byTopic = { ...timer.byTopic }
  if (live > 0) {
    const key = timer.activeTopic ?? ''
    byTopic[key] = (byTopic[key] ?? 0) + live
  }
  const rows = Object.entries(byTopic)
    .filter(([, ms]) => ms >= 1000)
    .sort((a, b) => b[1] - a[1])
  const longest = rows.length > 0 ? rows[0]![1] : 1

  return (
    <div ref={ref} className="relative flex items-center">
      <div
        className={`flex items-stretch overflow-hidden rounded-lg border ${
          timer.running ? 'border-q bg-q-soft' : 'border-line bg-white'
        }`}
      >
        <button
          type="button"
          onClick={timer.running ? pause : start}
          title={timer.running ? 'Pause the meeting clock' : 'Start the meeting clock'}
          aria-label={timer.running ? 'Pause the meeting clock' : 'Start the meeting clock'}
          className={`px-2 text-[11px] leading-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-q ${
            timer.running ? 'text-q' : 'text-muted hover:text-ink'
          }`}
        >
          {timer.running ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title="Time spent per topic"
          className={`border-l py-1.5 pr-2.5 pl-2 font-mono text-xs tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-q ${
            timer.running ? 'border-q/30 font-semibold text-q' : 'border-line text-muted hover:text-ink'
          }`}
        >
          {formatDuration(elapsed)}
        </button>
      </div>

      {open && (
        <div className="absolute top-full right-0 z-30 mt-1.5 w-[268px] rounded-xl border border-line bg-white p-2.5 shadow-[0_10px_28px_rgba(22,33,58,.16)]">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-display text-[11px] font-bold tracking-[.08em] text-muted uppercase">
              Time per topic
            </span>
            <button
              type="button"
              onClick={reset}
              className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
            >
              Reset
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted">
              Start the clock and it follows along — whichever <code className="font-mono">#</code>{' '}
              topic you are typing under is the one being timed.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map(([topic, ms]) => (
                <li key={topic} className="text-[11px]">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        (timer.activeTopic ?? '') === topic ? 'font-semibold text-ink' : 'text-ink'
                      }`}
                    >
                      {topic || <span className="text-muted italic">outside any topic</span>}
                    </span>
                    <span className="font-mono text-[10.5px] text-muted tabular-nums">
                      {formatDuration(ms)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className={(timer.activeTopic ?? '') === topic ? 'h-full bg-q' : 'h-full bg-muted/50'}
                      style={{ width: `${Math.max(3, (ms / longest) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
