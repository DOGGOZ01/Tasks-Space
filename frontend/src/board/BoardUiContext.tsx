import type { SerializedNodes } from '@craftjs/core'
import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { BoardBackground } from './boardBackground'
import type { DeviceMode } from './geometry'
import { boardHeightFor, boardWidthFor } from './geometry'
import type { HeaderStyle } from './headerStyle'

interface BoardUiValue {
  editMode: boolean
  toggleEditMode: () => void
  scale: number
  setScale: (scale: number) => void
  device: DeviceMode
  setDevice: (device: DeviceMode) => void
  canEditDesktop: boolean
  canvasWidth: number
  canvasHeight: number
  background: BoardBackground
  setBackground: (background: BoardBackground) => void
  headerStyle: HeaderStyle
  setHeaderStyle: (style: HeaderStyle) => void
  revertToOriginalDesign: () => void
  applyDesignNow: (layout: SerializedNodes, background: BoardBackground, headerStyle: HeaderStyle) => void
  flushFieldSaves: () => void
  hoverToRevealBlocks: boolean
  setHoverToRevealBlocks: (next: boolean) => void
  controlsLayerNode: HTMLDivElement | null
  setControlsLayerNode: (node: HTMLDivElement | null) => void
}

const HOVER_REVEAL_STORAGE_KEY = 'task-tracker:hover-reveal-blocks'

function readStoredHoverToReveal(): boolean {
  try {
    return localStorage.getItem(HOVER_REVEAL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const BoardUiContext = createContext<BoardUiValue | null>(null)

interface BoardUiProviderProps {
  children: ReactNode
  editMode: boolean
  toggleEditMode: () => void
  device: DeviceMode
  onDeviceChange: (device: DeviceMode) => void
  canEditDesktop: boolean
  background: BoardBackground
  onBackgroundChange: (background: BoardBackground) => void
  headerStyle: HeaderStyle
  onHeaderStyleChange: (style: HeaderStyle) => void
  onRevertToOriginalDesign: () => void
  onApplyDesignNow: (layout: SerializedNodes, background: BoardBackground, headerStyle: HeaderStyle) => void
  onFlushFieldSaves: () => void
}

export function BoardUiProvider({
  children,
  editMode,
  toggleEditMode,
  device,
  onDeviceChange,
  canEditDesktop,
  background,
  onBackgroundChange,
  headerStyle,
  onHeaderStyleChange,
  onRevertToOriginalDesign,
  onApplyDesignNow,
  onFlushFieldSaves,
}: BoardUiProviderProps) {
  const [scale, setScale] = useState(1)
  const [hoverToRevealBlocks, setHoverToRevealBlocksState] = useState(readStoredHoverToReveal)
  const [controlsLayerNode, setControlsLayerNode] = useState<HTMLDivElement | null>(null)

  function setHoverToRevealBlocks(next: boolean) {
    setHoverToRevealBlocksState(next)
    try {
      localStorage.setItem(HOVER_REVEAL_STORAGE_KEY, next ? '1' : '0')
    } catch {}
  }

  const value = useMemo<BoardUiValue>(
    () => ({
      editMode,
      toggleEditMode,
      scale,
      setScale,
      device,
      setDevice: onDeviceChange,
      canEditDesktop,
      canvasWidth: boardWidthFor(device),
      canvasHeight: boardHeightFor(device),
      background,
      setBackground: onBackgroundChange,
      headerStyle,
      setHeaderStyle: onHeaderStyleChange,
      revertToOriginalDesign: onRevertToOriginalDesign,
      applyDesignNow: onApplyDesignNow,
      flushFieldSaves: onFlushFieldSaves,
      hoverToRevealBlocks,
      setHoverToRevealBlocks,
      controlsLayerNode,
      setControlsLayerNode,
    }),
    [
      editMode,
      toggleEditMode,
      scale,
      device,
      onDeviceChange,
      canEditDesktop,
      background,
      onBackgroundChange,
      headerStyle,
      onHeaderStyleChange,
      onRevertToOriginalDesign,
      onApplyDesignNow,
      onFlushFieldSaves,
      hoverToRevealBlocks,
      controlsLayerNode,
    ],
  )

  return <BoardUiContext.Provider value={value}>{children}</BoardUiContext.Provider>
}

export function useBoardUi(): BoardUiValue {
  const ctx = useContext(BoardUiContext)
  if (!ctx) throw new Error('useBoardUi must be used within BoardUiProvider')
  return ctx
}
