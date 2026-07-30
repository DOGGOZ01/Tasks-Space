import type { CSSProperties } from 'react'
import { sanitizeCssDeclarations } from './cssDeclarations'

export interface BlockStyle {
  background?: string
  textColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  opacity?: number
  customCss?: string
}

export const DEFAULT_BLOCK_STYLE: BlockStyle = {}

export const STYLE_PRESETS: { label: string; style: BlockStyle }[] = [
  { label: 'Default', style: {} },
  {
    label: 'Solid accent',
    style: { background: '#ff5a1f', textColor: '#16130d', borderColor: '#221d15', borderWidth: 2, borderRadius: 3 },
  },
  {
    label: 'Dark',
    style: { background: '#221d15', textColor: '#f3ecdc', borderColor: '#221d15', borderWidth: 2, borderRadius: 3 },
  },
  {
    label: 'Outline',
    style: { borderColor: '#ff5a1f', borderWidth: 2, borderRadius: 3 },
  },
  {
    label: 'Pill',
    style: { background: '#f6f1e7', textColor: '#221d15', borderColor: '#221d15', borderWidth: 2, borderRadius: 40 },
  },
]

const ALLOWED_CUSTOM_CSS_PROPERTIES = new Set([
  'color', 'background', 'background-color', 'background-image', 'background-position',
  'background-size', 'background-repeat', 'border', 'border-radius', 'border-color',
  'border-style', 'border-width', 'font', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-align', 'text-decoration', 'text-shadow', 'line-height',
  'opacity', 'filter', 'box-shadow', 'letter-spacing', 'text-transform', 'padding',
])

export function sanitizeCustomCss(raw: string): CSSProperties {
  return sanitizeCssDeclarations(raw, ALLOWED_CUSTOM_CSS_PROPERTIES)
}

export function resolveBlockStyle(style: BlockStyle, bare: boolean): CSSProperties {
  const result: CSSProperties = {}

  if (style.background) {
    result.background = style.background
  } else if (bare) {
    result.background = 'transparent'
  }

  if (style.textColor) {
    result.color = style.textColor
  }

  if (style.borderWidth && style.borderColor) {
    result.border = `${style.borderWidth}px solid ${style.borderColor}`
  } else if (bare) {
    result.border = 'none'
  }

  if (style.borderRadius != null) {
    result.borderRadius = style.borderRadius
  } else if (bare) {
    result.borderRadius = 0
  }

  if (style.opacity != null && style.opacity < 1) {
    result.opacity = style.opacity
  }

  const customCss = sanitizeCustomCss(style.customCss ?? '')

  if (style.customCss) {
    return {
      ...result,
      boxShadow: 'none',
      filter: 'none',
      clipPath: 'none',
      ...customCss,
    }
  }

  return { ...result, ...customCss }
}
