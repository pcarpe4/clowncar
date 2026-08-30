import { useReactFlow } from '@xyflow/react'
import { useState } from 'react'
import { NODE_H, NODE_W } from '../canvas/layout'
import { downloadPng } from '../canvas/exportPng'
import { followUpStats, openQuestions } from '../model/derive'
import type { Model } from '../model/types'
import { useCallmap } from '../store/useCallmap'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Header({ model }: { model: Model }) {
  const { fitView, zoomIn, zoomOut, setCenter, getNode, getNodes, getZoom } = useReactFlow()
  const text = useCallmap((s) => s.text)
  const showNotes = useCallmap((s) => s.showNotes)
  const toggleNotes = useCallmap((s) => s.toggleNotes)
  const clearPositions = useCallmap((s) => s.clearPositions)
  const select = useCallmap((s) => s.select)
  const flash = useCallmap((s) => s.flash)
  const [copied, setCopied] = useState(false)

  const open = openQuestions(model)
  const follow = followUpStats(model)

  const focusNode = (id: number) => {
    const node = getNode(String(id))
    if (!node) return
    setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
      zoom: getZoom(),
      duration: prefersReducedMotion() ? 0 : 400,
    })
    select(id)
    flash(id)
  }

  const tidy = () => {
    clearPositions()
    // Let the rebuilt layout land before framing it.
    requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1.2 }))
  }

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <header className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line bg-paper px-3.5 py-2.5">
      <div className="flex items-center gap-2 font-display text-[18px] font-bold tracking-[-0.02em]">
        <span className="h-2.5 w-2.5 rounded-full bg-q shadow-[0_0_0_3px_#E4E9FB]" />
        Callmap
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="font-display text-[11px] font-bold tracking-[.08em] whitespace-nowrap text-muted uppercase">
          Still open
        </span>
        {open.length === 0 ? (
          <span className="text-xs whitespace-nowrap text-muted">
            none — every question has an answer
          </span>
        ) : (
          open.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => focusNode(n.id)}
              title="Jump to this question"
              className="max-w-[190px] shrink-0 overflow-hidden rounded-full border-[1.5px] border-dashed border-q bg-white px-2.5 py-[3px] text-xs font-medium text-ellipsis whitespace-nowrap text-q hover:bg-[#E4E9FB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
            >
              {n.text || 'Untitled question'}
            </button>
          ))
        )}
      </div>

      <span className="text-xs whitespace-nowrap text-muted">
        <b className="font-semibold text-f">{follow.total}</b> follow-up
        {follow.total === 1 ? '' : 's'}
        {follow.dated > 0 && `, ${follow.dated} dated`}
      </span>

      <div className="ml-auto flex gap-1.5">
        <Btn onClick={toggleNotes}>{showNotes ? 'Hide notes' : 'Show notes'}</Btn>
        <Btn onClick={tidy} title="Re-run the automatic layout and clear hand-placed cards">
          Tidy
        </Btn>
        <Btn onClick={() => fitView({ padding: 0.2, maxZoom: 1.2 })} title="Fit everything on screen">
          Fit
        </Btn>
        <Btn onClick={() => zoomOut()} label="Zoom out">
          −
        </Btn>
        <Btn onClick={() => zoomIn()} label="Zoom in">
          +
        </Btn>
        <Btn onClick={copyMarkdown} title="Copy the notes as a Markdown outline">
          {copied ? 'Copied' : 'Copy MD'}
        </Btn>
        <Btn onClick={() => void downloadPng(getNodes())} title="Download the map as a PNG">
          PNG
        </Btn>
      </div>
    </header>
  )
}

function Btn({
  children,
  onClick,
  title,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink hover:border-[#AAB4C3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
    >
      {children}
    </button>
  )
}
