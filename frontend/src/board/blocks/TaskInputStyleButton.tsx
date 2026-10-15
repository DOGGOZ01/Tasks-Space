import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BlockStylePanel } from '../BlockStylePanel'
import type { BlockStyle } from '../blockStyle'
import { anchorBelowRect } from '../popoverAnchor'
import { useDragOffset } from '../useDragOffset'
import { useViewportFit } from '../useViewportFit'

export const TASK_INPUT_STYLE_PANEL_WIDTH = 300

type RowTarget = 'input' | 'button'

const ROW_TARGETS: { key: RowTarget; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'button', label: 'Button' },
]

export function useTaskInputStylePanel() {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const [target, setTarget] = useState<RowTarget>('input')
  const { offset, dragHandleProps, reset: resetOffset } = useDragOffset()

  function open(rect: DOMRect | null | undefined) {
    resetOffset()
    setAnchor(anchorBelowRect(rect, TASK_INPUT_STYLE_PANEL_WIDTH))
  }

  function close() {
    setAnchor(null)
  }

  return { anchor, target, setTarget, offset, dragHandleProps, open, close }
}

export function TaskInputStyleTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="block-quick-menu-item"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
    >
      Input style
    </button>
  )
}

export function TaskInputStylePanel({
  anchor,
  target,
  onTargetChange,
  offset,
  dragHandleProps,
  onClose,
  inputStyle,
  onInputStyleChange,
  buttonStyle,
  onButtonStyleChange,
  buttonIcon,
  onButtonIconChange,
}: {
  anchor: { top: number; left: number }
  target: RowTarget
  onTargetChange: (target: RowTarget) => void
  offset: { dx: number; dy: number }
  dragHandleProps: ReturnType<typeof useDragOffset>['dragHandleProps']
  onClose: () => void
  inputStyle: BlockStyle
  onInputStyleChange: (next: BlockStyle) => void
  buttonStyle: BlockStyle
  onButtonStyleChange: (next: BlockStyle) => void
  buttonIcon: string
  onButtonIconChange: (next: string) => void
}) {
  const fit = useViewportFit<HTMLDivElement>(anchor)
  return createPortal(
    <>
      <div className="block-style-backdrop" onClick={onClose} />
      <div
        ref={fit.ref}
        className="block-style-panel-wrap header-style-panel-wrap"
        style={{ top: fit.top, left: anchor.left, transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="board-bg-type-tabs" role="tablist">
          {ROW_TARGETS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={target === t.key}
              onClick={() => onTargetChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {target === 'input' && (
          <BlockStylePanel
            title="Input style"
            style={inputStyle}
            onChange={onInputStyleChange}
            onClose={onClose}
            dragHandleProps={dragHandleProps}
          />
        )}
        {target === 'button' && (
          <BlockStylePanel
            title="Button style"
            style={buttonStyle}
            onChange={onButtonStyleChange}
            onClose={onClose}
            dragHandleProps={dragHandleProps}
          >
            <label className="block-style-row">
              <span className="block-style-label">Icon</span>
              <input
                type="text"
                className="confirm-popover-input"
                value={buttonIcon}
                placeholder="+"
                maxLength={4}
                onChange={(e) => onButtonIconChange(e.target.value)}
              />
            </label>
          </BlockStylePanel>
        )}
      </div>
    </>,
    document.body,
  )
}
