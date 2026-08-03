import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BlockStylePanel } from './BlockStylePanel'
import { CustomCssButton } from './CustomCssButton'
import type { BlockStyle } from './blockStyle'
import { DEFAULT_BLOCK_STYLE, resolveBlockStyle } from './blockStyle'
import { useBoardUi } from './BoardUiContext'
import type { Geometry } from './geometry'
import { MIN_BLOCK_HEIGHT, MIN_BLOCK_WIDTH, clamp, snapToGrid } from './geometry'

const PANEL_WIDTH = 300
const MENU_WIDTH = 190

interface BlockShellProps extends Geometry {
  title: string
  decorative?: boolean
  style?: BlockStyle
  onStyleChange?: (style: BlockStyle) => void
  titleOverride?: string
  onTitleChange?: (title: string) => void
  headerStyle?: BlockStyle
  onHeaderStyleChange?: (style: BlockStyle) => void
  headerActions?: ReactNode
  craftRef?: (dom: HTMLElement) => HTMLElement
  onGeometryChange: (geometry: Geometry) => void
  onRemove: () => void
  children: ReactNode
}

export function BlockShell({
  x,
  y,
  width,
  height,
  title,
  decorative = false,
  style = DEFAULT_BLOCK_STYLE,
  onStyleChange,
  titleOverride,
  onTitleChange,
  headerStyle = DEFAULT_BLOCK_STYLE,
  onHeaderStyleChange,
  headerActions,
  craftRef,
  onGeometryChange,
  onRemove,
  children,
}: BlockShellProps) {
  const { editMode, scale, canvasWidth, canvasHeight } = useBoardUi()
  const bare = decorative && !editMode
  const displayTitle = titleOverride?.trim() ? titleOverride : title
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null)
  const [panelAnchor, setPanelAnchor] = useState<{ top: number; left: number } | null>(null)
  const [headerPanelAnchor, setHeaderPanelAnchor] = useState<{ top: number; left: number } | null>(null)
  const [confirmAnchor, setConfirmAnchor] = useState<{ top: number; left: number } | null>(null)
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const geometryRef = useRef<Geometry>({ x, y, width, height })
  geometryRef.current = { x, y, width, height }

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      if (!editMode) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const start = { pointerX: event.clientX, pointerY: event.clientY, ...geometryRef.current }

      function handleMove(moveEvent: PointerEvent) {
        const dx = (moveEvent.clientX - start.pointerX) / scale
        const dy = (moveEvent.clientY - start.pointerY) / scale
        onGeometryChange({
          x: clamp(snapToGrid(start.x + dx), 0, canvasWidth - start.width),
          y: clamp(snapToGrid(start.y + dy), 0, canvasHeight - start.height),
          width: start.width,
          height: start.height,
        })
      }
      function handleUp() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [editMode, scale, canvasWidth, canvasHeight, onGeometryChange],
  )

  const startResize = useCallback(
    (event: ReactPointerEvent) => {
      if (!editMode) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      const start = { pointerX: event.clientX, pointerY: event.clientY, ...geometryRef.current }

      function handleMove(moveEvent: PointerEvent) {
        const dx = (moveEvent.clientX - start.pointerX) / scale
        const dy = (moveEvent.clientY - start.pointerY) / scale
        onGeometryChange({
          x: start.x,
          y: start.y,
          width: clamp(snapToGrid(start.width + dx), MIN_BLOCK_WIDTH, canvasWidth - start.x),
          height: clamp(snapToGrid(start.height + dy), MIN_BLOCK_HEIGHT, canvasHeight - start.y),
        })
      }
      function handleUp() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [editMode, scale, canvasWidth, canvasHeight, onGeometryChange],
  )

  function toggleMenu() {
    if (menuAnchor) {
      setMenuAnchor(null)
      return
    }
    const rect = menuToggleRef.current?.getBoundingClientRect()
    if (!rect) {
      setMenuAnchor({ top: 80, left: 80 })
      return
    }
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setMenuAnchor({ top, left: Math.max(12, left) })
  }

  function openStylePanel() {
    setMenuAnchor(null)
    const rect = menuToggleRef.current?.getBoundingClientRect()
    if (!rect) {
      setPanelAnchor({ top: 80, left: 80 })
      return
    }
    const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setPanelAnchor({ top, left: Math.max(12, left) })
  }

  function openHeaderPanel() {
    setMenuAnchor(null)
    const rect = menuToggleRef.current?.getBoundingClientRect()
    if (!rect) {
      setHeaderPanelAnchor({ top: 80, left: 80 })
      return
    }
    const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setHeaderPanelAnchor({ top, left: Math.max(12, left) })
  }

  const CONFIRM_WIDTH = 220
  function requestRemove() {
    setMenuAnchor(null)
    const rect = menuToggleRef.current?.getBoundingClientRect()
    if (!rect) {
      setConfirmAnchor({ top: 80, left: 80 })
      return
    }
    const left = Math.min(rect.right - CONFIRM_WIDTH, window.innerWidth - CONFIRM_WIDTH - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setConfirmAnchor({ top, left: Math.max(12, left) })
  }

  const menuToggle = (
    <button
      ref={menuToggleRef}
      type="button"
      className="block-shell-menu-toggle"
      onClick={toggleMenu}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`${displayTitle} block menu`}
      aria-pressed={menuAnchor != null}
      title={displayTitle}
    >
      ⋯
    </button>
  )

  return (
    <div
      ref={(dom) => {
        if (dom && craftRef) craftRef(dom)
      }}
      className={`block-shell${editMode ? ' block-shell-editable' : ''}${bare ? ' block-shell-bare' : ''}`}
      style={{ left: x, top: y, width, height, ...resolveBlockStyle(style, bare) }}
    >
      {!decorative && (
        <div
          className="block-shell-header"
          onPointerDown={startDrag}
          style={resolveBlockStyle(headerStyle, false)}
        >
          <span className="block-shell-title">{displayTitle}</span>
          {editMode && menuToggle}
        </div>
      )}
      <div className="block-shell-body">{children}</div>
      {decorative && editMode && (
        <div className="block-shell-overlay-controls">
          <div
            className="block-shell-drag-handle"
            onPointerDown={startDrag}
            role="presentation"
            title="Drag to move"
          >
            ⠿
          </div>
          {menuToggle}
        </div>
      )}
      {editMode && <div className="block-shell-resize" onPointerDown={startResize} />}
      {editMode &&
        menuAnchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setMenuAnchor(null)} />
            <div
              className="block-quick-menu"
              style={{ top: menuAnchor.top, left: menuAnchor.left, width: MENU_WIDTH }}
            >
              <div className="block-quick-menu-title">{displayTitle}</div>
              {(onTitleChange || onHeaderStyleChange) && (
                <button type="button" className="block-quick-menu-item" onClick={openHeaderPanel}>
                  Header
                </button>
              )}
              {headerActions}
              {onStyleChange && (
                <button type="button" className="block-quick-menu-item" onClick={openStylePanel}>
                  Body style
                </button>
              )}
              {onStyleChange && (
                <CustomCssButton
                  value={style.customCss ?? ''}
                  onChange={(customCss) => onStyleChange({ ...style, customCss })}
                />
              )}
              <button
                type="button"
                className="block-quick-menu-item block-quick-menu-danger"
                onClick={requestRemove}
              >
                Remove
              </button>
            </div>
          </>,
          document.body,
        )}
      {editMode &&
        panelAnchor &&
        onStyleChange &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setPanelAnchor(null)} />
            <div
              className="block-style-panel-wrap"
              style={{ top: panelAnchor.top, left: panelAnchor.left }}
            >
              <BlockStylePanel
                style={style}
                onChange={onStyleChange}
                onClose={() => setPanelAnchor(null)}
                showCustomCss={false}
              />
            </div>
          </>,
          document.body,
        )}
      {editMode &&
        headerPanelAnchor &&
        (onTitleChange || onHeaderStyleChange) &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setHeaderPanelAnchor(null)} />
            <div
              className="block-style-panel-wrap"
              style={{ top: headerPanelAnchor.top, left: headerPanelAnchor.left }}
            >
              <BlockStylePanel
                title="Header"
                style={headerStyle}
                onChange={(next) => onHeaderStyleChange?.(next)}
                onClose={() => setHeaderPanelAnchor(null)}
                showCustomCss={false}
              >
                {onTitleChange && (
                  <label className="block-style-row">
                    <span className="block-style-label">Title</span>
                    <input
                      type="text"
                      className="confirm-popover-input"
                      value={titleOverride ?? ''}
                      placeholder={title}
                      maxLength={80}
                      onChange={(e) => onTitleChange(e.target.value)}
                    />
                  </label>
                )}
              </BlockStylePanel>
            </div>
          </>,
          document.body,
        )}
      {editMode &&
        confirmAnchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setConfirmAnchor(null)} />
            <div
              className="confirm-popover"
              style={{ top: confirmAnchor.top, left: confirmAnchor.left, width: CONFIRM_WIDTH }}
            >
              <p>Delete the "{title}" block?</p>
              <p className="confirm-popover-hint">This can't be undone.</p>
              <div className="confirm-popover-actions">
                <button type="button" onClick={() => setConfirmAnchor(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="confirm-popover-danger"
                  onClick={() => {
                    setConfirmAnchor(null)
                    onRemove()
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
