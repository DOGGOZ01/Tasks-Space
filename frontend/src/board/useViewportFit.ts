import { useLayoutEffect, useRef, useState } from 'react'
import type { PopoverAnchor } from './popoverAnchor'

const VIEWPORT_MARGIN = 12

export function useViewportFit<T extends HTMLElement>(anchor: PopoverAnchor | null) {
  const ref = useRef<T>(null)
  const [fittedTop, setFittedTop] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!anchor || !el) {
      setFittedTop(null)
      return
    }
    const maxTop = window.innerHeight - el.offsetHeight - VIEWPORT_MARGIN
    setFittedTop(Math.max(VIEWPORT_MARGIN, Math.min(anchor.top, maxTop)))
  }, [anchor])

  return { ref, top: fittedTop ?? anchor?.top ?? 0 }
}
