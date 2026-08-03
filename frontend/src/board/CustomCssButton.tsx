import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const CSS_PANEL_WIDTH = 280

interface CustomCssButtonProps {
  value: string
  onChange: (next: string) => void
  className?: string
  label?: string
  placeholder?: string
}

export function CustomCssButton({
  value,
  onChange,
  className = 'block-quick-menu-item',
  label = 'Custom CSS',
  placeholder = 'background: linear-gradient(...); font-family: cursive;',
}: CustomCssButtonProps) {
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  function toggle() {
    if (anchor) {
      setAnchor(null)
      return
    }
    const rect = toggleRef.current?.getBoundingClientRect()
    if (!rect) {
      setAnchor({ top: 80, left: 80 })
      return
    }
    const left = Math.min(rect.left, window.innerWidth - CSS_PANEL_WIDTH - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setAnchor({ top, left: Math.max(12, left) })
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={className}
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        aria-pressed={anchor != null}
      >
        {label}
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setAnchor(null)} />
            <div className="block-style-panel-wrap" style={{ top: anchor.top, left: anchor.left }}>
              <div
                className="block-style-panel"
                style={{ width: CSS_PANEL_WIDTH }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="block-style-panel-header">
                  <span>Custom CSS</span>
                  <button type="button" onClick={() => setAnchor(null)} aria-label="Close custom CSS editor">
                    ×
                  </button>
                </div>
                <textarea
                  className="block-style-css-editor"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  spellCheck={false}
                  placeholder={placeholder}
                  autoFocus
                />
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
