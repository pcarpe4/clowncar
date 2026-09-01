import { type Node, type NodeProps } from '@xyflow/react'
import { daysBetween } from '../model/dates'
import { toggleDone } from '../model/edits'
import type { CallNode } from '../model/types'
import { useCallmap } from '../store/useCallmap'
import {
  ACTIONS_HEADER,
  ACTIONS_MAX_ROWS,
  ACTIONS_ROW,
  ACTIONS_W,
  actionsHeight,
} from './layout'

/**
 * The aggregate actions tile.
 *
 * It has no line in the notes — it is a view over every follow-up in the
 * meeting — so it carries a reserved graph key rather than a node id, and it
 * exports into the PNG along with the rest of the map.
 */

export interface ActionsData extends Record<string, unknown> {
  items: CallNode[]
  today: string
}

export type ActionsFlowNode = Node<ActionsData, 'actions'>

export function ActionsCard({ data }: NodeProps<ActionsFlowNode>) {
  const { items, today } = data
  const edit = useCallmap((s) => s.edit)
  const select = useCallmap((s) => s.select)
  const flash = useCallmap((s) => s.flash)

  const outstanding = items.filter((n) => !n.done)
  const late = outstanding.filter((n) => n.due && daysBetween(today, n.due.iso) < 0).length
  const shown = items.slice(0, ACTIONS_MAX_ROWS)

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border-[1.5px] border-f/40 bg-paper shadow-[0_1px_2px_rgba(22,33,58,.06)]"
      style={{ width: ACTIONS_W, height: actionsHeight(items.length) }}
    >
      <div
        className="flex items-center gap-1.5 border-b border-line bg-f-soft/50 px-2.5"
        style={{ height: ACTIONS_HEADER }}
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-f font-display text-[10px] leading-none font-bold text-white">
          →
        </span>
        <span className="font-display text-[11px] font-bold tracking-[.08em] text-ink uppercase">
          Actions
        </span>
        <span className="ml-auto text-[10.5px] whitespace-nowrap text-muted">
          {outstanding.length} to do
          {late > 0 && <span className="ml-1 font-semibold text-overdue">· {late} late</span>}
        </span>
      </div>

      <div className="flex flex-col">
        {shown.map((n) => {
          const overdue = !n.done && !!n.due && daysBetween(today, n.due.iso) < 0
          return (
            <div
              key={n.id}
              className="flex items-center gap-1.5 border-b border-line/60 px-2 last:border-0"
              style={{ height: ACTIONS_ROW }}
            >
              <button
                type="button"
                className={`nodrag h-3.5 w-3.5 shrink-0 rounded-[4px] border text-[9px] leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
                  n.done ? 'border-a bg-a text-white' : 'border-[#AAB4C3] text-transparent hover:border-f'
                }`}
                title={n.done ? 'Done — click to reopen' : 'Mark done'}
                aria-label={`${n.done ? 'Reopen' : 'Complete'}: ${n.text}`}
                aria-pressed={n.done}
                onClick={(e) => {
                  e.stopPropagation()
                  edit((t, m) => toggleDone(t, m, n.id))
                }}
              >
                ✓
              </button>

              <button
                type="button"
                className="nodrag min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                title={`${n.text} — show on the map`}
                onClick={(e) => {
                  e.stopPropagation()
                  select(n.id)
                  flash(n.id)
                }}
              >
                <div
                  className={`truncate text-[11.5px] leading-tight ${
                    n.done ? 'text-muted line-through' : 'text-ink'
                  }`}
                >
                  {n.text || 'Untitled follow-up'}
                </div>
                <div className="flex gap-1.5 font-mono text-[9.5px] leading-tight text-muted">
                  {n.owner && <span>{n.owner}</span>}
                  {n.date && (
                    <span className={overdue ? 'font-semibold text-overdue' : ''}>
                      {n.due ? n.due.label : n.date}
                    </span>
                  )}
                </div>
              </button>
            </div>
          )
        })}

        {items.length > ACTIONS_MAX_ROWS && (
          <div className="px-2.5 py-1 text-[10px] text-muted">
            +{items.length - ACTIONS_MAX_ROWS} more in the Actions panel
          </div>
        )}
      </div>
    </div>
  )
}
