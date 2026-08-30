import type { CallNode, Model } from './types'

export const allNodes = (model: Model): CallNode[] => [...model.byId.values()]

/** Questions with no answer directly beneath them, in document order. */
export const openQuestions = (model: Model): CallNode[] =>
  allNodes(model).filter((n) => n.type === 'question' && n.open === true)

export interface FollowUpStats {
  total: number
  dated: number
}

export const followUpStats = (model: Model): FollowUpStats => {
  const actions = allNodes(model).filter((n) => n.type === 'action')
  return { total: actions.length, dated: actions.filter((n) => n.date).length }
}
