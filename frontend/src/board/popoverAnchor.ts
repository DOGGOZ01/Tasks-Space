export interface PopoverAnchor {
  top: number
  left: number
}

export function anchorBelowRect(rect: DOMRect | null | undefined, panelWidth: number): PopoverAnchor {
  if (!rect) return { top: 80, left: 80 }
  const left = Math.min(rect.left, window.innerWidth - panelWidth - 12)
  const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
  return { top, left: Math.max(12, left) }
}

export function anchorBelowRectRightAligned(rect: DOMRect | null | undefined, panelWidth: number): PopoverAnchor {
  if (!rect) return { top: 80, left: 80 }
  const left = Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 12)
  const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
  return { top, left: Math.max(12, left) }
}
