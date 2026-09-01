import { useEffect, useMemo, useState } from 'react'
import { daysBetween, formatLabel, todayIso } from '../model/dates'
import { download, slugify } from '../model/io'
import type { Meeting } from '../model/project'
import { buildSummary, summaryMarkdown } from '../model/summary'
import type { CallNode, Model } from '../model/types'
import { useCallmap } from '../store/useCallmap'

/**
 * The wrap-up. What the meeting produced, in the order someone reads it after
 * the call — and one button to get it into an email.
 */
export function SummaryDialog({ meeting, model }: { meeting: Meeting; model: Model }) {
  const setShowSummary = useCallmap((s) => s.setShowSummary)
  const select = useCallmap((s) => s.select)
  const setView = useCallmap((s) => s.setView)
  const notify = useCallmap((s) => s.notify)

  const today = todayIso()
  const doc = useMemo(() => buildSummary(meeting, model), [meeting, model])
  const markdown = useMemo(() => summaryMarkdown(doc, today), [doc, today])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setShowSummary(false)
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [setShowSummary])

  const jump = (id: number) => {
    setShowSummary(false)
    setView('map')
    select(id)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]"
      onClick={() => setShowSummary(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Meeting summary"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-[620px] max-w-full flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_20px_60px_rgba(22,33,58,.3)]"
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[17px] font-bold tracking-[-0.02em] text-ink">
              {doc.title}
            </h2>
            <p className="text-[11.5px] text-muted">
              {formatLabel(doc.date, today)} · {doc.counts.decisions} decision
              {doc.counts.decisions === 1 ? '' : 's'} · {doc.counts.actions} action
              {doc.counts.actions === 1 ? '' : 's'} · {doc.counts.open} still open
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSummary(false)}
            aria-label="Close"
            className="ml-auto rounded-lg px-2 py-1 text-sm leading-none text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {doc.counts.decisions +
            doc.counts.actions +
            doc.counts.open +
            doc.counts.risks ===
          0 ? (
            <p className="py-8 text-center text-[13px] text-muted">
              Nothing recorded in this meeting yet.
            </p>
          ) : (
            <>
              <Section title="Decisions" tone="text-d" items={doc.decisions}>
                {(n) => <Line node={n} onJump={jump} />}
              </Section>

              <Section title="Actions" tone="text-f" items={doc.actions}>
                {(n) => (
                  <Line node={n} onJump={jump} today={today}>
                    <span
                      className={`mr-1.5 inline-block h-3 w-3 shrink-0 rounded-[3px] border text-center text-[8px] leading-[11px] ${
                        n.done ? 'border-a bg-a text-white' : 'border-[#AAB4C3] text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  </Line>
                )}
              </Section>

              <Section title="Still open" tone="text-q" items={doc.openQuestions}>
                {(n) => <Line node={n} onJump={jump} />}
              </Section>

              <Section title="Risks" tone="text-r" items={doc.risks}>
                {(n) => <Line node={n} onJump={jump} today={today} />}
              </Section>

              {doc.topics.some((t) => !t.covered) && (
                <div className="mb-3">
                  <Heading tone="text-muted">Not covered</Heading>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {doc.topics
                      .filter((t) => !t.covered)
                      .map((t) => (
                        <li
                          key={t.text}
                          className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11.5px] text-muted"
                        >
                          {t.text}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-4 py-2.5">
          <p className="mr-auto text-[11px] text-muted">Copies as Markdown, ready to paste.</p>
          <button
            type="button"
            onClick={() => {
              download(`${slugify(doc.title)}-summary.md`, markdown, 'text/markdown')
              notify('Summary downloaded')
            }}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink hover:border-[#AAB4C3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
          >
            Download .md
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-lg border border-q bg-q px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3450c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
          >
            {copied ? 'Copied' : 'Copy summary'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Section({
  title,
  tone,
  items,
  children,
}: {
  title: string
  tone: string
  items: CallNode[]
  children: (n: CallNode) => React.ReactNode
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-3">
      <Heading tone={tone}>
        {title} <span className="text-muted">({items.length})</span>
      </Heading>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((n) => (
          <li key={n.id}>{children(n)}</li>
        ))}
      </ul>
    </div>
  )
}

const Heading = ({ tone, children }: { tone: string; children: React.ReactNode }) => (
  <h3 className={`font-display text-[11px] font-bold tracking-[.08em] uppercase ${tone}`}>
    {children}
  </h3>
)

function Line({
  node,
  onJump,
  today,
  children,
}: {
  node: CallNode
  onJump: (id: number) => void
  today?: string
  children?: React.ReactNode
}) {
  const overdue = today && !node.done && node.due && daysBetween(today, node.due.iso) < 0

  return (
    <button
      type="button"
      onClick={() => onJump(node.id)}
      title="Show this on the map"
      className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
    >
      {children}
      <span className={`text-[13px] ${node.done ? 'text-muted line-through' : 'text-ink'}`}>
        {node.text || 'Untitled'}
      </span>
      {node.owner && <span className="font-mono text-[10.5px] text-muted">{node.owner}</span>}
      {node.date && (
        <span
          className={`font-mono text-[10.5px] ${overdue ? 'font-semibold text-overdue' : 'text-muted'}`}
        >
          {node.due ? node.due.label : node.date}
          {overdue && ' · late'}
        </span>
      )}
    </button>
  )
}
