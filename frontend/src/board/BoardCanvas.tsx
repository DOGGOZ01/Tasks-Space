import { Editor, Element, Frame, useEditor } from '@craftjs/core'
import type { SerializedNodes } from '@craftjs/core'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch } from '../lib/api'
import { BlockStylePanel } from './BlockStylePanel'
import { BoardBackgroundLayer } from './BoardBackgroundLayer'
import { BoardBackgroundPanel } from './BoardBackgroundPanel'
import type { BoardBackground } from './boardBackground'
import { DEFAULT_BOARD_BACKGROUND, resolveBoardBackground } from './boardBackground'
import {
  BoardDesignImportError,
  buildBoardDesignExport,
  downloadBoardDesignExport,
  parseBoardDesignImport,
} from './boardExport'
import type { BoardDesignExport } from './boardExport'
import { BoardUiProvider, useBoardUi } from './BoardUiContext'
import { resolveBlockStyle } from './blockStyle'
import { Container } from './Container'
import type { DeviceMode } from './geometry'
import { GRID_SIZE } from './geometry'
import { DEFAULT_HEADER_STYLE, HEADER_STYLE_TARGETS } from './headerStyle'
import type { HeaderStyle, HeaderStyleTarget } from './headerStyle'
import { resolver } from './resolver'
import { applySavedDesign, createSavedDesign, deleteSavedDesign, listSavedDesigns } from './savedDesigns'
import type { SavedDesignSummary } from './savedDesigns'
import { TaskBoardProvider } from './TaskBoardContext'
import { Toolbox } from './Toolbox'
import { useIsMobileDevice } from './useIsMobileDevice'

interface PageResponse {
  layout: SerializedNodes
  mobile_layout: SerializedNodes
  background: BoardBackground
  header_style: HeaderStyle
  updated_at: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type LayoutsByDevice = Record<DeviceMode, SerializedNodes>

const SAVE_DEBOUNCE_MS = 800
const LAYOUT_FIELD: Record<DeviceMode, string> = {
  desktop: 'layout',
  mobile: 'mobile_layout',
}

const BLANK_LAYOUT: SerializedNodes = {
  ROOT: {
    type: { resolvedName: 'Container' },
    isCanvas: true,
    props: {},
    displayName: 'Container',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: null,
  },
}

function BoardLoader({ layout, onLoaded }: { layout: SerializedNodes; onLoaded: () => void }) {
  const { actions } = useEditor()

  useEffect(() => {
    if (Object.keys(layout).length > 0) {
      actions.deserialize(layout)
    }
    onLoaded()
  }, [])

  return null
}

function useAnchoredPanel(panelWidth: number) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

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
    const left = Math.min(rect.left, window.innerWidth - panelWidth - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setAnchor({ top, left: Math.max(12, left) })
  }

  return { anchor, toggleRef, toggle, close: () => setAnchor(null) }
}

const PANEL_WIDTH = 300

function EditModeToggle() {
  const { editMode, toggleEditMode, headerStyle } = useBoardUi()
  return (
    <button
      type="button"
      className="board-edit-toggle"
      aria-pressed={editMode}
      onClick={toggleEditMode}
      title={editMode ? 'Switch to view mode' : 'Switch to edit mode'}
      style={resolveBlockStyle(headerStyle.edit ?? {}, false)}
    >
      {editMode ? 'Editing' : 'Edit'}
    </button>
  )
}

function UsernameLabel({ username }: { username?: string }) {
  const { headerStyle } = useBoardUi()
  return (
    <span className="board-username" style={resolveBlockStyle(headerStyle.username ?? {}, false)}>
      {username}
    </span>
  )
}

function LogoutButton({ onLogout }: { onLogout: () => void }) {
  const { headerStyle } = useBoardUi()
  return (
    <button
      type="button"
      className="board-logout"
      onClick={onLogout}
      style={resolveBlockStyle(headerStyle.logout ?? {}, false)}
    >
      Log out
    </button>
  )
}

function HeaderStyleToggle() {
  const { headerStyle, setHeaderStyle } = useBoardUi()
  const { anchor, toggleRef, toggle, close } = useAnchoredPanel(PANEL_WIDTH)
  const [target, setTarget] = useState<HeaderStyleTarget>('edit')

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="board-bg-toggle"
        onClick={toggle}
        aria-pressed={anchor != null}
        title="Style the top bar"
      >
        Style
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={close} />
            <div
              className="block-style-panel-wrap header-style-panel-wrap"
              style={{ top: anchor.top, left: anchor.left }}
            >
              <div className="board-bg-type-tabs" role="tablist">
                {HEADER_STYLE_TARGETS.map((t) => (
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
              <BlockStylePanel
                title={`${HEADER_STYLE_TARGETS.find((t) => t.key === target)?.label} style`}
                style={headerStyle[target] ?? {}}
                onChange={(next) => setHeaderStyle({ ...headerStyle, [target]: next })}
                onClose={close}
              />
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

const TRANSFER_POPOVER_WIDTH = 260

function ExportDesignButton() {
  const { query } = useEditor()
  const { device, background, headerStyle } = useBoardUi()

  function handleExport() {
    const layout = JSON.parse(query.serialize()) as SerializedNodes
    downloadBoardDesignExport(buildBoardDesignExport(device, layout, background, headerStyle))
  }

  return (
    <button
      type="button"
      className="board-bg-toggle"
      onClick={handleExport}
      title="Download this board's design (layout, background, button styling) as a JSON file"
    >
      Export
    </button>
  )
}

function ImportDesignButton() {
  const { actions } = useEditor()
  const { setBackground, setHeaderStyle } = useBoardUi()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState<BoardDesignExport | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  function openPopover() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) {
      setAnchor({ top: 80, left: 80 })
      return
    }
    const left = Math.min(rect.left, window.innerWidth - TRANSFER_POPOVER_WIDTH - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setAnchor({ top, left: Math.max(12, left) })
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        setPending(parseBoardDesignImport(String(reader.result)))
        setPendingName(file.name.replace(/\.json$/i, '').trim() || 'Imported design')
        setError(null)
      } catch (err) {
        setPending(null)
        setError(err instanceof BoardDesignImportError ? err.message : 'Could not read that file.')
      }
      openPopover()
    }
    reader.onerror = () => {
      setPending(null)
      setError('Could not read that file.')
      openPopover()
    }
    reader.readAsText(file)
  }

  function close() {
    setAnchor(null)
    setPending(null)
    setError(null)
  }

  function confirmImport() {
    if (!pending) return
    actions.deserialize(pending.layout)
    setBackground(pending.background)
    setHeaderStyle(pending.headerStyle)
    createSavedDesign(pendingName, pending).catch(() => {})
    close()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="board-bg-toggle"
        onClick={() => fileInputRef.current?.click()}
        title="Import a design from a JSON file"
      >
        Import
      </button>
      <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChange} hidden />
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={close} />
            <div
              className="confirm-popover"
              style={{ top: anchor.top, left: anchor.left, width: TRANSFER_POPOVER_WIDTH }}
            >
              {error ? (
                <>
                  <p>Couldn't import that file.</p>
                  <p className="confirm-popover-hint">{error}</p>
                  <div className="confirm-popover-actions">
                    <button type="button" onClick={close}>
                      OK
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>Replace this board's design?</p>
                  <p className="confirm-popover-hint">
                    Overwrites the current layout, background, and button styling. Images aren't
                    included in a design import -- image blocks come back empty, ready to
                    re-upload.
                  </p>
                  <div className="confirm-popover-actions">
                    <button type="button" onClick={close}>
                      Cancel
                    </button>
                    <button type="button" className="confirm-popover-danger" onClick={confirmImport}>
                      Import
                    </button>
                  </div>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

type DesignsScreen =
  | { kind: 'list' }
  | { kind: 'save' }
  | { kind: 'confirm-use'; item: SavedDesignSummary }
  | { kind: 'confirm-delete'; item: SavedDesignSummary }
  | { kind: 'confirm-revert' }

function DesignsButton() {
  const { actions, query } = useEditor()
  const { device, background, headerStyle, setBackground, setHeaderStyle, revertToOriginalDesign } =
    useBoardUi()
  const { anchor, toggleRef, toggle, close } = useAnchoredPanel(TRANSFER_POPOVER_WIDTH)
  const [designs, setDesigns] = useState<SavedDesignSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [screen, setScreen] = useState<DesignsScreen>({ kind: 'list' })
  const [saveName, setSaveName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current)
    }
  }, [])

  function showFlash(message: string) {
    setFlash(message)
    if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = window.setTimeout(() => setFlash(null), 2200)
  }

  function open() {
    setScreen({ kind: 'list' })
    if (!anchor) {
      setDesigns(null)
      setLoadError(null)
      listSavedDesigns()
        .then(setDesigns)
        .catch(() => setLoadError('Could not load saved designs.'))
    }
    toggle()
  }

  function openSaveScreen() {
    setSaveName('')
    setSaveError(null)
    setScreen({ kind: 'save' })
  }

  function handleSave() {
    const trimmed = saveName.trim()
    if (!trimmed) {
      setSaveError("Name can't be empty.")
      return
    }
    const layout = JSON.parse(query.serialize()) as SerializedNodes
    const design = buildBoardDesignExport(device, layout, background, headerStyle, { stripImages: false })
    setSaving(true)
    setSaveError(null)
    createSavedDesign(trimmed, design)
      .then((created) => {
        setDesigns((prev) => (prev ? [created, ...prev] : [created]))
        setScreen({ kind: 'list' })
        showFlash(`Design saved: "${created.name}"`)
      })
      .catch(() => setSaveError('Could not save that design. Try again?'))
      .finally(() => setSaving(false))
  }

  function applyDesign(item: SavedDesignSummary) {
    setApplying(true)
    setApplyError(null)
    applySavedDesign(item.id)
      .then((design) => {
        actions.deserialize(design.layout)
        setBackground(design.background)
        setHeaderStyle(design.headerStyle)
        close()
      })
      .catch(() => setApplyError('Could not apply that design. Try again?'))
      .finally(() => setApplying(false))
  }

  function removeDesign(item: SavedDesignSummary) {
    deleteSavedDesign(item.id)
      .then(() => setDesigns((prev) => prev?.filter((d) => d.id !== item.id) ?? prev))
      .catch(() => setLoadError('Could not delete that design.'))
    setScreen({ kind: 'list' })
  }

  function confirmRevert() {
    actions.deserialize(BLANK_LAYOUT)
    revertToOriginalDesign()
    setScreen({ kind: 'list' })
    showFlash('Reverted to the original design')
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="board-bg-toggle"
        onClick={open}
        aria-pressed={anchor != null}
        title="Save, use, or delete board designs"
      >
        Designs
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={close} />
            <div
              className="confirm-popover saved-designs-popover"
              style={{ top: anchor.top, left: anchor.left, width: TRANSFER_POPOVER_WIDTH }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {screen.kind === 'save' && (
                <>
                  <p>Save current design</p>
                  <input
                    type="text"
                    className="confirm-popover-input"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Design name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave()
                    }}
                  />
                  {saveError && <p className="confirm-popover-hint">{saveError}</p>}
                  <div className="confirm-popover-actions">
                    <button type="button" onClick={() => setScreen({ kind: 'list' })}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="confirm-popover-primary"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </>
              )}

              {screen.kind === 'confirm-use' && (
                <>
                  <p>Replace this board's design with "{screen.item.name}"?</p>
                  <p className="confirm-popover-hint">
                    Overwrites the current layout, background, and button styling.
                  </p>
                  {applyError && <p className="confirm-popover-hint">{applyError}</p>}
                  <div className="confirm-popover-actions">
                    <button
                      type="button"
                      onClick={() => setScreen({ kind: 'list' })}
                      disabled={applying}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="confirm-popover-danger"
                      onClick={() => applyDesign(screen.item)}
                      disabled={applying}
                    >
                      {applying ? 'Applying...' : 'Use'}
                    </button>
                  </div>
                </>
              )}

              {screen.kind === 'confirm-delete' && (
                <>
                  <p>Delete saved design "{screen.item.name}"?</p>
                  <p className="confirm-popover-hint">This can't be undone.</p>
                  <div className="confirm-popover-actions">
                    <button type="button" onClick={() => setScreen({ kind: 'list' })}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="confirm-popover-danger"
                      onClick={() => removeDesign(screen.item)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}

              {screen.kind === 'confirm-revert' && (
                <>
                  <p>Revert to the original site design?</p>
                  <p className="confirm-popover-hint">
                    Wipes your layout, background, and top bar styling on both desktop and mobile
                    back to the blank starting design. This can't be undone, and it isn't saved as
                    a design you can bring back later -- save your current design first if you
                    might want it again.
                  </p>
                  <div className="confirm-popover-actions">
                    <button type="button" onClick={() => setScreen({ kind: 'list' })}>
                      Cancel
                    </button>
                    <button type="button" className="confirm-popover-danger" onClick={confirmRevert}>
                      Revert
                    </button>
                  </div>
                </>
              )}

              {screen.kind === 'list' && (
                <>
                  <p>Designs</p>
                  {flash && <p className="confirm-popover-flash">{flash}</p>}
                  <button type="button" className="design-menu-item" onClick={openSaveScreen}>
                    Save current design...
                  </button>
                  {designs === null && !loadError && <p className="confirm-popover-hint">Loading...</p>}
                  {loadError && <p className="confirm-popover-hint">{loadError}</p>}
                  {designs && designs.length === 0 && (
                    <p className="confirm-popover-hint">No saved designs yet.</p>
                  )}
                  {designs && designs.length > 0 && (
                    <ul className="saved-designs-list">
                      {designs.map((item) => (
                        <li key={item.id}>
                          <span className="saved-designs-item-name" title={item.name}>
                            {item.name}
                          </span>
                          <div className="saved-designs-item-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setApplyError(null)
                                setScreen({ kind: 'confirm-use', item })
                              }}
                            >
                              Use
                            </button>
                            <button
                              type="button"
                              className="saved-designs-item-delete"
                              aria-label={`Delete "${item.name}"`}
                              onClick={() => setScreen({ kind: 'confirm-delete', item })}
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="design-menu-item design-menu-item-danger"
                    onClick={() => setScreen({ kind: 'confirm-revert' })}
                  >
                    Revert to original design...
                  </button>
                  <div className="confirm-popover-actions">
                    <button type="button" onClick={close}>
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

function DeviceToggle() {
  const { device, setDevice, canEditDesktop } = useBoardUi()
  return (
    <div className="board-device-toggle" role="group" aria-label="Board to edit">
      <button
        type="button"
        aria-pressed={device === 'desktop'}
        disabled={!canEditDesktop}
        title={canEditDesktop ? 'Edit the desktop board' : "Can't edit the desktop board from a phone"}
        onClick={() => setDevice('desktop')}
      >
        Desktop
      </button>
      <button
        type="button"
        aria-pressed={device === 'mobile'}
        title="Edit the mobile board"
        onClick={() => setDevice('mobile')}
      >
        Mobile
      </button>
    </div>
  )
}

function BackgroundToggle() {
  const { background, setBackground } = useBoardUi()
  const { anchor, toggleRef, toggle, close } = useAnchoredPanel(PANEL_WIDTH)

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="board-bg-toggle"
        onClick={toggle}
        aria-pressed={anchor != null}
        title="Board background"
      >
        Background
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={close} />
            <div className="block-style-panel-wrap" style={{ top: anchor.top, left: anchor.left }}>
              <BoardBackgroundPanel background={background} onChange={setBackground} onClose={close} />
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

type DesignMenuStep = 'menu' | 'background' | 'buttons'

function MobileDesignMenu() {
  const { background, setBackground, headerStyle, setHeaderStyle } = useBoardUi()
  const { anchor, toggleRef, toggle, close } = useAnchoredPanel(PANEL_WIDTH)
  const [step, setStep] = useState<DesignMenuStep>('menu')
  const [target, setTarget] = useState<HeaderStyleTarget>('edit')

  function closeAll() {
    close()
    setStep('menu')
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="board-bg-toggle"
        onClick={anchor ? closeAll : toggle}
        aria-pressed={anchor != null}
        title="Background and button styling"
      >
        Design
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={closeAll} />
            <div
              className="block-style-panel-wrap header-style-panel-wrap"
              style={{ top: anchor.top, left: anchor.left }}
            >
              {step === 'menu' && (
                <div className="block-style-panel">
                  <div className="block-style-panel-header">
                    <span>Design</span>
                    <button type="button" onClick={closeAll} aria-label="Close">
                      ×
                    </button>
                  </div>
                  <button
                    type="button"
                    className="design-menu-item"
                    onClick={() => setStep('background')}
                  >
                    Board background
                  </button>
                  <button type="button" className="design-menu-item" onClick={() => setStep('buttons')}>
                    Top bar buttons
                  </button>
                </div>
              )}
              {step === 'background' && (
                <BoardBackgroundPanel background={background} onChange={setBackground} onClose={closeAll} />
              )}
              {step === 'buttons' && (
                <>
                  <div className="board-bg-type-tabs" role="tablist">
                    {HEADER_STYLE_TARGETS.map((t) => (
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
                  <BlockStylePanel
                    title={`${HEADER_STYLE_TARGETS.find((t) => t.key === target)?.label} style`}
                    style={headerStyle[target] ?? {}}
                    onChange={(next) => setHeaderStyle({ ...headerStyle, [target]: next })}
                    onClose={closeAll}
                  />
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

function BoardStage({ children }: { children: ReactNode }) {
  const { device, editMode, scale, setScale, canvasWidth, canvasHeight, background } = useBoardUi()
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    function recompute() {
      const rect = wrapper!.getBoundingClientRect()
      if (rect.width <= 0) return
      if (device === 'mobile') {
        setScale(Math.min(1, rect.width / canvasWidth))
      } else {
        if (rect.height <= 0) return
        setScale(Math.min(rect.width / canvasWidth, rect.height / canvasHeight))
      }
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [device, canvasWidth, canvasHeight, setScale])

  const gridSize = GRID_SIZE * scale
  return (
    <div
      className={`board-stage board-stage-${device}`}
      ref={wrapperRef}
      style={resolveBoardBackground(background)}
    >
      {background.type === 'html' && <BoardBackgroundLayer background={background} />}
      <div
        className="board-canvas-scaler"
        style={{
          width: canvasWidth * scale,
          height: canvasHeight * scale,
        }}
      >
        {editMode && (
          <div
            className="board-canvas-grid-overlay"
            style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}
          />
        )}
        <div
          className="board-canvas-inner"
          style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function BoardChrome({
  layout,
  onLoaded,
  username,
  onLogout,
}: {
  layout: SerializedNodes
  onLoaded: () => void
  username?: string
  onLogout: () => void
}) {
  const { editMode, canEditDesktop } = useBoardUi()
  const isRealMobile = !canEditDesktop
  return (
    <>
      <div className={`board-topbar${editMode ? '' : ' board-topbar-floating'}`}>
        <UsernameLabel username={username} />
        <div className="board-topbar-group">
          {editMode && <ExportDesignButton />}
          {editMode && <ImportDesignButton />}
          {editMode && <DesignsButton />}
          {editMode && !isRealMobile && <DeviceToggle />}
          {editMode && isRealMobile && <MobileDesignMenu />}
          {editMode && !isRealMobile && <BackgroundToggle />}
          {editMode && !isRealMobile && <HeaderStyleToggle />}
          <EditModeToggle />
          <LogoutButton onLogout={onLogout} />
        </div>
      </div>
      <div className="board-layout">
        {editMode && <Toolbox />}
        <BoardStage>
          <Frame>
            <Element is={Container} canvas />
          </Frame>
        </BoardStage>
      </div>
      <BoardLoader layout={layout} onLoaded={onLoaded} />
    </>
  )
}

function BoardEditor({
  layout,
  onLoaded,
  onNodesChange,
  username,
  onLogout,
}: {
  layout: SerializedNodes
  onLoaded: () => void
  onNodesChange: (query: { serialize: () => string }) => void
  username?: string
  onLogout: () => void
}) {
  const { editMode, device } = useBoardUi()
  return (
    <Editor key={device} resolver={resolver} enabled={editMode} onNodesChange={onNodesChange}>
      <BoardChrome layout={layout} onLoaded={onLoaded} username={username} onLogout={onLogout} />
    </Editor>
  )
}

export function BoardCanvas({ username, onLogout }: { username?: string; onLogout: () => void }) {
  const isMobileDevice = useIsMobileDevice()
  const [layouts, setLayouts] = useState<LayoutsByDevice | null>(null)
  const [background, setBackgroundState] = useState<BoardBackground>(DEFAULT_BOARD_BACKGROUND)
  const [headerStyle, setHeaderStyleState] = useState<HeaderStyle>(DEFAULT_HEADER_STYLE)
  const [editMode, setEditMode] = useState(false)
  const [editDevice, setEditDeviceState] = useState<DeviceMode>(() =>
    isMobileDevice ? 'mobile' : 'desktop',
  )
  const [status, setStatus] = useState<SaveStatus>('idle')
  const readyRef = useRef(false)
  const fieldSaveTimeoutsRef = useRef<Record<string, number | null>>({})

  useEffect(() => {
    if (isMobileDevice) setEditDeviceState('mobile')
  }, [isMobileDevice])

  function setEditDevice(next: DeviceMode) {
    if (next === 'desktop' && isMobileDevice) return
    setEditDeviceState(next)
  }

  const device: DeviceMode = editMode ? editDevice : isMobileDevice ? 'mobile' : 'desktop'

  useEffect(() => {
    let cancelled = false
    apiFetch<PageResponse>('/api/page/')
      .then((page) => {
        if (!cancelled) {
          setLayouts({ desktop: page.layout, mobile: page.mobile_layout })
          if (page.background && Object.keys(page.background).length > 0) {
            setBackgroundState(page.background)
          }
          if (page.header_style && Object.keys(page.header_style).length > 0) {
            setHeaderStyleState(page.header_style)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLayouts({ desktop: {}, mobile: {} })
      })
    return () => {
      cancelled = true
    }
  }, [])

  function scheduleFieldSave(field: string, value: unknown) {
    const existing = fieldSaveTimeoutsRef.current[field]
    if (existing) window.clearTimeout(existing)
    fieldSaveTimeoutsRef.current[field] = window.setTimeout(() => {
      setStatus('saving')
      apiFetch('/api/page/', {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      })
        .then(() => setStatus('saved'))
        .catch(() => setStatus('error'))
    }, SAVE_DEBOUNCE_MS)
  }

  function setBackground(next: BoardBackground) {
    setBackgroundState(next)
    scheduleFieldSave('background', next)
  }

  function setHeaderStyle(next: HeaderStyle) {
    setHeaderStyleState(next)
    scheduleFieldSave('header_style', next)
  }

  function revertToOriginalDesign() {
    Object.values(fieldSaveTimeoutsRef.current).forEach((timeoutId) => {
      if (timeoutId) window.clearTimeout(timeoutId)
    })
    fieldSaveTimeoutsRef.current = {}

    setLayouts({ desktop: {}, mobile: {} })
    setBackgroundState(DEFAULT_BOARD_BACKGROUND)
    setHeaderStyleState(DEFAULT_HEADER_STYLE)

    setStatus('saving')
    apiFetch('/api/page/', {
      method: 'PATCH',
      body: JSON.stringify({
        layout: {},
        mobile_layout: {},
        background: DEFAULT_BOARD_BACKGROUND,
        header_style: DEFAULT_HEADER_STYLE,
      }),
    })
      .then(() => setStatus('saved'))
      .catch(() => setStatus('error'))
  }

  function handleNodesChange(forDevice: DeviceMode, query: { serialize: () => string }) {
    if (!readyRef.current) return
    const parsedLayout = JSON.parse(query.serialize()) as SerializedNodes
    setLayouts((prev) => (prev ? { ...prev, [forDevice]: parsedLayout } : prev))
    scheduleFieldSave(LAYOUT_FIELD[forDevice], parsedLayout)
  }

  if (layouts === null) {
    return <div className="page-loading">Loading board...</div>
  }

  return (
    <TaskBoardProvider>
      <BoardUiProvider
        editMode={editMode}
        toggleEditMode={() => setEditMode((v) => !v)}
        device={device}
        onDeviceChange={setEditDevice}
        canEditDesktop={!isMobileDevice}
        background={background}
        onBackgroundChange={setBackground}
        headerStyle={headerStyle}
        onHeaderStyleChange={setHeaderStyle}
        onRevertToOriginalDesign={revertToOriginalDesign}
      >
        <BoardEditor
          layout={layouts[device]}
          onNodesChange={(query) => handleNodesChange(device, query)}
          onLoaded={() => {
            readyRef.current = true
          }}
          username={username}
          onLogout={onLogout}
        />
      </BoardUiProvider>
      <div className="board-status">
        {status === 'saving' && 'Saving...'}
        {status === 'saved' && 'Saved'}
        {status === 'error' && 'Save failed'}
      </div>
    </TaskBoardProvider>
  )
}
