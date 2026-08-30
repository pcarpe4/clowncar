import { ReactFlowProvider } from '@xyflow/react'
import { useMemo } from 'react'
import { Canvas } from './canvas/Canvas'
import { Header } from './header/Header'
import { parseText } from './model/parse'
import { NotesPane } from './notes/NotesPane'
import { useCallmap } from './store/useCallmap'

export default function App() {
  const text = useCallmap((s) => s.text)
  const showNotes = useCallmap((s) => s.showNotes)

  // The one place the text becomes a tree. Everything downstream reads this.
  const model = useMemo(() => parseText(text), [text])

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas font-ui text-ink">
        <Header model={model} />
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {showNotes && <NotesPane />}
          <Canvas model={model} />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
