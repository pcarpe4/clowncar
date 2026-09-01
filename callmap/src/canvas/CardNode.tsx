import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useRef } from 'react'
import { daysBetween, todayIso } from '../model/dates'
import { addChild, cycleType, deleteNode, setNodeText, toggleDone } from '../model/edits'
import type { Tile } from '../model/tiles'
import type { CallNode, NodeType } from '../model/types'
import { TYPES } from '../model/types'
import { useCallmap } from '../store/useCallmap'
import { ANSWER_H, NODE_H, NODE_W, tileHeight } from './layout'

export interface CardData extends Record<string, unknown> {
  tile: Tile
  isDropTarget: boolean
  collapsed: boolean
  /** How many tiles sit below this one — what collapsing would hide. */
  descendantCount: number
}

export type CardFlowNode = Node<CardData, 'card'>

/**
 * Type → class maps are written out in full rather than interpolated. Tailwind
 * scans source text for complete class names, so a template literal like
 * `bg-${token}` would compile to nothing.
 */
const SPINE: Record<NodeType, string> = {
  question: 'bg-q',
  answer: 'bg-a',
  decision: 'bg-d',
  action: 'bg-f',
  risk: 'bg-r',
  idea: 'bg-i',
  topic: 'bg-t',
  note: 'bg-muted',
}

const TEXT: Record<NodeType, string> = {
  question: 'text-q',
  answer: 'text-a',
  decision: 'text-d',
  action: 'text-f',
  risk: 'text-r',
  idea: 'text-i',
  topic: 'text-t',
  note: 'text-muted',
}

const isOverdue = (n: CallNode, today: string) =>
  !!n.due &&
  !n.done &&
  (n.type === 'action' || n.type === 'risk') &&
  daysBetween(today, n.due.iso) < 0

export function CardNode({ data }: NodeProps<CardFlowNode>) {
  const { tile, isDropTarget, collapsed, descendantCount } = data
  const node = tile.node
  const spec = TYPES[node.type]

  const selectedId = useCallmap((s) => s.selectedId)
  const editingId = useCallmap((s) => s.editingId)
  const flashId = useCallmap((s) => s.flashId)
  const edit = useCallmap((s) => s.edit)
  const toggleCollapse = useCallmap((s) => s.toggleCollapse)

  const isSelected = selectedId === node.id
  const isEditing = editingId === node.id
  const isOpen = node.type === 'question' && node.open === true
  const isRisk = node.type === 'risk'
  const today = todayIso()

  const border = isDropTarget
    ? 'border-a'
    : isOpen
      ? 'border-dashed border-q'
      : isRisk
        ? 'border-r/50'
        : isSelected
          ? 'border-q/40'
          : 'border-line'

  const ring = isDropTarget
    ? 'shadow-[0_0_0_3px_#A7E3D3] motion-safe:scale-[1.03]'
    : isSelected
      ? 'shadow-[0_0_0_3px_#C9D3FA,0_6px_16px_rgba(22,33,58,.12)]'
      : 'shadow-[0_1px_2px_rgba(22,33,58,.06)]'

  return (
    <div
      className={`group relative flex overflow-hidden rounded-xl border-[1.5px] bg-paper transition-transform ${border} ${ring} ${
        flashId === node.id ? 'motion-safe:animate-cm-flash' : ''
      }`}
      style={{ width: NODE_W, height: tileHeight(tile) }}
    >
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />

      {/* The spine is segmented, so a merged tile shows the colour of each part it holds. */}
      <div className="flex w-1.5 shrink-0 flex-col">
        <div className={`${SPINE[node.type]}`} style={{ height: NODE_H }} />
        {tile.absorbed.map((a) => (
          <div key={a.id} className={SPINE[a.type]} style={{ height: ANSWER_H }} />
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* --- the question (or whatever this tile is about) --- */}
        <div className="flex min-h-0" style={{ height: NODE_H }}>
          <button
            type="button"
            className={`nodrag mt-2 ml-2 h-[26px] w-[26px] shrink-0 rounded-[7px] font-display text-[13px] leading-none font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${SPINE[node.type]}`}
            title={`${spec.label} — click to change type`}
            aria-label={`Type: ${spec.label}. Click to change.`}
            onClick={(e) => {
              e.stopPropagation()
              edit((t, m) => cycleType(t, m, node.id))
            }}
          >
            {spec.glyph}
          </button>

          <div className="flex min-w-0 flex-1 flex-col justify-between overflow-hidden py-2 pr-2.5 pl-2">
            {isEditing ? (
              <InlineEditor id={node.id} value={node.text} />
            ) : (
              <div
                className={`line-clamp-2 text-[13px] leading-[1.3] break-words ${
                  node.type === 'topic' ? 'font-display font-bold' : 'font-medium'
                } ${node.text ? '' : 'text-[#9AA3B2]'} ${node.done ? 'text-muted line-through' : ''}`}
              >
                {node.text || `Untitled ${spec.label.toLowerCase()}`}
              </div>
            )}

            <div className="mt-1 flex gap-[5px] overflow-hidden">
              {node.type === 'question' &&
                (isOpen ? (
                  <Badge className="border border-dashed border-q text-q">open</Badge>
                ) : (
                  <Badge className="bg-a-soft text-a">answered</Badge>
                ))}
              {isRisk && <Badge className="bg-r-soft text-r">risk</Badge>}
              <NodeBadges node={node} today={today} />
            </div>
          </div>
        </div>

        {/* --- the answers and decisions that settle it --- */}
        {tile.absorbed.map((a) => (
          <AbsorbedRow key={a.id} node={a} today={today} editing={editingId === a.id} />
        ))}
      </div>

      {descendantCount > 0 && (
        <button
          type="button"
          className="nodrag absolute -bottom-2.5 left-1/2 z-10 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-white px-1.5 text-[10px] font-semibold text-muted shadow-[0_1px_3px_rgba(22,33,58,.14)] hover:border-[#AAB4C3] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
          title={
            collapsed
              ? `Show ${descendantCount} hidden card${descendantCount === 1 ? '' : 's'}`
              : 'Hide what sits below this card'
          }
          aria-label={collapsed ? `Expand ${descendantCount} hidden cards` : 'Collapse children'}
          aria-expanded={!collapsed}
          onClick={(e) => {
            e.stopPropagation()
            toggleCollapse(node.id)
          }}
        >
          {collapsed ? `+${descendantCount}` : '−'}
        </button>
      )}

      {isSelected && !isEditing && (
        <div className="nodrag absolute top-full left-0 z-20 mt-3 flex gap-1 rounded-lg border border-line bg-white p-[3px] shadow-[0_4px_12px_rgba(22,33,58,.12)]">
          <ToolButton className={TEXT.question} label="Add a question under this card" onClick={() => edit((t, m) => addChild(t, m, node.id, 'question'))}>
            + Q
          </ToolButton>
          <ToolButton className={TEXT.answer} label="Add an answer to this card" onClick={() => edit((t, m) => addChild(t, m, node.id, 'answer'))}>
            + A
          </ToolButton>
          <ToolButton className={TEXT.decision} label="Add a decision to this card" onClick={() => edit((t, m) => addChild(t, m, node.id, 'decision'))}>
            + D
          </ToolButton>
          <ToolButton className={TEXT.action} label="Add a follow-up under this card" onClick={() => edit((t, m) => addChild(t, m, node.id, 'action'))}>
            + →
          </ToolButton>
          <ToolButton className={TEXT.risk} label="Add a risk under this card" onClick={() => edit((t, m) => addChild(t, m, node.id, 'risk'))}>
            + !
          </ToolButton>
          <ToolButton className="text-[#B42318]" label="Delete this card and everything under it" onClick={() => edit((t, m) => deleteNode(t, m, node.id))}>
            ✕
          </ToolButton>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  )
}

/** One answer or decision, drawn inside the question it settles. */
function AbsorbedRow({ node, today, editing }: { node: CallNode; today: string; editing: boolean }) {
  const edit = useCallmap((s) => s.edit)
  const setEditing = useCallmap((s) => s.setEditing)
  const spec = TYPES[node.type]

  return (
    <div
      className="flex items-center gap-1.5 border-t border-line px-2 py-1"
      style={{ height: ANSWER_H }}
    >
      <button
        type="button"
        className={`nodrag h-[18px] w-[18px] shrink-0 rounded-[5px] font-display text-[10px] leading-none font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${SPINE[node.type]}`}
        title={`${spec.label} — click to change type`}
        aria-label={`Type: ${spec.label}. Click to change.`}
        onClick={(e) => {
          e.stopPropagation()
          edit((t, m) => cycleType(t, m, node.id))
        }}
      >
        {spec.glyph}
      </button>

      {editing ? (
        <InlineEditor id={node.id} value={node.text} single />
      ) : (
        <button
          type="button"
          className="nodrag min-w-0 flex-1 truncate text-left text-[12px] leading-[1.3] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
          title="Click to edit"
          onClick={(e) => {
            e.stopPropagation()
            setEditing(node.id)
          }}
        >
          {node.text || <span className="text-[#9AA3B2]">Untitled {spec.label.toLowerCase()}</span>}
        </button>
      )}

      <NodeBadges node={node} today={today} />

      <button
        type="button"
        className="nodrag shrink-0 rounded px-1 text-[11px] leading-none text-transparent group-hover:text-muted hover:!text-overdue focus-visible:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
        title={`Delete this ${spec.label.toLowerCase()}`}
        aria-label={`Delete this ${spec.label.toLowerCase()}`}
        onClick={(e) => {
          e.stopPropagation()
          edit((t, m) => deleteNode(t, m, node.id))
        }}
      >
        ✕
      </button>
    </div>
  )
}

function InlineEditor({ id, value, single }: { id: number; value: string; single?: boolean }) {
  const edit = useCallmap((s) => s.edit)
  const setEditing = useCallmap((s) => s.setEditing)
  const cancel = useRef(false)

  return (
    <textarea
      className={`nodrag nowheel w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-[1.3] font-medium text-ink outline-0 ${
        single ? 'min-w-0 flex-1 text-[12px]' : 'flex-1'
      }`}
      autoFocus
      defaultValue={value}
      aria-label="Card text"
      rows={single ? 1 : undefined}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          cancel.current = true
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        if (!cancel.current) edit((t, m) => setNodeText(t, m, id, e.target.value))
        cancel.current = false
        setEditing(null)
      }}
    />
  )
}

function NodeBadges({ node, today }: { node: CallNode; today: string }) {
  const edit = useCallmap((s) => s.edit)
  const overdue = isOverdue(node, today)

  return (
    <>
      {node.type === 'decision' && <Badge className="bg-d-soft text-d">decided</Badge>}
      {node.type === 'action' && (
        <button
          type="button"
          className={`nodrag shrink-0 rounded-full px-1.5 text-[10.5px] leading-[1.5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
            node.done ? 'bg-a-soft text-a' : 'bg-muted-soft text-muted hover:text-ink'
          }`}
          title={node.done ? 'Done — click to reopen' : 'Mark this follow-up done'}
          aria-pressed={node.done}
          onClick={(e) => {
            e.stopPropagation()
            edit((t, m) => toggleDone(t, m, node.id))
          }}
        >
          {node.done ? '✓ done' : '○ to do'}
        </button>
      )}
      {node.owner && <Badge className="bg-muted-soft text-muted">{node.owner}</Badge>}
      {node.date && (
        <Badge
          className={`font-mono ${overdue ? 'bg-r-soft text-overdue' : 'bg-f-soft text-[#B4460A]'}`}
          title={node.due ? undefined : `“${node.date}” is not a date we can place on a timeline`}
        >
          {node.due ? node.due.label : node.date}
          {node.due?.approximate && '≈'}
        </Badge>
      )}
    </>
  )
}

function Badge({
  children,
  className,
  title,
}: {
  children: React.ReactNode
  className: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={`shrink-0 rounded-full px-1.5 text-[10.5px] leading-[1.5] whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  )
}

function ToolButton({
  children,
  className,
  label,
  onClick,
}: {
  children: React.ReactNode
  className: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`rounded-[5px] bg-[#F3F5F8] px-[7px] py-1 text-[11.5px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}
