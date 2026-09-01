import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditResult } from '../model/edits'
import { parseText } from '../model/parse'
import {
  chronological,
  findMeeting,
  findProject,
  newMeeting,
  newProject,
  seedProjects,
  uid,
  type Meeting,
  type Project,
  type Version,
  type XY,
} from '../model/project'
import type { Model } from '../model/types'

export type { XY } from '../model/project'

export type View = 'map' | 'timeline' | 'project'

/**
 * The meeting clock.
 *
 * Time is accrued in segments rather than ticked: `since` marks when the
 * current segment began, and it is flushed into `total` and `byTopic` whenever
 * the timer pauses or the active topic changes. That keeps a running clock at
 * zero store writes per second — the display re-renders itself from `since`.
 *
 * Topics are keyed by their text, not their line index, because ids move every
 * time a line is inserted above them.
 */
export interface Timer {
  /** Which meeting this clock belongs to; a different one starts fresh. */
  meetingId: string | null
  running: boolean
  /** Epoch ms the current segment began, or null when paused. */
  since: number | null
  /** Completed milliseconds, excluding the segment in flight. */
  total: number
  /** Completed milliseconds per topic text; '' is time spent outside any topic. */
  byTopic: Record<string, number>
  activeTopic: string | null
}

const freshTimer = (meetingId: string | null): Timer => ({
  meetingId,
  running: false,
  since: null,
  total: 0,
  byTopic: {},
  activeTopic: null,
})

/** Bank the segment in flight and start a new one from `now`. */
function flushTimer(t: Timer, now: number): Timer {
  if (!t.running || t.since === null) return t
  const delta = Math.max(0, now - t.since)
  const key = t.activeTopic ?? ''
  return {
    ...t,
    total: t.total + delta,
    byTopic: { ...t.byTopic, [key]: (t.byTopic[key] ?? 0) + delta },
    since: now,
  }
}

/** How long a burst of typing runs before it earns an automatic snapshot. */
const AUTO_SNAPSHOT_MS = 5 * 60 * 1000
/** Automatic snapshots are pruned to this many; versions the user named never are. */
const MAX_AUTO_VERSIONS = 25

const linesOf = (s: string) => s.split('\n').length

interface CallmapState {
  projects: Project[]
  activeProjectId: string | null
  activeMeetingId: string | null

  view: View
  showSidebar: boolean
  showNotes: boolean
  showVersions: boolean
  showActionsPanel: boolean
  showActionsCard: boolean
  showSummary: boolean
  timer: Timer
  /** Version being compared against the working text, if any. */
  compareVersionId: string | null

  selectedId: number | null
  editingId: number | null
  flashId: number | null
  toast: string | null

  // --- notes -----------------------------------------------------------
  setText: (next: string) => void
  applyEdit: (result: EditResult | null) => void
  /** Run a text transform against a freshly parsed model, so indices are never stale. */
  edit: (fn: (text: string, model: Model) => EditResult | null) => void

  // --- canvas ----------------------------------------------------------
  select: (id: number | null) => void
  setEditing: (id: number | null) => void
  setPosition: (id: number, at: XY) => void
  clearPositions: () => void
  toggleCollapse: (id: number) => void
  setCollapsed: (ids: number[]) => void

  // --- chrome ----------------------------------------------------------
  setView: (view: View) => void
  toggleSidebar: () => void
  toggleNotes: () => void
  toggleActionsPanel: () => void
  toggleActionsCard: () => void
  setShowSummary: (open: boolean) => void

  // --- meeting clock ----------------------------------------------------
  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
  setActiveTopic: (topic: string | null) => void

  toggleVersions: () => void
  flash: (id: number) => void
  notify: (message: string) => void

  // --- projects and meetings -------------------------------------------
  selectProject: (id: string) => void
  selectMeeting: (id: string) => void
  addProject: (name?: string) => void
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  addMeeting: (title?: string) => void
  duplicateMeeting: (id: string) => void
  renameMeeting: (id: string, title: string) => void
  setMeetingDate: (id: string, date: string) => void
  deleteMeeting: (id: string) => void

  // --- versions --------------------------------------------------------
  saveVersion: (label: string) => void
  restoreVersion: (versionId: string) => void
  deleteVersion: (versionId: string) => void
  setCompareVersion: (versionId: string | null) => void

  // --- import ----------------------------------------------------------
  importProjects: (projects: Project[]) => void
  importMeeting: (meeting: Meeting) => void
}

export const selectActiveProject = (s: CallmapState): Project | undefined =>
  findProject(s.projects, s.activeProjectId)

export const selectActiveMeeting = (s: CallmapState): Meeting | undefined =>
  findMeeting(selectActiveProject(s), s.activeMeetingId)

/**
 * Carry a v1 buffer into the new shape.
 *
 * v1 persisted a single `text` under its own key. Rather than a persist
 * `migrate` — which only ever sees the key it is attached to — the old key is
 * read once at store construction. If a v2 blob also exists, persist rehydrates
 * over the top of this and the v1 read is simply discarded. The old key is left
 * in place deliberately: nothing is destroyed on the user's behalf.
 */
function initialProjects(): Project[] {
  try {
    const raw = globalThis.localStorage?.getItem('callmap.v1')
    if (raw) {
      const state = (JSON.parse(raw) as { state?: Record<string, unknown> }).state
      const text = state?.text
      if (typeof text === 'string' && text.trim()) {
        return [
          newProject({
            name: 'My notes',
            meetings: [
              newMeeting({
                title: 'Imported notes',
                text,
                manualPositions:
                  (state?.manualPositions as Record<number, XY> | undefined) ?? {},
              }),
            ],
          }),
        ]
      }
    }
  } catch {
    // A corrupt or unreadable v1 blob is not worth failing startup over.
  }
  return seedProjects()
}

const snapshot = (text: string, label: string, auto: boolean): Version => ({
  id: uid(),
  at: Date.now(),
  label,
  text,
  auto,
})

/** Drop the oldest automatic snapshots once they pile up. Named ones are kept. */
function prune(versions: Version[]): Version[] {
  const autos = versions.filter((v) => v.auto)
  if (autos.length <= MAX_AUTO_VERSIONS) return versions
  const doomed = new Set(autos.slice(0, autos.length - MAX_AUTO_VERSIONS).map((v) => v.id))
  return versions.filter((v) => !doomed.has(v.id))
}

/**
 * Snapshot the text *as it was* before this edit, but only once per quiet
 * period — so a five-minute stretch of typing leaves one restore point rather
 * than one per keystroke.
 */
function withAutoSnapshot(meeting: Meeting, now: number): Version[] {
  const last = meeting.versions[meeting.versions.length - 1]
  if (last && (now - last.at < AUTO_SNAPSHOT_MS || last.text === meeting.text)) {
    return meeting.versions
  }
  if (!meeting.text.trim()) return meeting.versions
  return prune([...meeting.versions, snapshot(meeting.text, 'Autosave', true)])
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useCallmap = create<CallmapState>()(
  persist(
    (set, get) => {
      /** Immutably replace the active meeting, stamping `updatedAt`. */
      const patchMeeting = (fn: (m: Meeting) => Meeting) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== s.activeProjectId
              ? p
              : {
                  ...p,
                  meetings: p.meetings.map((m) =>
                    m.id !== s.activeMeetingId ? m : { ...fn(m), updatedAt: Date.now() },
                  ),
                },
          ),
        }))

      const patchProject = (id: string, fn: (p: Project) => Project) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? fn(p) : p)) }))

      return {
        projects: initialProjects(),
        activeProjectId: null,
        activeMeetingId: null,

        view: 'map',
        showSidebar: true,
        showNotes: true,
        showVersions: false,
        showActionsPanel: true,
        showActionsCard: false,
        showSummary: false,
        timer: freshTimer(null),
        compareVersionId: null,

        selectedId: null,
        editingId: null,
        flashId: null,
        toast: null,

        // --- notes -------------------------------------------------------
        setText: (next) => {
          const meeting = selectActiveMeeting(get())
          if (!meeting) return
          const structural = linesOf(next) !== linesOf(meeting.text)
          patchMeeting((m) => ({
            ...m,
            text: next,
            versions: withAutoSnapshot(m, Date.now()),
            // Node ids are line indices, so any change to the line count
            // reassigns the ids beneath it and every hand-placed position and
            // fold below becomes meaningless. Rather than remap them, drop them.
            manualPositions: structural ? {} : m.manualPositions,
            collapsed: structural ? [] : m.collapsed,
          }))
        },

        applyEdit: (result) => {
          if (!result) return
          patchMeeting((m) => ({
            ...m,
            text: result.text,
            versions: withAutoSnapshot(m, Date.now()),
            manualPositions: result.structural ? {} : m.manualPositions,
            collapsed: result.structural ? [] : m.collapsed,
          }))
          set((s) => ({
            selectedId: result.focus ?? (result.structural ? null : s.selectedId),
            editingId: result.focus ?? null,
          }))
        },

        edit: (fn) => {
          const meeting = selectActiveMeeting(get())
          if (!meeting) return
          get().applyEdit(fn(meeting.text, parseText(meeting.text, meeting.date)))
        },

        // --- canvas ------------------------------------------------------
        select: (id) => set({ selectedId: id, editingId: null }),
        setEditing: (id) => set({ editingId: id, ...(id === null ? {} : { selectedId: id }) }),
        setPosition: (id, at) =>
          patchMeeting((m) => ({ ...m, manualPositions: { ...m.manualPositions, [id]: at } })),
        clearPositions: () => patchMeeting((m) => ({ ...m, manualPositions: {} })),

        toggleCollapse: (id) =>
          patchMeeting((m) => ({
            ...m,
            collapsed: m.collapsed.includes(id)
              ? m.collapsed.filter((x) => x !== id)
              : [...m.collapsed, id],
          })),
        setCollapsed: (ids) => patchMeeting((m) => ({ ...m, collapsed: ids })),

        // --- chrome ------------------------------------------------------
        setView: (view) => set({ view, selectedId: null, editingId: null }),
        toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
        toggleNotes: () => set((s) => ({ showNotes: !s.showNotes })),
        toggleActionsPanel: () => set((s) => ({ showActionsPanel: !s.showActionsPanel })),
        toggleActionsCard: () => set((s) => ({ showActionsCard: !s.showActionsCard })),
        setShowSummary: (open) => set({ showSummary: open }),

        startTimer: () =>
          set((s) => {
            const now = Date.now()
            // A clock left over from another meeting starts again from zero.
            const base = s.timer.meetingId === s.activeMeetingId ? s.timer : freshTimer(s.activeMeetingId)
            return { timer: { ...base, meetingId: s.activeMeetingId, running: true, since: now } }
          }),

        pauseTimer: () =>
          set((s) => {
            const flushed = flushTimer(s.timer, Date.now())
            return { timer: { ...flushed, running: false, since: null } }
          }),

        resetTimer: () => set((s) => ({ timer: freshTimer(s.activeMeetingId) })),

        setActiveTopic: (topic) =>
          set((s) => {
            if (s.timer.activeTopic === topic) return {}
            const flushed = flushTimer(s.timer, Date.now())
            return { timer: { ...flushed, activeTopic: topic } }
          }),
        toggleVersions: () =>
          set((s) => ({ showVersions: !s.showVersions, compareVersionId: null })),

        flash: (id) => {
          set({ flashId: id })
          setTimeout(() => {
            if (get().flashId === id) set({ flashId: null })
          }, 900)
        },

        notify: (message) => {
          set({ toast: message })
          clearTimeout(toastTimer)
          toastTimer = setTimeout(() => set({ toast: null }), 2600)
        },

        // --- projects and meetings ---------------------------------------
        selectProject: (id) => {
          const project = findProject(get().projects, id)
          const first = project ? chronological(project)[0] : undefined
          set({
            activeProjectId: id,
            activeMeetingId: project?.meetings[project.meetings.length - 1]?.id ?? first?.id ?? null,
            selectedId: null,
            editingId: null,
            compareVersionId: null,
          })
        },

        selectMeeting: (id) =>
          set((s) => {
            const flushed = flushTimer(s.timer, Date.now())
            return {
              activeMeetingId: id,
              selectedId: null,
              editingId: null,
              compareVersionId: null,
              // The clock belongs to the meeting it was started in.
              timer: { ...flushed, running: false, since: null },
            }
          }),

        addProject: (name) => {
          const meeting = newMeeting({ title: 'First meeting' })
          const project = newProject({ name: name?.trim() || 'New project', meetings: [meeting] })
          set((s) => ({
            projects: [...s.projects, project],
            activeProjectId: project.id,
            activeMeetingId: meeting.id,
            view: 'map',
            selectedId: null,
            editingId: null,
          }))
        },

        renameProject: (id, name) =>
          patchProject(id, (p) => ({ ...p, name: name.trim() || p.name })),

        deleteProject: (id) =>
          set((s) => {
            const projects = s.projects.filter((p) => p.id !== id)
            if (s.activeProjectId !== id) return { projects }
            const next = projects[0]
            return {
              projects,
              activeProjectId: next?.id ?? null,
              activeMeetingId: next?.meetings[0]?.id ?? null,
              selectedId: null,
              editingId: null,
            }
          }),

        addMeeting: (title) => {
          const meeting = newMeeting({ title: title?.trim() || 'New meeting' })
          const projectId = get().activeProjectId
          if (!projectId) return
          patchProject(projectId, (p) => ({ ...p, meetings: [...p.meetings, meeting] }))
          set({
            activeMeetingId: meeting.id,
            view: 'map',
            selectedId: null,
            editingId: null,
            compareVersionId: null,
          })
        },

        duplicateMeeting: (id) => {
          const s = get()
          const project = selectActiveProject(s)
          const source = findMeeting(project, id)
          if (!project || !source) return
          const copy = newMeeting({
            title: `${source.title} (copy)`,
            text: source.text,
            manualPositions: { ...source.manualPositions },
            collapsed: [...source.collapsed],
          })
          patchProject(project.id, (p) => ({ ...p, meetings: [...p.meetings, copy] }))
          set({ activeMeetingId: copy.id, selectedId: null, editingId: null })
        },

        renameMeeting: (id, title) => {
          const projectId = get().activeProjectId
          if (!projectId) return
          patchProject(projectId, (p) => ({
            ...p,
            meetings: p.meetings.map((m) => (m.id === id ? { ...m, title: title.trim() || m.title } : m)),
          }))
        },

        setMeetingDate: (id, date) => {
          const projectId = get().activeProjectId
          if (!projectId) return
          patchProject(projectId, (p) => ({
            ...p,
            meetings: p.meetings.map((m) => (m.id === id ? { ...m, date } : m)),
          }))
        },

        deleteMeeting: (id) => {
          const s = get()
          const projectId = s.activeProjectId
          if (!projectId) return
          patchProject(projectId, (p) => ({ ...p, meetings: p.meetings.filter((m) => m.id !== id) }))
          if (s.activeMeetingId === id) {
            const remaining = findProject(get().projects, projectId)?.meetings ?? []
            set({
              activeMeetingId: remaining[remaining.length - 1]?.id ?? null,
              selectedId: null,
              editingId: null,
            })
          }
        },

        // --- versions ----------------------------------------------------
        saveVersion: (label) => {
          const meeting = selectActiveMeeting(get())
          if (!meeting) return
          patchMeeting((m) => ({
            ...m,
            versions: [...m.versions, snapshot(m.text, label.trim() || 'Saved version', false)],
          }))
          get().notify('Version saved')
        },

        restoreVersion: (versionId) => {
          const meeting = selectActiveMeeting(get())
          const version = meeting?.versions.find((v) => v.id === versionId)
          if (!meeting || !version) return
          patchMeeting((m) => ({
            ...m,
            text: version.text,
            // Restoring is itself an edit worth being able to walk back from.
            versions: prune([...m.versions, snapshot(m.text, 'Before restore', true)]),
            manualPositions: {},
            collapsed: [],
          }))
          set({ selectedId: null, editingId: null, compareVersionId: null })
          get().notify(`Restored “${version.label}”`)
        },

        deleteVersion: (versionId) =>
          patchMeeting((m) => ({ ...m, versions: m.versions.filter((v) => v.id !== versionId) })),

        setCompareVersion: (versionId) => set({ compareVersionId: versionId }),

        // --- import ------------------------------------------------------
        importProjects: (incoming) => {
          if (incoming.length === 0) return
          set((s) => ({
            projects: [...s.projects, ...incoming],
            activeProjectId: incoming[0]!.id,
            activeMeetingId: incoming[0]!.meetings[0]?.id ?? null,
            view: 'map',
          }))
          get().notify(
            `Imported ${incoming.length} project${incoming.length === 1 ? '' : 's'}`,
          )
        },

        importMeeting: (meeting) => {
          const projectId = get().activeProjectId
          if (!projectId) return
          patchProject(projectId, (p) => ({ ...p, meetings: [...p.meetings, meeting] }))
          set({ activeMeetingId: meeting.id, view: 'map' })
          get().notify(`Imported “${meeting.title}”`)
        },
      }
    },
    {
      name: 'callmap.v2',
      version: 2,
      partialize: (s) => ({
        projects: s.projects,
        activeProjectId: s.activeProjectId,
        activeMeetingId: s.activeMeetingId,
        view: s.view,
        showSidebar: s.showSidebar,
        showNotes: s.showNotes,
        showVersions: s.showVersions,
        showActionsPanel: s.showActionsPanel,
        showActionsCard: s.showActionsCard,
        timer: s.timer,
      }),
    },
  ),
)

/**
 * Land the selection on something that actually exists.
 *
 * Covers three cases with one rule: a fresh install (nothing selected yet), a
 * rehydrated blob whose ids point at a since-deleted project or meeting, and
 * hand-edited storage. Runs once after `create`, by which point the synchronous
 * localStorage rehydration has already happened — and it goes through `setState`
 * rather than mutating the rehydrated object, so subscribers are notified.
 */
function normalizeSelection(): void {
  const s = useCallmap.getState()
  const projects = s.projects.length > 0 ? s.projects : seedProjects()
  const project = findProject(projects, s.activeProjectId) ?? projects[0]

  if (!project) return
  const meeting = findMeeting(project, s.activeMeetingId)

  useCallmap.setState({
    projects,
    activeProjectId: project.id,
    activeMeetingId: meeting?.id ?? project.meetings[project.meetings.length - 1]?.id ?? null,
    // A clock that was running when the tab closed is parked rather than
    // resumed: the wall-clock gap since then is not meeting time.
    timer: s.timer.running ? { ...s.timer, running: false, since: null } : s.timer,
  })
}

normalizeSelection()

export const useActiveProject = (): Project | undefined => useCallmap(selectActiveProject)
export const useActiveMeeting = (): Meeting | undefined => useCallmap(selectActiveMeeting)
export const useText = (): string => useCallmap((s) => selectActiveMeeting(s)?.text ?? '')
export const useMeetingDate = (): string =>
  useCallmap((s) => selectActiveMeeting(s)?.date ?? '1970-01-01')
