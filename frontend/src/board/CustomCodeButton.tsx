import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { OVERLAY_HTML_PLACEHOLDER } from './AnimationOverlay'
import type { BlockStyle } from './blockStyle'
import { useDragOffset } from './useDragOffset'

const PANEL_WIDTH = 320

type CodeTab = 'css' | 'animation' | 'js'

interface CustomCodeButtonProps {
  style: BlockStyle
  onChange: (next: BlockStyle) => void
  allowCustomScripts: boolean
  className?: string
}

const CSS_PLACEHOLDER = 'background: linear-gradient(...); font-family: cursive;'
const ANIMATION_PLACEHOLDER =
  '&:hover { transform: scale(1.05); }\n&:active { transform: scale(0.95); }\n@keyframes pulse {\n  0% { box-shadow: 0 0 0 0 rgba(255,90,31,.5) !important; }\n  100% { box-shadow: 0 0 0 10px rgba(255,90,31,0) !important; }\n}\n& { animation: pulse 1.5s infinite; }'

export function CustomCodeButton({
  style,
  onChange,
  allowCustomScripts,
  className = 'block-quick-menu-item',
}: CustomCodeButtonProps) {
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const [tab, setTab] = useState<CodeTab>('css')
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

  const tabs: { key: CodeTab; label: string }[] = [
    { key: 'css', label: 'CSS' },
    { key: 'animation', label: 'Animation' },
    ...(allowCustomScripts ? [{ key: 'js' as const, label: 'JS overlay' }] : []),
  ]
  const activeTab = tab === 'js' && !allowCustomScripts ? 'css' : tab

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
        Custom code (manual)
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setAnchor(null)} />
            <div
              className="block-style-panel-wrap"
              style={{ top: anchor.top, left: anchor.left, transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
            >
              <div
                className="block-style-panel"
                style={{ width: PANEL_WIDTH }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="block-style-panel-header" {...dragHandleProps}>
                  <span>Custom code (manual)</span>
                  <button
                    type="button"
                    onClick={() => setAnchor(null)}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Close custom code editor"
                  >
                    ×
                  </button>
                </div>

                <p className="block-layout-editor-hint">
                  Raw code, applied exactly as written. Not the point-and-click controls above.
                </p>

                <div className="board-bg-type-tabs" role="tablist">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === t.key}
                      onClick={() => setTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'css' && (
                  <textarea
                    className="block-style-css-editor"
                    value={style.customCss ?? ''}
                    onChange={(e) => onChange({ ...style, customCss: e.target.value })}
                    spellCheck={false}
                    placeholder={CSS_PLACEHOLDER}
                    autoFocus
                  />
                )}
                {activeTab === 'animation' && (
                  <textarea
                    className="block-style-css-editor"
                    value={style.animationCss ?? ''}
                    onChange={(e) => onChange({ ...style, animationCss: e.target.value })}
                    spellCheck={false}
                    placeholder={ANIMATION_PLACEHOLDER}
                  />
                )}
                {activeTab === 'js' && allowCustomScripts && (
                  <textarea
                    className="block-style-css-editor"
                    value={style.overlayHtml ?? ''}
                    onChange={(e) => onChange({ ...style, overlayHtml: e.target.value })}
                    spellCheck={false}
                    placeholder={OVERLAY_HTML_PLACEHOLDER}
                  />
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
