import { parseDueDate, todayIso } from './dates'
import type { CallNode, Model, NodeType, ParsedLine, RootNode } from './types'

export const tabsToSpaces = (s: string): string => s.replace(/\t/g, '  ')

/**
 * Prefix table, tried in order. Order is load-bearing in two places:
 *  - `risk` sits before `action` so `!!` is not eaten by `!`;
 *  - `topic`'s `#` form requires a following space, so a line that opens with
 *    an owner (`#Maria said yes`) still parses as a note owned by Maria.
 */
const PREFIXES: readonly [NodeType, RegExp][] = [
  ['question', /^(q:|\?)\s*/i],
  ['answer', /^(a:|=)\s*/i],
  ['decision', /^(d:|decision:|decided:)\s*/i],
  ['risk', /^(!!|r:|risk:|blocker:)\s*/i],
  ['action', /^(>|!|todo:|action:)\s*/i],
  ['idea', /^(~|i:|idea:)\s*/i],
  ['topic', /^(#\s|t:|topic:)\s*/i],
]

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

  for (const [candidate, re] of PREFIXES) {
    const m = re.exec(body)
    if (m) {
      type = candidate
      body = body.slice(m[0].length)
      break
    }
  }

  // A `[x]` / `[ ]` marker sits between the type prefix and the text, so it is
  // read before owner and date are pulled off the end.
  let done = false
  const ticked = /^\[([ xX])\]\s*/.exec(body)
  if (ticked) {
    done = ticked[1]!.toLowerCase() === 'x'
    body = body.slice(ticked[0].length)
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

  return { depth: Math.round(indent / 2), type, text: body, owner, date, done }
}

/** A direct child of one of these closes an open question. */
const RESOLVING: readonly NodeType[] = ['answer', 'decision']

/**
 * Parse the whole notes buffer into a tree. Blank lines are skipped but still
 * consume their index, so a node's id always equals its source line number.
 *
 * `refIso` is the day relative dates ("friday", "eom") resolve against — the
 * meeting's own date, so reopening old notes does not slide their deadlines.
 */
export function parseText(text: string, refIso: string = todayIso()): Model {
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
    const parsed = parseLine(raw)
    const node: CallNode = {
      id: i,
      line: i,
      ...parsed,
      due: parsed.date ? parseDueDate(parsed.date, refIso) : null,
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
    if (n.type === 'question') n.open = !n.children.some((c) => RESOLVING.includes(c.type))
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

/** Every node in `model`, in document order. */
export const walk = (model: Model): CallNode[] =>
  [...model.byId.keys()].sort((a, b) => a - b).map((id) => model.byId.get(id)!)

/** Ids of every node beneath `id`, not including `id` itself. */
export function descendantIds(model: Model, id: number): number[] {
  const n = model.byId.get(id)
  if (!n) return []
  const out: number[] = []
  const visit = (x: CallNode) =>
    x.children.forEach((c) => {
      out.push(c.id)
      visit(c)
    })
  visit(n)
  return out
}
