import type { CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import type { BoardBackground } from './boardBackground'
import { useRenderPreviewUrl } from './useRenderPreviewUrl'

export function BoardBackgroundLayer({ background, style }: { background: BoardBackground; style?: CSSProperties }) {
  const { allowCustomScripts } = useAuth()
  const previewUrl = useRenderPreviewUrl(background.html ?? '', 'background')

  if (!previewUrl) return null

  return (
    <iframe
      className="board-background-frame"
      sandbox={allowCustomScripts ? 'allow-scripts' : ''}
      src={previewUrl}
      style={style}
      title="Board background"
    />
  )
}
