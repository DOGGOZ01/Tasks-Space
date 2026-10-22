import { Editor, Element, Frame, useEditor } from '@craftjs/core'
import type { SerializedNodes } from '@craftjs/core'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch } from '../lib/api'
import { AiAssistantButton } from './ai/AiAssistantPanel'
import { getRememberAcrossReload, setRememberAcrossReload } from './ai/keyStore'
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
import { DEFAULT_DATE_FORMAT } from './dateFormat'
import type { DateFormatPref } from './dateFormat'
import type { DeviceMode } from './geometry'
import { GRID_SIZE } from './geometry'
import { DEFAULT_HEADER_STYLE, HEADER_STYLE_TARGETS } from './headerStyle'
import type { HeaderStyle, HeaderStyleTarget } from './headerStyle'
import { resolver } from './resolver'
import { applySavedDesign, createSavedDesign, deleteSavedDesign, listSavedDesigns } from './savedDesigns'
import type { SavedDesignSummary } from './savedDesigns'
import { TaskBoardProvider, useTaskBoard } from './TaskBoardContext'
import { Toolbox } from './Toolbox'
import { useDragOffset } from './useDragOffset'
import { useGoogleFonts } from './useGoogleFonts'
import { useIsMobileDevice } from './useIsMobileDevice'

interface PageResponse {
  layout: SerializedNodes
  mobile_layout: SerializedNodes
  background: BoardBackground
  header_style: HeaderStyle
  date_format: DateFormatPref
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
    actions.history.clear()
    onLoaded()
  }, [])

  return null
}

export function useAnchoredPanel(panelWidth: number) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
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
    const left = Math.min(rect.left, window.innerWidth - panelWidth - 12)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 12)
    setAnchor({ top, left: Math.max(12, left) })
  }

  return { anchor, offset, toggleRef, toggle, dragHandleProps, close: () => setAnchor(null) }
}

const PANEL_WIDTH = 300

function UndoRedoControls() {
  const { actions, canUndo, canRedo } = useEditor((_state, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }))

  return (
    <div className="board-undo-redo" role="group" aria-label="Undo or redo">
      <button
        type="button"
        className="board-bg-toggle"
        onClick={() => actions.history.undo()}
        disabled={!canUndo}
        title="Undo"
      >
        Undo
      </button>
      <button
        type="button"
        className="board-bg-toggle"
        onClick={() => actions.history.redo()}
        disabled={!canRedo}
        title="Redo"
      >
        Redo
      </button>
    </div>
  )
}

function HoverRevealToggle() {
  const { hoverToRevealBlocks, setHoverToRevealBlocks } = useBoardUi()
  return (
    <label className="board-hover-reveal-toggle" title="Off: edit controls of every block stay on top. On: a block comes to the front only on hover, so overlapping blocks keep their order.">
      <input
        type="checkbox"
        checked={hoverToRevealBlocks}
        onChange={(e) => setHoverToRevealBlocks(e.target.checked)}
      />
      Reveal on hover
    </label>
  )
}

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
  const { anchor, offset, toggleRef, toggle, dragHandleProps, close } = useAnchoredPanel(PANEL_WIDTH)
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
              style={{ top: anchor.top, left: anchor.left, transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
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
                dragHandleProps={dragHandleProps}
              />
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

function SettingsButton() {
  const { dateFormat, setDateFormat } = useBoardUi()
  const { anchor, offset, toggleRef, toggle, dragHandleProps, close } = useAnchoredPanel(PANEL_WIDTH)
  const [rememberAiKey, setRememberAiKeyState] = useState(() => getRememberAcrossReload())

  function handleRememberAiKeyChange(next: boolean) {
    setRememberAcrossReload(next)
    setRememberAiKeyState(next)
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="board-bg-toggle"
        onClick={toggle}
        aria-pressed={anchor != null}
        title="Board settings"
      >
        Settings
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={close} />
            <div
              className="block-style-panel-wrap header-style-panel-wrap"
              style={{ top: anchor.top, left: anchor.left, transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
            >
              <div className="block-style-panel" onPointerDown={(e) => e.stopPropagation()}>
                <div className="block-style-panel-header" {...dragHandleProps}>
                  <span>Settings</span>
                  <button
                    type="button"
                    onClick={close}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Close settings panel"
                  >
                    ×
                  </button>
                </div>
                <label className="block-style-row">
                  <span className="block-style-label">Date format</span>
                </label>
                <div className="board-bg-type-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dateFormat === 'MDY'}
                    onClick={() => setDateFormat('MDY')}
                  >
                    US (MM/DD/YYYY)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dateFormat === 'DMY'}
                    onClick={() => setDateFormat('DMY')}
                  >
                    EU (DD/MM/YYYY)
                  </button>
                </div>
                <label className="block-style-row settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={rememberAiKey}
                    onChange={(e) => handleRememberAiKeyChange(e.target.checked)}
                  />
                  <span className="block-style-label">Keep AI assistant unlocked across page reloads</span>
                </label>
                {rememberAiKey && (
                  <p className="settings-warning">
                    Less secure: the passphrase is not asked again until you close this tab.
                  </p>
                )}
              </div>
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
  const { device, applyDesignNow } = useBoardUi()
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
    const layoutForDevice = pending.layouts?.[device] ?? pending.layout
    actions.deserialize(layoutForDevice)
    applyDesignNow(layoutForDevice, pending.background, pending.headerStyle, pending.layouts)
    createSavedDesign(pendingName, { ...pending, device, layout: layoutForDevice }).catch(() => {})
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
                    Overwrites the current layout, background, and button styling. Imported designs
                    don't include images, so image blocks will be empty.
                  </p>
                  {pending?.layouts?.desktop && pending.layouts.mobile && (
                    <p className="confirm-popover-hint">This design has layouts for both desktop and phone.</p>
                  )}
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
  const { device, background, headerStyle, applyDesignNow, revertToOriginalDesign } = useBoardUi()
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
      .catch(() => setSaveError('Could not save that design. Try again.'))
      .finally(() => setSaving(false))
  }

  function applyDesign(item: SavedDesignSummary) {
    setApplying(true)
    setApplyError(null)
    applySavedDesign(item.id)
      .then((design) => {
        const layoutForDevice = design.layouts?.[device] ?? design.layout
        actions.deserialize(layoutForDevice)
        applyDesignNow(layoutForDevice, design.background, design.headerStyle, design.layouts)
        close()
      })
      .catch(() => setApplyError('Could not apply that design. Try again.'))
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
                    Resets the layout, background, and top bar on desktop and mobile to the blank
                    starting design. This can't be undone. Save your current design first if you
                    may want it back.
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
                    Save current design
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
                    Revert to original design
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
  const { anchor, offset, toggleRef, toggle, dragHandleProps, close } = useAnchoredPanel(PANEL_WIDTH)

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
            <div
              className="block-style-panel-wrap"
              style={{ top: anchor.top, left: anchor.left, transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
            >
              <BoardBackgroundPanel
                background={background}
                onChange={setBackground}
                onClose={close}
                dragHandleProps={dragHandleProps}
              />
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
  const { anchor, offset, toggleRef, toggle, dragHandleProps, close } = useAnchoredPanel(PANEL_WIDTH)
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
              style={{ top: anchor.top, left: anchor.left, transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
            >
              {step === 'menu' && (
                <div className="block-style-panel">
                  <div className="block-style-panel-header" {...dragHandleProps}>
                    <span>Design</span>
                    <button
                      type="button"
                      onClick={closeAll}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label="Close"
                    >
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
                <BoardBackgroundPanel
                  background={background}
                  onChange={setBackground}
                  onClose={closeAll}
                  dragHandleProps={dragHandleProps}
                />
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
                    dragHandleProps={dragHandleProps}
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

function buildGridLineGradient(direction: 'to right' | 'to bottom', canvasSize: number, scale: number, dpr: number): string {
  const lineWidth = Math.max(1, Math.round(dpr)) / dpr
  const count = Math.floor(canvasSize / GRID_SIZE)
  const stops: string[] = []
  let lastEnd = -Infinity
  for (let i = 0; i <= count; i++) {
    const pos = Math.round(i * GRID_SIZE * scale * dpr) / dpr
    if (pos < lastEnd) continue
    stops.push(`transparent ${pos}px`, `#fff ${pos}px`, `#fff ${pos + lineWidth}px`, `transparent ${pos + lineWidth}px`)
    lastEnd = pos + lineWidth
  }
  return `linear-gradient(${direction}, ${stops.join(', ')})`
}

function BoardStage({ children }: { children: ReactNode }) {
  const {
    device,
    editMode,
    scale,
    setScale,
    canvasWidth,
    canvasHeight,
    background,
    hoverToRevealBlocks,
    setControlsLayerNode,
  } = useBoardUi()
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

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const phone = device === 'mobile' && !editMode
  return (
    <div
      className={`board-stage board-stage-${device}${phone ? ' board-stage-phone' : ''}`}
      ref={wrapperRef}
      style={{
        ...resolveBoardBackground(background),
        ...(background.type === 'html' && phone ? { background: 'transparent' } : {}),
      }}
    >
      {background.type === 'html' && device === 'desktop' && <BoardBackgroundLayer background={background} />}
      {background.type === 'html' && phone && (
        <BoardBackgroundLayer background={background} style={{ position: 'fixed' }} />
      )}
      <div
        className="board-canvas-scaler"
        style={{
          width: canvasWidth * scale,
          height: canvasHeight * scale,
        }}
      >
        {background.type === 'html' && device === 'mobile' && !phone && <BoardBackgroundLayer background={background} />}
        {editMode && (
          <div
            className="board-canvas-grid-overlay"
            style={{
              backgroundImage: [
                buildGridLineGradient('to right', canvasWidth, scale, dpr),
                buildGridLineGradient('to bottom', canvasHeight, scale, dpr),
              ].join(', '),
              backgroundRepeat: 'no-repeat',
            }}
          />
        )}
        <div
          className={`board-canvas-inner${hoverToRevealBlocks ? ' board-hover-reveal' : ''}`}
          style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${scale})` }}
        >
          {children}
          {editMode && !hoverToRevealBlocks && (
            <div className="board-controls-layer" ref={setControlsLayerNode} />
          )}
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
          {editMode && <AiAssistantButton />}
          {editMode && <UndoRedoControls />}
          {editMode && !isRealMobile && <DeviceToggle />}
          {editMode && isRealMobile && <MobileDesignMenu />}
          {editMode && !isRealMobile && <BackgroundToggle />}
          {editMode && !isRealMobile && <HeaderStyleToggle />}
          {editMode && <SettingsButton />}
          {editMode && <HoverRevealToggle />}
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

const INITIAL_IMAGE_LOAD_TIMEOUT_MS = 5000

function useBoardImagesLoaded(active: boolean): boolean {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!active || loaded) return
    let cancelled = false

    function finish() {
      if (!cancelled) setLoaded(true)
    }

    const timeoutId = window.setTimeout(finish, INITIAL_IMAGE_LOAD_TIMEOUT_MS)

    function check() {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.board-canvas-inner img'))
      const pending = imgs.filter((img) => !img.complete)
      if (pending.length === 0) {
        finish()
        return
      }
      let remaining = pending.length
      const settle = () => {
        remaining -= 1
        if (remaining === 0) finish()
      }
      pending.forEach((img) => {
        img.addEventListener('load', settle, { once: true })
        img.addEventListener('error', settle, { once: true })
      })
    }

    const raf = requestAnimationFrame(check)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.clearTimeout(timeoutId)
    }
  }, [active, loaded])

  return loaded
}

function BoardInitialLoadingOverlay({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      return
    }
    const timeoutId = window.setTimeout(() => setMounted(false), 300)
    return () => window.clearTimeout(timeoutId)
  }, [visible])

  if (!mounted) return null

  return (
    <div className={`board-initial-loading${visible ? '' : ' board-initial-loading-hidden'}`}>
      <div className="board-initial-loading-spinner" />
      <p>Loading your board...</p>
    </div>
  )
}

function InitialLoadGate({ craftReady }: { craftReady: boolean }) {
  const { tasksLoaded } = useTaskBoard()
  const readyForImages = craftReady && tasksLoaded
  const imagesLoaded = useBoardImagesLoaded(readyForImages)

  return <BoardInitialLoadingOverlay visible={!(readyForImages && imagesLoaded)} />
}

export function BoardCanvas({ username, onLogout }: { username?: string; onLogout: () => void }) {
  const isMobileDevice = useIsMobileDevice()
  const [layouts, setLayouts] = useState<LayoutsByDevice | null>(null)
  const [background, setBackgroundState] = useState<BoardBackground>(DEFAULT_BOARD_BACKGROUND)
  const [headerStyle, setHeaderStyleState] = useState<HeaderStyle>(DEFAULT_HEADER_STYLE)
  const [dateFormat, setDateFormatState] = useState<DateFormatPref>(DEFAULT_DATE_FORMAT)
  const [editMode, setEditMode] = useState(false)
  const [editDevice, setEditDeviceState] = useState<DeviceMode>(() =>
    isMobileDevice ? 'mobile' : 'desktop',
  )
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [craftReady, setCraftReady] = useState(false)
  const readyRef = useRef(false)
  const fieldSaveTimeoutsRef = useRef<Record<string, number | null>>({})
  const fieldSavePendingValuesRef = useRef<Record<string, unknown>>({})
  const fieldSaveControllersRef = useRef<Record<string, AbortController | null>>({})

  useGoogleFonts([layouts, background, headerStyle])

  function abortInFlightFieldSaves() {
    Object.values(fieldSaveControllersRef.current).forEach((controller) => controller?.abort())
    fieldSaveControllersRef.current = {}
  }

  function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === 'AbortError'
  }

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
          if (page.date_format === 'MDY' || page.date_format === 'DMY') {
            setDateFormatState(page.date_format)
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

  function firePendingFieldSave(field: string, value: unknown) {
    fieldSaveControllersRef.current[field]?.abort()
    const controller = new AbortController()
    fieldSaveControllersRef.current[field] = controller
    setStatus('saving')
    apiFetch('/api/page/', {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value }),
      signal: controller.signal,
    })
      .then(() => setStatus('saved'))
      .catch((err) => {
        if (isAbortError(err)) return
        setStatus('error')
      })
  }

  function scheduleFieldSave(field: string, value: unknown) {
    const existing = fieldSaveTimeoutsRef.current[field]
    if (existing) window.clearTimeout(existing)
    fieldSavePendingValuesRef.current[field] = value
    fieldSaveTimeoutsRef.current[field] = window.setTimeout(() => {
      fieldSaveTimeoutsRef.current[field] = null
      delete fieldSavePendingValuesRef.current[field]
      firePendingFieldSave(field, value)
    }, SAVE_DEBOUNCE_MS)
  }

  function flushFieldSaves() {
    Object.entries(fieldSaveTimeoutsRef.current).forEach(([field, timeoutId]) => {
      if (!timeoutId) return
      window.clearTimeout(timeoutId)
      fieldSaveTimeoutsRef.current[field] = null
      const value = fieldSavePendingValuesRef.current[field]
      delete fieldSavePendingValuesRef.current[field]
      firePendingFieldSave(field, value)
    })
  }

  function setBackground(next: BoardBackground) {
    setBackgroundState(next)
    scheduleFieldSave('background', next)
  }

  function setHeaderStyle(next: HeaderStyle) {
    setHeaderStyleState(next)
    scheduleFieldSave('header_style', next)
  }

  function setDateFormat(next: DateFormatPref) {
    setDateFormatState(next)
    scheduleFieldSave('date_format', next)
  }

  function revertToOriginalDesign() {
    Object.values(fieldSaveTimeoutsRef.current).forEach((timeoutId) => {
      if (timeoutId) window.clearTimeout(timeoutId)
    })
    fieldSaveTimeoutsRef.current = {}
    fieldSavePendingValuesRef.current = {}
    abortInFlightFieldSaves()

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
      .catch((err) => {
        if (isAbortError(err)) return
        setStatus('error')
      })
  }

  function applyDesignNow(
    nextLayout: SerializedNodes,
    nextBackground: BoardBackground,
    nextHeaderStyle: HeaderStyle,
    otherLayouts: Partial<Record<DeviceMode, SerializedNodes>> = {},
  ) {
    Object.values(fieldSaveTimeoutsRef.current).forEach((timeoutId) => {
      if (timeoutId) window.clearTimeout(timeoutId)
    })
    fieldSaveTimeoutsRef.current = {}
    fieldSavePendingValuesRef.current = {}
    abortInFlightFieldSaves()

    const nextLayouts: Partial<Record<DeviceMode, SerializedNodes>> = { ...otherLayouts, [device]: nextLayout }
    setLayouts((prev) => (prev ? { ...prev, ...nextLayouts } : prev))
    setBackgroundState(nextBackground)
    setHeaderStyleState(nextHeaderStyle)

    const layoutFields = Object.fromEntries(
      (Object.keys(nextLayouts) as DeviceMode[]).map((key) => [LAYOUT_FIELD[key], nextLayouts[key]]),
    )
    setStatus('saving')
    apiFetch('/api/page/', {
      method: 'PATCH',
      body: JSON.stringify({
        ...layoutFields,
        background: nextBackground,
        header_style: nextHeaderStyle,
      }),
    })
      .then(() => setStatus('saved'))
      .catch((err) => {
        if (isAbortError(err)) return
        setStatus('error')
      })
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
        dateFormat={dateFormat}
        onDateFormatChange={setDateFormat}
        onRevertToOriginalDesign={revertToOriginalDesign}
        onApplyDesignNow={applyDesignNow}
        onFlushFieldSaves={flushFieldSaves}
      >
        <BoardEditor
          layout={layouts[device]}
          onNodesChange={(query) => handleNodesChange(device, query)}
          onLoaded={() => {
            readyRef.current = true
            setCraftReady(true)
          }}
          username={username}
          onLogout={onLogout}
        />
      </BoardUiProvider>
      <InitialLoadGate craftReady={craftReady} />
      <div className="board-status">
        {status === 'saving' && 'Saving...'}
        {status === 'saved' && 'Saved'}
        {status === 'error' && 'Save failed'}
      </div>
    </TaskBoardProvider>
  )
}
