import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react'
import { toPng } from 'html-to-image'

const WIDTH = 1600
const HEIGHT = 1000

/**
 * Render the whole map — not just what is on screen — by re-framing the
 * viewport around the node bounds before rasterising it.
 */
export async function downloadPng(nodes: Node[]): Promise<void> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!viewport || nodes.length === 0) return

  const bounds = getNodesBounds(nodes)
  const { x, y, zoom } = getViewportForBounds(bounds, WIDTH, HEIGHT, 0.3, 2, 0.12)

  const dataUrl = await toPng(viewport, {
    backgroundColor: '#EEF1F5',
    width: WIDTH,
    height: HEIGHT,
    style: {
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
  })

  const link = document.createElement('a')
  link.download = 'callmap.png'
  link.href = dataUrl
  link.click()
}
