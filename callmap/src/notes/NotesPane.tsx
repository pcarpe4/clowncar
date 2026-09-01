import { useCallback, useEffect, useRef } from 'react'
import type { Model } from '../model/types'
import { useCallmap, useText } from '../store/useCallmap'

export function NotesPane({ model }: { model: Model }) {
  const text = useText()
  const setText = useCallmap((s) => s.setText)
  const setActiveTopic = useCallmap((s) => s.setActiveTopic)
  const ref = useRef<HTMLTextAreaElement>(null)
  /** Caret position to restore after a programmatic edit (Tab / Enter). */
  const pendingSelection = useRef<[number, number] | null>(null)

  useEffect(() => {
    if (pendingSelection.current && ref.current) {
      const [start, end] = pendingSelection.current
      ref.current.setSelectionRange(start, end)
      pendingSelection.current = null
    }
  }, [text])

  const apply = (next: string, start: number, end: number) => {
    setText(next)
    pendingSelection.current = [start, end]
  }

  /**
   * Which topic is the caret under? The last `#` line at or above it — which is
   * how an agenda reads, and it stays right on blank lines and part-typed ones
   * where a tree walk would find no node at all.
   */
  const followTopic = useCallback(
    (value: string, caret: number) => {
      const line = value.slice(0, caret).split('\n').length - 1
      let current: string | null = null
      for (const node of model.byId.values()) {
        if (node.id > line) break
        if (node.type === 'topic') current = node.text
      }
      setActiveTopic(current)
    },
    [model, setActiveTopic],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart: s, selectionEnd: end, value } = e.currentTarget
    const lineStart = value.lastIndexOf('\n', s - 1) + 1

    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        // Outdent: drop two spaces from the front of the line, if they are there.
        if (value.slice(lineStart, lineStart + 2) === '  ') {
          apply(
            value.slice(0, lineStart) + value.slice(lineStart + 2),
            Math.max(lineStart, s - 2),
            Math.max(lineStart, end - 2),
          )
        }
      } else {
        apply(value.slice(0, s) + '  ' + value.slice(end), s + 2, s + 2)
      }
    } else if (e.key === 'Enter') {
      // Keep the current line's indent on the new line.
      e.preventDefault()
      const insert = '\n' + /^ */.exec(value.slice(lineStart))![0]
      apply(value.slice(0, s) + insert + value.slice(end), s + insert.length, s + insert.length)
    }
  }

  return (
    <aside className="flex h-[36vh] shrink-0 flex-col border-b border-line bg-paper md:h-auto md:w-80 md:border-r md:border-b-0">
      <label htmlFor="callmap-notes" className="sr-only">
        Meeting notes
      </label>
      <textarea
        id="callmap-notes"
        ref={ref}
        value={text}
        onChange={(e) => apply(e.target.value, e.target.selectionStart, e.target.selectionEnd)}
        onKeyDown={onKeyDown}
        onSelect={(e) => followTopic(e.currentTarget.value, e.currentTarget.selectionStart)}
        spellCheck={false}
        placeholder="Q: What are we deciding today?"
        style={{ tabSize: 2 }}
        className="flex-1 resize-none border-0 bg-transparent p-3.5 font-mono text-[13px] leading-[1.55] text-ink outline-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-q/40"
      />
      <div className="border-t border-line px-3.5 py-2.5 text-[11.5px] leading-[1.9] text-muted">
        <Key>Q:</Key> question · <Key>A:</Key> answer · <Key>D:</Key> decision · <Key>&gt;</Key>{' '}
        follow-up · <Key>!!</Key> risk · <Key>~</Key> idea · <Key>#</Key> topic
        <div className="mt-1.5 border-t border-line pt-1.5">
          <Key>#name</Key> owner · <Key>@date</Key> due · <Key>[x]</Key> done · <Key>Tab</Key> nests
          under the line above · drag a card onto another card to move it there
        </div>
      </div>
    </aside>
  )
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-[#F1F3F7] px-[5px] py-px font-mono text-ink">{children}</code>
)
