import { useMemo, useState } from 'react'
import { collapseUnchanged, diffLines, summarize } from '../model/diff'
import type { Meeting } from '../model/project'
import { useCallmap } from '../store/useCallmap'

/** "just now" / "14m ago" / "3d ago" — enough to find a restore point by. */
function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function VersionsPane({ meeting }: { meeting: Meeting }) {
  const saveVersion = useCallmap((s) => s.saveVersion)
  const restoreVersion = useCallmap((s) => s.restoreVersion)
  const deleteVersion = useCallmap((s) => s.deleteVersion)
  const compareVersionId = useCallmap((s) => s.compareVersionId)
  const setCompareVersion = useCallmap((s) => s.setCompareVersion)
  const toggleVersions = useCallmap((s) => s.toggleVersions)

  const [label, setLabel] = useState('')
  const now = Date.now()

  // Newest first — the version you want is nearly always a recent one.
  const versions = useMemo(() => [...meeting.versions].reverse(), [meeting.versions])
  const comparing = versions.find((v) => v.id === compareVersionId) ?? null

  const rows = useMemo(
    () => (comparing ? collapseUnchanged(diffLines(comparing.text, meeting.text), 2) : null),
    [comparing, meeting.text],
  )
  const totals = useMemo(
    () => (comparing ? summarize(diffLines(comparing.text, meeting.text)) : null),
    [comparing, meeting.text],
  )

  const commit = () => {
    saveVersion(label)
    setLabel('')
  }

  return (
    <aside className="flex h-[45vh] shrink-0 flex-col border-t border-line bg-paper md:h-auto md:w-80 md:border-t-0 md:border-l">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-display text-[11px] font-bold tracking-[.08em] text-muted uppercase">
          History
        </span>
        <button
          type="button"
          onClick={toggleVersions}
          aria-label="Close history"
          title="Close history"
          className="rounded px-1.5 text-sm leading-none text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-1.5 border-b border-line px-3 py-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder="Name this version…"
          aria-label="Version name"
          className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 text-xs text-ink outline-0 focus:border-q"
        />
        <button
          type="button"
          onClick={commit}
          className="shrink-0 rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-[#AAB4C3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
        >
          Save
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {versions.length === 0 ? (
          <p className="px-3 py-4 text-[11.5px] leading-relaxed text-muted">
            No versions yet. Callmap saves one automatically as you work, and you can name one at any
            point to come back to.
          </p>
        ) : (
          <ul>
            {versions.map((v) => {
              const active = v.id === compareVersionId
              return (
                <li key={v.id} className={`border-b border-line/60 ${active ? 'bg-q-soft/40' : ''}`}>
                  <div className="flex items-center gap-1 px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setCompareVersion(active ? null : v.id)}
                      aria-expanded={active}
                      className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-medium text-ink">{v.label}</span>
                        {v.auto && (
                          <span className="shrink-0 rounded-full bg-muted-soft px-1.5 text-[9.5px] text-muted">
                            auto
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-muted">{ago(v.at, now)}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => restoreVersion(v.id)}
                      title="Replace the current notes with this version"
                      className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-medium text-ink hover:border-[#AAB4C3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteVersion(v.id)}
                      title="Delete this version"
                      aria-label={`Delete version ${v.label}`}
                      className="shrink-0 rounded px-1 text-[11px] text-muted hover:text-overdue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                    >
                      ✕
                    </button>
                  </div>

                  {active && rows && totals && (
                    <div className="border-t border-line bg-canvas/60 px-2 py-1.5">
                      <div className="mb-1 flex gap-2 px-1 font-mono text-[10px]">
                        {totals.identical ? (
                          <span className="text-muted">identical to the current notes</span>
                        ) : (
                          <>
                            <span className="text-a">+{totals.added}</span>
                            <span className="text-overdue">−{totals.removed}</span>
                            <span className="text-muted">since this version</span>
                          </>
                        )}
                      </div>
                      <pre className="max-h-64 overflow-auto font-mono text-[10.5px] leading-[1.5]">
                        {rows.map((row, i) =>
                          row === null ? (
                            <div key={`gap-${i}`} className="px-1 text-muted select-none">
                              ⋯
                            </div>
                          ) : (
                            <div
                              key={`${row.kind}-${row.left}-${row.right}-${i}`}
                              className={`px-1 ${
                                row.kind === 'add'
                                  ? 'bg-a-soft text-a'
                                  : row.kind === 'del'
                                    ? 'bg-r-soft text-overdue'
                                    : 'text-muted'
                              }`}
                            >
                              <span className="select-none opacity-60">
                                {row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '}
                              </span>
                              {row.text || ' '}
                            </div>
                          ),
                        )}
                      </pre>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
