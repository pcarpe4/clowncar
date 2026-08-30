import type { CallNode, Model, NodeType, ParsedLine, RootNode } from './types'

export const tabsToSpaces = (s: string): string => s.replace(/\t/g, '  ')

/**
 * Parse one line of shorthand.
 *
 * Two orderings here are load-bearing and must not be "tidied":
 *  - owner is stripped before the date, which is what lets `#Dave @Sep 3` and
 *    `@Sep 3 #Dave` both parse correctly (the date runs to end-of-line, so it
 *    would otherwise swallow a trailing owner);
 *  - the `?` auto-detect runs *after* owner/date are stripped, so
 *    `Is that right? #Dave` is still recognised as a question.
 */
export function parseLine(raw: string): ParsedLine {
  const line = tabsToSpaces(raw)
  const indent = /^ */.exec(line)![0].length
  let body = line.trim()
  let type: NodeType = 'note'

  let m: RegExpMatchArray | null
  if ((m = body.match(/^(q:|\?)\s*/i))) {
    type = 'question'
    body = body.slice(m[0].length)
  } else if ((m = body.match(/^(a:|=)\s*/i))) {
    type = 'answer'
    body = body.slice(m[0].length)
  } else if ((m = body.match(/^(>|!|todo:)\s*/i))) {
    type = 'action'
    body = body.slice(m[0].length)
  }

  let owner: string | null = null
  let date: string | null = null
  body = body.replace(/\s*#(\S+)/, (_, o: string) => {
    owner = o
    return ''
  })
  body = body.replace(/\s*@(.+)$/, (_, d: string) => {
    date = d.trim()
    return ''
  })
  body = body.trim()

  // A line ending in ? is a question even without the Q: prefix.
  if (type === 'note' && /\?$/.test(body)) type = 'question'

  return { depth: Math.round(indent / 2), type, text: body, owner, date }
}

/**
 * Parse the whole notes buffer into a tree. Blank lines are skipped but still
 * consume their index, so a node's id always equals its source line number.
 */
export function parseText(text: string): Model {
  const lines = text.split('\n')
  const root: RootNode = {
    id: -1,
    line: -1,
    depth: -1,
    type: 'root',
    text: '',
    end: -1,
    children: [],
    parent: null,
  }
  const byId = new Map<number, CallNode>()
  const stack: (CallNode | RootNode)[] = [root]

  lines.forEach((raw, i) => {
    if (!raw.trim()) return
    const node: CallNode = {
      id: i,
      line: i,
      ...parseLine(raw),
      end: i,
      children: [],
      parent: root,
    }
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= node.depth) stack.pop()
    const parent = stack[stack.length - 1]!
    node.parent = parent
    parent.children.push(node)
    stack.push(node)
    byId.set(i, node)
  })

  const finish = (n: CallNode | RootNode): number => {
    let end = n.line
    n.children.forEach((c) => {
      end = Math.max(end, finish(c))
    })
    n.end = end
    if (n.type === 'question') n.open = !n.children.some((c) => c.type === 'answer')
    return end
  }
  finish(root)

  return { root, byId }
}

/** True when `node` sits anywhere beneath `ancestor`. */
export function isDescendant(node: CallNode, ancestor: CallNode): boolean {
  let p: CallNode | RootNode | null = node.parent
  while (p) {
    if (p === ancestor) return true
    p = p.parent
  }
  return false
}
