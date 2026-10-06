import { useCallback, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimationOverlay } from './AnimationOverlay'
import { scopeKeyFor } from './animationCss'
import { BlockLayoutEditor } from './BlockLayoutEditor'
import { BlockStylePanel } from './BlockStylePanel'
import { ScopedAnimationStyle } from './ScopedAnimationStyle'
import type { BlockStyle } from './blockStyle'
import { DEFAULT_BLOCK_STYLE, resolveBlockStyle } from './blockStyle'
import { useAuth } from '../context/AuthContext'
import { useBoardUi } from './BoardUiContext'
import type { BlockElementId, ElementLayout, ElementRect } from './elementLayout'
import {
  DEFAULT_ELEMENT_LAYOUT,
  ELEMENT_LABELS,
  MIN_ELEMENT_PERCENT,
  clampPercent,
  defaultElementLayout,
  hasCustomLayoutFor,
  resolveElementRect,
} from './elementLayout'
import type { Geometry } from './geometry'
import { MIN_BLOCK_HEIGHT, MIN_BLOCK_WIDTH, clamp, snapToGrid } from './geometry'
import { anchorBelowRect, anchorBelowRectRightAligned } from './popoverAnchor'
import { useDragOffset } from './useDragOffset'
import { useViewportFit } from './useViewportFit'
import { getZIndexRank } from './zOrder'

const PANEL_WIDTH = 300
const MENU_WIDTH = 190

interface BlockShellProps extends Geometry {
  nodeId: string
  title: string
  decorative?: boolean
  style?: BlockStyle
  onStyleChange?: (style: BlockStyle) => void
  hideCustomCodeButton?: boolean
  hideBodyStyleButton?: boolean
  alwaysBare?: boolean
  titleOverride?: string
  onTitleChange?: (title: string) => void
  headerStyle?: BlockStyle
  onHeaderStyleChange?: (style: BlockStyle) => void
  extraActions?: (closeMenu: () => void, menuToggleRef: RefObject<HTMLButtonElement | null>) => ReactNode
  elementLayout?: ElementLayout
  onElementLayoutChange?: (layout: ElementLayout) => void
  addRowSlot?: ReactNode
  bodyLabel?: string
  zIndex?: number
  onBringToFront?: () => void
  onSendToBack?: () => void
  query?: { serialize: () => string }
  craftRef?: (dom: HTMLElement) => HTMLElement
  onGeometryChange: (geometry: Geometry) => void
  onRemove: () => void
  children: ReactNode
}

export function BlockShell({
  nodeId,
  x,
  y,
  width,
  height,
  title,
  decorative = false,
  style = DEFAULT_BLOCK_STYLE,
  onStyleChange,
  hideCustomCodeButton = false,
  hideBodyStyleButton = false,
  alwaysBare = false,
  titleOverride,
  onTitleChange,
  headerStyle = DEFAULT_BLOCK_STYLE,
  onHeaderStyleChange,
  extraActions,
  elementLayout = DEFAULT_ELEMENT_LAYOUT,
  onElementLayoutChange,
  addRowSlot,
  bodyLabel,
  zIndex,
  onBringToFront,
  onSendToBack,
  query,
  craftRef,
  onGeometryChange,
  onRemove,
  children,
}: BlockShellProps) {
  const { editMode, scale, canvasWidth, canvasHeight, hoverToRevealBlocks, controlsLayerNode } = useBoardUi()
  const { allowCustomScripts } = useAuth()
  const bare = decorative && (alwaysBare || !editMode)
  const displayTitle = titleOverride?.trim() ? titleOverride : title
  const rootRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const addRowRef = useRef<HTMLDivElement>(null)
  const [layoutSeed, setLayoutSeed] = useState<ElementLayout | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null)
  const [panelAnchor, setPanelAnchor] = useState<{ top: number; left: number } | null>(null)
  const [headerPanelAnchor, setHeaderPanelAnchor] = useState<{ top: number; left: number } | null>(null)
  const [layoutPanelAnchor, setLayoutPanelAnchor] = useState<{ top: number; left: number } | null>(null)
  const [confirmAnchor, setConfirmAnchor] = useState<{ top: number; left: number } | null>(null)
  const menuDrag = useDragOffset()
  const stylePanelDrag = useDragOffset()
  const headerPanelDrag = useDragOffset()
  const layoutPanelDrag = useDragOffset()
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const menuFit = useViewportFit<HTMLDivElement>(editMode ? menuAnchor : null)
  const stylePanelFit = useViewportFit<HTMLDivElement>(editMode ? panelAnchor : null)
  const headerPanelFit = useViewportFit<HTMLDivElement>(editMode ? headerPanelAnchor : null)
  const layoutPanelFit = useViewportFit<HTMLDivElement>(editMode ? layoutPanelAnchor : null)
  const confirmFit = useViewportFit<HTMLDivElement>(editMode ? confirmAnchor : null)

  const elementIds: BlockElementId[] = [
    ...(!decorative ? (['header'] as const) : []),
    'body',
    ...(addRowSlot ? (['addRow'] as const) : []),
  ]
  const custom = !decorative && hasCustomLayoutFor(elementLayout, elementIds)
  const headerHidden = !!elementLayout.header?.hidden
  const geometryRef = useRef<Geometry>({ x, y, width, height })
  geometryRef.current = { x, y, width, height }

  const hasIdentityMenuGroup = !!(onTitleChange || onHeaderStyleChange) || !!extraActions
  const hasStyleMenuGroup =
    !!(onStyleChange && !hideBodyStyleButton) || !!(onElementLayoutChange && elementIds.length > 1)
  const hasLayerMenuGroup = !!(onBringToFront || onSendToBack)

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

  function closeMenu() {
    setMenuAnchor(null)
  }

  function toggleMenu() {
    if (menuAnchor) {
      setMenuAnchor(null)
      return
    }
    menuDrag.reset()
    setMenuAnchor(anchorBelowRect(menuToggleRef.current?.getBoundingClientRect(), MENU_WIDTH))
  }

  function openStylePanel() {
    setMenuAnchor(null)
    stylePanelDrag.reset()
    setPanelAnchor(anchorBelowRect(menuToggleRef.current?.getBoundingClientRect(), PANEL_WIDTH))
  }

  function openHeaderPanel() {
    setMenuAnchor(null)
    headerPanelDrag.reset()
    setHeaderPanelAnchor(anchorBelowRect(menuToggleRef.current?.getBoundingClientRect(), PANEL_WIDTH))
  }

  function measureElementRect(rootRect: DOMRect, el: HTMLElement | null): ElementRect | null {
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (rootRect.width <= 0 || rootRect.height <= 0) return null
    const x = clampPercent(((r.left - rootRect.left) / rootRect.width) * 100, 0, 100)
    const y = clampPercent(((r.top - rootRect.top) / rootRect.height) * 100, 0, 100)
    const width = clampPercent((r.width / rootRect.width) * 100, MIN_ELEMENT_PERCENT, 100 - x)
    const height = clampPercent((r.height / rootRect.height) * 100, MIN_ELEMENT_PERCENT, 100 - y)
    return { x, y, width, height }
  }

  function measureCurrentLayout(): ElementLayout {
    const rootRect = rootRef.current?.getBoundingClientRect()
    const fallback = defaultElementLayout(elementIds)
    if (!rootRect) return fallback

    const measured: ElementLayout = {}
    if (elementIds.includes('header')) {
      measured.header = measureElementRect(rootRect, headerRef.current) ?? fallback.header
    }
    measured.body = measureElementRect(rootRect, bodyRef.current) ?? fallback.body
    if (elementIds.includes('addRow')) {
      measured.addRow = measureElementRect(rootRect, addRowRef.current) ?? fallback.addRow
    }
    return measured
  }

  function openLayoutPanel() {
    setMenuAnchor(null)
    layoutPanelDrag.reset()
    setLayoutSeed(measureCurrentLayout())
    setLayoutPanelAnchor(anchorBelowRect(menuToggleRef.current?.getBoundingClientRect(), PANEL_WIDTH))
  }

  const CONFIRM_WIDTH = 220
  function requestRemove() {
    setMenuAnchor(null)
    setConfirmAnchor(anchorBelowRectRightAligned(menuToggleRef.current?.getBoundingClientRect(), CONFIRM_WIDTH))
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

  const overlayControlsInner = (
    <div className={`block-shell-overlay-controls${decorative ? '' : ' block-shell-overlay-controls-solo'}`}>
      {decorative && (
        <div
          className="block-shell-drag-handle"
          onPointerDown={startDrag}
          role="presentation"
          title="Drag to move"
        >
          ⠿
        </div>
      )}
      {menuToggle}
    </div>
  )

  return (
    <div
      ref={(dom) => {
        rootRef.current = dom
        if (dom && craftRef) craftRef(dom)
      }}
      className={`block-shell${editMode ? ' block-shell-editable' : ''}${bare ? ' block-shell-bare' : ''}`}
      style={
        {
          left: x,
          top: y,
          width,
          height,
          '--block-z': zIndex ?? 0,
          ...resolveBlockStyle(style, bare),
        } as CSSProperties
      }
      data-anim-scope={scopeKeyFor(nodeId, 'root')}
    >
      <ScopedAnimationStyle css={style.animationCss} scopeKey={scopeKeyFor(nodeId, 'root')} />
      <AnimationOverlay
        html={allowCustomScripts ? style.overlayHtml : undefined}
        targetRef={rootRef}
        allowScripts={allowCustomScripts}
      />
      {!decorative && (
        <div
          ref={headerRef}
          className="block-shell-header"
          onPointerDown={startDrag}
          data-anim-scope={scopeKeyFor(nodeId, 'header')}
          style={{
            ...resolveBlockStyle(headerStyle, false),
            ...(custom && elementLayout.header
              ? headerHidden && editMode
                ? { ...resolveElementRect({ ...elementLayout.header, hidden: false }), opacity: 0.35, zIndex: 3 }
                : { ...resolveElementRect(elementLayout.header), zIndex: 3 }
              : undefined),
          }}
        >
          <ScopedAnimationStyle css={headerStyle.animationCss} scopeKey={scopeKeyFor(nodeId, 'header')} />
          <AnimationOverlay
            html={allowCustomScripts ? headerStyle.overlayHtml : undefined}
            targetRef={headerRef}
            allowScripts={allowCustomScripts}
          />
          <span className="block-shell-title">{displayTitle}</span>
        </div>
      )}
      <div
        ref={bodyRef}
        className={`block-shell-body${addRowSlot ? ' block-shell-body-with-addrow' : ''}`}
        style={custom ? { ...resolveElementRect(elementLayout.body), zIndex: 1 } : undefined}
      >
        {children}
      </div>
      {addRowSlot && (
        <div
          ref={addRowRef}
          className="block-shell-addrow"
          style={custom ? { ...resolveElementRect(elementLayout.addRow), zIndex: 2 } : undefined}
        >
          {addRowSlot}
        </div>
      )}
      {editMode &&
        (!hoverToRevealBlocks && controlsLayerNode
          ? createPortal(
              <div
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width,
                  height,
                  pointerEvents: 'none',
                  background: 'transparent',
                }}
              >
                {overlayControlsInner}
                <div className="block-shell-resize" onPointerDown={startResize} />
              </div>,
              controlsLayerNode,
            )
          : (
              <>
                {overlayControlsInner}
                <div className="block-shell-resize" onPointerDown={startResize} />
              </>
            ))}
      {editMode &&
        menuAnchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setMenuAnchor(null)} />
            <div
              ref={menuFit.ref}
              className="block-quick-menu"
              style={{
                top: menuFit.top,
                left: menuAnchor.left,
                width: MENU_WIDTH,
                transform: `translate3d(${menuDrag.offset.dx}px, ${menuDrag.offset.dy}px, 0)`,
              }}
            >
              <div className="block-quick-menu-title" {...menuDrag.dragHandleProps}>
                {displayTitle}
              </div>
              {(onTitleChange || onHeaderStyleChange) && (
                <button type="button" className="block-quick-menu-item" onClick={openHeaderPanel}>
                  Header style
                </button>
              )}
              {extraActions?.(closeMenu, menuToggleRef)}
              {hasIdentityMenuGroup && hasStyleMenuGroup && <div className="block-quick-menu-divider" />}
              {onStyleChange && !hideBodyStyleButton && (
                <button type="button" className="block-quick-menu-item" onClick={openStylePanel}>
                  Body style
                </button>
              )}
              {onElementLayoutChange && elementIds.length > 1 && (
                <button type="button" className="block-quick-menu-item" onClick={openLayoutPanel}>
                  Layout
                </button>
              )}
              {(hasIdentityMenuGroup || hasStyleMenuGroup) && hasLayerMenuGroup && (
                <div className="block-quick-menu-divider" />
              )}
              {onBringToFront && onSendToBack && query && (
                <div className="block-quick-menu-layer-info">
                  {(() => {
                    const { rank, total } = getZIndexRank(query, nodeId)
                    return `Layer ${rank} of ${total}`
                  })()}
                </div>
              )}
              {onBringToFront && (
                <button
                  type="button"
                  className="block-quick-menu-item"
                  onClick={() => {
                    setMenuAnchor(null)
                    onBringToFront()
                  }}
                >
                  Bring forward
                </button>
              )}
              {onSendToBack && (
                <button
                  type="button"
                  className="block-quick-menu-item"
                  onClick={() => {
                    setMenuAnchor(null)
                    onSendToBack()
                  }}
                >
                  Send backward
                </button>
              )}
              {(hasIdentityMenuGroup || hasStyleMenuGroup || hasLayerMenuGroup) && (
                <div className="block-quick-menu-divider" />
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
              ref={stylePanelFit.ref}
              className="block-style-panel-wrap"
              style={{
                top: stylePanelFit.top,
                left: panelAnchor.left,
                transform: `translate3d(${stylePanelDrag.offset.dx}px, ${stylePanelDrag.offset.dy}px, 0)`,
              }}
            >
              <BlockStylePanel
                title="Body"
                style={style}
                onChange={onStyleChange}
                onClose={() => setPanelAnchor(null)}
                showCustomCss={!hideCustomCodeButton}
                dragHandleProps={stylePanelDrag.dragHandleProps}
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
              ref={headerPanelFit.ref}
              className="block-style-panel-wrap"
              style={{
                top: headerPanelFit.top,
                left: headerPanelAnchor.left,
                transform: `translate3d(${headerPanelDrag.offset.dx}px, ${headerPanelDrag.offset.dy}px, 0)`,
              }}
            >
              <BlockStylePanel
                title="Header"
                style={headerStyle}
                onChange={(next) => onHeaderStyleChange?.(next)}
                onClose={() => setHeaderPanelAnchor(null)}
                dragHandleProps={headerPanelDrag.dragHandleProps}
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
        layoutPanelAnchor &&
        onElementLayoutChange &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setLayoutPanelAnchor(null)} />
            <div
              ref={layoutPanelFit.ref}
              className="block-style-panel-wrap"
              style={{
                top: layoutPanelFit.top,
                left: layoutPanelAnchor.left,
                transform: `translate3d(${layoutPanelDrag.offset.dx}px, ${layoutPanelDrag.offset.dy}px, 0)`,
              }}
            >
              <BlockLayoutEditor
                elements={elementIds.map((id) => ({ id, label: id === 'body' && bodyLabel ? bodyLabel : ELEMENT_LABELS[id] }))}
                layout={elementLayout}
                seedLayout={layoutSeed ?? defaultElementLayout(elementIds)}
                onChange={onElementLayoutChange}
                onReset={() => {
                  onElementLayoutChange({})
                  setLayoutPanelAnchor(null)
                }}
                onClose={() => setLayoutPanelAnchor(null)}
                blockWidth={width}
                blockHeight={height}
                dragHandleProps={layoutPanelDrag.dragHandleProps}
              />
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
              ref={confirmFit.ref}
              className="confirm-popover"
              style={{ top: confirmFit.top, left: confirmAnchor.left, width: CONFIRM_WIDTH }}
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
