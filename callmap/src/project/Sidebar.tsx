import { useMemo, useState } from 'react'
import { formatLabel, todayIso } from '../model/dates'
import { meetingStats } from '../model/derive'
import { parseText } from '../model/parse'
import { chronological, type Meeting } from '../model/project'
import { useCallmap } from '../store/useCallmap'

/**
 * The project / meeting tree.
 *
 * Meeting rows show a live count of what is unresolved, which is the thing you
 * are actually scanning for when you come back to a project after a fortnight.
 */
export function Sidebar() {
  const projects = useCallmap((s) => s.projects)
  const activeProjectId = useCallmap((s) => s.activeProjectId)
  const activeMeetingId = useCallmap((s) => s.activeMeetingId)
  const selectProject = useCallmap((s) => s.selectProject)
  const selectMeeting = useCallmap((s) => s.selectMeeting)
  const addProject = useCallmap((s) => s.addProject)
  const addMeeting = useCallmap((s) => s.addMeeting)
  const renameProject = useCallmap((s) => s.renameProject)
  const deleteProject = useCallmap((s) => s.deleteProject)
  const deleteMeeting = useCallmap((s) => s.deleteMeeting)
  const duplicateMeeting = useCallmap((s) => s.duplicateMeeting)
  const setView = useCallmap((s) => s.setView)

  const [renamingId, setRenamingId] = useState<string | null>(null)

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-paper">
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="font-display text-[11px] font-bold tracking-[.08em] text-muted uppercase">
          Projects
        </span>
        <button
          type="button"
          onClick={() => addProject()}
          title="New project"
          aria-label="New project"
          className="rounded-md px-1.5 py-0.5 text-sm leading-none text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
        >
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId
          return (
            <div key={project.id} className="mb-0.5">
              <div
                className={`group flex items-center gap-1 rounded-lg px-1.5 py-1 ${
                  isActive ? 'bg-q-soft' : 'hover:bg-canvas'
                }`}
              >
                {renamingId === project.id ? (
                  <input
                    autoFocus
                    defaultValue={project.name}
                    aria-label="Project name"
                    onBlur={(e) => {
                      renameProject(project.id, e.target.value)
                      setRenamingId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    className="min-w-0 flex-1 rounded border border-q bg-white px-1 py-0.5 text-xs font-semibold text-ink outline-0"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => selectProject(project.id)}
                    onDoubleClick={() => setRenamingId(project.id)}
                    title={`${project.name} — double-click to rename`}
                    className={`min-w-0 flex-1 truncate text-left text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q ${
                      isActive ? 'text-q' : 'text-ink'
                    }`}
                  >
                    {project.name}
                  </button>
                )}

                <RowAction
                  label={`Delete ${project.name}`}
                  onClick={() => {
                    if (
                      confirm(
                        `Delete “${project.name}” and its ${project.meetings.length} meeting(s)? This cannot be undone.`,
                      )
                    ) {
                      deleteProject(project.id)
                    }
                  }}
                >
                  ✕
                </RowAction>
              </div>

              {isActive && (
                <div className="mt-0.5 mb-1.5 ml-2 border-l border-line pl-1.5">
                  {chronological(project).map((meeting) => (
                    <MeetingRow
                      key={meeting.id}
                      meeting={meeting}
                      active={meeting.id === activeMeetingId}
                      onSelect={() => selectMeeting(meeting.id)}
                      onDuplicate={() => duplicateMeeting(meeting.id)}
                      onDelete={() => {
                        if (confirm(`Delete “${meeting.title}”? This cannot be undone.`)) {
                          deleteMeeting(meeting.id)
                        }
                      }}
                    />
                  ))}

                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => addMeeting()}
                      className="flex-1 rounded-md border border-dashed border-line px-1.5 py-1 text-[11px] font-medium text-muted hover:border-[#AAB4C3] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                    >
                      + Meeting
                    </button>
                    {project.meetings.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setView('project')}
                        title="See how this project has evolved across its meetings"
                        className="rounded-md border border-line px-1.5 py-1 text-[11px] font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
                      >
                        Timeline
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function MeetingRow({
  meeting,
  active,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  meeting: Meeting
  active: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const stats = useMemo(
    () => meetingStats(parseText(meeting.text, meeting.date), todayIso()),
    [meeting.text, meeting.date],
  )

  return (
    <div
      className={`group flex items-center gap-1 rounded-lg px-1.5 py-1 ${
        active ? 'bg-canvas' : 'hover:bg-canvas'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
      >
        <div className={`truncate text-[11.5px] ${active ? 'font-semibold text-ink' : 'text-ink'}`}>
          {meeting.title}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span title={meeting.date}>{formatLabel(meeting.date, todayIso())}</span>
          {stats.open > 0 && <span className="text-q">{stats.open} open</span>}
          {stats.risks > 0 && <span className="text-r">{stats.risks} risk</span>}
          {stats.overdue > 0 && <span className="text-overdue">{stats.overdue} late</span>}
        </div>
      </button>

      <RowAction label={`Duplicate ${meeting.title}`} onClick={onDuplicate}>
        ⧉
      </RowAction>
      <RowAction label={`Delete ${meeting.title}`} onClick={onDelete}>
        ✕
      </RowAction>
    </div>
  )
}

function RowAction({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded px-1 text-[11px] leading-none text-transparent group-hover:text-muted hover:!text-ink focus-visible:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
    >
      {children}
    </button>
  )
}
