import { ReactFlowProvider } from '@xyflow/react'
import { useMemo } from 'react'
import { Canvas } from './canvas/Canvas'
import { Header } from './header/Header'
import { parseText } from './model/parse'
import { NotesPane } from './notes/NotesPane'
import { ProjectView } from './project/ProjectView'
import { Sidebar } from './project/Sidebar'
import { SummaryDialog } from './summary/SummaryDialog'
import { TimelineView } from './timeline/TimelineView'
import { VersionsPane } from './versions/VersionsPane'
import { useActiveMeeting, useActiveProject, useCallmap } from './store/useCallmap'

export default function App() {
  const project = useActiveProject()
  const meeting = useActiveMeeting()
  const view = useCallmap((s) => s.view)
  const showSidebar = useCallmap((s) => s.showSidebar)
  const showNotes = useCallmap((s) => s.showNotes)
  const showVersions = useCallmap((s) => s.showVersions)
  const showSummary = useCallmap((s) => s.showSummary)

  // The one place the text becomes a tree. Everything downstream reads this.
  // Dates resolve against the meeting's own day, not today's.
  const model = useMemo(
    () => parseText(meeting?.text ?? '', meeting?.date),
    [meeting?.text, meeting?.date],
  )

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas font-ui text-ink">
        <Header model={model} />

        <div className="flex min-h-0 flex-1">
          {showSidebar && (
            <div className="hidden md:flex">
              <Sidebar />
            </div>
          )}

          {!meeting ? (
            <NoMeeting />
          ) : view === 'project' ? (
            project ? (
              <ProjectView project={project} />
            ) : (
              <NoMeeting />
            )
          ) : view === 'timeline' ? (
            <TimelineView model={model} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {showNotes && <NotesPane model={model} />}
              <Canvas model={model} />
            </div>
          )}

          {showVersions && meeting && <VersionsPane meeting={meeting} />}
        </div>

        {showSummary && meeting && <SummaryDialog meeting={meeting} model={model} />}

        <Toast />
      </div>
    </ReactFlowProvider>
  )
}

function NoMeeting() {
  const addMeeting = useCallmap((s) => s.addMeeting)
  const addProject = useCallmap((s) => s.addProject)
  const hasProject = useCallmap((s) => s.activeProjectId !== null)

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas p-6">
      <div className="max-w-[320px] rounded-2xl border border-dashed border-line bg-paper px-5 py-6 text-center text-[13px] leading-relaxed text-muted">
        {hasProject ? 'This project has no meetings yet.' : 'No project open.'}
        <br />
        <button
          type="button"
          onClick={() => (hasProject ? addMeeting() : addProject())}
          className="mt-3 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-[#AAB4C3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q"
        >
          {hasProject ? 'New meeting' : 'New project'}
        </button>
      </div>
    </div>
  )
}

function Toast() {
  const toast = useCallmap((s) => s.toast)
  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_rgba(22,33,58,.28)]"
    >
      {toast}
    </div>
  )
}
