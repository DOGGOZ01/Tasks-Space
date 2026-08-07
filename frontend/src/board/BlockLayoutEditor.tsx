import { useRef, useState } from 'react'
import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from 'react'
import type { BlockElementId, ElementLayout, ElementRect } from './elementLayout'
import {
  MIN_ELEMENT_PERCENT,
  clampPercent,
  hasCustomLayoutFor,
  resolveElementRect,
  rectsOverlap,
  snapPercent,
} from './elementLayout'

const CANVAS_WIDTH = 260

interface BlockLayoutEditorProps {
  elements: { id: BlockElementId; label: string }[]
  layout: ElementLayout
  seedLayout: ElementLayout
  onChange: (next: ElementLayout) => void
  onReset: () => void
  onClose: () => void
  blockWidth: number
  blockHeight: number
  dragHandleProps?: HTMLAttributes<HTMLDivElement>
}

export function BlockLayoutEditor({
  elements,
  layout,
  seedLayout,
  onChange,
  onReset,
  onClose,
  blockWidth,
  blockHeight,
  dragHandleProps,
}: BlockLayoutEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const ids = elements.map((el) => el.id)
  const alreadyCustom = hasCustomLayoutFor(layout, ids)
  const [draft, setDraft] = useState<ElementLayout>(() => (alreadyCustom ? layout : seedLayout))
  const [isCustomized, setIsCustomized] = useState(alreadyCustom)
  const aspect = blockWidth > 0 && blockHeight > 0 ? blockWidth / blockHeight : 1
  const canvasHeight = clampPercent(CANVAS_WIDTH / aspect, 120, 260)

  function commit(next: ElementLayout) {
    setDraft(next)
    setIsCustomized(true)
    onChange(next)
  }

  function updateRect(id: BlockElementId, next: ElementRect) {
    commit({ ...draft, [id]: next })
  }

  function startDrag(id: BlockElementId, rect: ElementRect, event: ReactPointerEvent) {
    event.stopPropagation()
    event.preventDefault()
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const canvasRect = canvasEl.getBoundingClientRect()
    const start = { pointerX: event.clientX, pointerY: event.clientY, x: rect.x, y: rect.y }

    function handleMove(moveEvent: PointerEvent) {
      const dxPct = ((moveEvent.clientX - start.pointerX) / canvasRect.width) * 100
      const dyPct = ((moveEvent.clientY - start.pointerY) / canvasRect.height) * 100
      const nextX = clampPercent(snapPercent(start.x + dxPct), 0, 100 - rect.width)
      const nextY = clampPercent(snapPercent(start.y + dyPct), 0, 100 - rect.height)
      updateRect(id, { ...rect, x: nextX, y: nextY })
    }
    function handleUp() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  function startResize(id: BlockElementId, rect: ElementRect, event: ReactPointerEvent) {
    event.stopPropagation()
    event.preventDefault()
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const canvasRect = canvasEl.getBoundingClientRect()
    const start = { pointerX: event.clientX, pointerY: event.clientY, width: rect.width, height: rect.height }

    function handleMove(moveEvent: PointerEvent) {
      const dwPct = ((moveEvent.clientX - start.pointerX) / canvasRect.width) * 100
      const dhPct = ((moveEvent.clientY - start.pointerY) / canvasRect.height) * 100
      const nextWidth = clampPercent(snapPercent(start.width + dwPct), MIN_ELEMENT_PERCENT, 100 - rect.x)
      const nextHeight = clampPercent(snapPercent(start.height + dhPct), MIN_ELEMENT_PERCENT, 100 - rect.y)
      updateRect(id, { ...rect, width: nextWidth, height: nextHeight })
    }
    function handleUp() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const overlappingIds = new Set<BlockElementId>()
  if (isCustomized) {
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = draft[elements[i].id]
        const b = draft[elements[j].id]
        if (a && b && rectsOverlap(a, b)) {
          overlappingIds.add(elements[i].id)
          overlappingIds.add(elements[j].id)
        }
      }
    }
  }

  return (
    <div className="block-style-panel block-layout-editor" onPointerDown={(e) => e.stopPropagation()}>
      <div className="block-style-panel-header" {...dragHandleProps}>
        <span>Layout</span>
        <button type="button" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Close layout editor">
          ×
        </button>
      </div>

      <p className="block-layout-editor-hint">Drag a box to move it, the corner to resize. The eye toggles visibility.</p>
      {overlappingIds.size > 0 && (
        <p className="block-layout-editor-warning">
          Overlapping boxes (outlined below) will hide each other's content on the real block -- header
          always draws on top, then add row, then content.
        </p>
      )}

      <div
        ref={canvasRef}
        className="block-layout-editor-canvas"
        style={{ width: CANVAS_WIDTH, height: canvasHeight }}
      >
        {elements.map(({ id, label }) => {
          const rect = draft[id]
          if (!rect) return null
          return (
            <div
              key={id}
              className={`block-layout-editor-rect${rect.hidden ? ' block-layout-editor-rect-hidden' : ''}${overlappingIds.has(id) ? ' block-layout-editor-rect-overlap' : ''}`}
              style={
                rect.hidden
                  ? { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` }
                  : resolveElementRect(rect)
              }
              onPointerDown={(e) => startDrag(id, rect, e)}
            >
              <span className="block-layout-editor-rect-label">{label}</span>
              <button
                type="button"
                className="block-layout-editor-visibility"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => updateRect(id, { ...rect, hidden: !rect.hidden })}
                aria-pressed={!!rect.hidden}
                aria-label={rect.hidden ? `Show ${label}` : `Hide ${label}`}
                title={rect.hidden ? 'Show' : 'Hide'}
              >
                {rect.hidden ? '◇' : '◆'}
              </button>
              {!rect.hidden && (
                <div
                  className="block-layout-editor-resize"
                  onPointerDown={(e) => startResize(id, rect, e)}
                  role="presentation"
                />
              )}
            </div>
          )
        })}
      </div>

      <button type="button" className="block-style-full-button" onClick={onReset}>
        Reset to default layout
      </button>
    </div>
  )
}
