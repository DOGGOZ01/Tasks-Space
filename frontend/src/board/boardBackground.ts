import type { CSSProperties } from 'react'
import { sanitizeCssDeclarations } from './cssDeclarations'

export type BoardBackgroundType = 'color' | 'image' | 'custom' | 'html'
export type BoardBackgroundImageFit = 'cover' | 'contain' | 'repeat'

export interface BoardBackground {
  type: BoardBackgroundType
  color?: string
  imageUrl?: string
  imageFit?: BoardBackgroundImageFit
  customCss?: string
  html?: string
}

export const DEFAULT_BOARD_BACKGROUND: BoardBackground = { type: 'color' }

export const BACKGROUND_PRESET_COLORS = [
  '#F6F1E7',
  '#FFE8CF',
  '#E7EFE1',
  '#F3E1E7',
  '#DCE7EC',
  '#1A160F',
]

const ALLOWED_BACKGROUND_CSS_PROPERTIES = new Set([
  'background', 'background-color', 'background-image', 'background-position',
  'background-size', 'background-repeat', 'background-attachment', 'filter', 'opacity',
])

export function sanitizeBackgroundCustomCss(raw: string): CSSProperties {
  return sanitizeCssDeclarations(raw, ALLOWED_BACKGROUND_CSS_PROPERTIES)
}

const IMAGE_FIT_CSS: Record<BoardBackgroundImageFit, CSSProperties> = {
  cover: { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' },
  contain: { backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' },
  repeat: { backgroundSize: 'auto', backgroundPosition: 'top left', backgroundRepeat: 'repeat' },
}

export function resolveBoardBackground(background: BoardBackground): CSSProperties {
  const customCss = sanitizeBackgroundCustomCss(background.customCss ?? '')
  switch (background.type) {
    case 'color':
      return {
        backgroundAttachment: 'local',
        ...(background.color ? { background: background.color } : {}),
        ...customCss,
      }
    case 'image':
      return {
        backgroundAttachment: 'local',
        ...(background.imageUrl
          ? {
              backgroundImage: `url(${JSON.stringify(background.imageUrl)})`,
              ...IMAGE_FIT_CSS[background.imageFit ?? 'cover'],
            }
          : {}),
        ...customCss,
      }
    case 'custom':
      return { backgroundAttachment: 'local', ...customCss }
    case 'html':
      return {}
    default:
      return {}
  }
}
