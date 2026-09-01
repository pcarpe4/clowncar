import { useMemo } from 'react'
import { daysBetween, formatRelative } from '../model/dates'
import { toggleDone } from '../model/edits'
import type { CallNode } from '../model/types'
import { useCallmap } from '../store/useCallmap'

/**
 * The docked actions list.
 *
 * Same data as the aggregate card on the map, different job: this one floats
 * above the canvas and stays put while you pan, so what still has to happen is
 * never scrolled off during a call.
 */
export function ActionsPanel({ items, today }: { items: CallNode[]; today: string }) {
  const open = useCallmap((s) => s.showActionsPanel)
  const toggle = useCallmap((s) => s.toggleActionsPanel)
  const pinned = useCallmap((s) => s.showActionsCard)
  const togglePinned = useCallmap((s) => s.toggleActionsCard)
  const edit = useCallmap((s) => s.edit)
  const select = useCallmap((s) => s.select)
  const flash = useCallmap((s) => s.flash)

  const { todo, done, late } = useMemo(() => {
    const todo = items.filter((n) => !n.done)
    return {
      todo,
      done: items.filter((n) => n.done),
      late: todo.filter((n) => n.due && daysBetween(today, n.due.iso) < 0).length,
    }
  }, [items, today])

  if (items.length === 0) return null

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col">
      <div className="pointer-events-auto flex w-[270px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-paper/95 shadow-[0_6px_20px_rgba(22,33,58,.14)] backdrop-blur-sm">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5 text-left hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
        >
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-f font-display text-[10px] leading-none font-bold text-white">
            →
          </span>
          <span className="font-display text-[11px] font-bold tracking-[.08em] text-ink uppercase">
            Actions
          </span>
          <span className="ml-auto text-[10.5px] whitespace-nowrap text-muted">
            {todo.length} to do
            {late > 0 && <span className="ml-1 font-semibold text-overdue">· {late} late</span>}
          </span>
          <span className="text-[10px] text-muted">{open ? '▾' : '▸'}</span>
        </button>

        <button
          type="button"
          onClick={togglePinned}
          aria-pressed={pinned}
          title={pinned ? 'Remove the actions card from the map' : 'Also show these as a card on the map (included in the PNG export)'}
          className={`border-b border-line px-2.5 py-1 text-left text-[10.5px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-q ${
            pinned ? 'bg-f-soft/60 text-[#B4460A]' : 'text-muted hover:bg-canvas hover:text-ink'
          }`}
        >
          {pinned ? '✓ Shown as a card on the map' : '+ Also show as a card on the map'}
        </button>

        {open && (
          <div className="max-h-[38vh] overflow-y-auto">
            {todo.length === 0 && (
              <p className="px-2.5 py-2 text-[11px] text-muted">
                Everything here is ticked off.
              </p>
            )}
            {[...todo, ...done].map((n) => (
              <Row
                key={n.id}
                node={n}
                today={today}
                onToggle={() => edit((t, m) => toggleDone(t, m, n.id))}
                onJump={() => {
                  select(n.id)
                  flash(n.id)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({
  node,
  today,
  onToggle,
  onJump,
}: {
  node: CallNode
  today: string
  onToggle: () => void
  onJump: () => void
}) {
  const overdue = !node.done && !!node.due && daysBetween(today, node.due.iso) < 0

  return (
    <div className="flex items-center gap-1.5 border-b border-line/60 px-2 py-1.5 last:border-0">
      <button
        type="button"
        className={`h-3.5 w-3.5 shrink-0 rounded-[4px] border text-[9px] leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
          node.done ? 'border-a bg-a text-white' : 'border-[#AAB4C3] text-transparent hover:border-f'
        }`}
        title={node.done ? 'Done — click to reopen' : 'Mark done'}
        aria-label={`${node.done ? 'Reopen' : 'Complete'}: ${node.text}`}
        aria-pressed={node.done}
        onClick={onToggle}
      >
        ✓
      </button>

      <button
        type="button"
        onClick={onJump}
        title="Show this on the map"
        className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
      >
        <div
          className={`truncate text-[11.5px] leading-tight ${
            node.done ? 'text-muted line-through' : 'text-ink'
          }`}
        >
          {node.text || 'Untitled follow-up'}
        </div>
        {(node.owner || node.date) && (
          <div className="flex gap-1.5 text-[10px] leading-tight text-muted">
            {node.owner && <span className="font-mono">{node.owner}</span>}
            {node.date && (
              <span className={overdue ? 'font-semibold text-overdue' : ''}>
                {node.due ? formatRelative(node.due.iso, today) : node.date}
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  )
}
