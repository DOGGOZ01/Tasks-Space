import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BlockStylePanel } from '../BlockStylePanel'
import type { BlockStyle } from '../blockStyle'
import { useDragOffset } from '../useDragOffset'

const PANEL_WIDTH = 300

type RowTarget = 'input' | 'button'

const ROW_TARGETS: { key: RowTarget; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'button', label: 'Button' },
]

export function TaskInputStyleButton({
  inputStyle,
  onInputStyleChange,
  buttonStyle,
  onButtonStyleChange,
  buttonIcon,
  onButtonIconChange,
}: {
  inputStyle: BlockStyle
  onInputStyleChange: (next: BlockStyle) => void
  buttonStyle: BlockStyle
  onButtonStyleChange: (next: BlockStyle) => void
  buttonIcon: string
  onButtonIconChange: (next: string) => void
}) {
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const [target, setTarget] = useState<RowTarget>('input')
  const { offset, dragHandleProps, reset: resetOffset } = useDragOffset()

  function toggle() {
    if (anchor) {
      setAnchor(null)
      return
    }
    resetOffset()
    const rect = toggleRef.current?.getBoundingClientRect()
    if (!rect) {
      setAnchor({ top: 80, left: 80 })
      return
    }
    const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setAnchor({ top, left: Math.max(12, left) })
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="block-quick-menu-item"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        aria-pressed={anchor != null}
      >
        Input style
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setAnchor(null)} />
            <div
              className="block-style-panel-wrap header-style-panel-wrap"
              style={{ top: anchor.top, left: anchor.left, transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="board-bg-type-tabs" role="tablist">
                {ROW_TARGETS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={target === t.key}
                    onClick={() => setTarget(t.key)}
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
                  onClose={() => setAnchor(null)}
                  dragHandleProps={dragHandleProps}
                />
              )}
              {target === 'button' && (
                <BlockStylePanel
                  title="Button style"
                  style={buttonStyle}
                  onChange={onButtonStyleChange}
                  onClose={() => setAnchor(null)}
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
        )}
    </>
  )
}
