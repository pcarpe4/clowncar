import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditResult } from '../model/edits'

export interface XY {
  x: number
  y: number
}

export const SAMPLE = `Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3
  Q: What's the fallback if QA slips?
    A: Feature-flag the new checkout
      > Write rollout plan #Priya @Sep 8
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12`

interface CallmapState {
  /** The single source of truth. The diagram is only ever a projection of this. */
  text: string
  showNotes: boolean
  /** Cards the user has dragged, keyed by line index. Everything else is auto-laid-out. */
  manualPositions: Record<number, XY>
  selectedId: number | null
  editingId: number | null
  flashId: number | null

  setText: (next: string) => void
  applyEdit: (result: EditResult | null) => void
  select: (id: number | null) => void
  setEditing: (id: number | null) => void
  setPosition: (id: number, at: XY) => void
  clearPositions: () => void
  toggleNotes: () => void
  flash: (id: number) => void
}

/**
 * Node ids are line indices, so any edit that changes the line count reassigns
 * the ids beneath it and every hand-placed position becomes meaningless. Rather
 * than try to remap them, drop them all — the same rule the prototype used.
 */
const linesOf = (s: string) => s.split('\n').length

export const useCallmap = create<CallmapState>()(
  persist(
    (set, get) => ({
      text: SAMPLE,
      showNotes: true,
      manualPositions: {},
      selectedId: null,
      editingId: null,
      flashId: null,

      setText: (next) =>
        set((s) => ({
          text: next,
          manualPositions: linesOf(next) === linesOf(s.text) ? s.manualPositions : {},
        })),

      applyEdit: (result) => {
        if (!result) return
        set((s) => ({
          text: result.text,
          manualPositions: result.structural ? {} : s.manualPositions,
          selectedId: result.focus ?? (result.structural ? null : s.selectedId),
          editingId: result.focus ?? null,
        }))
      },

      select: (id) => set({ selectedId: id, editingId: null }),
      setEditing: (id) => set({ editingId: id, ...(id === null ? {} : { selectedId: id }) }),
      setPosition: (id, at) => set((s) => ({ manualPositions: { ...s.manualPositions, [id]: at } })),
      clearPositions: () => set({ manualPositions: {} }),
      toggleNotes: () => set((s) => ({ showNotes: !s.showNotes })),

      flash: (id) => {
        set({ flashId: id })
        setTimeout(() => {
          if (get().flashId === id) set({ flashId: null })
        }, 900)
      },
    }),
    {
      name: 'callmap.v1',
      partialize: (s) => ({
        text: s.text,
        showNotes: s.showNotes,
        manualPositions: s.manualPositions,
      }),
    },
  ),
)
