import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useRef } from 'react'
import { cycleType, addChild, deleteNode, setNodeText } from '../model/edits'
import { parseText } from '../model/parse'
import type { CallNode, NodeType } from '../model/types'
import { TYPES } from '../model/types'
import { useCallmap } from '../store/useCallmap'
import { NODE_H, NODE_W } from './layout'

export interface CardData extends Record<string, unknown> {
  node: CallNode
  isDropTarget: boolean
}

export type CardFlowNode = Node<CardData, 'card'>

const SPINE: Record<NodeType, string> = {
  question: 'bg-q',
  answer: 'bg-a',
  action: 'bg-f',
  note: 'bg-muted',
}

export function CardNode({ data }: NodeProps<CardFlowNode>) {
  const { node, isDropTarget } = data
  const spec = TYPES[node.type]
  const cancelEdit = useRef(false)

  const text = useCallmap((s) => s.text)
  const selectedId = useCallmap((s) => s.selectedId)
  const editingId = useCallmap((s) => s.editingId)
  const flashId = useCallmap((s) => s.flashId)
  const applyEdit = useCallmap((s) => s.applyEdit)
  const setEditing = useCallmap((s) => s.setEditing)

  const isSelected = selectedId === node.id
  const isEditing = editingId === node.id
  const isOpen = node.type === 'question' && node.open === true

  /** Re-parse at the moment of the edit so indices are never stale. */
  const run = (fn: (t: string, m: ReturnType<typeof parseText>) => ReturnType<typeof setNodeText>) =>
    applyEdit(fn(text, parseText(text)))

  const border = isOpen
    ? 'border-dashed border-q'
    : isDropTarget
      ? 'border-a'
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
      className={`group relative flex rounded-xl border-[1.5px] bg-paper transition-transform ${border} ${ring} ${
        flashId === node.id ? 'motion-safe:animate-cm-flash' : ''
      }`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />

      <div className={`w-1.5 shrink-0 rounded-l-[10px] ${SPINE[node.type]}`} />

      <button
        type="button"
        className={`nodrag mt-2 ml-2 h-[26px] w-[26px] shrink-0 rounded-[7px] font-display text-[13px] leading-none font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${SPINE[node.type]}`}
        title={`${spec.label} — click to change type`}
        aria-label={`Type: ${spec.label}. Click to change.`}
        onClick={(e) => {
          e.stopPropagation()
          run((t, m) => cycleType(t, m, node.id))
        }}
      >
        {spec.glyph}
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-between overflow-hidden py-2 pr-2.5 pl-2">
        {isEditing ? (
          <textarea
            className="nodrag nowheel w-full flex-1 resize-none border-0 bg-transparent p-0 text-[13px] leading-[1.3] font-medium text-ink outline-0"
            autoFocus
            defaultValue={node.text}
            aria-label="Card text"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') {
                cancelEdit.current = true
                e.currentTarget.blur()
              }
            }}
            onBlur={(e) => {
              if (!cancelEdit.current) run((t, m) => setNodeText(t, m, node.id, e.target.value))
              cancelEdit.current = false
              setEditing(null)
            }}
          />
        ) : (
          <div
            className={`line-clamp-2 text-[13px] leading-[1.3] break-words ${
              node.text ? 'font-medium' : 'text-[#9AA3B2]'
            }`}
          >
            {node.text || `Untitled ${spec.label.toLowerCase()}`}
          </div>
        )}

        <div className="mt-1 flex gap-[5px] overflow-hidden">
          {node.type === 'question' &&
            (isOpen ? (
              <span className="rounded-full border border-dashed border-q px-1.5 text-[10.5px] leading-[1.5] text-q">
                open
              </span>
            ) : (
              <span className="rounded-full bg-[#DDF3EC] px-1.5 text-[10.5px] leading-[1.5] text-a">
                answered
              </span>
            ))}
          {node.owner && (
            <span className="rounded-full bg-[#EEF0F4] px-1.5 text-[10.5px] leading-[1.5] whitespace-nowrap text-muted">
              {node.owner}
            </span>
          )}
          {node.date && (
            <span className="rounded-full bg-[#FDE6D8] px-1.5 font-mono text-[10.5px] leading-[1.5] whitespace-nowrap text-[#B4460A]">
              {node.date}
            </span>
          )}
        </div>
      </div>

      {isSelected && !isEditing && (
        <div className="nodrag absolute top-full left-0 z-10 mt-1.5 flex gap-1 rounded-lg border border-line bg-white p-[3px] shadow-[0_4px_12px_rgba(22,33,58,.12)]">
          <ToolButton className="text-q" label="Add a question under this card" onClick={() => run((t, m) => addChild(t, m, node.id, 'question'))}>
            + Q
          </ToolButton>
          <ToolButton className="text-a" label="Add an answer under this card" onClick={() => run((t, m) => addChild(t, m, node.id, 'answer'))}>
            + A
          </ToolButton>
          <ToolButton className="text-f" label="Add a follow-up under this card" onClick={() => run((t, m) => addChild(t, m, node.id, 'action'))}>
            + →
          </ToolButton>
          <ToolButton className="text-[#B42318]" label="Delete this card and everything under it" onClick={() => run((t, m) => deleteNode(t, m, node.id))}>
            ✕
          </ToolButton>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
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
