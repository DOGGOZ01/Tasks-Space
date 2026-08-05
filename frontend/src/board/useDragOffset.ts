import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export interface DragOffset {
  dx: number
  dy: number
}

const ZERO_OFFSET: DragOffset = { dx: 0, dy: 0 }

export function useDragOffset() {
  const [offset, setOffset] = useState<DragOffset>(ZERO_OFFSET)
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = { x: event.clientX, y: event.clientY, ...offsetRef.current }

    function handleMove(moveEvent: PointerEvent) {
      setOffset({
        dx: start.dx + (moveEvent.clientX - start.x),
        dy: start.dy + (moveEvent.clientY - start.y),
      })
    }
    function handleUp() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }, [])

  const reset = useCallback(() => setOffset(ZERO_OFFSET), [])

  return { offset, dragHandleProps: { onPointerDown }, reset }
}
