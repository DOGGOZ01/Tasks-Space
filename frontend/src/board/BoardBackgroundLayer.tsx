import type { CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import type { BoardBackground } from './boardBackground'
import { useIframeLoadTracking } from './iframeLoadTracker'
import { useRenderPreview } from './useRenderPreviewUrl'

export function BoardBackgroundLayer({ background, style }: { background: BoardBackground; style?: CSSProperties }) {
  const { allowCustomScripts } = useAuth()
  const { url: previewUrl, settled } = useRenderPreview(background.html ?? '', 'background')
  const handleFrameLoad = useIframeLoadTracking(Boolean(background.html), previewUrl, settled)

  if (!previewUrl) return null

  return (
    <iframe
      className="board-background-frame"
      sandbox={allowCustomScripts ? 'allow-scripts' : ''}
      src={previewUrl}
      style={style}
      onLoad={handleFrameLoad}
      title="Board background"
    />
  )
}
