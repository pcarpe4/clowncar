import { daysBetween } from './dates'
import type { CallNode, Model, NodeType } from './types'

export const allNodes = (model: Model): CallNode[] => [...model.byId.values()]

const byType = (model: Model, type: NodeType): CallNode[] =>
  allNodes(model).filter((n) => n.type === type)

/** Questions with no answer or decision directly beneath them, in document order. */
export const openQuestions = (model: Model): CallNode[] =>
  allNodes(model).filter((n) => n.type === 'question' && n.open === true)

export const decisions = (model: Model): CallNode[] => byType(model, 'decision')
export const risks = (model: Model): CallNode[] => byType(model, 'risk')
export const ideas = (model: Model): CallNode[] => byType(model, 'idea')
export const topics = (model: Model): CallNode[] => byType(model, 'topic')

export interface FollowUpStats {
  total: number
  dated: number
}

export const followUpStats = (model: Model): FollowUpStats => {
  const actions = byType(model, 'action')
  return { total: actions.length, dated: actions.filter((n) => n.date).length }
}

/** Headline counters for the header bar. */
export interface MeetingStats {
  open: number
  decisions: number
  risks: number
  followUps: FollowUpStats
  overdue: number
}

export function meetingStats(model: Model, today: string): MeetingStats {
  return {
    open: openQuestions(model).length,
    decisions: decisions(model).length,
    risks: risks(model).length,
    followUps: followUpStats(model),
    overdue: overdueItems(model, today).length,
  }
}

/** A node that carries a resolved calendar date. */
export interface DatedItem {
  node: CallNode
  iso: string
  approximate: boolean
}

/** Every node with an understandable date, earliest first. */
export function datedItems(model: Model): DatedItem[] {
  return allNodes(model)
    .filter((n): n is CallNode & { due: NonNullable<CallNode['due']> } => !!n.due)
    .map((n) => ({ node: n, iso: n.due.iso, approximate: n.due.approximate }))
    .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.node.id - b.node.id))
}

/** Dated work still outstanding whose day has passed. */
export function overdueItems(model: Model, today: string): DatedItem[] {
  return datedItems(model).filter(
    (d) => (d.node.type === 'action' || d.node.type === 'risk') && daysBetween(today, d.iso) < 0,
  )
}

/** Dated items that could not be understood — shown in the timeline's tray. */
export const undatedWithText = (model: Model): CallNode[] =>
  allNodes(model).filter((n) => n.date && !n.due)

export interface OwnerLoad {
  owner: string
  items: CallNode[]
  overdue: number
}

/** Follow-ups and risks grouped by owner, busiest first. */
export function ownerLoad(model: Model, today: string): OwnerLoad[] {
  const groups = new Map<string, CallNode[]>()
  for (const n of allNodes(model)) {
    if (!n.owner) continue
    if (n.type !== 'action' && n.type !== 'risk') continue
    const list = groups.get(n.owner) ?? []
    list.push(n)
    groups.set(n.owner, list)
  }
  return [...groups.entries()]
    .map(([owner, items]) => ({
      owner,
      items,
      overdue: items.filter((n) => n.due && daysBetween(today, n.due.iso) < 0).length,
    }))
    .sort((a, b) => b.items.length - a.items.length || a.owner.localeCompare(b.owner))
}

/** Every follow-up, ticked or not. */
export const actions = (model: Model): CallNode[] => byType(model, 'action')

/** Follow-ups still to do, earliest dated first, then undated. */
export function openActions(model: Model): CallNode[] {
  return actions(model)
    .filter((n) => !n.done)
    .sort((a, b) => {
      if (a.due && b.due) return a.due.iso.localeCompare(b.due.iso) || a.id - b.id
      if (a.due) return -1
      if (b.due) return 1
      return a.id - b.id
    })
}

/** Topics and whether anything was recorded under them — an agenda checklist. */
export interface TopicCoverage {
  node: CallNode
  covered: boolean
}

export const topicCoverage = (model: Model): TopicCoverage[] =>
  topics(model).map((node) => ({ node, covered: node.children.length > 0 }))
