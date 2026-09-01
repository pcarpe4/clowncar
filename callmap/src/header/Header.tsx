import { useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { NODE_H, NODE_W } from '../canvas/layout'
import { downloadPng } from '../canvas/exportPng'
import { todayIso } from '../model/dates'
import { meetingStats, openQuestions } from '../model/derive'
import {
  download,
  exportBundle,
  exportMeetingMarkdown,
  exportProjectMarkdown,
  pickFile,
  readBundle,
  readMeetingMarkdown,
  slugify,
} from '../model/io'
import type { Model } from '../model/types'
import { MeetingTimer } from './MeetingTimer'
import {
  useActiveMeeting,
  useActiveProject,
  useCallmap,
  useText,
  type View,
} from '../store/useCallmap'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const VIEWS: { id: View; label: string; title: string }[] = [
  { id: 'map', label: 'Map', title: 'The meeting as a tree of cards' },
  { id: 'timeline', label: 'Timeline', title: 'Dated items on a calendar axis' },
  { id: 'project', label: 'Project', title: 'How this project has evolved across meetings' },
]

export function Header({ model }: { model: Model }) {
  const { fitView, zoomIn, zoomOut, setCenter, getNode, getNodes, getZoom } = useReactFlow()
  const text = useText()
  const project = useActiveProject()
  const meeting = useActiveMeeting()

  const view = useCallmap((s) => s.view)
  const setView = useCallmap((s) => s.setView)
  const showSidebar = useCallmap((s) => s.showSidebar)
  const toggleSidebar = useCallmap((s) => s.toggleSidebar)
  const showNotes = useCallmap((s) => s.showNotes)
  const toggleNotes = useCallmap((s) => s.toggleNotes)
  const showVersions = useCallmap((s) => s.showVersions)
  const toggleVersions = useCallmap((s) => s.toggleVersions)
  const clearPositions = useCallmap((s) => s.clearPositions)
  const setCollapsed = useCallmap((s) => s.setCollapsed)
  const select = useCallmap((s) => s.select)
  const flash = useCallmap((s) => s.flash)
  const renameMeeting = useCallmap((s) => s.renameMeeting)
  const setMeetingDate = useCallmap((s) => s.setMeetingDate)
  const importProjects = useCallmap((s) => s.importProjects)
  const importMeeting = useCallmap((s) => s.importMeeting)
  const setShowSummary = useCallmap((s) => s.setShowSummary)
  const notify = useCallmap((s) => s.notify)

  const [copied, setCopied] = useState(false)

  const today = todayIso()
  const open = openQuestions(model)
  const stats = meetingStats(model, today)

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
    setCollapsed([])
    // Let the rebuilt layout land before framing it.
    requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1.2 }))
  }

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const runImport = async () => {
    const file = await pickFile('.json,.md,.txt,.markdown')
    if (!file) return
    if (file.name.endsWith('.json')) {
      const result = readBundle(file.text)
      if (result.ok) importProjects(result.projects)
      else notify(result.error)
      return
    }
    importMeeting(readMeetingMarkdown(file.text, file.name.replace(/\.[^.]+$/, '')))
  }

  return (
    <header className="border-b border-line bg-paper">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 pt-2.5 pb-2">
        <button
          type="button"
          onClick={toggleSidebar}
          title={showSidebar ? 'Hide the project list' : 'Show the project list'}
          aria-label={showSidebar ? 'Hide the project list' : 'Show the project list'}
          aria-pressed={showSidebar}
          className="hidden rounded-lg border border-line bg-white px-2 py-1.5 text-xs leading-none text-muted hover:border-[#AAB4C3] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q md:block"
        >
          ☰
        </button>

        <div className="flex items-center gap-2 font-display text-[18px] font-bold tracking-[-0.02em]">
          <span className="h-2.5 w-2.5 rounded-full bg-q shadow-[0_0_0_3px_#E4E9FB]" />
          Callmap
        </div>

        {meeting && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs whitespace-nowrap text-muted">{project?.name}</span>
            <span className="text-muted">/</span>
            <input
              value={meeting.title}
              onChange={(e) => renameMeeting(meeting.id, e.target.value)}
              aria-label="Meeting title"
              className="min-w-0 max-w-[220px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-ink hover:border-line focus:border-q focus-visible:outline-0"
            />
            <input
              type="date"
              value={meeting.date}
              onChange={(e) => e.target.value && setMeetingDate(meeting.id, e.target.value)}
              aria-label="Meeting date"
              title="The day this meeting happened — relative dates like “friday” resolve against it"
              className="rounded-md border border-transparent bg-transparent px-1 py-1 font-mono text-[11.5px] text-muted hover:border-line focus:border-q focus-visible:outline-0"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex rounded-lg border border-line p-0.5" role="tablist" aria-label="View">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                title={v.title}
                onClick={() => setView(v.id)}
                className={`rounded-[6px] px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
                  view === v.id ? 'bg-q text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view === 'map' && (
            <>
              <Btn onClick={toggleNotes}>{showNotes ? 'Hide notes' : 'Show notes'}</Btn>
              <Btn onClick={tidy} title="Re-run the automatic layout, clearing hand-placed cards and folds">
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
            </>
          )}

          <MeetingTimer />

          <Btn
            onClick={toggleVersions}
            title="Saved versions of this meeting"
            active={showVersions}
          >
            History
          </Btn>

          <Btn
            onClick={() => setShowSummary(true)}
            title="Decisions, actions and what is still open — ready to send round"
          >
            Wrap up
          </Btn>

          <Menu label="Share">
            <MenuItem onClick={() => void copyMarkdown()}>
              {copied ? 'Copied to clipboard' : 'Copy notes as Markdown'}
            </MenuItem>
            <MenuItem
              disabled={view !== 'map'}
              onClick={() => void downloadPng(getNodes())}
              hint={view === 'map' ? undefined : 'Map view only'}
            >
              Download map as PNG
            </MenuItem>
            <MenuDivider />
            <MenuItem
              disabled={!meeting}
              onClick={() =>
                meeting &&
                download(
                  `${slugify(meeting.title)}.md`,
                  exportMeetingMarkdown(meeting),
                  'text/markdown',
                )
              }
            >
              Export this meeting (.md)
            </MenuItem>
            <MenuItem
              disabled={!project}
              onClick={() =>
                project &&
                download(
                  `${slugify(project.name)}.md`,
                  exportProjectMarkdown(project),
                  'text/markdown',
                )
              }
            >
              Export project (.md)
            </MenuItem>
            <MenuItem
              disabled={!project}
              onClick={() => project && download(`${slugify(project.name)}.json`, exportBundle([project]))}
              hint="Lossless — positions, folds and history"
            >
              Export project (.json)
            </MenuItem>
            <MenuDivider />
            <MenuItem onClick={() => void runImport()}>Import a file…</MenuItem>
          </Menu>
        </div>
      </div>

      {view !== 'project' && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-3.5 pb-2.5">
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
                  className="max-w-[190px] shrink-0 overflow-hidden rounded-full border-[1.5px] border-dashed border-q bg-white px-2.5 py-[3px] text-xs font-medium text-ellipsis whitespace-nowrap text-q hover:bg-q-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                >
                  {n.text || 'Untitled question'}
                </button>
              ))
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5 text-xs whitespace-nowrap text-muted">
            {stats.decisions > 0 && (
              <span>
                <b className="font-semibold text-d">{stats.decisions}</b> decision
                {stats.decisions === 1 ? '' : 's'}
              </span>
            )}
            {stats.risks > 0 && (
              <span>
                <b className="font-semibold text-r">{stats.risks}</b> risk
                {stats.risks === 1 ? '' : 's'}
              </span>
            )}
            <span>
              <b className="font-semibold text-f">{stats.followUps.total}</b> follow-up
              {stats.followUps.total === 1 ? '' : 's'}
              {stats.followUps.dated > 0 && `, ${stats.followUps.dated} dated`}
            </span>
            {stats.overdue > 0 && (
              <span className="rounded-full bg-r-soft px-2 py-px font-semibold text-overdue">
                {stats.overdue} overdue
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

function Btn({
  children,
  onClick,
  title,
  label,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  label?: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={active}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
        active
          ? 'border-q bg-q-soft text-q'
          : 'border-line bg-white text-ink hover:border-[#AAB4C3]'
      }`}
    >
      {children}
    </button>
  )
}

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={ref} className="relative">
      <Btn onClick={() => setOpen((v) => !v)} active={open}>
        {label} ▾
      </Btn>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1.5 w-[248px] rounded-xl border border-line bg-white p-1 shadow-[0_10px_28px_rgba(22,33,58,.16)]"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  disabled,
  hint,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:text-[#AAB4C3] disabled:hover:bg-transparent"
    >
      {children}
      {hint && <span className="mt-px block text-[10.5px] text-muted">{hint}</span>}
    </button>
  )
}

const MenuDivider = () => <div className="my-1 border-t border-line" />
