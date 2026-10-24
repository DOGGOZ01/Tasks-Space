import type { HTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPanel } from './BoardCanvas'
import { useBoardUi } from './BoardUiContext'
import { CustomCssButton } from './CustomCssButton'
import { DEFAULT_LOADING_SCREEN } from './loadingScreen'
import { resolveThemeColor } from './themeColor'

const PANEL_WIDTH = 300

interface LoadingScreenPanelProps {
  onClose: () => void
  dragHandleProps?: HTMLAttributes<HTMLDivElement>
}

export function LoadingScreenPanel({ onClose, dragHandleProps }: LoadingScreenPanelProps) {
  const { loadingScreen, setLoadingScreen, previewLoadingScreen } = useBoardUi()
  const isDefault = !loadingScreen.html && !loadingScreen.color

  return (
    <div className="board-bg-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="block-style-panel-header" {...dragHandleProps}>
        <span>Loading screen</span>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close loading screen panel"
        >
          ×
        </button>
      </div>

      <p className="board-bg-html-hint">
        Shown until every block, image and HTML frame has loaded, for 8 seconds at most. Sandboxed
        HTML/CSS like the animated background. Leave it empty for the default spinner.
      </p>

      <label className="block-style-row">
        <span className="block-style-label">Backdrop color</span>
        <div className="block-style-control">
          <input
            type="color"
            value={loadingScreen.color ?? resolveThemeColor('--bg')}
            onChange={(e) => setLoadingScreen({ ...loadingScreen, color: e.target.value })}
          />
        </div>
      </label>

      <CustomCssButton
        className="block-style-full-button"
        label="Edit HTML/JS"
        value={loadingScreen.html ?? ''}
        onChange={(html) => setLoadingScreen({ ...loadingScreen, html })}
        placeholder='<div style="color:#0ff;font:24px monospace">BOOTING...</div>'
      />

      <div className="block-style-control loading-screen-actions">
        <button
          type="button"
          onClick={() => {
            onClose()
            previewLoadingScreen()
          }}
        >
          Preview
        </button>
        <button type="button" onClick={() => setLoadingScreen(DEFAULT_LOADING_SCREEN)} disabled={isDefault}>
          Use default
        </button>
      </div>
    </div>
  )
}

export function LoadingScreenToggle() {
  const { anchor, offset, toggleRef, toggle, dragHandleProps, close } = useAnchoredPanel(PANEL_WIDTH)

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="board-bg-toggle"
        onClick={toggle}
        aria-pressed={anchor != null}
        title="Loading screen"
      >
        Loading screen
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={close} />
            <div
              className="block-style-panel-wrap"
              style={{ top: anchor.top, left: anchor.left, transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
            >
              <LoadingScreenPanel onClose={close} dragHandleProps={dragHandleProps} />
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
