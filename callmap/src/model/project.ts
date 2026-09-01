import { todayIso } from './dates'

export interface XY {
  x: number
  y: number
}

/** A saved point in a meeting's history. */
export interface Version {
  id: string
  /** Epoch milliseconds. */
  at: number
  label: string
  text: string
  /** True for periodic autosnapshots, false for versions the user named. */
  auto: boolean
}

export interface Meeting {
  id: string
  title: string
  /**
   * The day the meeting happened, `YYYY-MM-DD`. Doubles as the reference date
   * that relative deadlines ("friday") resolve against, so reopening old notes
   * never slides their dates forward.
   */
  date: string
  /** The single source of truth. The diagram is only ever a projection of this. */
  text: string
  /** Cards the user has dragged, keyed by line index. Everything else is auto-laid-out. */
  manualPositions: Record<number, XY>
  /** Line indices whose subtrees are folded away on the canvas. */
  collapsed: number[]
  versions: Version[]
  createdAt: number
  updatedAt: number
}

export interface Project {
  id: string
  name: string
  createdAt: number
  meetings: Meeting[]
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const SAMPLE = `# Launch readiness
  Q: Ship v2 in September?
    A: Only if QA signs off by the 10th #Maria
      > Confirm QA timeline #Dave @Sep 3
    !! Payment migration is untested in staging #Priya @Sep 5
    Q: What's the fallback if QA slips?
      D: Feature-flag the new checkout and ship dark
        > Write rollout plan #Priya @Sep 8
# Go to market
  Q: Who owns launch comms?
    > Draft announcement #Sam @Sep 12
  ~ Could we do a partner webinar? #Sam`

export function newMeeting(partial: Partial<Meeting> = {}): Meeting {
  const now = Date.now()
  return {
    id: uid(),
    title: 'Untitled meeting',
    date: todayIso(),
    text: '',
    manualPositions: {},
    collapsed: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function newProject(partial: Partial<Project> = {}): Project {
  return {
    id: uid(),
    name: 'Untitled project',
    createdAt: Date.now(),
    meetings: [],
    ...partial,
  }
}

/** A fresh workspace: one project holding one worked example. */
export function seedProjects(): Project[] {
  return [
    newProject({
      name: 'Product launch',
      meetings: [newMeeting({ title: 'Launch sync', text: SAMPLE })],
    }),
  ]
}

/** Meetings oldest-first — the order every project-level view reads them in. */
export const chronological = (p: Project): Meeting[] =>
  [...p.meetings].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))

export const findProject = (projects: Project[], id: string | null): Project | undefined =>
  projects.find((p) => p.id === id)

export const findMeeting = (project: Project | undefined, id: string | null): Meeting | undefined =>
  project?.meetings.find((m) => m.id === id)
